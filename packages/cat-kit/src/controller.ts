import { XZ, dist, wrap, yawToward } from './geom'
import { Intent } from './intents'
import { Link, Nav, P3, Timeline, areaAt, gridOf, poseOn, route, snap, timeline, walkableAt } from './path'
import { Pose } from './routine'

/** Narrow passages (optional): where two cats meeting stop and one backs out. Set by addCats from the floors. */
let inTube: (p: P3) => boolean = () => false
export function setNarrow(f: (p: P3) => boolean) {
  inTube = f
}

/**
 * One cat on one client. With no intent it simply wears the shared routine's pose.
 * An intent (the same on every client) sends it to a visitor: up, trot over,
 * settle and lie down beside them (or just lie where it is while being petted).
 * When the intent ends it walks back to wherever the routine has got to, then
 * blends back into it. Pure, so every client plays it out the same way.
 */
export type Mode = 'routine' | 'rising' | 'going' | 'settling' | 'lying' | 'rejoin' | 'playing' | 'standoff' | 'retreat' | 'chasing' | 'catching'
export type CatState = {
  mode: Mode
  pos: XZ
  y: number
  yaw: number
  stand: number
  stride: number
  speed: number
  chirp: boolean
  key: string
  t: number
  path: P3[]
  /** The route's timing, how far along it she is (seconds), and when she's on the stairs or the climb. */
  tl: Timeline | null
  link: [number, number] | null
  d: number
  goal: P3
  replan: number
  blend: number
  greet: number
  lookAt: XZ | null
  /** Leaping (from the routine): body pitch in degrees, crouch 0-1, and whether she's in the air. */
  pitch: number
  crouch: number
  flight: number
  /** Curled up (0-1), mid-stretch (0-1), asleep; how long she's been lying here, and how far into her stretch. */
  curl: number
  stretch: number
  asleep: boolean
  still: number
  wake: number
  /** Playing with a toy (a wand's feather, say): the butt-wiggle before a pounce (0-1), batting with a front paw (0-1), and her place. */
  wiggle: number
  bat: number
  playAt: P3 | null
  /** Chasing a toy that darts about (a laser dot, say): where it last settled and how long it's been still, crouched for it, a pounce under way. */
  dotAt: XZ | null
  dotStill: number
  crouched: boolean
  crouchT: number
  pounceT: number
  pounceFrom: XZ | null
  pounceTo: XZ | null
  pounceY: number
  /** Her goes at a still dot: how many, whether she's worked this one out (null: not decided), and how long she's stood
   * over it, lost track of it (−1: she hasn't). */
  attempt: number
  gets: boolean | null
  lostT: number
  /** A satisfied tail flick (0-1), after a catch. */
  flick: number
  /** Her route's stretch through a narrow passage: the index of its first point, and when she steps onto it. */
  tube: { k: number; t: number } | null
  /** A standoff in a narrow passage: who she's facing, whether she's the one who backs down, and the growl and hiss cues. */
  foe: XZ | null
  loser: boolean
  wasRoutine: boolean
  fight: number
  growl: boolean
  hiss: boolean
}
/** `target` is the visitor's position, including their height (so which floor they're on). */
/** `tubeBusy`: another cat is in a narrow passage, so she doesn't step into it. */
export type Input = { routine: Pose; intent: Intent | null; target: P3 | null; dt: number; scale: number; tubeBusy?: boolean }

const RISE = 1.1
const SETTLE = 1.5
const TROT = 0.9
const BESIDE = 0.9
const PLAY_BESIDE = 0.45 // right by the feather, so the pounce reaches it
const REPLAN = 1.5
const CHIRP_NEAR = 3
const TURN = 240
const DROP = 2
const CURL_AFTER = 4 // seconds lying beside someone before she curls up
const CURL = 2 // seconds to curl up
const UNCURL = 0.5
const STRETCH = 1.4
const PLAY_LOOP = 3.4 // seconds: crouch and wiggle, pounce, bat
const POUNCE = 0.3 // metres toward the feather
const SPRINT = 2.2 // m/s after a laser dot
const WIND_UP = 0.9 // metres: where she crouches for a still dot, a leap away from it
const STILL_MOVE = 0.05 // metres: the dot moving less than this is still
const STILL_FOR = 0.5 // seconds still before she crouches for it
const WIGGLE = 1.5 // seconds crouched and wiggling at a still dot before she pounces on it
const POUNCE_TIME = 0.4
const MAX_POUNCE = 1.3 // metres
const LEAP_TIME = 0.5 // seconds in the air
const LEAP_HIGH = 0.25 // metres: the top of the leap's arc
const GETS_IT = 0.1 // one go in ten she works out she can leap on it from a way off
const LOST_FOR = 3 // seconds standing over it, looking for it, before another go
const PIN_BACK = 0.15 // metres: her body behind the dot, front paws on it
export const STANDOFF_SECONDS = 3.6 // stopped face to face in a narrow passage: growling, hissing, swatting
const RUN = 1.6 // m/s: backing down, she turns tail and runs

/** A number in [0, 1) from a string, the same on every client (so they all make the same call). */
export function chance(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

export function newCatState(p: Pose): CatState {
  return {
    mode: 'routine', pos: { x: p.x, z: p.z }, y: p.y, yaw: p.yaw, stand: p.stand, stride: p.stride, speed: 0,
    chirp: false, key: '', t: 0, path: [], tl: null, link: null, d: 0, goal: { x: p.x, y: p.y, z: p.z }, replan: 0, blend: 0, greet: 0, lookAt: null,
    pitch: p.pitch, crouch: p.crouch, flight: p.flight, curl: p.curl, stretch: p.stretch, asleep: p.asleep, still: 0, wake: 0, wiggle: 0, bat: 0, playAt: null,
    dotAt: null, dotStill: 0, crouched: false, crouchT: 0, pounceT: -1, pounceFrom: null, pounceTo: null, pounceY: 0, attempt: 0, gets: null, lostT: -1, flick: 0,
    tube: null, foe: null, loser: false, wasRoutine: false, fight: 0, growl: false, hiss: false
  }
}

/** On the floor of `p`, the nearest open floor to it. */
function snapOn(nav: Nav, p: P3): P3 {
  const f = areaAt(nav, p)
  const q = snap(gridOf(nav, f), p)
  return { x: q.x, y: nav.areas[f].y, z: q.z }
}

const ROOM = 0.55 // how close she'll lie to another cat
const SAME_FLOOR = 0.3 // metres: a laser dot within this of her height is on her floor, and leapable
const OVER_IT = 0.15 // metres: standing over the dot she's lost track of

/** Her place `r` from a laser dot: on her side of it, always that far out (so after landing on it she backs out to wind
 * up again), or the nearest free place round it if another cat is there; snapped to where she can stand. */
function roundDot(nav: Nav, cat: XZ, dot: P3, others: P3[], r: number, yaw: number): P3 {
  const d = dist(cat, dot)
  const y = (yaw * Math.PI) / 180 // on top of it: back out the way she came (behind her; she faces (-sin, -cos))
  const a0 = d > 0.05 ? Math.atan2(cat.z - dot.z, cat.x - dot.x) : Math.atan2(Math.cos(y), Math.sin(y))
  const free = (p: P3) => others.every((o) => Math.abs(o.y - p.y) > 0.3 || Math.hypot(o.x - p.x, o.z - p.z) >= ROOM)
  const at = (a: number, rr: number) => snapOn(nav, { x: dot.x + rr * Math.cos(a), y: dot.y, z: dot.z + rr * Math.sin(a) })
  const mine = at(a0, r)
  if (free(mine)) return mine
  const out = Math.max(r, ROOM + 0.05) // round it, at least a cat's width out so there's room beside the other
  for (let k = 0; k <= 6; k++) for (const sgn of [1, -1]) {
    const p = at(a0 + (sgn * k * Math.PI) / 6, out) // nearest her side first
    if (free(p)) return p
  }
  return mine
}

/** Where a leap from `from` toward `to` (at most `max` away) comes down: along the walkable floor of her level, stopping
 * at the last place a cat can stand, so she never leaps through the counter, a wall or a table. */
function leapTo(nav: Nav, from: P3, to: XZ, max: number): XZ {
  const g = gridOf(nav, areaAt(nav, from))
  const d = dist(from, to)
  const reach = Math.min(d, max)
  const n = Math.max(1, Math.ceil(reach / 0.05))
  let last: XZ = { x: from.x, z: from.z }
  for (let i = 1; i <= n && d > 1e-6; i++) {
    const k = (reach * i) / n
    const p = { x: from.x + ((to.x - from.x) / d) * k, z: from.z + ((to.z - from.z) / d) * k }
    if (!walkableAt(g, p)) break
    last = p
  }
  return last
}

/**
 * Where to lie beside someone: on her side of them, or if another cat is already there, the
 * nearest free place round them (12 places at arm's length, tried nearest-to-her first). To play, `beside` is
 * closer: right by the feather.
 */
function besideTarget(nav: Nav, cat: XZ, target: P3, others: P3[], beside = BESIDE): P3 {
  const t = snapOn(nav, target) // someone outside the walls: their nearest spot inside
  const d = dist(cat, t)
  const k = d > 1e-6 ? Math.min(1, beside / d) : 0
  const mine = snapOn(nav, { x: t.x + (cat.x - t.x) * k, y: t.y, z: t.z + (cat.z - t.z) * k })
  const free = (p: P3) => others.every((o) => Math.abs(o.y - p.y) > 0.3 || Math.hypot(o.x - p.x, o.z - p.z) >= ROOM)
  if (free(mine)) return mine
  const round = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6
    return snapOn(nav, { x: t.x + beside * Math.cos(a), y: t.y, z: t.z + beside * Math.sin(a) })
  }).sort((p, q) => dist(p, cat) - dist(q, cat))
  return round.find((p) => free(p) && dist(p, t) < beside + 0.4) ?? mine
}

function turn(s: CatState, yaw: number, dt: number) {
  const d = wrap(yaw - s.yaw)
  s.yaw = wrap(s.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, d)))
}

/** Partway up or down the stairs or the climb: she finishes it before re-planning. */
function onLink(s: CatState): boolean {
  return !!s.link && s.d > s.link[0] + 1e-6 && s.d < s.link[1] - 1e-6
}

function plan(s: CatState, nav: Nav, links: Link[], goal: P3, speed: number) {
  s.goal = goal
  s.path = route(nav, links, { ...s.pos, y: s.y }, goal)
  s.tl = timeline(s.path, speed)
  s.d = 0
  s.replan = REPLAN
  const on = s.path.map((p, i) => (p.link ? i : -1)).filter((i) => i >= 0)
  s.link = on.length ? [s.tl.times[on[0] - 1] ?? 0, s.tl.times[Math.min(s.path.length - 1, on[on.length - 1] + 1)]] : null
  s.tube = tubeStretch(s.path, s.tl)
}

/** Where a route steps onto a narrow passage's link (its run of link points through the passage), if it does. */
function tubeStretch(path: P3[], tl: Timeline): { k: number; t: number } | null {
  let k = 0
  while (k < path.length) {
    if (!path[k].link) {
      k++
      continue
    }
    let e = k
    while (e + 1 < path.length && path[e + 1].link) e++
    if (path.slice(k, e + 1).some((p) => inTube(p))) return { k, t: tl.times[k - 1] ?? 0 }
    k = e + 1
  }
  return null
}

/** Start a standoff in a narrow passage with the cat at `foe`: they stop face to face; `loser` backs down after. */
export function startStandoff(s: CatState, foe: XZ, loser: boolean) {
  s.wasRoutine = s.mode === 'routine'
  s.mode = 'standoff'
  s.t = 0
  s.foe = foe
  s.loser = loser
  s.stand = 1
  s.curl = 0
}

/**
 * Which of two cats meeting in a narrow passage backs down (0 or 1). The one on her everyday rounds
 * never does: the routine is the same for everyone. Otherwise the later one in backs out.
 */
export function pickLoser(a: { mode: Mode; inTubeFor: number }, b: { mode: Mode; inTubeFor: number }): 0 | 1 {
  if (a.mode === 'routine' && b.mode !== 'routine') return 1
  if (b.mode === 'routine' && a.mode !== 'routine') return 0
  return a.inTubeFor < b.inTubeFor ? 0 : 1
}

/** How long she's been in the narrow passage along her route (0 if she isn't on it). */
export function inTubeFor(s: CatState): number {
  return s.tube && s.d > s.tube.t ? s.d - s.tube.t : 0
}

/** Back the way she came: from where she is along her route to just before the narrow passage. */
function backOut(s: CatState): P3[] {
  if (!s.tube || !s.tl) return []
  let i = s.tube.k - 1
  while (i + 1 < s.path.length && s.tl.times[i + 1] <= s.d) i++
  const back = s.path.slice(Math.max(0, s.tube.k - 1), i + 1)
  const n = back.length - 1
  const rev = back.map((_, k) => ({ ...back[n - k], hop: k > 0 && !!back[n - k + 1].hop, link: k > 0 && k < n }))
  return [{ x: s.pos.x, y: s.y, z: s.pos.z, link: true }, ...rev]
}

/** Height follows the path (up and down the stairs); a cat starting from a perch drops down to it smoothly. */
function follow(s: CatState, y: number, dt: number) {
  s.y += Math.max(-DROP * dt, Math.min(DROP * dt, y - s.y))
}

function walk(s: CatState, dt: number, tubeBusy = false): boolean {
  if (!s.tl) return true
  if (tubeBusy && s.tube && s.d <= s.tube.t + 1e-6) {
    s.d = Math.min(s.tube.t, s.d + dt) // up to the passage's entrance, and wait there for it to clear
    if (s.d >= s.tube.t - 1e-6) {
      s.pos = { x: s.path[s.tube.k - 1].x, z: s.path[s.tube.k - 1].z }
      return false
    }
  } else s.d = Math.min(s.tl.total, s.d + dt)
  const a = poseOn(s.path, s.tl, s.d)
  const step = Math.hypot(a.p.x - s.pos.x, a.p.z - s.pos.z)
  s.speed = a.hop ? 0 : step / dt
  if (!a.hop) s.stride += step
  s.pos = { x: a.p.x, z: a.p.z }
  if (a.hop) s.y = a.p.y
  else follow(s, a.p.y, dt)
  s.pitch = a.pitch
  s.crouch = a.crouch
  s.flight = a.flight
  turn(s, a.yaw, dt)
  return s.d >= s.tl.total - 1e-6
}

/** `others`: where the other cats are, so she doesn't lie down on one. */
export function stepCat(s: CatState, input: Input, nav: Nav, links: Link[], others: P3[] = []): CatState {
  const { routine, intent, target, dt, scale } = input
  const tubeBusy = !!input.tubeBusy
  s.t += dt
  s.chirp = false
  s.speed = 0
  s.pitch = 0
  s.crouch = 0
  s.flight = 0
  s.stretch = 0
  s.asleep = false
  s.wiggle = 0
  s.bat = 0
  s.flick = 0
  s.fight = 0
  s.growl = false
  s.hiss = false
  const key = intent ? `${intent.kind}:${intent.userId}:${intent.since}` : ''
  // Partway up the stairs or the climb, or mid-leap, she finishes that before answering anyone.
  // In a standoff in a narrow passage, or backing out of it, she sees that through first.
  if (key !== s.key && !(s.mode === 'routine' && routine.busy) && s.mode !== 'standoff' && s.mode !== 'retreat') {
    s.key = key
    s.t = 0
    s.wake = s.stand < 0.05 ? 0 : STRETCH // lying down: she'll stretch before she gets up
    if (intent && intent.kind === 'pet') {
      s.mode = s.stand > 0.01 ? 'settling' : 'lying'
      s.still = 0
    } else if (intent) {
      const laser = intent.kind === 'chase' || intent.kind === 'catch'
      s.mode = s.stand > 0.5 ? (intent.kind === 'chase' ? 'chasing' : intent.kind === 'catch' ? 'catching' : 'going') : 'rising'
      s.replan = 0
      s.greet = intent.kind === 'visit' ? 1 : 0
      s.chirp = intent.kind === 'visit'
      if (laser) {
        s.dotAt = null
        s.dotStill = 0
        s.crouched = false
        s.crouchT = 0
        s.attempt = 0
        s.gets = null
        s.lostT = -1
        s.pounceT = -1
        s.pounceFrom = null
        s.pounceTo = null
        s.path = []
      }
    } else if (s.mode !== 'routine') {
      s.mode = s.stand > 0.5 ? 'rejoin' : 'rising'
      s.replan = 0
    }
  }
  s.lookAt = target
  switch (s.mode) {
    case 'routine': {
      s.blend = Math.max(0, s.blend - 2 * dt)
      const k = s.blend
      s.pos = { x: routine.x + (s.pos.x - routine.x) * k, z: routine.z + (s.pos.z - routine.z) * k }
      s.y = routine.y + (s.y - routine.y) * k
      s.yaw = routine.yaw + wrap(s.yaw - routine.yaw) * k
      s.stand = routine.stand
      s.stride = routine.stride
      s.speed = routine.moving && routine.stand > 0.9 && !routine.flight ? 0.4 : 0
      s.pitch = routine.pitch
      s.crouch = routine.crouch
      s.flight = routine.flight
      s.curl += Math.max(-dt / UNCURL, Math.min(dt / CURL, routine.curl - s.curl))
      s.stretch = routine.stretch
      s.asleep = routine.asleep
      break
    }
    case 'rising':
      if (s.curl > 0) {
        s.curl = Math.max(0, s.curl - dt / UNCURL) // uncurl first...
        break
      }
      if (s.wake < STRETCH) {
        s.wake += dt // ...then a long play-bow stretch...
        s.stretch = Math.sin(Math.PI * Math.min(1, s.wake / STRETCH))
        break
      }
      s.stand = Math.min(1, s.stand + dt / RISE) // ...then up
      if (s.stand >= 1) s.mode = intent ? 'going' : 'rejoin'
      break
    case 'going': {
      if (intent?.kind === 'chase' || intent?.kind === 'catch') {
        s.mode = intent.kind === 'chase' ? 'chasing' : 'catching'
        s.t = 0
        s.path = []
        break
      }
      if (!target) break
      const goal = besideTarget(nav, s.pos, target, others, intent?.kind === 'play' ? PLAY_BESIDE : BESIDE)
      s.replan -= dt
      if (!s.path.length || (!onLink(s) && (s.replan <= 0 || dist(goal, s.goal) > 0.7))) plan(s, nav, links, goal, TROT * scale)
      if (s.greet === 1 && dist(s.pos, target) < CHIRP_NEAR) {
        s.chirp = true
        s.greet = 2
      }
      if (walk(s, dt, tubeBusy)) {
        s.mode = intent?.kind === 'play' ? 'playing' : 'settling'
        s.t = 0
        s.playAt = { x: s.pos.x, y: s.y, z: s.pos.z }
      }
      break
    }
    case 'playing': {
      // Crouch and wiggle, pounce at the feather, then bat at it standing; round again.
      const home = s.playAt ?? { x: s.pos.x, y: s.y, z: s.pos.z }
      if (target && dist(home, target) > BESIDE + 1) {
        s.mode = 'going' // they've walked off with the wand: follow
        s.replan = 0
        s.path = []
        break
      }
      const dir = target ? { x: target.x - home.x, z: target.z - home.z } : { x: 0, z: 0 }
      const d = Math.hypot(dir.x, dir.z) || 1
      const u = s.t % PLAY_LOOP
      let out = 0 // how far toward the feather she is
      s.stand = 1
      if (u < 1.2) {
        s.crouch = 0.8
        s.wiggle = 1
      } else if (u < 1.6) {
        const k = (u - 1.2) / 0.4
        out = POUNCE * k
        s.flight = 1
        s.pitch = 15 * (1 - 2 * k)
      } else {
        const k = Math.min(1, (u - 1.6) / 0.6)
        out = POUNCE * (1 - k * k * (3 - 2 * k)) // stepping back to her place as she bats
        s.bat = 1
      }
      s.pos = { x: home.x + (dir.x / d) * out, z: home.z + (dir.z / d) * out }
      s.y = home.y + (s.flight ? 0.12 * Math.sin((Math.PI * (u - 1.2)) / 0.4) : 0)
      if (target) turn(s, yawToward(home, target), dt)
      break
    }
    case 'chasing': {
      // After a laser dot. When it's still she has a go at it: about one go in ten she works it out (sprints to a leap
      // short of it, crouches and wiggles, and leaps onto it); otherwise she trots right up, stands over it and loses
      // track of it, looking about, before another go. When it moves she's after it again.
      s.stand = 1
      if (!target) break
      const was = s.dotAt
      const moved = was ? Math.hypot(target.x - was.x, target.z - was.z) : Infinity
      if (moved > STILL_MOVE) {
        s.dotAt = { x: target.x, z: target.z }
        s.dotStill = 0
      } else s.dotStill += dt
      if (s.pounceT >= 0 && s.pounceFrom && s.pounceTo) {
        s.pounceT += dt
        const k = Math.min(1, s.pounceT / LEAP_TIME)
        s.pos = { x: s.pounceFrom.x + (s.pounceTo.x - s.pounceFrom.x) * k, z: s.pounceFrom.z + (s.pounceTo.z - s.pounceFrom.z) * k }
        s.y = s.pounceY + LEAP_HIGH * Math.sin(Math.PI * k) // up in an arc, and down onto it
        s.flight = k < 1 ? 1 : 0
        s.pitch = 20 * (1 - 2 * k)
        if (k >= 1) {
          s.pounceT = -1
          s.path = []
          s.replan = 0
          s.gets = null
          s.attempt++
        }
        break
      }
      if (s.crouched && moved > STILL_MOVE) {
        // It moved: pounce at where it was, then chase on.
        s.crouched = false
        const to = was ?? target
        s.pounceFrom = { ...s.pos }
        s.pounceTo = leapTo(nav, { x: s.pos.x, y: s.y, z: s.pos.z }, to, MAX_POUNCE)
        s.pounceY = s.y
        s.pounceT = 0
        turn(s, yawToward(s.pos, to), dt * 4)
        break
      }
      if (moved > STILL_MOVE && (s.lostT >= 0 || s.gets !== null)) {
        // It's off again: after it, fresh
        s.lostT = -1
        s.gets = null
        s.attempt++
        s.path = []
      }
      const off = dist(s.pos, target)
      if (s.lostT >= 0) {
        // Standing over it, she's lost track of it: looking this way and that, a sniff at the floor, then another go.
        s.lostT += dt
        const a = (s.yaw * Math.PI) / 180 + 1.3 * Math.sin(s.lostT * 1.8)
        s.lookAt = { x: s.pos.x - 1.5 * Math.sin(a), z: s.pos.z - 1.5 * Math.cos(a) }
        s.crouch = s.lostT > 1.2 && s.lostT < 1.8 ? 0.35 : 0
        if (s.lostT >= LOST_FOR) {
          s.lostT = -1
          s.gets = null
          s.attempt++
          s.path = []
        }
        break
      }
      if (s.gets === null && s.dotStill >= STILL_FOR && off < WIND_UP + 0.4)
        s.gets = Math.abs(target.y - s.y) < SAME_FLOOR && chance(`${s.key}:${s.attempt}`) < GETS_IT // up on a table or the counter: no leap
      if (s.gets === false) {
        // Not this time: she trots right up to it and stands over it (or just by it, if another cat's already there)
        const spot = roundDot(nav, s.pos, target, others, OVER_IT, s.yaw)
        if (dist(s.pos, spot) < 0.2) {
          s.lostT = 0
          s.path = []
          break
        }
        s.replan -= dt
        if (!s.path.length || (!onLink(s) && (s.replan <= 0 || dist(spot, s.goal) > 0.4))) plan(s, nav, links, spot, TROT * scale)
        if (walk(s, dt, tubeBusy)) s.lostT = 0 // at her spot, or as close as she can get
        break
      }
      if (s.gets && s.dotStill >= STILL_FOR && off > WIND_UP - 0.25 && off < WIND_UP + 0.4) { // back out at her wind-up spot
        s.crouchT = s.crouched ? s.crouchT + dt : 0
        s.crouched = true
        if (s.crouchT >= WIGGLE) {
          // It's stayed put: she pounces right onto it.
          s.crouched = false
          s.crouchT = 0
          s.pounceFrom = { ...s.pos }
          s.pounceTo = leapTo(nav, { x: s.pos.x, y: s.y, z: s.pos.z }, target, MAX_POUNCE)
          s.pounceY = s.y
          s.pounceT = 0
          break
        }
        s.crouch = 0.8
        s.wiggle = 1
        turn(s, yawToward(s.pos, target), dt)
        break
      }
      // Her wind-up spot: a leap short of the dot, on her side of it, or round it if another cat's there (out of reach:
      // the nearest place she can stand)
      const goal = roundDot(nav, s.pos, target, others, WIND_UP, s.yaw)
      s.replan -= dt
      if (!s.path.length || (!onLink(s) && (s.replan <= 0 || dist(goal, s.goal) > 0.4))) plan(s, nav, links, goal, SPRINT * scale)
      if (walk(s, dt, tubeBusy)) turn(s, yawToward(s.pos, target), dt)
      break
    }
    case 'catching': {
      // Switched off on her: a pounce onto the spot, then she pins it under her front paws, flicks her tail and chirps.
      s.stand = 1
      const spot = target ?? { x: s.pos.x, y: s.y, z: s.pos.z }
      if (!s.pounceFrom) s.pounceFrom = { ...s.pos }
      const d = dist(s.pounceFrom, spot) || 1
      const land = { x: spot.x - ((spot.x - s.pounceFrom.x) / d) * PIN_BACK, z: spot.z - ((spot.z - s.pounceFrom.z) / d) * PIN_BACK }
      if (s.t < POUNCE_TIME) {
        const k = s.t / POUNCE_TIME
        s.pos = { x: s.pounceFrom.x + (land.x - s.pounceFrom.x) * k, z: s.pounceFrom.z + (land.z - s.pounceFrom.z) * k }
        s.flight = 1
        s.pitch = 15 * (1 - 2 * k)
      } else {
        s.pos = land
        s.crouch = 0.9
        s.pitch = -10 // nose down over her paws
        s.flick = s.t > 0.6 && s.t < 2.6 ? 1 : 0
      }
      s.chirp = s.t - dt < 0.6 && s.t >= 0.6
      turn(s, yawToward(s.pos, spot), dt * 4)
      break
    }
    case 'settling':
      s.stand = Math.max(0, s.stand - dt / SETTLE)
      if (s.path.length) follow(s, s.path[s.path.length - 1].y, dt)
      if (target) turn(s, yawToward(s.pos, target), dt)
      if (s.stand <= 0) {
        s.mode = 'lying'
        s.still = 0
      }
      break
    case 'lying':
      s.stand = 0
      s.still += dt
      if (s.still > CURL_AFTER) s.curl = Math.min(1, s.curl + dt / CURL) // settled in: curl up
      break
    case 'standoff': {
      // Stopped face to face: a low growl, fur up, crouched; a hiss or two, and swats at each other.
      s.stand = 1
      s.crouch = 0.45
      s.fight = 1
      if (s.foe) turn(s, yawToward(s.pos, s.foe), dt * 2)
      s.growl = s.t < dt + 1e-6
      s.hiss = [1.2, 2.5].some((h) => s.t - dt < h && s.t >= h)
      s.bat = s.t > 1.4 && Math.sin(s.t * 7) > 0.4 ? 1 : 0
      if (s.t >= STANDOFF_SECONDS) {
        s.foe = null
        s.t = 0
        if (s.loser) {
          // She backs down: turns tail and runs back out the way she came.
          const back = backOut(s)
          s.mode = back.length > 1 ? 'retreat' : intent ? 'going' : 'rejoin'
          s.path = back
          s.tl = back.length > 1 ? timeline(back, RUN) : null
          s.d = 0
          s.link = null
          s.tube = null
        } else if (s.wasRoutine && !intent) {
          // On her rounds: straight back to them, catching up along the passage.
          s.mode = 'routine'
          s.blend = 1
          s.path = []
          s.tl = null
          s.link = null
          s.tube = null
        } else {
          // She carries on to where she was going (or back to her rounds).
          s.mode = intent ? 'going' : 'rejoin'
          if (s.tl) s.replan = REPLAN // keep her current route: she's partway through the passage
        }
      }
      break
    }
    case 'retreat': {
      if (walk(s, dt)) {
        s.mode = intent ? 'going' : 'rejoin'
        s.path = []
        s.tl = null
        s.replan = 0
      }
      break
    }
    case 'rejoin': {
      const goal = snapOn(nav, routine)
      s.replan -= dt
      if (!s.path.length || (!onLink(s) && s.replan <= 0)) plan(s, nav, links, goal, TROT * scale)
      const done = walk(s, dt, tubeBusy)
      if (done || dist(s.pos, { x: routine.x, z: routine.z }) < 0.4) {
        s.mode = 'routine'
        s.blend = 1
        s.path = [] // her own route is done with: the next visit plans afresh from where she is
        s.tl = null
        s.link = null
      }
      break
    }
  }
  return s
}
