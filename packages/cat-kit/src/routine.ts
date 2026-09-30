import { wrap, yawToward } from './geom'
import { leap, leapSeconds } from './leap'
import { AVOID_R, Link, Nav, P3, Timeline, passesNear, poseOn, route, timeline } from './path'

/**
 * The cats' day, worked out from the clock alone so every visitor sees the same
 * thing. Starting from home at the day's turnover (10:00 UTC, early morning in
 * Florida), each cat rests a while, gets up, walks (or hops) to a free favourite
 * spot, settles, and so on; in the last half hour everyone heads home to sleep,
 * so the next day starts exactly where this one ends.
 */
export type CatSpec = { key: string; name: string; scale: number; social: number; nap: number; roam: number; home: number; owner?: string }
export type Regular = Omit<CatSpec, 'home'>
export type Spot = { x: number; z: number; y: number; yaw: number; bx: number; bz: number; area: number; sun?: boolean; watch?: number }
export type Pose = {
  x: number; y: number; z: number; yaw: number; stand: number; stride: number; moving: boolean; spot: number
  /** Leaping: nose up (+) or down (-) in degrees, how deep the crouch is (0-1), and whether she's in the air. */
  pitch: number; crouch: number; flight: number
  /** Curled up (0-1), mid-stretch (0-1), and whether she's asleep (eyes closed; not to be disturbed). */
  curl: number; stretch: number; asleep: boolean
  /** Partway through something she has to finish: on the stairs or the climb, or mid-leap. */
  busy: boolean
}

export const DAY_START_UTC_HOUR = 10
export const HOME_BY_MS = 30 * 60_000
const DAY_MS = 86_400_000
const WALK = 0.42 // m/s, times the cat's scale
const RISE = 1.1
/** Rests this long become sleep: she dozes off after DOZE, curling up over CURL. */
const SLEEP_REST = 100_000
const DOZE = 15_000
const CURL = 2_000
/** Getting up: uncurl (if curled), a play-bow stretch, then rise. Seconds. */
const UNCURL = 0.5
const STRETCH = 1.4
const AWAKE = { pitch: 0, crouch: 0, flight: 0, curl: 0, stretch: 0, asleep: false, busy: false }
const SETTLE = 1.5
/** Whether it's daytime in the cats' day: the first 12 hours after it starts (10:00 UTC). */
export function daytime(ms: number): boolean {
  return ms - dayStartOf(ms) < 12 * 3_600_000
}

/**
 * How much a cat fancies a spot: perches (by how high above its floor, and how much she roams),
 * cushions, sunny spots in the daytime, and watch spots (somewhere with something to look at).
 */
export function spotWeight(s: Spot, cat: { roam: number }, ms: number, floorY = 0): number {
  const above = s.y - floorY
  return 1 + cat.roam * (above > 0.3 ? 1.5 : 0) + (above > 0.05 && above < 0.3 ? 0.8 : 0) + (s.sun && daytime(ms) ? 1.2 : 0) + (s.watch !== undefined ? 0.8 : 0)
}

/** Today's guests: a fair, distinct rotation through the regulars (indices), `slots` a day. */
export function guestsForDay(day: number, count: number, slots = 3): number[] {
  if (count <= slots) return Array.from({ length: count }, (_, k) => k)
  const start = (((day * slots) % count) + count) % count
  return Array.from({ length: slots }, (_, k) => (start + k) % count)
}

export function dayIndex(ms: number): number {
  return Math.round(dayStartOf(ms) / DAY_MS)
}

export function dayStartOf(ms: number): number {
  const off = DAY_START_UTC_HOUR * 3_600_000
  return Math.floor((ms - off) / DAY_MS) * DAY_MS + off
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Trip = {
  from: number; to: number; path: P3[]; tl: Timeline; len: number; t0: number; tWalk0: number; tWalk1: number; t1: number
  /** Seconds from setting off to standing (uncurl, stretch, rise), and how curled she was. */
  up: number; curl0: number
}
type CatRun = {
  spot: number; restUntil: number; trip: Trip | null; k: number; strideBase: number; waited: number
  /** When this rest began, and whether it's long enough to sleep. */
  restFrom: number; sleepy: boolean
}

export function makeRoutine(residents: CatSpec[], regulars: Regular[], guestHomes: number[], spots: Spot[], nav: Nav, links: Link[]) {
  const floorY = (i: number) => nav.areas[spots[i].area].y
  let cats: CatSpec[] = residents
  const paths = new Map<string, P3[]>()
  const detours = new Map<string, P3[]>() // routes round resting cats
  const pathOf = (a: number, b: number) => {
    const key = `${a}>${b}`
    if (!paths.has(key))
      paths.set(key, route(nav, links, { x: spots[a].bx, y: floorY(a), z: spots[a].bz }, { x: spots[b].bx, y: floorY(b), z: spots[b].bz }))
    return paths.get(key)!
  }
  let homes = new Set<number>()
  let day0 = NaN
  let last = -Infinity
  let runs: CatRun[] = []

  const restFor = (i: number, k: number) => {
    const r = rng(day0 / 1000 + i * 7919 + k * 104729)
    return (40 + 150 * cats[i].nap * r()) * 1000
  }
  const reset = (d0: number) => {
    day0 = d0
    const guests = guestsForDay(dayIndex(d0), regulars.length).map((k, j) => ({ ...regulars[k], home: guestHomes[j] }))
    cats = [...residents, ...guests]
    homes = new Set(cats.map((c) => c.home))
    // Everyone starts the day asleep at home, curled up from the night before.
    runs = cats.map((c, i) => ({ spot: c.home, restUntil: d0 + restFor(i, 0), trip: null, k: 0, strideBase: 0, waited: 0, restFrom: d0 - DOZE - CURL, sleepy: true }))
  }
  const asleepAt = (run: CatRun, t: number) => run.sleepy && t >= run.restFrom + DOZE
  const curlAt = (run: CatRun, t: number) => (asleepAt(run, t) ? Math.min(1, (t - run.restFrom - DOZE) / CURL) : 0)
  const busy = (except: number) => new Set(runs.filter((_, j) => j !== except).map((r) => (r.trip ? r.trip.to : r.spot)))

  // Personal space. A cat resting on the floor (or about to be, at the end of her walk) is
  // walked round; and a trip that would cross another cat's walk waits a moment first.
  const WAIT = 5000
  const MAX_WAIT = 120_000 // two minutes at most; then she picks somewhere else (or, going home at night, goes anyway)
  const CLOSE = 0.45
  const onFloorAt = (k: number): P3 | null => (spots[k].y < floorY(k) + 0.3 ? { x: spots[k].x, y: floorY(k), z: spots[k].z } : null)
  const obstacles = (i: number): P3[] =>
    runs.flatMap((r, j) => (j === i ? [] : [onFloorAt(r.trip ? r.trip.to : r.spot)])).filter((p): p is P3 => !!p)
  // Each trip's track, sampled every STEP ms from its start: x, y, z, and 1 if she's in the air
  // (mid-leap, or up on a perch) else 0. After the last sample she's settled at her spot.
  const STEP = 200
  // The track only depends on the route and the trip's shape, not when it starts, so a cat
  // who waits and tries again reuses it.
  const tracks = new WeakMap<P3[], Map<string, Float32Array>>()
  const speeds = new WeakMap<Float32Array, number>()
  const track = (trip: Trip): Float32Array => {
    const key = `${trip.from}>${trip.to}:${trip.tWalk0 - trip.t0}:${trip.tWalk1 - trip.t0}:${trip.t1 - trip.t0}`
    let byShape = tracks.get(trip.path)
    if (!byShape) tracks.set(trip.path, (byShape = new Map()))
    let tr = byShape.get(key)
    if (tr) return tr
    const n = Math.ceil((trip.t1 - trip.t0) / STEP) + 1
    tr = new Float32Array(n * 4)
    const from = spots[trip.from]
    const to = spots[trip.to]
    const fromAir = from.y > floorY(trip.from) + 0.3 ? 1 : 0 // up a cat tree or on a shelf, not on a cushion
    const toAir = to.y > floorY(trip.to) + 0.3 ? 1 : 0
    const { path, tl } = trip
    let seg = 0
    for (let k = 0; k < n; k++) {
      const t = trip.t0 + k * STEP
      const o = k * 4
      const hopOut = t >= trip.t0 + trip.up * 1000 && t < trip.tWalk0
      const hopIn = t >= trip.tWalk1 && t < trip.t1 - SETTLE * 1000 && toAir
      if (hopOut || hopIn) {
        // leaping off her perch, or up onto the new one: on the floor while she crouches
        const l = hopOut
          ? leap(from, from.y, path[0], path[0].y, (t - trip.t0) / 1000 - trip.up, 0)
          : leap(path[path.length - 1], path[path.length - 1].y, to, to.y, (t - trip.tWalk1) / 1000, 0)
        const floor = hopOut ? path[0].y : path[path.length - 1].y
        tr[o] = l.x; tr[o + 1] = l.y; tr[o + 2] = l.z; tr[o + 3] = l.flight > 0 || l.y > floor + 0.3 ? 1 : 0
      } else if (t < trip.tWalk0) {
        tr[o] = from.x; tr[o + 1] = from.y; tr[o + 2] = from.z; tr[o + 3] = fromAir
      } else if (t < trip.tWalk1) {
        const u = (t - trip.tWalk0) / 1000
        while (seg < path.length - 2 && u >= tl.times[seg + 1]) seg++
        const a = path[seg]
        const b = path[seg + 1]
        if (b.hop) {
          const l = poseOn(path, tl, u) // mid-leap: the arc
          tr[o] = l.p.x; tr[o + 1] = l.p.y; tr[o + 2] = l.p.z; tr[o + 3] = l.flight > 0 ? 1 : 0
        } else {
          const d = tl.times[seg + 1] - tl.times[seg]
          const f = d > 0 ? Math.min(1, (u - tl.times[seg]) / d) : 1
          tr[o] = a.x + (b.x - a.x) * f; tr[o + 1] = a.y + (b.y - a.y) * f; tr[o + 2] = a.z + (b.z - a.z) * f; tr[o + 3] = 0
        }
      } else {
        tr[o] = to.x; tr[o + 1] = to.y; tr[o + 2] = to.z; tr[o + 3] = toAir
      }
    }
    let fast = 0 // her biggest move in one step, on the floor (for skipping ahead safely)
    for (let k = 1; k < n; k++) fast = Math.max(fast, Math.hypot(tr[k * 4] - tr[k * 4 - 4], tr[k * 4 + 2] - tr[k * 4 - 2]))
    speeds.set(tr, fast)
    byShape.set(key, tr)
    return tr
  }
  const boxes = new WeakMap<Trip, number[]>()
  const box = (trip: Trip): number[] => {
    let b = boxes.get(trip)
    if (b) return b
    b = [Infinity, -Infinity, Infinity, -Infinity]
    for (const p of [...trip.path, spots[trip.from], spots[trip.to]]) {
      b[0] = Math.min(b[0], p.x - CLOSE)
      b[1] = Math.max(b[1], p.x + CLOSE)
      b[2] = Math.min(b[2], p.z - CLOSE)
      b[3] = Math.max(b[3], p.z + CLOSE)
    }
    boxes.set(trip, b)
    return b
  }
  // The wall climb and the sky tunnel are single file: while a cat is on one (from leaving the
  // floor to stepping out onto the other), no other cat is on that one. Each stretch of a route
  // along a link with hops is a span, keyed by its two ends (the same whichever way she goes).
  type Span = { key: string; t0: number; t1: number }
  const CLEAR = 3000 // ms either side: the last cat off it is well clear before the next steps on
  const climbs = new WeakMap<Trip, Span[]>()
  const onClimb = (trip: Trip): Span[] => {
    if (climbs.has(trip)) return climbs.get(trip)!
    const at = (k: number) => trip.tWalk0 + trip.tl.times[Math.max(0, Math.min(trip.path.length - 1, k))] * 1000
    const spans: Span[] = []
    let k = 0
    while (k < trip.path.length) {
      if (!trip.path[k].link) {
        k++
        continue
      }
      let e = k
      while (e + 1 < trip.path.length && trip.path[e + 1].link) e++
      const run = trip.path.slice(k, e + 1)
      if (run.some((p) => p.hop)) {
        const ends = [run[0], run[run.length - 1]].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`).sort()
        spans.push({ key: ends.join('|'), t0: at(k - 1), t1: at(e + 1) })
      }
      k = e + 1
    }
    climbs.set(trip, spans)
    return spans
  }
  /** The walk that `trip` would run into, if any. */
  /** Whether `trip` would run into another cat's walk; and, for a single-file link she's waiting for, how long until it's clear (ms). */
  const crosses = (i: number, trip: Trip): { clear: number } | null => {
    const [ax0, ax1, az0, az1] = box(trip)
    const mine = onClimb(trip)
    const a = track(trip)
    const na = a.length / 4
    for (let j = 0; j < runs.length; j++) {
      const o = runs[j].trip
      if (j === i || !o || o.t1 < trip.t0) continue
      const theirs = onClimb(o)
      let clear = 0
      for (const sa of mine)
        for (const sb of theirs)
          if (sa.key === sb.key && sa.t0 < sb.t1 + CLEAR && sb.t0 < sa.t1 + CLEAR) clear = Math.max(clear, sb.t1 + CLEAR - sa.t0 + 100)
      if (clear > 0) return { clear }
      const [bx0, bx1, bz0, bz1] = box(o)
      if (ax1 < bx0 || bx1 < ax0 || az1 < bz0 || bz1 < az0) continue
      const b = track(o)
      const nb = b.length / 4
      const closing = speeds.get(a)! + speeds.get(b)! + 1e-6 // the most they can close in one step
      for (let t = Math.max(trip.t0, o.t0); t <= Math.max(trip.t1, o.t1); t += STEP) {
        const ka = Math.min(na - 1, Math.round((t - trip.t0) / STEP)) * 4
        const kb = Math.min(nb - 1, Math.round((t - o.t0) / STEP)) * 4
        const dx = a[ka] - b[kb]
        const dz = a[ka + 2] - b[kb + 2]
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d >= CLOSE + closing) {
          t += Math.floor((d - CLOSE) / closing - 1) * STEP // far apart: skip ahead while they can't meet
          continue
        }
        if (a[ka + 3] || b[kb + 3] || Math.abs(a[ka + 1] - b[kb + 1]) >= 0.3) continue
        if (d < CLOSE) return { clear: 0 }
      }
    }
    return null
  }

  const depart = (i: number, t: number) => {
    const run = runs[i]
    const cat = cats[i]
    const goingHome = t >= day0 + DAY_MS - HOME_BY_MS
    let to = cat.home
    if (!goingHome) {
      const taken = busy(i)
      const crowd = obstacles(i) // someone lying right where she'd hop up from, or lie down
      const choices = spots
        .map((s, j) => ({ j, s }))
        .filter(({ j }) => j !== run.spot && !taken.has(j) && (!homes.has(j) || j === cat.home))
        .filter(({ j, s: q }) => !crowd.some((o) => o.y === floorY(j) && Math.hypot(o.x - q.bx, o.z - q.bz) < CLOSE + 0.1))
      const r = rng(day0 / 1000 + i * 7919 + run.k * 104729 + 1)
      const weights = choices.map(({ s, j }) => spotWeight(s, cat, t, floorY(j)))
      let pick = r() * weights.reduce((a, b) => a + b, 0)
      to = choices.length ? choices[0].j : run.spot
      for (let c = 0; c < choices.length; c++) {
        pick -= weights[c]
        if (pick <= 0) {
          to = choices[c].j
          break
        }
      }
    }
    if (to === run.spot) {
      run.restUntil = goingHome ? Infinity : t + restFor(i, ++run.k)
      if (goingHome && !run.sleepy) {
        run.sleepy = true // already home at bedtime: settle in for the night, dozing off from now
        run.restFrom = t
      }
      return
    }
    let path = pathOf(run.spot, to)
    const avoid = obstacles(i)
    if (avoid.some((o) => passesNear(path, o, AVOID_R))) {
      const toP = { x: spots[to].bx, y: floorY(to), z: spots[to].bz }
      const key = `${run.spot}>${to}|${avoid.map((o) => `${o.x},${o.y},${o.z}`).join(';')}`
      if (!detours.has(key)) detours.set(key, route(nav, links, { x: spots[run.spot].bx, y: floorY(run.spot), z: spots[run.spot].bz }, toP, avoid))
      const alt = detours.get(key)!
      const end = alt[alt.length - 1]
      if (Math.hypot(end.x - toP.x, end.z - toP.z) < 0.3 && Math.abs(end.y - toP.y) < 0.3) path = alt
    }
    const tl = timeline(path, WALK * cat.scale)
    const len = tl.walked[tl.walked.length - 1]
    const a = spots[run.spot]
    const b = spots[to]
    const hopOut = a.y > floorY(run.spot) + 0.05 ? leapSeconds(a.y, floorY(run.spot)) : 0
    const hopIn = b.y > floorY(to) + 0.05 ? leapSeconds(floorY(to), b.y) : 0
    const curl0 = curlAt(run, t)
    const up = (curl0 > 0 ? UNCURL * curl0 : 0) + STRETCH + RISE
    const tWalk0 = t + up * 1000 + hopOut * 1000
    const tWalk1 = tWalk0 + tl.total * 1000
    const trip = { from: run.spot, to, path, tl, len, t0: t, tWalk0, tWalk1, t1: tWalk1 + (hopIn + SETTLE) * 1000, up, curl0 }
    const blocked = run.waited < MAX_WAIT || !goingHome ? crosses(i, trip) : null
    if (blocked) {
      // someone's in the way: let them pass first (for the climb or the tunnel, until it's clear)
      const wait = Math.min(MAX_WAIT, Math.max(WAIT, blocked.clear))
      run.waited += wait
      run.restUntil = t + wait
      if (run.waited >= MAX_WAIT && !goingHome) {
        run.waited = 0 // tired of waiting: she'll think of somewhere else to go instead
        run.k++
      }
      return
    }
    run.waited = 0
    run.trip = trip
  }

  const arrive = (i: number) => {
    const run = runs[i]
    const trip = run.trip!
    run.strideBase += trip.len
    run.spot = trip.to
    run.trip = null
    run.k++
    const home = run.spot === cats[i].home
    const lateInDay = trip.t1 >= day0 + DAY_MS - HOME_BY_MS
    run.restUntil = home && lateInDay ? Infinity : trip.t1 + restFor(i, run.k)
    if (!home && run.restUntil > day0 + DAY_MS - HOME_BY_MS) run.restUntil = Math.max(trip.t1 + 5000, day0 + DAY_MS - HOME_BY_MS)
    run.restFrom = trip.t1
    run.sleepy = run.restUntil - trip.t1 >= SLEEP_REST
  }

  const advance = (now: number) => {
    for (;;) {
      let who = -1
      let when = Infinity
      runs.forEach((r, i) => {
        const t = r.trip ? r.trip.t1 : r.restUntil
        if (t < when) {
          when = t
          who = i
        }
      })
      if (who < 0 || when > now) return
      if (runs[who].trip) arrive(who)
      else depart(who, when)
    }
  }

  const poseOf = (i: number, now: number): Pose => {
    const run = runs[i]
    const trip = run.trip
    if (!trip || now < trip.t0) {
      const s = spots[run.spot]
      return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, stand: 0, stride: 0, moving: false, spot: run.spot, ...AWAKE, curl: curlAt(run, now), asleep: asleepAt(run, now) }
    }
    const from = spots[trip.from]
    const to = spots[trip.to]
    const start = poseOn(trip.path, trip.tl, 0)
    const end = poseOn(trip.path, trip.tl, trip.tl.total)
    const yFrom = floorY(trip.from)
    const yTo = floorY(trip.to)
    const walkYaw0 = trip.tl.total > 0.01 ? start.yaw : from.yaw
    const u = (now - trip.t0) / 1000
    const uncurl = trip.curl0 > 0 ? UNCURL * trip.curl0 : 0
    const still = { x: from.x, y: from.y, z: from.z, yaw: from.yaw, stand: 0, stride: 0, moving: true, spot: trip.to, ...AWAKE }
    if (u < uncurl) return { ...still, curl: trip.curl0 * (1 - u / uncurl) }
    if (u < uncurl + STRETCH) return { ...still, stretch: Math.sin((Math.PI * (u - uncurl)) / STRETCH) }
    if (u < trip.up) {
      const k = (u - uncurl - STRETCH) / RISE
      return { ...still, yaw: from.yaw + wrap(walkYaw0 - from.yaw) * k, stand: k }
    }
    if (now < trip.tWalk0) {
      const l = leap({ x: from.x, z: from.z }, from.y, start.p, yFrom, u - trip.up, walkYaw0)
      return { ...AWAKE, ...l, stand: 1, stride: 0, moving: true, spot: trip.to, busy: true }
    }
    if (now < trip.tWalk1) {
      const a = poseOn(trip.path, trip.tl, (now - trip.tWalk0) / 1000)
      return { ...AWAKE, x: a.p.x, y: a.p.y, z: a.p.z, yaw: a.yaw, stand: 1, stride: a.walked, moving: true, spot: trip.to, pitch: a.pitch, crouch: a.crouch, flight: a.flight, busy: a.hop || a.link }
    }
    const hopEnd = trip.tWalk1 + (to.y > yTo + 0.05 ? leapSeconds(yTo, to.y) * 1000 : 0)
    if (now < hopEnd) {
      const l = leap(end.p, yTo, { x: to.x, z: to.z }, to.y, (now - trip.tWalk1) / 1000, yawToward(end.p, { x: to.x, z: to.z }))
      return { ...AWAKE, ...l, stand: 1, stride: trip.len, moving: true, spot: trip.to, busy: true }
    }
    const k = Math.min(1, (now - hopEnd) / (SETTLE * 1000))
    const yaw0 = to.y > yTo + 0.05 ? yawToward(end.p, { x: to.x, z: to.z }) : end.yaw // hopped up: facing the way she jumped
    return { ...AWAKE, x: to.x, y: to.y, z: to.z, yaw: yaw0 + wrap(to.yaw - yaw0) * k, stand: 1 - k, stride: trip.len, moving: true, spot: trip.to }
  }

  return {
    at(ms: number): { cats: CatSpec[]; poses: Pose[] } {
      const d0 = dayStartOf(ms)
      if (d0 !== day0 || ms < last) reset(d0)
      last = ms
      advance(ms)
      return { cats, poses: cats.map((_, i) => poseOf(i, ms)) }
    }
  }
}

