import { describe, it, expect } from 'vitest'
import { NONE, isActive, canClaim, claim, extend, LASTS } from '../src/intents'

const here = () => true
const gone = () => false

describe('cat intents', () => {
  it('a fresh claim is active until it lapses', () => {
    const i = claim('visit', 'me', 1000)
    expect(isActive(i, 2000, here)).toBe(true)
    expect(isActive(i, 1000 + LASTS.visit + 1, here)).toBe(false)
    expect(isActive(NONE, 2000, here)).toBe(false)
  })

  it('the first claim wins until it lapses', () => {
    const mine = claim('visit', 'alice', 1000)
    expect(canClaim(mine, 2000, 'bob', here)).toBe(false)
    expect(canClaim(mine, 2000, 'alice', here)).toBe(true)
    expect(canClaim(mine, 1000 + LASTS.visit + 1, 'bob', here)).toBe(true)
  })

  it("stops steering the cat when its visitor has left", () => {
    const i = claim('sit', 'alice', 1000)
    expect(isActive(i, 2000, gone)).toBe(false)
    expect(canClaim(i, 2000, 'bob', gone)).toBe(true)
  })

  it('can be extended by its owner', () => {
    const i = extend(claim('pet', 'me', 0), 25_000, 30_000)
    expect(i.until).toBe(55_000)
  })
})

describe('laser claims', () => {
  it('a chase lasts as long as a play (renewed while the laser is on); a catch lasts three seconds', () => {
    const here = () => true
    const chase = claim('chase', 'alice', 1000)
    expect(chase.kind).toBe('chase')
    expect(isActive(chase, 1000 + LASTS.chase - 1, here)).toBe(true)
    const c = claim('catch', 'alice', 1000)
    expect(isActive(c, 1000 + 2999, here)).toBe(true)
    expect(isActive(c, 1000 + 3001, here)).toBe(false)
  })
})
