import { describe, it, expect } from 'vitest'
import { eyesShut } from '../src/blink'

const shutSpells = (seed: number, seconds: number) => {
  const spells: number[] = []
  let run = 0
  for (let t = 0; t < seconds; t += 0.05) {
    if (eyesShut({ t, seed, asleep: false, purring: 0 })) run += 0.05
    else if (run > 0) {
      spells.push(run)
      run = 0
    }
  }
  return spells
}

describe("a cat's eyes", () => {
  it('slow-blink now and then: a slow close, a moment shut, every several seconds', () => {
    const spells = shutSpells(3, 120)
    expect(spells.length).toBeGreaterThanOrEqual(8)
    expect(spells.length).toBeLessThanOrEqual(18)
    for (const s of spells) expect(s).toBeGreaterThan(0.4)
    for (const s of spells) expect(s).toBeLessThan(1.0)
  })

  it('each cat to her own rhythm, not all at once', () => {
    let together = 0
    for (let t = 0; t < 120; t += 0.05) if (eyesShut({ t, seed: 1, asleep: false, purring: 0 }) && eyesShut({ t, seed: 2, asleep: false, purring: 0 })) together++
    expect(together * 0.05).toBeLessThan(2)
  })

  it('close while she is petted and purring, and while she sleeps', () => {
    for (let t = 0; t < 30; t += 0.5) {
      expect(eyesShut({ t, seed: 5, asleep: false, purring: 0.8 })).toBe(true)
      expect(eyesShut({ t, seed: 5, asleep: true, purring: 0 })).toBe(true)
    }
  })
})
