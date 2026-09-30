import { describe, it, expect, beforeAll } from 'vitest'
import { setNarrow } from '../src/controller'
import { makeRoutine as make, dayStartOf, guestsForDay, HOME_BY_MS, daytime, spotWeight } from '../src/routine'
import { RESIDENTS, SPOTS, NAV, LINKS, GUEST_HOMES } from './fixtures/cafe-nav'
import { areaAt, gridOf, walkableAt } from '../src/path'
import { inTube } from './fixtures/cafe-tube'

beforeAll(() => setNarrow(inTube))

const CATS = RESIDENTS
const HATCH = LINKS[1].points.filter((q) => q.hop).pop()! // the hop up into the hatch box
const FAKE_REGULARS = ['Mochi', 'Pepper', 'Biscuit', 'Luna'].map((name, k) => ({
  key: `${name.toLowerCase()}-by-someone`, name, owner: 'Someone', scale: 1, social: 0.6, nap: 0.5, roam: 0.6
}))
// The routine's poses for the day's cats (residents first, then guests).
const makeRoutine = (_c: unknown, _s: unknown, _n: unknown, regulars = FAKE_REGULARS) => {
  const r = make(RESIDENTS, regulars, GUEST_HOMES, SPOTS, NAV, LINKS)
  return { at: (ms: number) => r.at(ms).poses, day: (ms: number) => r.at(ms).cats }
}

const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 1, 15, 0, 0) // an afternoon in Florida

describe('the routine', () => {
  it('is the same for everyone at the same moment', () => {
    const a = makeRoutine(CATS, SPOTS, NAV)
    const b = makeRoutine(CATS, SPOTS, NAV)
    for (let k = 0; k < 40; k++) {
      const t = T0 + k * 97_000
      expect(a.at(t)).toEqual(b.at(t))
    }
  })

  it('gives the same answer after jumping back in time (a visitor joining late)', () => {
    const a = makeRoutine(CATS, SPOTS, NAV)
    a.at(T0 + 3_600_000)
    const late = a.at(T0 + 1_000_000)
    expect(late).toEqual(makeRoutine(CATS, SPOTS, NAV).at(T0 + 1_000_000))
  })

  it('never teleports a cat (only a leap moves one fast)', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let prev = r.at(T0)
    for (let t = T0 + 200; t < T0 + 30 * 60_000; t += 200) {
      const now = r.at(t)
      now.forEach((p, i) => {
        const q = prev[i]
        const step = Math.hypot(p.x - q.x, p.z - q.z) + Math.abs(p.y - q.y)
        expect(step).toBeLessThan(p.flight || q.flight ? 1.4 : 0.45) // a 2 m drop lands at ~6 m/s
      })
      prev = now
    }
  })

  it('leaps like a cat: a crouch, a falling arc that speeds up and tips nose-down, then a landing that absorbs it', () => {
    // Find a cat leaving a high cat-tree platform (stepping forward only; going back in time recomputes the day).
    const r = makeRoutine(CATS, SPOTS, NAV)
    let prev = r.at(T0)
    let found = false
    for (let t = T0 + 1000; t < T0 + 8 * 3_600_000 && !found; t += 1000) {
      const now = r.at(t)
      const above = (y: number) => y - (y > NAV.areas[1].y - 1 ? NAV.areas[1].y : 0) // height above her own floor
      const i = now.findIndex((p, k) => p.moving && !prev[k].moving && above(prev[k].y) > 1.0)
      prev = now
      if (i < 0) continue
      const r2 = makeRoutine(CATS, SPOTS, NAV)
      const trail: { y: number; pitch: number; crouch: number; flight: number }[] = []
      for (let v = t - 1000; v < t + 8000; v += 20) trail.push(r2.at(v)[i])
      const start = trail.findIndex((q) => q.flight > 0)
      const end = start < 0 ? -1 : trail.findIndex((q, k) => k > start && q.flight === 0)
      const air = start < 0 ? [] : trail.slice(start, end < 0 ? undefined : end) // her first leap, off the perch
      if (air.length < 10) continue
      found = true
      const third = Math.floor(air.length / 3)
      const drop = (xs: typeof air) => xs[0].y - xs[xs.length - 1].y
      expect(drop(air.slice(-third))).toBeGreaterThan(2 * drop(air.slice(0, third))) // gravity: falls faster and faster
      expect(Math.min(...air.map((q) => q.pitch))).toBeLessThan(-25) // nose-down on the way down
      expect(trail.slice(0, trail.indexOf(air[0])).some((q) => q.crouch > 0.8)).toBe(true) // winds up first
      const landed = trail.slice(trail.indexOf(air[air.length - 1]) + 1)
      expect(landed.slice(0, 10).some((q) => q.crouch > 0.5)).toBe(true) // absorbs the landing
      expect(air.length * 0.02).toBeLessThan(1.0) // quick, not floaty
    }
    expect(found).toBe(true)
  })

  it('never has two cats resting on the same spot', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    for (let t = T0; t < T0 + 6 * 3_600_000; t += 20_000) {
      const resting = r.at(t).filter((p) => !p.moving).map((p) => p.spot)
      expect(new Set(resting).size).toBe(resting.length)
    }
  })

  it('keeps walking cats on open floor', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    for (let t = T0; t < T0 + 3_600_000; t += 1_000) {
      for (const p of r.at(t)) {
        const onFloor = p.y < 0.01 || Math.abs(p.y - NAV.areas[1].y) < 0.01
        const inHatchBox = Math.abs(p.x - HATCH.x) < 0.3 && p.z < LINKS[1].top.z && p.y > 2 // walking out of the cat door
        if (p.moving && onFloor && !inHatchBox && !p.busy) expect(walkableAt(gridOf(NAV, areaAt(NAV, p)), p)).toBe(true) // (not on a link)
      }
    }
  })

  it('sometimes takes the wall climb, hopping up or down the shelves', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let shelf = 0
    for (let t = T0; t < T0 + 8 * 3_600_000; t += 2_000) {
      for (const p of r.at(t)) if (p.moving && p.z < 5.7 && p.y > 0.5 && p.y < NAV.areas[1].y - 0.3) shelf++
    }
    expect(shelf).toBeGreaterThan(0)
  })

  it('never has two cats in the same place: no lying on each other, no walking through each other', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    const clashes: string[] = []
    for (let t = T0; t < T0 + 2 * 3_600_000; t += 500) {
      const ps = r.at(t)
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i]
          const b = ps[j]
          if (a.flight || b.flight || Math.abs(a.y - b.y) > 0.3) continue // one leaping over, or on another level
          if (Math.hypot(a.x - b.x, a.z - b.z) < 0.3) clashes.push(`${i}/${j} at ${t - T0}`)
        }
    }
    expect(clashes).toEqual([])
  })

  it('sends cats through the sky tunnel one at a time, never two in the tube at once', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let used = 0
    const both: string[] = []
    for (let t = T0; t < T0 + 8 * 3_600_000; t += 1_000) {
      const inside = r.at(t).flatMap((p, i) => (inTube(p) ? [i] : []))
      if (inside.length) used++
      if (inside.length > 1) both.push(`${inside.join('/')} at ${(t - T0) / 1000}s`)
    }
    expect(used).toBeGreaterThan(0)
    expect(both).toEqual([])
  })

  it('falls asleep on long rests, curled up, but not on short ones', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let asleep = 0
    let awakeResting = 0
    let curled = 0
    for (let t = T0; t < T0 + 3 * 3_600_000; t += 2_000) {
      for (const p of r.at(t)) {
        if (p.asleep) {
          asleep++
          expect(p.moving).toBe(false)
          expect(p.stand).toBe(0)
          if (p.curl === 1) curled++
        } else if (!p.moving) awakeResting++
        if (!p.asleep && p.curl > 0) expect(p.moving).toBe(true) // only uncurling as she wakes
      }
    }
    expect(asleep).toBeGreaterThan(0)
    expect(curled).toBeGreaterThan(0)
    expect(awakeResting).toBeGreaterThan(0)
  })

  it('has everyone asleep at home, curled up, at the end of the day', () => {
    const end = dayStartOf(T0) + 86_400_000 - 60_000
    const r = make(RESIDENTS, FAKE_REGULARS, GUEST_HOMES, SPOTS, NAV, LINKS).at(end)
    r.poses.forEach((p, i) => {
      expect(p.asleep).toBe(true)
      expect(p.curl).toBe(1)
      expect(p.spot).toBe(r.cats[i].home)
    })
  })

  it('stretches before she gets up', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let prev = r.at(T0)
    let checked = 0
    const watching = new Map<number, boolean>() // cat -> has stretched since leaving
    for (let t = T0 + 100; t < T0 + 3_600_000; t += 100) {
      const now = r.at(t)
      now.forEach((p, i) => {
        if (p.moving && !prev[i].moving) watching.set(i, false)
        if (!watching.has(i)) return
        if (p.stretch > 0.5) watching.set(i, true)
        if (p.stand > 0.5) {
          expect(watching.get(i)).toBe(true)
          watching.delete(i)
          checked++
        }
      })
      prev = now
    }
    expect(checked).toBeGreaterThan(5)
  })

  it('turns smoothly as she settles on either floor, never snapping round', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let prev = r.at(T0)
    let settled = 0
    for (let t = T0 + 100; t < T0 + 2 * 3_600_000; t += 100) {
      const now = r.at(t)
      now.forEach((p, i) => {
        const q = prev[i]
        if (p.moving && q.moving && p.stand < q.stand && !p.flight && !q.flight && !p.crouch && !q.crouch) {
          const turn = Math.abs(((p.yaw - q.yaw + 540) % 360) - 180)
          expect(turn).toBeLessThan(40)
          settled++
        }
      })
      prev = now
    }
    expect(settled).toBeGreaterThan(100)
  })

  it('draws cats to the sunny patches by day (not at night), and to the bird-watching places', () => {
    const d0 = dayStartOf(T0)
    expect(daytime(d0 + 3 * 3_600_000)).toBe(true)
    expect(daytime(d0 + 13 * 3_600_000)).toBe(false)
    const cat = CATS[0]
    const sun = SPOTS.find((q) => q.sun)!
    const watch = SPOTS.find((q) => q.watch !== undefined)!
    const plain = SPOTS.find((q) => q.area === 2 && !q.sun && q.watch === undefined && q.y - NAV.areas[2].y < 0.05) ?? SPOTS[0]
    expect(spotWeight(sun, cat, d0 + 3 * 3_600_000)).toBeGreaterThan(spotWeight(sun, cat, d0 + 13 * 3_600_000))
    expect(spotWeight(watch, cat, d0)).toBeGreaterThan(spotWeight(plain, cat, d0))
  })

  it('goes out to the catio and sunbathes there', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let out = 0
    let sunny = 0
    for (let t = T0; t < T0 + 8 * 3_600_000; t += 5_000) for (const p of r.at(t)) {
      if (p.x < -4) out++
      if (!p.moving && SPOTS[p.spot].sun) sunny++
    }
    expect(out).toBeGreaterThan(0)
    expect(sunny).toBeGreaterThan(0)
  })

  it('uses both floors', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    let up = 0
    let stairs = 0
    for (let t = T0; t < T0 + 6 * 3_600_000; t += 5_000) {
      for (const p of r.at(t)) {
        if (!p.moving && p.y >= NAV.areas[1].y - 0.01) up++
        if (p.moving && p.y > 0.2 && p.y < NAV.areas[1].y - 0.2 && !p.flight) stairs++
      }
    }
    expect(up).toBeGreaterThan(0)
    expect(stairs).toBeGreaterThan(0)
  })

  it('brings everyone home to sleep before the day turns over, seamlessly', () => {
    const r = makeRoutine(CATS, SPOTS, NAV)
    const end = dayStartOf(T0) + DAY
    const before = r.at(end - 1)
    const after = makeRoutine(CATS, SPOTS, NAV).at(end)
    before.forEach((p, i) => {
      expect(p.moving).toBe(false)
      expect(p.spot).toBe(r.day(end - 1)[i].home)
      expect(after[i]).toEqual(p)
    })
    const day = makeRoutine(CATS, SPOTS, NAV)
    expect(day.at(T0).some((p, i) => p.spot !== day.day(T0)[i].home)).toBe(true) // they do roam by day
  })
})

describe("today's guests", () => {
  it('rotate fairly through all the regulars, three a day, all different', () => {
    const seen = new Map<number, number>()
    for (let d = 0; d < 40; d++) {
      const g = guestsForDay(d, 10)
      expect(g.length).toBe(3)
      expect(new Set(g).size).toBe(3)
      g.forEach((k) => seen.set(k, (seen.get(k) ?? 0) + 1))
    }
    expect(seen.size).toBe(10)
    expect(Math.max(...seen.values()) - Math.min(...seen.values())).toBeLessThanOrEqual(1)
  })

  it('invites everyone when there are three or fewer, and no one when there are none', () => {
    expect(guestsForDay(5, 2)).toEqual([0, 1])
    expect(guestsForDay(5, 0)).toEqual([])
  })

  it('join the residents in the routine, each with a guest home', () => {
    const r = make(RESIDENTS, FAKE_REGULARS, GUEST_HOMES, SPOTS, NAV, LINKS)
    const { cats, poses } = r.at(T0)
    expect(cats.length).toBe(RESIDENTS.length + 3)
    expect(poses.length).toBe(RESIDENTS.length + 3)
    expect(cats.slice(RESIDENTS.length).map((c) => c.home)).toEqual(GUEST_HOMES)
    expect(make(RESIDENTS, [], GUEST_HOMES, SPOTS, NAV, LINKS).at(T0).cats.length).toBe(RESIDENTS.length)
  })
})
