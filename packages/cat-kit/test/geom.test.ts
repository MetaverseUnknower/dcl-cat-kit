import { describe, it, expect } from 'vitest'
import { inBoxes } from '../src/geom'

// The cafe's plot (from its site.ts), for the moved tests.
const PLOT_BOXES = [{ x0: 0.0, x1: 16.0, z0: 0.0, z1: 16.0 }, { x0: 16.0, x1: 32.0, z0: 0.0, z1: 16.0 }, { x0: 32.0, x1: 48.0, z0: 0.0, z1: 16.0 }, { x0: 0.0, x1: 16.0, z0: 16.0, z1: 32.0 }, { x0: 16.0, x1: 32.0, z0: 16.0, z1: 32.0 }, { x0: 32.0, x1: 48.0, z0: 16.0, z1: 32.0 }, { x0: -16.0, x1: 0.0, z0: 16.0, z1: 32.0 }]
const inPlot = (p: { x: number; z: number }) => inBoxes(p, PLOT_BOXES)

describe('inPlot', () => {
  it('is true only on the cafe plot (48 x 32 m)', () => {
    expect(inPlot({ x: 18, z: 14 })).toBe(true)
    expect(inPlot({ x: 18, z: 39 })).toBe(false)
    expect(inPlot({ x: 48.2, z: 14 })).toBe(false)
    expect(inPlot({ x: -0.1, z: 5 })).toBe(false)
  })
  it('knows the catio parcel is part of the plot, but not the parcel south of it', () => {
    expect(inPlot({ x: -8, z: 24 })).toBe(true)
    expect(inPlot({ x: -8, z: 8 })).toBe(false)
    expect(inPlot({ x: 20, z: 10 })).toBe(true)
  })
})
