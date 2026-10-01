import { Area, Link, Nav, P3, walkableAt, snap } from './path'
import { Spot } from './routine'
import { Box } from './geom'

/**
 * A scene's floors, described simply, made into what the cats walk on: a grid per floor (open where a cat can stand,
 * a margin off every edge and obstacle), links between floors (stairs, ramps, climbs, narrow passages), and the spots
 * the routine sends them to.
 */
/** An area on a floor, in scene metres (x and z across the ground). Make one with `rect` or `circle`. */
export type Shape = { kind: 'rect'; x0: number; z0: number; x1: number; z1: number } | { kind: 'circle'; x: number; z: number; r: number }
/** A rectangle from corner (x0, z0) to corner (x1, z1), in scene metres; the corners can come in either order. */
export const rect = (x0: number, z0: number, x1: number, z1: number): Shape => ({ kind: 'rect', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) })
/** A circle centred on (x, z) with radius r, in scene metres. */
export const circle = (x: number, z: number, r: number): Shape => ({ kind: 'circle', x, z, r })

/**
 * One floor. `name`: what spots call it (`{ floor: name }`). `y`: the height of its walking surface, in metres.
 * `walk`: where a cat can stand (shapes may overlap or touch). `avoid`: what to keep out of (furniture, pillars, water).
 * Draw shapes at the real edges: cats keep about 0.3 m from every edge and avoid shape by themselves.
 */
export type FloorDef = { name: string; y: number; walk: Shape[]; avoid?: Shape[] }
type XZt = [number, number]
/** A way between two floors. Make one with `stairs`, `ramp`, `climb` or `narrow`. */
export type LinkDef = { from: XZt; to: XZt; up: number; points: [number, number, number][]; narrow: boolean; hops: boolean }
/** A place the routine sends cats to. Make one with `spot.bed`, `spot.perch`, `spot.sunny` or `spot.watch`. */
export type SpotDef = { x: number; z: number; height: number; yaw: number; floor?: string; sun?: boolean; watch?: number }
/** What `defineFloors` builds: pass it to `addCats` (and to `showFloors` to check it). Treat it as opaque. */
export type Floors = { nav: Nav; links: Link[]; spots: Spot[]; bounds: Box[]; narrow: (p: P3) => boolean; homes(n: number): number[] }

const MARGIN = 0.3 // metres: how far a cat keeps from a wall or an obstacle's edge

/**
 * Stairs, walked step by step. `from`: [x, z] on the lower floor (the foot). `to`: [x, z] on the upper floor (the top).
 * `up`: the upper floor's y minus the lower floor's, exactly. Each end must be within 1 m of its floor's walkable
 * ground. The steps are even, about 18 cm each unless you set `steps`; `.points` gives each step's [x, y, z] (y above the
 * lower floor), so you can build the visible steps on the cats' own path.
 */
export function stairs(o: { from: XZt; to: XZt; up: number; steps?: number }): LinkDef {
  const n = o.steps ?? Math.max(4, Math.round(o.up / 0.18))
  const points: [number, number, number][] = []
  for (let k = 1; k < n; k++) points.push([o.from[0] + ((o.to[0] - o.from[0]) * k) / n, (o.up * k) / n, o.from[1] + ((o.to[1] - o.from[1]) * k) / n])
  return { from: o.from, to: o.to, up: o.up, points, narrow: false, hops: false } // walked, step by step
}
/** A ramp: like `stairs`, but a smooth slope (fine 5 cm steps). */
export const ramp = (o: { from: XZt; to: XZt; up: number }): LinkDef => stairs({ ...o, steps: Math.max(8, Math.round(o.up / 0.05)) })
/**
 * A cat's own way up, leapt perch to perch: a cat tree, shelves on a wall. `from`: [x, z] on the lower floor. `perches`:
 * [x, y, z] for each perch in order, y its height above the lower floor (keep each hop under about 1 m). `to`: [x, z] on
 * the upper floor. `up`: the upper floor's y minus the lower floor's.
 */
export const climb = (o: { from: XZt; perches: [number, number, number][]; to: XZt; up: number }): LinkDef => ({ from: o.from, to: o.to, up: o.up, points: o.perches, narrow: false, hops: true }) // leapt, perch to perch
/**
 * A passage wide enough for one cat (a tunnel, a plank), walked through its `points` ([x, y, z], y above the lower
 * floor). Two cats meeting inside stop, growl and hiss, and one backs out. Otherwise like `stairs`.
 */
export const narrow = (o: { from: XZt; points: [number, number, number][]; to: XZt; up: number }): LinkDef => ({ from: o.from, to: o.to, up: o.up, points: o.points, narrow: true, hops: false }) // walked, single file

/**
 * Spots: where the routine sends the cats. All take x and z in scene metres, an optional `yaw` (degrees: which way she
 * faces there) and, last, `{ floor: 'name' }` for a spot on any floor but the first. The first spots in the list are the
 * cats' homes, one per cat, in order. `bed`: a nap place. `perch(x, height, z)`: something to jump up onto, `height`
 * above its floor, within 1.5 m of walkable ground. `sunny`: a warm place to stretch out. `watch(x, z, yaw, target)`: a
 * place to watch something move (addCats' `watch` option says where, by `target` number).
 */
export const spot = {
  bed: (x: number, z: number, yaw = 0, o: { floor?: string } = {}): SpotDef => ({ x, z, height: 0, yaw, ...o }),
  perch: (x: number, height: number, z: number, yaw = 0, o: { floor?: string } = {}): SpotDef => ({ x, z, height, yaw, ...o }),
  sunny: (x: number, z: number, yaw = 0, o: { floor?: string } = {}): SpotDef => ({ x, z, height: 0, yaw, sun: true, ...o }),
  watch: (x: number, z: number, yaw: number, target: number, o: { floor?: string } = {}): SpotDef => ({ x, z, height: 0, yaw, watch: target, ...o })
}

function inside(s: Shape, x: number, z: number, grow: number): boolean {
  if (s.kind === 'rect') return x >= s.x0 - grow && x <= s.x1 + grow && z >= s.z0 - grow && z <= s.z1 + grow
  return Math.hypot(x - s.x, z - s.z) <= s.r + grow
}
function box(s: Shape): Box {
  return s.kind === 'rect' ? { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 } : { x0: s.x - s.r, z0: s.z - s.r, x1: s.x + s.r, z1: s.z + s.r }
}

function grid(f: FloorDef, cell: number): Area {
  if (!f.walk.length) throw new Error(`dcl-cat-kit: floor "${f.name}" has no walk shapes. Fix: give it walk: [rect(x0, z0, x1, z1)] covering where a cat can stand on it (scene metres).`)
  const b = f.walk.map(box).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), z0: Math.min(a.z0, c.z0), x1: Math.max(a.x1, c.x1), z1: Math.max(a.z1, c.z1) }))
  const cols = Math.max(1, Math.ceil((b.x1 - b.x0) / cell))
  const rows = Math.max(1, Math.ceil((b.z1 - b.z0) / cell))
  const at = (c: number, r: number) => ({ x: b.x0 + (c + 0.5) * cell, z: b.z0 + (r + 0.5) * cell })
  // The floor itself (all its shapes together, so shapes that touch make one floor), then a margin off its real edges
  const base: boolean[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) base.push(f.walk.some((s) => inside(s, at(c, r).x, at(c, r).z, 0)))
  const k = Math.ceil(MARGIN / cell)
  let walk = ''
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = at(c, r)
      let open = base[r * cols + c] && !(f.avoid ?? []).some((s) => inside(s, p.x, p.z, MARGIN))
      for (let dr = -k; dr <= k && open; dr++)
        for (let dc = -k; dc <= k && open; dc++) {
          if (Math.hypot(dc, dr) * cell > MARGIN + 1e-9) continue
          const cc = c + dc
          const rr = r + dr
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows || !base[rr * cols + cc]) open = false
        }
      walk += open ? '1' : '0'
    }
  if (!walk.includes('1')) throw new Error(`dcl-cat-kit: floor "${f.name}" has no walkable cells: cats keep ${MARGIN} m from every edge and avoid shape, and nothing is left. Fix: make its walk shapes bigger than ${2 * MARGIN} m across, or its avoid shapes smaller.`)
  return { x0: b.x0, z0: b.z0, cell, cols, rows, walk, y: f.y }
}

/** Whether p is on a narrow passage: within 0.5 m of the line through its points (and at its height there). */
function nearRun(run: P3[], p: P3): boolean {
  for (let k = 0; k + 1 < run.length || (run.length === 1 && k === 0); k++) {
    const a = run[k]
    const b = run[Math.min(k + 1, run.length - 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0
    const q = { x: a.x + dx * t, y: a.y + (b.y - a.y) * t, z: a.z + dz * t }
    if (Math.hypot(p.x - q.x, p.z - q.z) < 0.5 && Math.abs(p.y - q.y) < 0.5) return true
    if (run.length === 1) break
  }
  return false
}

/**
 * Build the cats' map of the scene, once, in main(). Checks everything as it goes: a mistake throws an error starting
 * `dcl-cat-kit:` that names the floor, link or spot and ends with `Fix:`, what to change. `cell` is the grid's
 * resolution in metres (default 0.25).
 */
export function defineFloors(o: { floors: FloorDef[]; links?: LinkDef[]; spots: SpotDef[]; cell?: number }): Floors {
  if (!o.floors.length) throw new Error('dcl-cat-kit: defineFloors needs at least one floor. Fix: floors: [{ name: \'ground\', y: 0, walk: [rect(x0, z0, x1, z1)] }].')
  const cell = o.cell ?? 0.25
  const areas = o.floors.map((f) => grid(f, cell)) // (each floor checked first: its problem is the one to report)
  if (!o.spots.length) throw new Error('dcl-cat-kit: defineFloors needs at least one spot (a bed, perch or sunny place) for the routine. Fix: add spots: [spot.bed(x, z), ...], at least one per cat (the first ones are the cats\' homes).')
  const nav: Nav = { areas }
  const nearest = (area: number, x: number, z: number) => snap(areas[area], { x, z })
  const gap = (area: number, x: number, z: number) => {
    const q = nearest(area, x, z)
    return walkableAt(areas[area], q) ? Math.hypot(q.x - x, q.z - z) : Infinity
  }
  const ON = 1 // metres: how near a floor's walkable ground a link's end or a perch must be
  const links: Link[] = (o.links ?? []).map((l, i) => {
    const feet = areas.map((_, k) => k).filter((k) => gap(k, l.from[0], l.from[1]) <= ON)
    if (!feet.length) throw new Error(`dcl-cat-kit: link ${i} (from [${l.from}]): its foot [${l.from}] isn't on a floor (it must be within ${ON} m of a floor's walkable ground). Fix: move \`from\` onto the lower floor, or widen that floor's walk shapes to reach it.`)
    // Its lower floor: one its foot is on with a floor `up` above it where its top lands (the lowest, if several)
    const tops = (a: number) => areas.map((_, k) => k).filter((k) => Math.abs(areas[k].y - (areas[a].y + l.up)) < 0.05 && gap(k, l.to[0], l.to[1]) <= ON)
    const a = feet.sort((p, q) => areas[p].y - areas[q].y).find((k) => tops(k).length > 0)
    if (a === undefined) {
      const lowY = areas[feet[0]].y
      throw new Error(`dcl-cat-kit: link ${i} (up ${l.up} m): its top [${l.to}] isn't on a floor: there's no floor at height ${lowY + l.up} there. Fix: set \`up\` to the upper floor's y minus the lower floor's (${o.floors.map((f) => `${f.name}: ${f.y}`).join(', ')}), and put \`to\` inside the upper floor's walk shapes.`)
    }
    const b = tops(a).sort((p, q) => gap(p, l.to[0], l.to[1]) - gap(q, l.to[0], l.to[1]))[0] // the one nearest its top
    const lowY = areas[a].y
    const bottom = nearest(a, l.from[0], l.from[1])
    const top = nearest(b, l.to[0], l.to[1])
    const points: P3[] = [{ x: bottom.x, y: lowY, z: bottom.z }, ...l.points.map(([x, y, z]) => ({ x, y: lowY + y, z, ...(l.hops ? { hop: true } : {}) })), { x: top.x, y: lowY + l.up, z: top.z }]
    return { a, b, bottom, top, points }
  })
  const narrowRuns = (o.links ?? []).flatMap((l, i) => (l.narrow ? [links[i].points.slice(1, -1)] : []))
  const spots: Spot[] = o.spots.map((s, i) => {
    let area = 0
    if (s.floor !== undefined) {
      area = o.floors.findIndex((f) => f.name === s.floor)
      if (area < 0) throw new Error(`dcl-cat-kit: spot ${i} names no floor named "${s.floor}". Fix: use one of the floor names: ${o.floors.map((f) => `"${f.name}"`).join(', ')}.`)
    }
    const g = areas[area]
    const near = nearest(area, s.x, s.z)
    if (s.height === 0 && !walkableAt(g, { x: s.x, z: s.z }) && Math.hypot(near.x - s.x, near.z - s.z) > 1)
      throw new Error(`dcl-cat-kit: spot ${i} (${s.x}, ${s.z}) isn't on floor "${o.floors[area].name}". Fix: move it inside that floor's walk shapes and out of its avoid shapes${s.floor === undefined ? ', or add { floor: \'name\' } if it\'s on another floor' : ''}.`)
    if (s.height > 0 && Math.hypot(near.x - s.x, near.z - s.z) > 1.5)
      throw new Error(`dcl-cat-kit: spot ${i} (a perch at [${s.x}, ${s.z}]) is too far from floor "${o.floors[area].name}" to jump up to (more than 1.5 m from its walkable ground). Fix: move the perch nearer the floor, or check its floor and its x and z (spot.perch takes x, height, z).`)
    const onFloor = s.height === 0 ? near : { x: s.x, z: s.z }
    return { x: onFloor.x, z: onFloor.z, y: g.y + s.height, yaw: s.yaw, bx: near.x, bz: near.z, area, ...(s.sun ? { sun: true } : {}), ...(s.watch !== undefined ? { watch: s.watch } : {}) }
  })
  return {
    nav,
    links,
    spots,
    bounds: o.floors.flatMap((f) => f.walk.map(box)),
    narrow: (p) => narrowRuns.some((run) => nearRun(run, p)),
    homes: (n) => Array.from({ length: n }, (_, k) => k % spots.length)
  }
}

/** A floor's walkable cells as runs along each row (for drawing it: one box per run, not per cell). */
export function strips(a: Area): { x0: number; x1: number; z: number; cells: number }[] {
  const out: { x0: number; x1: number; z: number; cells: number }[] = []
  for (let r = 0; r < a.rows; r++) {
    let c = 0
    while (c < a.cols) {
      if (a.walk[r * a.cols + c] !== '1') {
        c++
        continue
      }
      const start = c
      while (c < a.cols && a.walk[r * a.cols + c] === '1') c++
      out.push({ x0: a.x0 + start * a.cell, x1: a.x0 + c * a.cell, z: a.z0 + (r + 0.5) * a.cell, cells: c - start })
    }
  }
  return out
}
