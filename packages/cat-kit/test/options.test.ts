import { describe, it, expect } from 'vitest'
import { seatOf, syncBase } from '../src/options'

describe('addCats options', () => {
  it('takes seats as a dcl-sittables instance or a function', () => {
    const p = { x: 1, y: 0, z: 2 }
    expect(seatOf({ localSeat: () => p })()).toEqual(p)
    expect(seatOf(() => p)()).toEqual(p)
    expect(seatOf(undefined)()).toBeNull()
  })
  it("uses sync ids from 7300 unless told otherwise (so two scenes' kits don't clash)", () => {
    expect(syncBase({})).toBe(7300)
    expect(syncBase({ sync: 9100 })).toBe(9100)
  })
})
