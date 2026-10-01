import { leap, leapSeconds } from './leap'
import { XZ, dist, yawToward } from './geom'

/**
 * Paths on the cats' walkable grid (generated from the furniture colliders).
 * Deterministic on purpose: every visitor's client must find the same path.
 */
export type Grid = { x0: number; z0: number; cell: number; cols: number; rows: number; walk: string }

// Each grid's open cells as bytes (1 open), worked out once: much quicker to test than the string.
const opens = new WeakMap<Grid, Uint8Array>()
function openCells(g: Grid): Uint8Array {
  let o = opens.get(g)
  if (!o) {
    o = new Uint8Array(g.cols * g.rows)
    for (let i = 0; i < o.length; i++) o[i] = g.walk.charCodeAt(i) === 49 ? 1 : 0
    opens.set(g, o)
  }
  return o
}
function ok(g: Grid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < g.cols && r < g.rows && openCells(g)[r * g.cols + c] === 1
}
function cellOf(g: Grid, p: XZ): [number, number] {
  return [Math.floor((p.x - g.x0) / g.cell), Math.floor((p.z - g.z0) / g.cell)]
}
function centre(g: Grid, c: number, r: number): XZ {
  return { x: g.x0 + (c + 0.5) * g.cell, z: g.z0 + (r + 0.5) * g.cell }
}

export function walkableAt(g: Grid, p: XZ): boolean {
  const [c, r] = cellOf(g, p)
  return ok(g, c, r)
}

/** The nearest open floor to p (p itself if it's walkable). Points off the grid are first pulled onto it. */
export function snap(g: Grid, p: XZ): XZ {
  if (walkableAt(g, p)) return p
  const inside = {
    x: Math.min(Math.max(p.x, g.x0 + g.cell / 2), g.x0 + (g.cols - 0.5) * g.cell),
    z: Math.min(Math.max(p.z, g.z0 + g.cell / 2), g.z0 + (g.rows - 0.5) * g.cell)
  }
  const [c0, r0] = cellOf(g, inside)
  let best: XZ | null = null
  let bestD = Infinity
  for (let ring = 1; ring < Math.max(g.cols, g.rows) && !best; ring++) {
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== ring || !ok(g, c, r)) continue
        const q = centre(g, c, r)
        const d = dist(q, p)
        if (d < bestD - 1e-9) {
          bestD = d
          best = q
        }
      }
    }
  }
  return best ?? p
}

/**
 * Whether the straight line from a to b stays on open floor: walks every grid cell
 * the line passes through (exactly, not by sampling), and where it crosses a cell
 * corner, both cells beside the corner must be open too.
 */
function lineClear(g: Grid, a: XZ, b: XZ): boolean {
  let [c, r] = cellOf(g, a)
  const dx = b.x - a.x
  const dz = b.z - a.z
  const sc = Math.sign(dx)
  const sr = Math.sign(dz)
  const tdc = dx !== 0 ? g.cell / Math.abs(dx) : Infinity
  const tdr = dz !== 0 ? g.cell / Math.abs(dz) : Infinity
  let tc = dx !== 0 ? (g.x0 + (c + (sc > 0 ? 1 : 0)) * g.cell - a.x) / dx : Infinity
  let tr = dz !== 0 ? (g.z0 + (r + (sr > 0 ? 1 : 0)) * g.cell - a.z) / dz : Infinity
  for (;;) {
    if (!ok(g, c, r)) return false
    if (tc > 1 && tr > 1) return true
    if (Math.abs(tc - tr) < 1e-9) {
      if (!ok(g, c + sc, r) || !ok(g, c, r + sr)) return false
      c += sc
      r += sr
      tc += tdc
      tr += tdr
    } else if (tc < tr) {
      c += sc
      tc += tdc
    } else {
      r += sr
      tr += tdr
    }
  }
}

// The A* heap's storage, shared between searches (grown as needed).
let HF = new Float64Array(4096)
let HH = new Float64Array(4096)
let HI = new Int32Array(4096)
function grow() {
  const f = new Float64Array(HF.length * 2), hh = new Float64Array(HF.length * 2), ii = new Int32Array(HF.length * 2)
  f.set(HF); hh.set(HH); ii.set(HI)
  HF = f; HH = hh; HI = ii
}

export function findPath(g: Grid, from: XZ, to: XZ): XZ[] {
  const a = snap(g, from)
  const b = snap(g, to)
  if (!walkableAt(g, a) || !walkableAt(g, b)) return [a] // no open floor at all: stay put
  if (lineClear(g, a, b)) return [a, b]
  const [sc, sr] = cellOf(g, a)
  const [tc, tr] = cellOf(g, b)
  const N = g.cols * g.rows
  const gs = new Float64Array(N).fill(Infinity)
  const came = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const start = sr * g.cols + sc
  const goal = tr * g.cols + tc
  const h = (i: number) => {
    const dx = Math.abs((i % g.cols) - tc)
    const dz = Math.abs(Math.floor(i / g.cols) - tr)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  // Binary heap of (f, h, index), in typed arrays; ties broken by h then index, so every client agrees.
  let n = 0
  const less = (x: number, y: number) =>
    HF[x] < HF[y] - 1e-9 || (Math.abs(HF[x] - HF[y]) <= 1e-9 && (HH[x] < HH[y] - 1e-9 || (Math.abs(HH[x] - HH[y]) <= 1e-9 && HI[x] < HI[y])))
  const swap = (x: number, y: number) => {
    const f = HF[x], hh = HH[x], ii = HI[x]
    HF[x] = HF[y]; HH[x] = HH[y]; HI[x] = HI[y]
    HF[y] = f; HH[y] = hh; HI[y] = ii
  }
  const push = (f: number, hh: number, idx: number) => {
    if (n >= HF.length) grow()
    HF[n] = f; HH[n] = hh; HI[n] = idx
    let k = n++
    while (k > 0) {
      const q = (k - 1) >> 1
      if (!less(k, q)) break
      swap(k, q)
      k = q
    }
  }
  const pop = (): number => {
    const top = HI[0]
    n--
    if (n > 0) {
      HF[0] = HF[n]; HH[0] = HH[n]; HI[0] = HI[n]
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < n && less(l, m)) m = l
        if (r < n && less(r, m)) m = r
        if (m === k) break
        swap(k, m)
        k = m
      }
    }
    return top
  }
  gs[start] = 0
  push(h(start), h(start), start)
  while (n > 0) {
    const i = pop()
    if (closed[i]) continue
    closed[i] = 1
    if (i === goal) break
    const c = i % g.cols
    const r = Math.floor(i / g.cols)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const nc = c + dc
        const nr = r + dr
        if (!ok(g, nc, nr)) continue
        if (dr && dc && (!ok(g, c + dc, r) || !ok(g, c, r + dr))) continue // no cutting corners
        const j = nr * g.cols + nc
        const ng = gs[i] + (dr && dc ? Math.SQRT2 : 1)
        if (ng < gs[j] - 1e-9) {
          gs[j] = ng
          came[j] = i
          push(ng + h(j), h(j), j)
        }
      }
    }
  }
  if (came[goal] < 0 && goal !== start) return [a]
  const cells: XZ[] = []
  for (let i = goal; i !== -1; i = came[i]) cells.push(centre(g, i % g.cols, Math.floor(i / g.cols)))
  cells.reverse()
  cells[0] = a
  cells[cells.length - 1] = b
  // Pull the string: keep only the points needed to see round corners.
  const out = [cells[0]]
  let i = 0
  while (i < cells.length - 1) {
    let j = cells.length - 1
    while (j > i + 1 && !lineClear(g, cells[i], cells[j])) j--
    out.push(cells[j])
    i = j
  }
  return out
}

export function pathLength(path: XZ[]): number {
  let d = 0
  for (let i = 0; i + 1 < path.length; i++) d += dist(path[i], path[i + 1])
  return d
}

export function along(path: XZ[], d: number): { p: XZ; yaw: number } {
  let rest = Math.max(0, d)
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]
    const b = path[i + 1]
    const seg = dist(a, b)
    if (rest <= seg || i + 2 === path.length) {
      const t = seg > 0 ? Math.min(1, rest / seg) : 1
      return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, yaw: yawToward(a, b) }
    }
    rest -= seg
  }
  return { p: { ...path[path.length - 1] }, yaw: 0 }
}
/** The areas the cats walk (a scene's floors): each a walkable grid over its own box, at its floor's height. */
export type Area = Grid & { y: number }
export type Nav = { areas: Area[] }
/** A point on a route. `hop`: she leaps to it from the point before; `link`: it's on a link (stairs, ramp, climb or narrow passage). */
export type P3 = { x: number; y: number; z: number; hop?: boolean; link?: boolean }
/** A way between two areas, from area `a` (its bottom end) to area `b` (its top end). */
export type Link = { a: number; b: number; bottom: XZ; top: XZ; points: P3[] }

export function gridOf(nav: Nav, area: number): Grid {
  return nav.areas[area]
}

function boxDist(a: Area, p: XZ): number {
  const x1 = a.x0 + a.cols * a.cell
  const z1 = a.z0 + a.rows * a.cell
  return Math.hypot(Math.max(a.x0 - p.x, 0, p.x - x1), Math.max(a.z0 - p.z, 0, p.z - z1))
}

/**
 * Which area a point is in: of the areas whose box it's in (or, if none, the nearest), the
 * highest whose floor is no more than a metre above it (so up the loft's cat tree is still the loft).
 */
export function areaAt(nav: Nav, p: { x: number; y: number; z: number }): number {
  const d = nav.areas.map((a) => boxDist(a, p))
  const near = Math.min(...d)
  const here = nav.areas.map((a, i) => ({ a, i })).filter(({ i }) => d[i] <= near + 1e-9)
  const below = here.filter(({ a }) => a.y <= p.y + 1)
  const pick = (below.length ? below : here).reduce((m, c) => ((below.length ? c.a.y > m.a.y : c.a.y < m.a.y) ? c : m))
  return pick.i
}

function onFloor(path: XZ[], y: number): P3[] {
  return path.map((p) => ({ x: p.x, y, z: p.z }))
}

/** A link's points the other way round: each hop stays on the same pair of points. */
function reversed(points: P3[]): P3[] {
  const n = points.length - 1
  return points.map((_, k) => ({ ...points[n - k], hop: k > 0 && !!points[n - k + 1].hop }))
}

const NOMINAL = 0.42 // m/s, for comparing routes

/** How wide a berth a walking cat gives another cat. */
export const AVOID_R = 0.45

/** The grid with the floor round each of `avoid` closed off (but never within half a metre of `keep`). */
function avoiding(g: Grid, avoid: XZ[], keep: XZ[]): Grid {
  if (!avoid.length) return g
  const w = openCells(g).slice()
  const n = Math.ceil(AVOID_R / g.cell)
  for (const p of avoid) {
    const [c0, r0] = cellOf(g, p)
    for (let r = r0 - n; r <= r0 + n; r++)
      for (let c = c0 - n; c <= c0 + n; c++) {
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) continue
        const q = centre(g, c, r)
        if (dist(q, p) < AVOID_R && keep.every((k) => dist(q, k) > 0.5)) w[r * g.cols + c] = 0
      }
  }
  const out = { ...g } // same cells, some closed: its open cells are these bytes, not its string
  opens.set(out, w)
  return out
}

/** Whether a route passes within `r` of `p` on p's floor (walking, not leaping over). */
export function passesNear(path: P3[], p: P3, r: number): boolean {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]
    const b = path[i + 1]
    if (b.hop || Math.abs(a.y - p.y) > 0.3 || Math.abs(b.y - p.y) > 0.3) continue
    const dx = b.x - a.x
    const dz = b.z - a.z
    const L = dx * dx + dz * dz
    const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0
    if (Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) < r) return true
  }
  return false
}

type Step = { l: Link; up: boolean; to: number }

/** Every way from area `a` to area `b` using one link, or two through an area in between. */
function chains(links: Link[], a: number, b: number): Step[][] {
  const steps = (x: number): Step[] =>
    links.flatMap((l): Step[] => (l.a === x ? [{ l, up: true, to: l.b }] : l.b === x ? [{ l, up: false, to: l.a }] : []))
  const out: Step[][] = []
  for (const s1 of steps(a)) {
    if (s1.to === b) out.push([s1])
    else for (const s2 of steps(s1.to)) if (s2.to === b && s2.l !== s1.l) out.push([s1, s2])
  }
  return out
}

/**
 * A route from one place to another: a floor path if they're in the same area; otherwise to the
 * end of the quickest link (or pair of links), along it, and on from there. The same inputs
 * always give the same route.
 */
export function route(nav: Nav, links: Link[], from: P3, to: P3, avoid: P3[] = []): P3[] {
  const a = areaAt(nav, from)
  const b = areaAt(nav, to)
  const keep = [from, to, ...links.flatMap((l) => [l.bottom, l.top])]
  const grid = (k: number) => avoiding(gridOf(nav, k), avoid.filter((p) => areaAt(nav, p) === k), keep)
  const walk = (k: number, p: XZ, q: XZ) => onFloor(findPath(grid(k), p, q), nav.areas[k].y)
  if (a === b) return walk(a, from, to)
  let best: P3[] = []
  let cost = Infinity
  let chosen = Infinity
  // Try each way, cheapest-looking first; skip any that can't beat the best found even walking straight.
  const hopeful = chains(links, a, b)
    .map((c, k) => {
      let hope = 0
      let at: XZ = from
      for (const s of c) {
        hope += dist(at, s.up ? s.l.bottom : s.l.top) / NOMINAL + timeline(s.l.points, NOMINAL).total
        at = s.up ? s.l.top : s.l.bottom
      }
      return { c, k, hope: hope + dist(at, to) / NOMINAL }
    })
    .sort((p, q) => p.hope - q.hope || p.k - q.k)
  for (const { c, k, hope } of hopeful) {
    if (hope > cost + 1e-9) continue
    const r: P3[] = []
    let at: XZ = from
    let area = a
    let landing = false // the last link ended in a hop onto this area's floor
    for (const s of c) {
      const floor = walk(area, at, s.up ? s.l.bottom : s.l.top)
      if (landing) floor[0] = { ...floor[0], hop: true }
      r.push(...floor)
      const way = s.up ? s.l.points : reversed(s.l.points)
      r.push(...way.slice(1, -1).map((p) => ({ ...p, link: true })))
      landing = !!way[way.length - 1].hop
      at = s.up ? s.l.top : s.l.bottom
      area = s.to
    }
    const last = walk(b, at, to)
    if (landing) last[0] = { ...last[0], hop: true } // the last hop lands on this floor
    r.push(...last)
    const t = timeline(r, NOMINAL).total
    if (t < cost - 1e-9 || (Math.abs(t - cost) <= 1e-9 && k < chosen)) {
      best = r
      cost = t
      chosen = k
    }
  }
  return best
}

/** When she reaches each point walking at `speed` (hops take a leap's time), and how far she has walked. */
export type Timeline = { times: number[]; walked: number[]; total: number }
export function timeline(path: P3[], speed: number): Timeline {
  const times = [0]
  const walked = [0]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    times.push(times[i - 1] + (b.hop ? leapSeconds(a.y, b.y) : d / speed))
    walked.push(walked[i - 1] + (b.hop ? 0 : d))
  }
  return { times, walked, total: times[times.length - 1] }
}

/** `link`: on the stairs or the climb (or stepping on or off them). */
export type RoutePose = { p: P3; yaw: number; pitch: number; crouch: number; flight: number; hop: boolean; link: boolean; walked: number }
/** Where she is `t` seconds along a timed route: walking, or partway through a leap. */
export function poseOn(path: P3[], tl: Timeline, t: number): RoutePose {
  const n = path.length
  const still = (p: P3, yaw: number, walked: number): RoutePose => ({ p: { x: p.x, y: p.y, z: p.z }, yaw, pitch: 0, crouch: 0, flight: 0, hop: false, link: false, walked })
  if (n < 2) return still(path[0] ?? { x: 0, y: 0, z: 0 }, 0, 0)
  let i = 0
  while (i < n - 2 && t >= tl.times[i + 1]) i++
  const a = path[i]
  const b = path[i + 1]
  const flat = Math.hypot(b.x - a.x, b.z - a.z) > 1e-6
  const yaw = flat ? yawToward(a, b) : 0
  const u = Math.max(0, Math.min(t, tl.total) - tl.times[i])
  if (b.hop) {
    const l = leap(a, a.y, b, b.y, u, yaw)
    return { p: { x: l.x, y: l.y, z: l.z }, yaw: l.yaw, pitch: l.pitch, crouch: l.crouch, flight: l.flight, hop: true, link: !!(a.link || b.link), walked: tl.walked[i] }
  }
  const seg = tl.times[i + 1] - tl.times[i]
  const k = seg > 0 ? Math.min(1, u / seg) : 1
  const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k }
  return { ...still(p, yaw, tl.walked[i] + (tl.walked[i + 1] - tl.walked[i]) * k), p, link: !!(a.link || b.link) }
}

export function length3(path: P3[]): number {
  let d = 0
  for (let i = 0; i + 1 < path.length; i++) d += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y, path[i + 1].z - path[i].z)
  return d
}

export function along3(path: P3[], d: number): { p: P3; yaw: number } {
  let rest = Math.max(0, d)
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]
    const b = path[i + 1]
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (rest <= seg || i + 2 === path.length) {
      const t = seg > 0 ? Math.min(1, rest / seg) : 1
      const flat = Math.hypot(b.x - a.x, b.z - a.z) > 1e-6
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, yaw: flat ? yawToward(a, b) : 0 }
    }
    rest -= seg
  }
  const e = path[path.length - 1]
  return { p: { ...e }, yaw: 0 }
}
