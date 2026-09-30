import { describe, it, expect } from 'vitest'
import { headTarget, HEAD_LIMIT, WATCH_RANGE } from '../src/gaze'

const cat = { x: 0, z: 0 }

describe("Faith's gaze", () => {
  it('turns her head toward a visitor nearby', () => {
    // She faces -Z (body yaw 0); a visitor off to her side at -X is 90° round.
    expect(headTarget(cat, 0, { x: -2, z: 0 }, 0)).toBeCloseTo(Math.min(90, HEAD_LIMIT))
    expect(headTarget(cat, 0, { x: 0, z: -2 }, 0)).toBeCloseTo(0)
  })

  it('never twists her neck past the limit, even for someone behind her', () => {
    for (const p of [{ x: 0.1, z: 3 }, { x: -0.1, z: 3 }, { x: 3, z: 0.5 }]) {
      expect(Math.abs(headTarget(cat, 0, p, 0))).toBeLessThanOrEqual(HEAD_LIMIT)
    }
  })

  it('accounts for which way her body is turned', () => {
    expect(headTarget(cat, 90, { x: -2, z: 0 }, 0)).toBeCloseTo(0)
  })

  it('looks lazily around when nobody is close', () => {
    const far = { x: WATCH_RANGE + 5, z: 0 }
    const looks = [0, 3, 6, 9, 12].map((t) => headTarget(cat, 0, far, t))
    expect(new Set(looks.map((y) => Math.round(y))).size).toBeGreaterThan(1)
    for (const y of looks) expect(Math.abs(y)).toBeLessThanOrEqual(HEAD_LIMIT)
  })
})
