import { XZ, dist, yawToward } from './geom'

/**
 * A leap up or down, like a real cat: a crouch to wind up, a gravity arc (a quick spring
 * up, or a drop that speeds up as it falls, the body tipping along the arc), then a
 * landing that sinks into a crouch to absorb it and rises again.
 */
const G = 9.81
export const CROUCH = 0.3
const LAND = 0.35
const ARC = 0.15 // how far the arc rises above the higher end

function flightTime(y0: number, y1: number): number {
  const apex = Math.max(y0, y1) + ARC
  return Math.sqrt((2 * (apex - y0)) / G) + Math.sqrt((2 * (apex - y1)) / G)
}

export function leapSeconds(y0: number, y1: number): number {
  return CROUCH + flightTime(y0, y1) + LAND
}

export type LeapPose = { x: number; y: number; z: number; yaw: number; pitch: number; crouch: number; flight: number }

/** Where she is `t` seconds into a leap from `a` (at height ya) to `b` (at yb). */
export function leap(a: XZ, ya: number, b: XZ, yb: number, t: number, yaw: number): LeapPose {
  const T = flightTime(ya, yb)
  const heading = dist(a, b) > 0.01 ? yawToward(a, b) : yaw
  const down = yb < ya
  if (t < CROUCH) {
    const k = Math.max(0, t) / CROUCH // winding up, eyes on the landing
    return { x: a.x, y: ya, z: a.z, yaw: heading, pitch: (down ? -12 : 12) * k, crouch: k, flight: 0 }
  }
  const f = t - CROUCH
  if (f < T) {
    const vy0 = Math.sqrt(2 * G * (Math.max(ya, yb) + ARC - ya))
    const k = f / T
    const vy = vy0 - G * f
    const across = Math.max(dist(a, b) / T, 0.5)
    const pitch = Math.max(-55, Math.min(45, ((Math.atan2(vy, across) * 180) / Math.PI) * 0.8))
    return { x: a.x + (b.x - a.x) * k, y: ya + vy0 * f - 0.5 * G * f * f, z: a.z + (b.z - a.z) * k, yaw: heading, pitch, crouch: 0, flight: 1 }
  }
  const k = Math.min(1, (f - T) / LAND) // absorbing the landing: sink quickly, rise slower
  const crouch = k < 0.3 ? k / 0.3 : 1 - (k - 0.3) / 0.7
  return { x: b.x, y: yb, z: b.z, yaw: heading, pitch: (down ? -15 : 0) * (1 - k), crouch, flight: 0 }
}
