import { describe, it, expect } from 'vitest'
import { findPath, pathLength, along, snap, walkableAt, Grid, gridOf, areaAt, route, along3, length3, timeline, poseOn } from '../src/path'
import { CROUCH, leapSeconds } from '../src/leap'
import { NAV, SPOTS, LINKS } from './fixtures/cafe-nav'

// A 10 x 10 grid of 1 m cells with a wall down x = 5 and a single gap at z = 8.
function wallGrid(): Grid {
  let walk = ''
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) walk += c === 5 && r !== 8 ? '0' : '1'
  return { x0: 0, z0: 0, cell: 1, cols: 10, rows: 10, walk }
}

function clear(g: Grid, path: { x: number; z: number }[]) {
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]
    const b = path[i + 1]
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1)
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }
      if (!walkableAt(g, p)) return false
    }
  }
  return true
}

describe('findPath', () => {
  it('goes round the wall through the gap', () => {
    const g = wallGrid()
    const p = findPath(g, { x: 1.5, z: 1.5 }, { x: 8.5, z: 1.5 })
    expect(p[0]).toEqual({ x: 1.5, z: 1.5 })
    expect(p[p.length - 1]).toEqual({ x: 8.5, z: 1.5 })
    expect(p.some((q) => q.z > 7.5)).toBe(true)
    expect(clear(g, p)).toBe(true)
    expect(pathLength(p)).toBeGreaterThan(14)
  })

  it('takes the straight line when it is clear', () => {
    const g = wallGrid()
    expect(findPath(g, { x: 0.5, z: 0.5 }, { x: 3.5, z: 4.5 })).toEqual([
      { x: 0.5, z: 0.5 },
      { x: 3.5, z: 4.5 }
    ])
  })

  it('snaps ends that are inside furniture to the nearest open floor', () => {
    const g = wallGrid()
    const s = snap(g, { x: 5.5, z: 3.5 })
    expect(walkableAt(g, s)).toBe(true)
    expect(Math.abs(s.x - 5.5)).toBeLessThanOrEqual(1.01)
  })

  it('is the same every time (every client must agree)', () => {
    const a = findPath(gridOf(NAV, 0), { x: 7.5, z: 12 }, { x: 28.6, z: 17 })
    const b = findPath(gridOf(NAV, 0), { x: 7.5, z: 12 }, { x: 28.6, z: 17 })
    expect(a).toEqual(b)
    expect(clear(gridOf(NAV, 0), a)).toBe(true)
  })
})

describe('along', () => {
  it('walks a path by distance and faces the way it goes', () => {
    const path = [
      { x: 0, z: 0 },
      { x: 0, z: -2 },
      { x: 2, z: -2 }
    ]
    expect(along(path, 1).p).toEqual({ x: 0, z: -1 })
    expect(along(path, 1).yaw).toBeCloseTo(0) // heading -Z
    expect(along(path, 3).p).toEqual({ x: 1, z: -2 })
    expect(along(path, 99).p).toEqual({ x: 2, z: -2 })
  })
})

describe('paths between the real spots', () => {
  it('never clip a corner of furniture, even between samples', () => {
    for (let a = 0; a < SPOTS.length; a += 3) {
      for (let b = 1; b < SPOTS.length; b += 4) {
        const p = findPath(gridOf(NAV, 0), { x: SPOTS[a].bx, z: SPOTS[a].bz }, { x: SPOTS[b].bx, z: SPOTS[b].bz })
        for (let i = 0; i + 1 < p.length; i++) {
          const n = Math.max(1, Math.ceil(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z) / 0.02))
          for (let k = 0; k <= n; k++) {
            const q = { x: p[i].x + ((p[i + 1].x - p[i].x) * k) / n, z: p[i].z + ((p[i + 1].z - p[i].z) * k) / n }
            expect(walkableAt(gridOf(NAV, 0), q)).toBe(true)
          }
        }
      }
    }
  })
})

describe('targets far off the grid', () => {
  it('snap always lands on open floor, however far away the point is', () => {
    for (const p of [{ x: 18, z: 39 }, { x: 48.2, z: 14 }, { x: -20, z: -20 }, { x: 90, z: 60 }]) {
      expect(walkableAt(gridOf(NAV, 0), snap(gridOf(NAV, 0), p))).toBe(true)
    }
  })

  it('paths to a visitor far outside end inside, on open floor, and finish', () => {
    for (const to of [{ x: 18, z: 39 }, { x: 48.2, z: 14 }, { x: -13, z: 10 }]) {
      const p = findPath(gridOf(NAV, 0), { x: 20, z: 14 }, to)
      expect(p.length).toBeLessThan(200)
      for (const q of p) expect(walkableAt(gridOf(NAV, 0), q)).toBe(true)
    }
  })
})

describe('routes between floors', () => {
  const g0 = gridOf(NAV, 0)
  const g1 = gridOf(NAV, 1)
  const LOFT = NAV.areas[1].y

  it('knows which floor a height belongs to', () => {
    expect(areaAt(NAV, { x: 18, y: 0, z: 14 })).toBe(0)
    expect(areaAt(NAV, { x: 18, y: LOFT, z: 21 })).toBe(1)
    expect(areaAt(NAV, { x: 29.6, y: LOFT + 1.9, z: 20.4 })).toBe(1) // up the loft cat tree
  })

  it('takes the stairs, never floating through the slab', () => {
    const p = route(NAV, [LINKS[0]], { x: 20, y: 0, z: 9.6 }, { x: 18, y: LOFT, z: 21.2 })
    expect(p[0].y).toBe(0)
    expect(p[p.length - 1].y).toBe(LOFT)
    const rising = p.filter((q) => q.y > 0.01 && q.y < LOFT - 0.01)
    expect(rising.length).toBeGreaterThan(5) // the staircase itself
    for (let i = 1; i < p.length; i++) {
      if (p[i].y !== p[i - 1].y) expect(p[i].y).toBeGreaterThan(p[i - 1].y) // only ever up, on the way up
    }
    for (const q of p) {
      if (q.y === 0) expect(walkableAt(g0, q)).toBe(true)
      if (q.y === LOFT) expect(walkableAt(g1, q)).toBe(true)
    }
    expect(length3(p)).toBeGreaterThan(15)
  })

  it('comes back down the same way, and stays on the loft when it can', () => {
    const down = route(NAV, [LINKS[0]], { x: 18, y: LOFT, z: 21.2 }, { x: 20, y: 0, z: 9.6 })
    expect(down[0].y).toBe(LOFT)
    expect(down[down.length - 1].y).toBe(0)
    const loft = route(NAV, [LINKS[0]], { x: 9, y: LOFT, z: 20.6 }, { x: 27.6, y: LOFT, z: 15 })
    expect(loft.every((q) => q.y === LOFT)).toBe(true)
  })

  it('climbs the wall when that is quicker, hopping shelf to shelf', () => {
    const p = route(NAV, LINKS, { x: 28, y: 0, z: 9 }, { x: 28, y: LOFT, z: 12 })
    const hops = p.filter((q) => q.hop)
    expect(hops.length).toBe(8)
    for (let i = 1; i < p.length; i++) if (p[i].hop) expect(p[i].y).toBeGreaterThan(p[i - 1].y)
    const down = route(NAV, LINKS, { x: 28, y: LOFT, z: 12 }, { x: 28, y: 0, z: 9 })
    expect(down.filter((q) => q.hop).length).toBe(8)
    for (let i = 1; i < down.length; i++) if (down[i].hop) expect(down[i].y).toBeLessThan(down[i - 1].y)
  })

  it('times a route: walks at her speed, hops take a leap', () => {
    const p = route(NAV, LINKS, { x: 28, y: 0, z: 9 }, { x: 28, y: LOFT, z: 12 })
    const tl = timeline(p, 0.5)
    const i = p.findIndex((q) => q.hop)
    expect(tl.times[i] - tl.times[i - 1]).toBeCloseTo(leapSeconds(p[i - 1].y, p[i].y), 6)
    const mid = poseOn(p, tl, tl.times[i - 1] + CROUCH + 0.1)
    expect(mid.flight).toBe(1)
    expect(mid.p.y).toBeGreaterThan(p[i - 1].y)
    const end = poseOn(p, tl, tl.total + 5)
    expect(end.p).toEqual({ x: p[p.length - 1].x, y: LOFT, z: p[p.length - 1].z })
    expect(end.walked).toBeCloseTo(tl.walked[tl.walked.length - 1], 6)
  })

  it('walks a 3D path by distance', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 3, z: -4 }
    ]
    expect(along3(path, 2.5).p).toEqual({ x: 0, y: 1.5, z: -2 })
  })
})

describe('routes across areas', () => {
  it('chains two links when it has to (lounge to a third area via the loft)', () => {
    const box = (x0: number, y: number) => ({ x0, z0: 0, cell: 1, cols: 10, rows: 10, y, walk: '1'.repeat(100) })
    const nav = { areas: [box(0, 0), box(0, 4), box(-20, 0)] }
    const up = { a: 0, b: 1, bottom: { x: 1, z: 1 }, top: { x: 1, z: 1.5 }, points: [{ x: 1, y: 0, z: 1 }, { x: 1, y: 2, z: 1.2 }, { x: 1, y: 4, z: 1.5 }] }
    const out = { a: 2, b: 1, bottom: { x: -12, z: 5 }, top: { x: 8, z: 5 }, points: [{ x: -12, y: 0, z: 5 }, { x: -2, y: 3, z: 5 }, { x: 8, y: 4, z: 5 }] }
    expect(areaAt(nav, { x: -15, y: 0, z: 5 })).toBe(2)
    expect(areaAt(nav, { x: 5, y: 4.1, z: 5 })).toBe(1)
    const r = route(nav, [up, out], { x: 5, y: 0, z: 5 }, { x: -15, y: 0, z: 5 })
    expect(r[0].y).toBe(0)
    expect(r.some((p) => p.y === 4)).toBe(true) // through the loft
    expect(r[r.length - 1]).toMatchObject({ x: -15, z: 5 })
  })
})

describe('the sky tunnel', () => {
  it('takes cats from the lounge to the catio (up to the loft, then through the tunnel)', () => {
    const r = route(NAV, LINKS, { x: 18, y: 0, z: 14 }, { x: -10, y: 0, z: 24 })
    expect(r.some((p) => p.x < 4 && p.x > -4 && p.y > 3)).toBe(true) // up in the tube over the patio
    expect(r[r.length - 1].x).toBeLessThan(-4)
  })
})
