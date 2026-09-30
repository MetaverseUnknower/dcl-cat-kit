import { describe, it, expect } from 'vitest'
import { pickGreeter, HEAR } from '../src/greet'

const seq = (xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

describe('who comes to greet a new arrival', () => {
  it('is at most one free cat within earshot', () => {
    const cats = [
      { i: 0, d: 5, social: 0.6, free: true },
      { i: 1, d: 3, social: 0.8, free: false }, // busy with someone else
      { i: 2, d: HEAR + 1, social: 0.9, free: true } // too far to hear
    ]
    expect(pickGreeter(cats, seq([0.1, 0.5]))).toBe(0)
    expect(pickGreeter([cats[1], cats[2]], seq([0.1]))).toBe(-1)
  })

  it('favours friendlier, closer cats', () => {
    const cats = [
      { i: 0, d: 10, social: 0.4, free: true },
      { i: 1, d: 2, social: 0.85, free: true }
    ]
    let one = 0
    let s = 1
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let k = 0; k < 1000; k++) if (pickGreeter(cats, rand) === 1) one++
    expect(one).toBeGreaterThan(700)
  })

  it('sometimes nobody bothers', () => {
    const cats = [{ i: 0, d: 6, social: 0.4, free: true }]
    expect(pickGreeter(cats, seq([0.99]))).toBe(-1)
  })
  it('never wakes a sleeping cat', () => {
    const cats = [
      { i: 0, d: 2, social: 1, free: true, asleep: true },
      { i: 1, d: 6, social: 0.5, free: true }
    ]
    for (let k = 0; k < 20; k++) expect(pickGreeter(cats, seq([k / 20, 0.01]))).not.toBe(0)
    expect(pickGreeter([cats[0]], seq([0.01]))).toBe(-1)
  })
})
