import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { CAFE_CATS } from '../src/catalog'

describe('the prebuilt cats', () => {
  it('are the cafe\'s seven residents, each with her model files and voice in the package', () => {
    expect(Object.keys(CAFE_CATS).sort()).toEqual(['cloud', 'faith', 'haze', 'nermal', 'smoky', 'smudge', 'tigger'])
    for (const c of Object.values(CAFE_CATS)) {
      for (const p of ['body', 'head', 'leg', 'tail', 'lids']) expect(existsSync(`assets/cats/${c.voice}-${p}.glb`)).toBe(true)
      expect(existsSync(`assets/sounds/${c.voice}-mrra.mp3`)).toBe(true)
      expect(c.models).toBe(`assets/dcl-cat-kit/cats/${c.voice}`)
    }
  })
})
