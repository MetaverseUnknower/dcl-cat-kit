import { describe, it, expect } from 'vitest'
import { hoverText } from '../src/hover'

describe('what the hover says', () => {
  it('pets up close, calls from further off, and says so when she is asleep', () => {
    expect(hoverText('pet', 'Faith')).toBe('Pet Faith')
    expect(hoverText('call', 'Faith')).toBe('Psspsspss')
    expect(hoverText('asleep', 'Faith')).toBe('Faith is sleeping...')
  })
})
