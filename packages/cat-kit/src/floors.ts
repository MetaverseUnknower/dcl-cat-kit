import { Area, Link, Nav, P3, walkableAt, snap } from './path'
import { Spot } from './routine'
import { Box } from './geom'

/**
 * A scene's floors, described simply, made into what the cats walk on: a grid per floor (open where a cat can stand,
 * a margin off every edge and obstacle), links between floors (stairs, ramps, climbs, narrow passages), and the spots
 * the routine sends them to. The same structures the MetaPetal Cat Cafe generates from its models.
 */
export type Shape = { kind: 'rect'; x0: number; z0: number; x1: number; z1: number } | { kind: 'circle'; x: number; z: number; r: number }
export const rect = (x0: number, z0: number, x1: number, z1: number): Shape => ({ kind: 'rect', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) })
export const circle = (x: number, z: number, r: number): Shape => ({ kind: 'circle', x, z, r })

export type FloorDef = { name: string; y: number; walk: Shape[]; avoid?: Shape[] }
type XZt = [number, number]
export type LinkDef = { from: XZt; to: XZt; up: number; points: [number, number, number][]; narrow: boolean }
export type SpotDef = { x: number; z: number; height: number; yaw: number; floor?: string; sun?: boolean; watch?: number }
export type Floors = { nav: Nav; links: Link[]; spots: Spot[]; bounds: Box[]; narrow: (p: P3) => boolean; homes(n: number): number[] }

const MARGIN = 0.3 // metres: how far a cat keeps from a wall or an obstacle's edge

/** Stairs from a floor point up `up` metres to a floor point on the floor above, in even steps. */
export function stairs(o: { from: XZt; to: XZt; up: number; steps?: number }): LinkDef {
  const n = o.steps ?? Math.max(4, Math.round(o.up / 0.18))
  const points: [number, number, number][] = []
  for (let k = 1; k < n; k++) points.push([o.from[0] + ((o.to[0] - o.from[0]) * k) / n, (o.up * k) / n, o.from[1] + ((o.to[1] - o.from[1]) * k) / n])
  return { from: o.from, to: o.to, up: o.up, points, narrow: false }
}
/** A ramp: stairs with fine steps. */
export const ramp = (o: { from: XZt; to: XZt; up: number }): LinkDef => stairs({ ...o, steps: Math.max(8, Math.round(o.up / 0.05)) })
/** A cat's own way up: hop from perch to perch (`[x, y, z]`, heights above the lower floor). */
export const climb = (o: { from: XZt; perches: [number, number, number][]; to: XZt; up: number }): LinkDef => ({ from: o.from, to: o.to, up: o.up, points: o.perches, narrow: false })
/** A passage wide enough for one cat (a tunnel, a plank): two meeting there have a standoff and one backs out. */
export const narrow = (o: { from: XZt; points: [number, number, number][]; to: XZt; up: number }): LinkDef => ({ from: o.from, to: o.to, up: o.up, points: o.points, narrow: true })

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
  const b = f.walk.map(box).reduce((a, c) => ({ x0: Math.min(a.x0, c.x0), z0: Math.min(a.z0, c.z0), x1: Math.max(a.x1, c.x1), z1: Math.max(a.z1, c.z1) }))
  const cols = Math.max(1, Math.ceil((b.x1 - b.x0) / cell))
  const rows = Math.max(1, Math.ceil((b.z1 - b.z0) / cell))
  let walk = ''
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = b.x0 + (c + 0.5) * cell
      const z = b.z0 + (r + 0.5) * cell
      const open = f.walk.some((s) => inside(s, x, z, -MARGIN)) && !(f.avoid ?? []).some((s) => inside(s, x, z, MARGIN))
      walk += open ? '1' : '0'
    }
  if (!walk.includes('1')) throw new Error(`dcl-cat-kit: floor "${f.name}" has no walkable cells (is it smaller than ${2 * MARGIN} m across?)`)
  return { x0: b.x0, z0: b.z0, cell, cols, rows, walk, y: f.y }
}

export function defineFloors(o: { floors: FloorDef[]; links?: LinkDef[]; spots: SpotDef[]; cell?: number }): Floors {
  if (!o.floors.length) throw new Error('dcl-cat-kit: defineFloors needs at least one floor')
  const cell = o.cell ?? 0.25
  const areas = o.floors.map((f) => grid(f, cell)) // (each floor checked first: its problem is the one to report)
  if (!o.spots.length) throw new Error('dcl-cat-kit: defineFloors needs at least one spot (a bed, perch or sunny place) for the routine')
  const nav: Nav = { areas }
  const floorAt = (y: number) => areas.findIndex((a) => Math.abs(a.y - y) < 0.05)
  const nearest = (area: number, x: number, z: number) => snap(areas[area], { x, z })
  const links: Link[] = (o.links ?? []).map((l, i) => {
    // Its lower floor: the lowest floor with walkable ground within 1 m of where it starts
    const a =
      areas
        .map((ar, k) => {
          const q = nearest(k, l.from[0], l.from[1])
          return { k, y: ar.y, d: Math.hypot(q.x - l.from[0], q.z - l.from[1]) }
        })
        .filter((c) => c.d <= 1)
        .sort((p, q) => p.y - q.y)[0]?.k ?? -1
    const lowY = areas[a]?.y ?? 0
    const b = floorAt(lowY + l.up)
    if (a < 0 || b < 0) throw new Error(`dcl-cat-kit: link ${i} (from [${l.from}] up ${l.up} m) ends where there's no floor at height ${lowY + l.up}`)
    const bottom = nearest(a, l.from[0], l.from[1])
    const top = nearest(b, l.to[0], l.to[1])
    const points: P3[] = [{ x: bottom.x, y: lowY, z: bottom.z }, ...l.points.map(([x, y, z]) => ({ x, y: lowY + y, z, hop: !l.narrow && y > 0.05 && l.points.length < 12 })), { x: top.x, y: lowY + l.up, z: top.z }]
    return { a, b, bottom, top, points }
  })
  const narrowPts = (o.links ?? []).flatMap((l, i) => (l.narrow ? links[i].points.slice(1, -1) : []))
  const spots: Spot[] = o.spots.map((s, i) => {
    let area = 0
    if (s.floor !== undefined) {
      area = o.floors.findIndex((f) => f.name === s.floor)
      if (area < 0) throw new Error(`dcl-cat-kit: spot ${i} names no floor named "${s.floor}"`)
    }
    const g = areas[area]
    const near = nearest(area, s.x, s.z)
    if (s.height === 0 && !walkableAt(g, { x: s.x, z: s.z }) && Math.hypot(near.x - s.x, near.z - s.z) > 1)
      throw new Error(`dcl-cat-kit: spot ${i} (${s.x}, ${s.z}) isn't on floor "${o.floors[area].name}"`)
    const onFloor = s.height === 0 ? near : { x: s.x, z: s.z }
    return { x: onFloor.x, z: onFloor.z, y: g.y + s.height, yaw: s.yaw, bx: near.x, bz: near.z, area, ...(s.sun ? { sun: true } : {}), ...(s.watch !== undefined ? { watch: s.watch } : {}) }
  })
  return {
    nav,
    links,
    spots,
    bounds: o.floors.flatMap((f) => f.walk.map(box)),
    narrow: (p) => narrowPts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.5 && Math.abs(q.y - p.y) < 0.5),
    homes: (n) => Array.from({ length: n }, (_, k) => k % spots.length)
  }
}
