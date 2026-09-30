import { describe, it, expect, beforeAll } from 'vitest'
import { setNarrow } from '../src/controller'
import { newCatState, stepCat, startStandoff, pickLoser, STANDOFF_SECONDS, CatState } from '../src/controller'
import { claim } from '../src/intents'
import { NAV, LINKS } from './fixtures/cafe-nav'
import { Pose } from '../src/routine'
import { inTube } from './fixtures/cafe-tube'
import { areaAt } from '../src/path'
import { SKY_TUNNEL } from './fixtures/cafe-tube'

beforeAll(() => setNarrow(inTube))

// A cat resting in the catio, and a visitor calling her from the loft: her way is through the sky tunnel.
const inCatio: Pose = { x: -9.6, y: 0, z: 25.8, yaw: 0, stand: 0, stride: 0, moving: false, spot: 0, pitch: 0, crouch: 0, flight: 0, curl: 0, stretch: 0, asleep: false, busy: false }
const visitor = { x: 8, y: 4.3, z: 19.5 }
const visit = claim('visit', 'alice', 0)
const at = (s: CatState) => ({ x: s.pos.x, y: s.y, z: s.pos.z })

function step(s: CatState, tubeBusy: boolean, intent: ReturnType<typeof claim> | null = visit) {
  stepCat(s, { routine: inCatio, intent, target: intent ? visitor : null, dt: 0.1, scale: 1, tubeBusy }, NAV, LINKS)
}

describe('the sky tunnel, when a visitor calls a cat through it', () => {
  it('waits at the entrance while another cat is in the tube, then goes through', () => {
    const s = newCatState(inCatio)
    for (let t = 0; t < 60; t += 0.1) {
      step(s, true)
      expect(inTube(at(s))).toBe(false)
    }
    expect(areaAt(NAV, at(s))).toBe(2) // still in the catio, by the shelves
    let through = false
    for (let t = 0; t < 90; t += 0.1) {
      step(s, false)
      through ||= inTube(at(s))
    }
    expect(through).toBe(true)
    expect(areaAt(NAV, at(s))).toBe(1) // up in the loft with her visitor
  })

  it('stands off with a cat she meets in the tube, and the one that backs down runs back out the way she came', () => {
    const s = newCatState(inCatio)
    while (!inTube(at(s))) step(s, false)
    for (let t = 0; t < 1.5; t += 0.1) step(s, false) // well inside
    const here = at(s)
    const foe = { x: s.pos.x + 0.8, z: s.pos.z } // coming the other way, from the loft
    startStandoff(s, foe, true)
    let swats = 0
    for (let t = 0; t < STANDOFF_SECONDS - 0.15; t += 0.1) {
      step(s, true)
      expect(s.mode).toBe('standoff')
      expect(Math.hypot(s.pos.x - here.x, s.pos.z - here.z)).toBeLessThan(0.05) // they stop face to face
      expect(s.crouch).toBeGreaterThan(0.2)
      if (s.bat > 0) swats++
    }
    expect(swats).toBeGreaterThan(0) // and fight
    for (let t = 0; t < 1; t += 0.1) step(s, true)
    expect(s.mode).toBe('retreat')
    for (let t = 0; t < 30 && s.mode === 'retreat'; t += 0.1) step(s, true)
    expect(inTube(at(s))).toBe(false)
    expect(areaAt(NAV, at(s))).toBe(2) // back out into the catio, where she came from
    for (let t = 0; t < 10; t += 0.1) {
      step(s, true)
      expect(inTube(at(s))).toBe(false) // and she waits for the tube to clear before trying again
    }
  })

  it('the winner of a standoff carries on', () => {
    const s = newCatState(inCatio)
    while (!inTube(at(s))) step(s, false)
    startStandoff(s, { x: s.pos.x + 0.8, z: s.pos.z }, false)
    for (let t = 0; t < STANDOFF_SECONDS + 0.5; t += 0.1) step(s, false)
    expect(s.mode).toBe('going')
    for (let t = 0; t < 60; t += 0.1) step(s, false)
    expect(areaAt(NAV, at(s))).toBe(1)
  })

  it('a cat on her rounds who wins a standoff goes straight back to them', () => {
    const s = newCatState(inCatio)
    const mid = SKY_TUNNEL.line[2]
    s.pos = { x: mid.x, z: mid.z } // partway along the tube, away from where her rounds have got to
    s.y = mid.y - SKY_TUNNEL.r + 0.03
    startStandoff(s, { x: s.pos.x + 0.8, z: s.pos.z }, false)
    for (let t = 0; t < STANDOFF_SECONDS + 0.15; t += 0.1) step(s, false, null)
    expect(s.mode).toBe('routine') // no planning a new way from inside the tube: she slips back into her rounds
  })

  it('the cat a visitor is steering backs down to the one on her everyday rounds; else the later one in', () => {
    const rounds = { mode: 'routine' as const, inTubeFor: 3 }
    const called = { mode: 'going' as const, inTubeFor: 5 }
    expect(pickLoser(rounds, called)).toBe(1)
    expect(pickLoser(called, rounds)).toBe(0)
    expect(pickLoser({ mode: 'going', inTubeFor: 5 }, { mode: 'rejoin', inTubeFor: 2 })).toBe(1)
  })
})
