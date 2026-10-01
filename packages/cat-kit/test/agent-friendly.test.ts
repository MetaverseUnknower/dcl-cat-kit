import { describe, it, expect } from 'vitest'
import { defineFloors, rect, stairs, spot } from '../src/floors'

// Every mistake in a floor description says what to change, so a person or an agent can fix it from the message alone.
const err = (f: () => unknown) => {
  try { f() } catch (e) { return String((e as Error).message) }
  return ''
}
const g = (walk = [rect(0, 0, 5, 5)]) => ({ name: 'g', y: 0, walk })
describe('defineFloors errors say how to fix them', () => {
  const cases: [string, () => unknown][] = [
    ['no floors', () => defineFloors({ floors: [], spots: [] })],
    ['no walk shapes', () => defineFloors({ floors: [g([])], spots: [spot.bed(1, 1)] })],
    ['a floor too small', () => defineFloors({ floors: [g([rect(0, 0, 0.2, 0.2)])], spots: [spot.bed(0.1, 0.1)] })],
    ['no spots', () => defineFloors({ floors: [g()], spots: [] })],
    ['a link whose foot is off the floors', () => defineFloors({ floors: [g()], links: [stairs({ from: [30, 30], to: [1, 1], up: 3 })], spots: [spot.bed(1, 1)] })],
    ['a link whose top is off the floors', () => defineFloors({ floors: [g()], links: [stairs({ from: [1, 1], to: [2, 2], up: 3 })], spots: [spot.bed(1, 1)] })],
    ['a spot naming no such floor', () => defineFloors({ floors: [g()], spots: [spot.bed(1, 1, 0, { floor: 'attic' })] })],
    ['a spot off its floor', () => defineFloors({ floors: [g()], spots: [spot.bed(20, 20)] })],
    ['a perch too far from the floor', () => defineFloors({ floors: [g()], spots: [spot.perch(50, 1, 50)] })]
  ]
  for (const [name, f] of cases)
    it(name, () => {
      const m = err(f)
      expect(m).toMatch(/^dcl-cat-kit: /)
      expect(m).toMatch(/ Fix: \S/)
    })
})

import { setupProblems } from '../src/options'
describe('addCats says when it has been set up wrong', () => {
  it('nothing to say when every cat has a home and it runs once', () => {
    expect(setupProblems({ spots: 3, cats: 3, guestsPerDay: 0, alreadyAdded: false })).toEqual([])
  })
  it('more cats (and guests) than spots: they share homes, and it says how to fix that', () => {
    const [m] = setupProblems({ spots: 3, cats: 3, guestsPerDay: 2, alreadyAdded: false })
    expect(m).toMatch(/^dcl-cat-kit: 5 cats .* 3 spots/)
    expect(m).toMatch(/ Fix: \S/)
  })
  it('a second call: it stops, and says so', () => {
    const [m] = setupProblems({ spots: 3, cats: 1, guestsPerDay: 0, alreadyAdded: true })
    expect(m).toMatch(/^dcl-cat-kit: addCats was called again/)
    expect(m).toMatch(/ Fix: \S/)
  })
})
