import { describe, it, expect } from 'vitest'
import { brrrowClip, growlClip, hissClip, mrraClip, mrraOnPet } from '../src/voices'
import { existsSync } from 'fs'

const seq = (xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

describe('cat voices', () => {
  it("uses each cat's own sounds, Faith's being her HQ originals", () => {
    expect(brrrowClip('Faith', seq([0.9, 0.2]))).toBe('assets/dcl-cat-kit/sounds/faith-brrrow-1.mp3')
    expect(brrrowClip('Faith', seq([0.1]))).toBe('assets/dcl-cat-kit/sounds/faith-brrrow-long.mp3')
    expect(brrrowClip('Cloud', seq([0.9, 0.8]))).toBe('assets/dcl-cat-kit/sounds/cloud-brrrow-2.mp3')
    expect(mrraClip('Haze')).toBe('assets/dcl-cat-kit/sounds/haze-mrra.mp3')
  })

  it('gives a mrra about a third of pets, never twice within 6 s', () => {
    expect(mrraOnPet(() => 0.1, 10)).toBe(true)
    expect(mrraOnPet(() => 0.9, 10)).toBe(false)
    expect(mrraOnPet(() => 0.1, 3)).toBe(false)
  })

  it('growls and hisses in each cat\'s own voice, and the clips are there', () => {
    for (const cat of ['faith', 'smoky', 'haze', 'tigger', 'nermal', 'cloud', 'smudge']) {
      for (const clip of [growlClip(cat), hissClip(cat)]) expect(existsSync(clip.replace('assets/dcl-cat-kit/', 'assets/'))).toBe(true) // in the package; a scene loads them from assets/dcl-cat-kit/
    }
    expect(growlClip('haze')).toBe('assets/dcl-cat-kit/sounds/haze-growl.mp3')
  })
})
