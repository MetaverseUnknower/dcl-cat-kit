import { XZ, yawToward } from './geom'

/** How far Faith turns her head (degrees either way), and how near someone must be for her to watch them. */
export const HEAD_LIMIT = 70
export const WATCH_RANGE = 6

/**
 * Where Faith's head should point, in degrees relative to her body: at a visitor
 * nearby (as far as her neck turns), otherwise lazily looking about.
 */
export function headTarget(cat: XZ, bodyYaw: number, player: XZ | null, t: number): number {
  if (player && Math.hypot(player.x - cat.x, player.z - cat.z) < WATCH_RANGE) {
    return clamp(wrap(yawToward(cat, player) - bodyYaw))
  }
  return clamp(40 * Math.sin(t * 0.23) + 20 * Math.sin(t * 0.61 + 1))
}

export function wrap(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function clamp(deg: number): number {
  return Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, deg))
}
