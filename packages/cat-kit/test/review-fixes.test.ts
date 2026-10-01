import { describe, it, expect } from 'vitest'
import { defineFloors, rect, stairs, ramp, climb, narrow, spot } from '../src/floors'
import { makeRoutine, dayStartOf, setDayStart } from '../src/routine'
import { route, walkableAt } from '../src/path'

const floor = (walk = [rect(0, 0, 10, 10)]) => ({ name: 'g', y: 0, walk })
const cat = (key: string) => ({ key, name: key, scale: 1, social: 0.5, nap: 0.5, roam: 0.5 })

describe('guests', () => {
  it('uses as many guest slots a day as the scene gives, not the cafe\'s three', () => {
    const f = defineFloors({ floors: [floor()], spots: [spot.bed(2, 2), spot.bed(4, 4), spot.bed(6, 6)] })
    const guests = ['a', 'b', 'c', 'd', 'e'].map(cat)
    const r = makeRoutine([{ ...cat('res'), home: 0 }], guests, [1], f.spots, f.nav, f.links)
    const today = r.at(Date.UTC(2026, 9, 3, 14))
    expect(today.cats.length).toBe(2) // the resident and one guest
  })
})

describe('a floor made of touching shapes', () => {
  it('is one floor: an L-shaped room has no wall down its seam', () => {
    const f = defineFloors({ floors: [floor([rect(0, 0, 10, 4), rect(0, 4, 4, 10)])], spots: [spot.bed(8, 2)] })
    expect(walkableAt(f.nav.areas[0], { x: 2, z: 4 })).toBe(true)
    const path = route(f.nav, f.links, { x: 8, y: 0, z: 2 }, { x: 2, y: 0, z: 8 })
    expect(path.length).toBeGreaterThan(1)
    expect(path[path.length - 1]).toMatchObject({ x: expect.closeTo(2, 0), z: expect.closeTo(8, 0) })
  })
  it('still keeps its margin off the outer walls and obstacles', () => {
    const f = defineFloors({ floors: [{ ...floor([rect(0, 0, 10, 4), rect(0, 4, 4, 10)]), avoid: [rect(6, 1, 7, 2)] }], spots: [spot.bed(8, 3)] })
    expect(walkableAt(f.nav.areas[0], { x: 0.1, z: 2 })).toBe(false)
    expect(walkableAt(f.nav.areas[0], { x: 5.9, z: 1.5 })).toBe(false)
    expect(walkableAt(f.nav.areas[0], { x: 4.1, z: 8 })).toBe(false) // the L's inner wall
  })
})

describe('mistakes are caught, and blame the right end', () => {
  const two = [floor(), { name: 'loft', y: 3, walk: [rect(0, 6, 10, 10)] }]
  it("a stair's top off the floor above", () => {
    expect(() => defineFloors({ floors: two, links: [stairs({ from: [1, 2], to: [40, 40], up: 3 })], spots: [spot.bed(5, 2)] })).toThrow(/link 0 .*top .*\[40,40\].* isn't on a floor/)
  })
  it("a stair's foot off every floor", () => {
    expect(() => defineFloors({ floors: two, links: [stairs({ from: [30, 30], to: [1, 7], up: 3 })], spots: [spot.bed(5, 2)] })).toThrow(/link 0 .*foot .*\[30,30\].* isn't on a floor/)
  })
  it('a perch far from any floor to jump up from', () => {
    expect(() => defineFloors({ floors: [floor()], spots: [spot.perch(50, 1, 50)] })).toThrow(/spot 0 .*perch .* too far/)
  })
})

describe('links between upper floors, and between floors at one height', () => {
  it('stairs from a loft up to a mezzanine', () => {
    const f = defineFloors({
      floors: [floor(), { name: 'loft', y: 3, walk: [rect(0, 5, 10, 10)] }, { name: 'mezz', y: 5, walk: [rect(0, 8, 10, 10)] }],
      links: [stairs({ from: [2, 6], to: [8, 9], up: 2 })],
      spots: [spot.bed(5, 2)]
    })
    expect(f.links[0].a).toBe(1)
    expect(f.links[0].b).toBe(2)
  })
  it('stairs to the right one of two lofts at the same height (the one nearer their top)', () => {
    const f = defineFloors({
      floors: [floor([rect(0, 0, 20, 10)]), { name: 'west', y: 3, walk: [rect(0, 6, 6, 10)] }, { name: 'east', y: 3, walk: [rect(14, 6, 20, 10)] }],
      links: [stairs({ from: [16, 2], to: [17, 8], up: 3 })],
      spots: [spot.bed(5, 2)]
    })
    expect(f.links[0].b).toBe(2)
  })
})

describe('stairs are walked, climbs are leapt', () => {
  const f = (l: ReturnType<typeof stairs>) => defineFloors({ floors: [floor(), { name: 'up', y: 1, walk: [rect(0, 6, 10, 10)] }], links: [l], spots: [spot.bed(5, 2)] })
  it('stairs and ramps have no leaps, however few or many steps', () => {
    expect(f(stairs({ from: [1, 2], to: [1, 7], up: 1 })).links[0].points.some((p) => p.hop)).toBe(false)
    expect(f(ramp({ from: [1, 2], to: [1, 7], up: 1 })).links[0].points.some((p) => p.hop)).toBe(false)
  })
  it('a climb leaps to each perch, however many perches', () => {
    const perches = Array.from({ length: 14 }, (_, k) => [2, 0.07 * (k + 1), 3 + k * 0.2] as [number, number, number])
    const pts = f(climb({ from: [2, 2], perches, to: [2, 7], up: 1 })).links[0].points
    expect(pts.slice(1, -1).every((p) => p.hop)).toBe(true)
  })
})

describe('narrow passages', () => {
  it('count the whole length between their points, not just near each point', () => {
    const f = defineFloors({
      floors: [floor(), { name: 'up', y: 2, walk: [rect(0, 6, 10, 10)] }],
      links: [narrow({ from: [2, 1], points: [[2, 2, 2], [2, 2, 5]], to: [2, 7], up: 2 })],
      spots: [spot.bed(5, 2)]
    })
    expect(f.narrow({ x: 2, y: 2, z: 3.5 })).toBe(true) // mid-plank, 1.5 m from either point
    expect(f.narrow({ x: 6, y: 2, z: 3.5 })).toBe(false)
  })
})

describe("the cats' day", () => {
  it('starts at 10:00 UTC by default, and a scene can set its own hour', () => {
    expect(new Date(dayStartOf(Date.UTC(2026, 9, 3, 14))).getUTCHours()).toBe(10)
    setDayStart(4)
    expect(new Date(dayStartOf(Date.UTC(2026, 9, 3, 14))).getUTCHours()).toBe(4)
    setDayStart(10)
  })
})

import { missingModels } from '../src/options'
import { strips } from '../src/floors'
import { existsSync, readFileSync } from 'fs'

describe("cats whose files weren't copied", () => {
  it('are named, so the scene can say so instead of showing invisible cats', () => {
    const faith = { ...cat('faith'), models: 'assets/dcl-cat-kit/cats/faith', voice: 'faith' }
    const haze = { ...cat('haze'), models: 'assets/dcl-cat-kit/cats/haze', voice: 'haze' }
    expect(missingModels(['assets/dcl-cat-kit/cats/faith-body.glb', 'scene.json'], [faith, haze])).toEqual(['haze'])
    expect(missingModels(['ASSETS/DCL-CAT-KIT/CATS/HAZE-BODY.GLB'], [haze])).toEqual([]) // content lists can be any case
  })
})

describe('the npm package', () => {
  it('ships its licences (MIT code, CC BY 4.0 assets)', () => {
    expect(existsSync('LICENSE') && existsSync('ASSETS-LICENSE.md')).toBe(true)
    const files: string[] = JSON.parse(readFileSync('package.json', 'utf8')).files
    expect(files).toEqual(expect.arrayContaining(['LICENSE', 'ASSETS-LICENSE.md']))
  })
})

describe('the debug view', () => {
  it('draws a floor as runs of cells along each row, not a box per cell', () => {
    const f = defineFloors({ floors: [floor([rect(0, 0, 16, 16)])], spots: [spot.bed(8, 8)] })
    const a = f.nav.areas[0]
    const cells = [...a.walk].filter((c) => c === '1').length
    const runs = strips(a)
    expect(runs.length).toBeLessThan(cells / 10)
    expect(runs.reduce((n, r) => n + r.cells, 0)).toBe(cells)
  })
})

import { reportMissingModels } from '../src/options'
import { CAFE_CATS } from '../src/catalog'
const test = it
describe('the missing-files check never stops the cats', () => {
  const faith = CAFE_CATS.faith
  const haze = CAFE_CATS.haze
  const content = { content: [{ file: 'assets/dcl-cat-kit/cats/faith-body.glb', hash: 'x' }] }
  test('a runtime that answers without a promise (the real client) is fine, and still reports', async () => {
    const said: string[] = []
    expect(() => reportMissingModels(() => content as any, [faith, haze], (m) => said.push(m))).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(said.join()).toContain('haze')
    expect(said.join()).not.toContain('faith,')
  })
  test('a promise works too', async () => {
    const said: string[] = []
    reportMissingModels(async () => content, [faith, haze], (m) => said.push(m))
    await new Promise((r) => setTimeout(r, 0))
    expect(said.join()).toContain('haze')
  })
  test('a getter that throws, rejects or returns junk says nothing and throws nothing', async () => {
    const said: string[] = []
    expect(() => reportMissingModels(() => { throw new Error('no') }, [haze], (m) => said.push(m))).not.toThrow()
    reportMissingModels(async () => { throw new Error('no') }, [haze], (m) => said.push(m))
    reportMissingModels(() => undefined as any, [haze], (m) => said.push(m))
    reportMissingModels(() => ({ content: 'nope' }) as any, [haze], (m) => said.push(m))
    await new Promise((r) => setTimeout(r, 0))
    expect(said).toEqual([])
  })
})
