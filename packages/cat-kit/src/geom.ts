
export type XZ = { x: number; z: number }

export function dist(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Yaw (degrees) that turns local -Z (a cat's front) from `from` toward `to`. */
export function yawToward(from: XZ, to: XZ): number {
  return (Math.atan2(-(to.x - from.x), -(to.z - from.z)) * 180) / Math.PI
}

export function wrap(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

export type Box = { x0: number; z0: number; x1: number; z1: number }

/** Whether a point is inside any of these boxes (a scene's floors' bounds). */
export function inBoxes(p: XZ, boxes: Box[]): boolean {
  return boxes.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1)
}
