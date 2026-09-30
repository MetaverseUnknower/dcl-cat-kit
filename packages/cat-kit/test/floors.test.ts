import { describe, it, expect } from 'vitest'
import { defineFloors, rect, circle, stairs, spot } from '../src/floors'
import { route, walkableAt, areaAt } from '../src/path'

const room = () =>
  defineFloors({
    floors: [
      { name: 'ground', y: 0, walk: [rect(0, 0, 10, 8)], avoid: [rect(4, 3, 6, 5)] },
      { name: 'loft', y: 3, walk: [rect(0, 5, 10, 8)] }
    ],
    links: [stairs({ from: [1, 2], to: [1, 6], up: 3 })],
    spots: [spot.bed(8, 2), spot.perch(9, 1.2, 7), spot.sunny(2, 1), spot.bed(8, 7, 0, { floor: 'loft' })]
  })

describe('defineFloors', () => {
  it('makes a walkable grid per floor from its shapes, minus the avoid areas', () => {
    const f = room()
    expect(f.nav.areas.length).toBe(2)
    expect(walkableAt(f.nav.areas[0], { x: 2, z: 2 })).toBe(true)
    expect(walkableAt(f.nav.areas[0], { x: 5, z: 4 })).toBe(false) // the table
    expect(walkableAt(f.nav.areas[1], { x: 5, z: 7 })).toBe(true)
    expect(walkableAt(f.nav.areas[1], { x: 5, z: 2 })).toBe(false) // the loft doesn't reach there
  })
  it('keeps a margin off the walls and obstacles, so a cat never pokes through them', () => {
    const f = room()
    expect(walkableAt(f.nav.areas[0], { x: 0.05, z: 4 })).toBe(false)
    expect(walkableAt(f.nav.areas[0], { x: 3.9, z: 4 })).toBe(false)
  })
  it('circles work too', () => {
    const f = defineFloors({ floors: [{ name: 'g', y: 0, walk: [circle(5, 5, 4)] }], spots: [spot.bed(5, 5)] })
    expect(walkableAt(f.nav.areas[0], { x: 5, z: 5 })).toBe(true)
    expect(walkableAt(f.nav.areas[0], { x: 0.5, z: 0.5 })).toBe(false)
  })
  it('joins floors with stairs a cat can route up', () => {
    const f = room()
    const path = route(f.nav, f.links, { x: 8, y: 0, z: 2 }, { x: 8, y: 3, z: 7 })
    expect(path.length).toBeGreaterThan(2)
    expect(path.some((p) => p.link)).toBe(true)
    expect(path[path.length - 1].y).toBe(3)
  })
  it('puts spots on their floor, perches above it with a floor point to hop up from', () => {
    const f = room()
    const perch = f.spots[1]
    expect(perch.y).toBeCloseTo(1.2)
    expect(walkableAt(f.nav.areas[0], { x: perch.bx, z: perch.bz })).toBe(true)
    const loftBed = f.spots[3]
    expect(loftBed.area).toBe(1)
    expect(loftBed.y).toBe(3)
    expect(areaAt(f.nav, { x: loftBed.x, y: loftBed.y, z: loftBed.z })).toBe(1)
  })
  it('marks sunny and watch spots for the routine', () => {
    const f = defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 6, 6)] }], spots: [spot.sunny(2, 2), spot.watch(4, 4, 90, 0)] })
    expect(f.spots[0].sun).toBe(true)
    expect(f.spots[1].watch).toBe(0)
  })
  it('bounds cover the floors (for "a visitor on the scene")', () => {
    expect(room().bounds).toEqual([{ x0: 0, z0: 0, x1: 10, z1: 8 }, { x0: 0, z0: 5, x1: 10, z1: 8 }])
  })
  it('gives each cat a home spot, spreading them over the spots', () => {
    expect(room().homes(3)).toEqual([0, 1, 2])
    expect(room().homes(6)).toEqual([0, 1, 2, 3, 0, 1])
  })
  it('says clearly what is wrong with a bad description', () => {
    expect(() => defineFloors({ floors: [], spots: [] })).toThrow(/at least one floor/)
    expect(() => defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 0.2, 0.2)] }], spots: [] })).toThrow(/floor "g" has no walkable/)
    expect(() => defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 5, 5)] }], spots: [spot.bed(20, 20)] })).toThrow(/spot 0 .* isn't on floor "g"/)
    expect(() => defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 5, 5)] }], spots: [spot.bed(1, 1, 0, { floor: 'attic' })] })).toThrow(/no floor named "attic"/)
    expect(() =>
      defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 5, 5)] }], links: [stairs({ from: [1, 1], to: [1, 4], up: 3 })], spots: [spot.bed(2, 2)] })
    ).toThrow(/link 0 .* no floor at height 3/)
    expect(() => defineFloors({ floors: [{ name: 'g', y: 0, walk: [rect(0, 0, 5, 5)] }], spots: [] })).toThrow(/at least one spot/)
  })
})
