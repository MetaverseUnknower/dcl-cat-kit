import { describe, it, expect, beforeAll } from 'vitest'
import { setNarrow } from '../src/controller'
import { inTube as cafeTube } from './fixtures/cafe-tube'
import { newCatState, stepCat } from '../src/controller'
import { claim } from '../src/intents'
import { NAV, LINKS, RESIDENTS, SPOTS, GUEST_HOMES } from './fixtures/cafe-nav'
import { gridOf, walkableAt } from '../src/path'
import { Pose, makeRoutine } from '../src/routine'

beforeAll(() => setNarrow(cafeTube))

const resting: Pose = { x: 26, y: 0, z: 14, yaw: 300, stand: 0, stride: 0, moving: false, spot: 2, pitch: 0, crouch: 0, flight: 0, curl: 0, stretch: 0, asleep: false, busy: false }

function run(seconds: number, opts: { intent?: (t: number) => any; target?: { x: number; y: number; z: number }; others?: { x: number; y: number; z: number }[] }) {
  const s = newCatState(resting)
  const trail: { t: number; x: number; y: number; z: number; mode: string; chirp: boolean; curl: number; stretch: number; stand: number }[] = []
  for (let t = 0; t < seconds; t += 0.1) {
    stepCat(s, { routine: resting, intent: opts.intent?.(t) ?? null, target: opts.target ?? null, dt: 0.1, scale: 1 }, NAV, LINKS, opts.others ?? [])
    trail.push({ t, x: s.pos.x, y: s.y, z: s.pos.z, mode: s.mode, chirp: s.chirp, curl: s.curl, stretch: s.stretch, stand: s.stand })
  }
  return { s, trail }
}

describe('a cat', () => {
  it('follows its routine when nobody wants it', () => {
    const { s } = run(2, {})
    expect(s.mode).toBe('routine')
    expect(s.pos).toEqual({ x: 26, z: 14 })
  })

  it('comes to say hello, brrrows twice, and lies down beside the visitor', () => {
    const visit = claim('visit', 'alice', 0)
    const target = { x: 15.5, y: 0, z: 11.2 }
    const { s, trail } = run(60, { intent: () => visit, target })
    expect(s.mode).toBe('lying')
    const d = Math.hypot(s.pos.x - target.x, s.pos.z - target.z)
    expect(d).toBeGreaterThan(0.5)
    expect(d).toBeLessThan(1.4)
    expect(trail.filter((p) => p.chirp).length).toBe(2)
    for (const p of trail) if (p.mode === 'going') expect(walkableAt(gridOf(NAV, 0), p)).toBe(true)
  })

  it('stays put and lies down while being petted', () => {
    const pet = claim('pet', 'alice', 0)
    const { s } = run(5, { intent: () => pet, target: { x: 26.5, y: 0, z: 14.5 } })
    expect(s.mode).toBe('lying')
    expect(Math.hypot(s.pos.x - 26, s.pos.z - 14)).toBeLessThan(0.01)
  })

  it('stops at the inside edge when called from the terrace', () => {
    const visit = claim('visit', 'alice', 0)
    const { s } = run(80, { intent: () => visit, target: { x: 20, y: 0, z: 28 } }) // out on the north terrace
    expect(walkableAt(gridOf(NAV, 0), s.pos)).toBe(true)
    expect(s.pos.z).toBeLessThan(23)
    expect(s.pos.z).toBeGreaterThan(20)
  })

  it('comes upstairs when called from the loft, and lies down beside you there', () => {
    const visit = claim('visit', 'alice', 0)
    const LOFT = NAV.areas[1].y
    const target = { x: 18, y: LOFT, z: 21.2 }
    const { s } = run(120, { intent: () => visit, target })
    expect(s.mode).toBe('lying')
    expect(Math.abs(s.y - LOFT)).toBeLessThan(0.01)
    expect(Math.hypot(s.pos.x - target.x, s.pos.z - target.z)).toBeLessThan(1.4)
  })

  it('takes the wall climb up to someone on the east side of the loft', () => {
    const visit = claim('visit', 'alice', 0)
    const LOFT = NAV.areas[1].y
    const target = { x: 28, y: LOFT, z: 12 }
    const { s, trail } = run(120, { intent: () => visit, target })
    expect(s.mode).toBe('lying')
    expect(Math.abs(s.y - LOFT)).toBeLessThan(0.01)
    expect(trail.some((p) => p.z < 5.7 && p.y > 0.5 && p.y < LOFT - 0.4)).toBe(true) // up the shelves
  })

  it('lies down beside you in a free place, not on a cat already there', () => {
    const visit = claim('visit', 'alice', 0)
    const target = { x: 15.5, y: 0, z: 11.2 }
    const free = run(60, { intent: () => visit, target }).s.pos // where she'd lie with nobody there
    const other = { x: free.x, y: 0, z: free.z }
    const { s } = run(60, { intent: () => visit, target, others: [other] })
    expect(s.mode).toBe('lying')
    expect(Math.hypot(s.pos.x - other.x, s.pos.z - other.z)).toBeGreaterThan(0.5)
    expect(Math.hypot(s.pos.x - target.x, s.pos.z - target.z)).toBeLessThan(1.4)
  })

  it('curls up after lying beside you a few seconds', () => {
    const visit = claim('visit', 'alice', 0)
    const { s, trail } = run(60, { intent: () => visit, target: { x: 15.5, y: 0, z: 11.2 } })
    const lay = trail.find((p) => p.mode === 'lying')!
    expect(lay.curl).toBe(0)
    expect(s.curl).toBe(1)
  })

  it('uncurls and stretches before she gets up when you go', () => {
    const visit = claim('visit', 'alice', 0)
    const { trail } = run(80, { intent: (t) => (t < 50 ? visit : null), target: { x: 15.5, y: 0, z: 11.2 } })
    const after = trail.filter((p) => p.t >= 50)
    const up = after.findIndex((p) => p.stand > 0.5)
    expect(trail.filter((p) => p.t < 50).pop()!.curl).toBe(1) // curled up while you were there
    expect(after.slice(0, up).some((p) => p.stretch > 0.5)).toBe(true)
    expect(after.slice(0, up).findIndex((p) => p.stretch > 0)).toBeGreaterThan(after.slice(0, up).findIndex((p) => p.curl === 0))
  })

  it('forgets her old route once she is back in her routine', () => {
    const visit = claim('visit', 'alice', 0)
    const { s } = run(120, { intent: (t) => (t < 40 ? visit : null), target: { x: 15.5, y: 0, z: 11.2 } })
    expect(s.mode).toBe('routine')
    expect(s.path).toEqual([])
    expect(s.tl).toBe(null)
    expect(s.link).toBe(null)
  })

  it('walks back into its routine afterwards without jumping', () => {
    const visit = claim('visit', 'alice', 0)
    const { trail, s } = run(120, { intent: (t) => (t < 40 ? visit : null), target: { x: 15.5, y: 0, z: 11.2 } })
    expect(s.mode).toBe('routine')
    for (let i = 1; i < trail.length; i++) {
      expect(Math.hypot(trail[i].x - trail[i - 1].x, trail[i].z - trail[i - 1].z)).toBeLessThan(0.2)
    }
  })
})

describe('a cat called while her routine has her on the stairs or the climb', () => {
  const r = makeRoutine(RESIDENTS, [], GUEST_HOMES, SPOTS, NAV, LINKS)
  const T0 = Date.UTC(2026, 9, 1, 15, 0, 0)
  const LOFT = NAV.areas[1].y
  // Find the first moment cat i is partway up a link (on the stairs, or on the shelves).
  const find = (on: (p: Pose) => boolean) => {
    for (let t = T0; t < T0 + 6 * 3_600_000; t += 500) {
      const ps = r.at(t).poses
      const i = ps.findIndex(on)
      if (i >= 0) return { t, i }
    }
    throw new Error('never found')
  }
  const cases = {
    'mid-stairs': (p: Pose) => p.moving && p.x > 5 && p.x < 8 && p.z > 10 && p.z < 19 && p.y > 1 && p.y < 3, // on the staircase itself
    'mid-climb, in the air': (p: Pose) => p.moving && p.z < 5.7 && p.y > 1 && p.flight > 0
  }
  for (const [name, on] of Object.entries(cases)) {
    it(`finishes the ${name.split(',')[0].replace('mid-', '')} before coming (${name})`, () => {
      const { t, i } = find(on)
      const s = newCatState(r.at(t - 5000).poses[i])
      for (let u = t - 5000; u < t; u += 50) stepCat(s, { routine: r.at(u).poses[i], intent: null, target: null, dt: 0.05, scale: 1 }, NAV, LINKS)
      const visit = claim('visit', 'alice', 0)
      const target = { x: 18, y: 0, z: 14 }
      let prev = { x: s.pos.x, y: s.y, z: s.pos.z }
      for (let u = t; u < t + 120_000; u += 50) {
        stepCat(s, { routine: r.at(u).poses[i], intent: visit, target, dt: 0.05, scale: 1 }, NAV, LINKS)
        const jump = Math.hypot(s.pos.x - prev.x, s.y - prev.y, s.pos.z - prev.z)
        expect(jump).toBeLessThan(0.3) // no sinking through shelves, no sideways teleports
        prev = { x: s.pos.x, y: s.y, z: s.pos.z }
      }
      expect(s.mode).toBe('lying')
      expect(s.y).toBeLessThan(0.01)
      void LOFT
    })
  }
})

describe('a cat with a feather wand to play with', () => {
  it('comes to play: crouches, wiggles, pounces and bats, staying near you', () => {
    const play = claim('play', 'alice', 0)
    const target = { x: 15.5, y: 0, z: 11.2 }
    const s = newCatState(resting)
    const seen = { crouch: false, wiggle: false, pounce: false, bat: false }
    let home: { x: number; z: number } | null = null
    for (let t = 0; t < 70; t += 0.05) {
      stepCat(s, { routine: resting, intent: play, target, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (s.mode !== 'playing') continue
      home ??= { ...s.pos }
      seen.crouch ||= s.crouch > 0.5
      seen.wiggle ||= s.wiggle > 0.5
      seen.pounce ||= s.flight > 0
      seen.bat ||= s.bat > 0.5
      expect(Math.hypot(s.pos.x - home.x, s.pos.z - home.z)).toBeLessThan(0.35)
    }
    expect(seen).toEqual({ crouch: true, wiggle: true, pounce: true, bat: true })
  })
})

describe('playing with the feather', () => {
  it('plays right by it: her place is close enough for the pounce to reach it', () => {
    const play = claim('play', 'alice', 0)
    const feather = { x: 15.5, y: 0, z: 11.2 }
    const s = newCatState(resting)
    let closest = Infinity
    let home: { x: number; z: number } | null = null
    for (let t = 0; t < 70; t += 0.05) {
      stepCat(s, { routine: resting, intent: play, target: feather, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (s.mode !== 'playing') continue
      home ??= { ...s.pos }
      closest = Math.min(closest, Math.hypot(s.pos.x - feather.x, s.pos.z - feather.z))
    }
    expect(home).not.toBeNull()
    expect(Math.hypot(home!.x - feather.x, home!.z - feather.z)).toBeLessThan(0.6)
    expect(closest).toBeLessThan(0.3)
  })
})

describe('playing with someone who moves about', () => {
  it('follows the wand when its holder walks off', () => {
    const play = claim('play', 'alice', 0)
    const s = newCatState(resting)
    let target = { x: 15.5, y: 0, z: 11.2 }
    for (let t = 0; t < 120; t += 0.05) {
      if (t > 50) target = { x: 20, y: 0, z: 9.6 } // walked off 4.7 m, still in play range
      stepCat(s, { routine: resting, intent: play, target, dt: 0.05, scale: 1 }, NAV, LINKS)
    }
    expect(s.mode).toBe('playing')
    expect(Math.hypot(s.pos.x - target.x, s.pos.z - target.z)).toBeLessThan(1.6)
  })
})

describe('chasing a laser dot', () => {
  const standing: Pose = { ...resting, stand: 1 }
  const step = (s: ReturnType<typeof newCatState>, intent: any, target: { x: number; y: number; z: number } | null, dt = 0.05) =>
    stepCat(s, { routine: standing, intent, target, dt, scale: 1 }, NAV, LINKS)

  it('sprints to the dot, faster than she trots to a visitor', () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 0, z: 14 } // 6 m away along open floor
    const s = newCatState(standing)
    let t = 0
    for (; t < 10 && Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z) > 0.7; t += 0.05) step(s, chase, dot)
    expect(s.mode).toBe('chasing')
    expect(t).toBeLessThan(6 / 0.9) // quicker than a trot over the same ground
  })

  it('winds up a little way off a dot that stays still: crouching and wiggling about a metre from it', () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 0, z: 14 }
    const s = newCatState(standing)
    let crouchedAt = Infinity
    for (let t = 0; t < 600; t += 0.05) {
      step(s, chase, dot)
      if (s.crouch > 0.5 && s.wiggle > 0.5) crouchedAt = Math.min(crouchedAt, Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z))
    }
    expect(crouchedAt).toBeGreaterThan(0.6)
    expect(crouchedAt).toBeLessThan(1.3)
  })

  it('pounces when it moves, without jumping about, then chases on', () => {
    const chase = claim('chase', 'alice', 0)
    let dot = { x: 20, y: 0, z: 14 }
    const s = newCatState(standing)
    for (let t = 0; t < 600 && !s.crouched; t += 0.05) step(s, chase, dot)
    expect(s.crouched).toBe(true)
    dot = { x: 18.5, y: 0, z: 14 }
    let pounced = false
    let last = { ...s.pos }
    for (let t = 0; t < 10; t += 0.05) {
      step(s, chase, dot)
      pounced ||= s.flight > 0
      expect(Math.hypot(s.pos.x - last.x, s.pos.z - last.z)).toBeLessThan(0.2) // no teleports (0.05 s steps)
      last = { ...s.pos }
    }
    expect(pounced).toBe(true)
    expect(Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z)).toBeLessThan(1.3) // chasing on, winding up again near it
  })

  it('waits at the nearest place she can reach when the dot is out of reach, looking at it', () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 2.5, z: -3 } // up the outside of the south wall
    const s = newCatState(standing)
    for (let t = 0; t < 20; t += 0.05) step(s, chase, dot)
    expect(s.mode).toBe('chasing')
    expect(walkableAt(gridOf(NAV, 0), { x: s.pos.x, y: s.y, z: s.pos.z })).toBe(true)
    expect(s.lookAt).toEqual(dot)
  })
})

describe('catching the dot', () => {
  const standing: Pose = { ...resting, stand: 1 }
  it('pounces on it, pins it, flicks her tail and chirps once, then goes back to her day', () => {
    const s = newCatState(standing)
    const dot = { x: 20, y: 0, z: 14 }
    const chase = claim('chase', 'alice', 0)
    for (let t = 0; t < 15; t += 0.05) stepCat(s, { routine: standing, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
    const caught = claim('catch', 'alice', 15_000)
    let chirps = 0
    let pinned = false
    let flicked = false
    for (let t = 0; t < 3; t += 0.05) {
      stepCat(s, { routine: standing, intent: caught, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
      expect(s.mode).toBe('catching')
      chirps += s.chirp ? 1 : 0
      pinned ||= s.crouch > 0.8 && Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z) < 0.3
      flicked ||= s.flick > 0.5
    }
    expect(chirps).toBe(1)
    expect(pinned).toBe(true)
    expect(flicked).toBe(true)
    stepCat(s, { routine: standing, intent: null, target: null, dt: 0.05, scale: 1 }, NAV, LINKS)
    expect(['rejoin', 'routine']).toContain(s.mode)
  })
})

describe('a still laser dot', () => {
  const standing: Pose = { ...resting, stand: 1 }
  it('gets pounced on after she has crouched and wiggled a moment, and she lands right on it', () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 0, z: 14 }
    const s = newCatState(standing)
    let crouchedAt = -1
    let pouncedAt = -1
    let landedOn = Infinity
    for (let t = 0; t < 600; t += 0.05) {
      const wasPouncing = s.pounceT >= 0
      stepCat(s, { routine: standing, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (crouchedAt < 0 && s.crouched) crouchedAt = t
      if (pouncedAt < 0 && s.pounceT >= 0) pouncedAt = t
      if (wasPouncing && s.pounceT < 0) landedOn = Math.min(landedOn, Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z))
    }
    expect(crouchedAt).toBeGreaterThanOrEqual(0)
    expect(pouncedAt - crouchedAt).toBeGreaterThan(1) // a proper wiggle first
    expect(pouncedAt - crouchedAt).toBeLessThan(2.5)
    expect(landedOn).toBeLessThan(0.3) // on it: a catch, if it's still there
  })
})

describe('the pounce', () => {
  const standing: Pose = { ...resting, stand: 1 }
  it('is a real jump: airborne, arcing up off the floor, from about a metre out, landing on the dot', () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 0, z: 14 }
    const s = newCatState(standing)
    let from = Infinity
    let top = 0
    let air = 0
    let landed = Infinity
    for (let t = 0; t < 600; t += 0.05) {
      const was = s.pounceT >= 0
      const before = Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z)
      stepCat(s, { routine: standing, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (!was && s.pounceT >= 0 && from === Infinity) from = before
      if (s.pounceT >= 0 && landed === Infinity) {
        air += 0.05
        top = Math.max(top, s.y - dot.y)
      }
      if (was && s.pounceT < 0 && landed === Infinity) landed = Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z)
    }
    expect(from).toBeGreaterThan(0.6) // she leapt from her wind-up spot
    expect(top).toBeGreaterThan(0.15) // up off the floor
    expect(air).toBeGreaterThan(0.35)
    expect(landed).toBeLessThan(0.3)
  })
})

describe('working out the laser dot', () => {
  const standing: Pose = { ...resting, stand: 1 }
  const dot = { x: 20, y: 0, z: 14 }
  const run = (seconds: number, since = 0) => {
    const chase = claim('chase', 'alice', since)
    const s = newCatState(standing)
    const leaps: number[] = []
    const lost: number[] = []
    let overIt = 0
    for (let t = 0; t < seconds; t += 0.05) {
      const wasLeaping = s.pounceT >= 0
      const wasLost = s.lostT >= 0
      stepCat(s, { routine: standing, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (!wasLeaping && s.pounceT >= 0) leaps.push(Math.round(t * 20))
      if (!wasLost && s.lostT >= 0) lost.push(Math.round(t * 20))
      if (s.lostT >= 0 && Math.hypot(s.pos.x - dot.x, s.pos.z - dot.z) < 0.3 && s.lookAt && Math.hypot(s.lookAt.x - dot.x, s.lookAt.z - dot.z) > 0.5) overIt += 0.05
    }
    return { leaps, lost, overIt }
  }
  it('mostly: she trots right up, stands over it and loses track of it, looking this way and that', () => {
    const { lost, overIt } = run(60)
    expect(lost.length).toBeGreaterThan(3)
    expect(overIt).toBeGreaterThan(5)
  })
  it('about one go in ten, she gets it and leaps', () => {
    const { leaps, lost } = run(900)
    const share = leaps.length / (leaps.length + lost.length)
    expect(leaps.length).toBeGreaterThanOrEqual(3)
    expect(share).toBeGreaterThan(0.03)
    expect(share).toBeLessThan(0.25)
  })
  it('is the same call on every client: the same claim gives the same goes', () => {
    const a = run(300)
    const b = run(300)
    expect(b.leaps).toEqual(a.leaps)
    expect(b.lost).toEqual(a.lost)
  })
})

describe('a leap never goes through things', () => {
  const standing: Pose = { ...resting, stand: 1 }
  const run = (dot: { x: number; y: number; z: number }) => {
    const chase = claim('chase', 'alice', 0)
    const s = newCatState(standing)
    const landings: { x: number; z: number }[] = []
    for (let t = 0; t < 600; t += 0.05) {
      const was = s.pounceT >= 0
      stepCat(s, { routine: standing, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS)
      if (!was && s.pounceT >= 0) landings.push({ ...s.pounceTo! })
    }
    return { s, landings }
  }
  it('lands only where a cat can stand (a dot on the floor just inside the counter)', () => {
    const { s, landings } = run({ x: 10, y: 0, z: 9.1 })
    for (const p of landings) expect(walkableAt(gridOf(NAV, 0), p)).toBe(true)
    expect(walkableAt(gridOf(NAV, 0), s.pos)).toBe(true) // and she never ends up inside it
  })
  it("doesn't leap at a dot up off her floor (on the counter top)", () => {
    expect(run({ x: 10, y: 1.05, z: 9.4 }).landings.length).toBe(0)
  })
})

describe('two cats after the same dot', () => {
  it("don't end up in the same place: each finds her own spot round it", () => {
    const chase = claim('chase', 'alice', 0)
    const dot = { x: 20, y: 0, z: 14 }
    const a = newCatState({ ...resting, stand: 1 })
    const b = newCatState({ ...resting, x: 26.4, stand: 1 })
    let closest = Infinity
    for (let t = 0; t < 120; t += 0.05) {
      stepCat(a, { routine: resting, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS, [{ x: b.pos.x, y: b.y, z: b.pos.z }])
      stepCat(b, { routine: resting, intent: chase, target: dot, dt: 0.05, scale: 1 }, NAV, LINKS, [{ x: a.pos.x, y: a.y, z: a.pos.z }])
      const settled = a.pounceT < 0 && b.pounceT < 0 && a.speed < 0.05 && b.speed < 0.05 // standing, not mid-leap or passing
      if (t > 20 && settled) closest = Math.min(closest, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z))
    }
    expect(closest).toBeGreaterThan(0.4)
  })
})
