import { describe, it, expect } from 'vitest'
// @ts-ignore: plain JS module shipped as a command
import { glbBounds, placed, yawOf } from '../bin/glb-bounds.mjs'

/** A minimal GLB: one mesh whose positions span `min`..`max`, under a node with an optional translation and scale. */
function glb(min: number[], max: number[], node: Record<string, unknown> = {}) {
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, ...node }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ componentType: 5126, count: 2, type: 'VEC3', min, max }]
  }
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const body = Buffer.from(text)
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + body.length, 8)
  head.writeUInt32LE(body.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
  return Buffer.concat([head, body])
}
const r2 = (b: Record<string, number>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 100) / 100]))

describe('measuring a model', () => {
  it('its size, in the scene axes (glTF x is mirrored in Decentraland)', () => {
    expect(r2(glbBounds(glb([-1, 0, -0.5], [2, 1.2, 0.5])))).toEqual({ x0: -2, x1: 1, y0: 0, y1: 1.2, z0: -0.5, z1: 0.5 })
  })
  it("follows its nodes' translation and scale", () => {
    expect(r2(glbBounds(glb([-1, 0, -1], [1, 1, 1], { translation: [0, 0, 3], scale: [2, 0.5, 1] })))).toEqual({ x0: -2, x1: 2, y0: 0, y1: 0.5, z0: 2, z1: 4 })
  })
  it('placed: moved, scaled and turned (90 degrees swaps width and depth), as a rect to avoid and a top to perch on', () => {
    const b = glbBounds(glb([-1.5, 0, -0.5], [1.5, 0.8, 0.5]))
    const p = placed(b, { at: [10, 0, 5], rot: 90, scale: 1 })
    expect(r2(p)).toEqual({ x0: 9.5, x1: 10.5, z0: 3.5, z1: 6.5, top: 0.8 })
  })
})

describe('a rotation given as a quaternion (as the Creator Hub stores it)', () => {
  const q = (deg: number) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)]
  it('turns into degrees about y', () => {
    expect(Math.round(yawOf(q(90)).deg)).toBe(90)
    expect(Math.round(yawOf(q(-135)).deg)).toBe(-135)
    expect(yawOf(q(30)).pure).toBe(true)
  })
  it('says when it also tilts (so the footprint is only approximate)', () => {
    expect(yawOf([0.3826834, 0, 0, 0.9238795]).pure).toBe(false)
  })
})
