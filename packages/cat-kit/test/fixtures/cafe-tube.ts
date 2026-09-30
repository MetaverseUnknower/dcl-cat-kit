// The cafe's sky tunnel (from its site.ts), for the moved tests.
export const SKY_TUNNEL = { r: 0.3, line: [{ x: 4.3, y: 4.65, z: 19.25 }, { x: 3.35, y: 4.65, z: 19.3 }, { x: 0.0, y: 4.65, z: 19.6 }, { x: -4.0, y: 4.65, z: 20.0 }] }

type P = { x: number; y: number; z: number }

/**
 * Whether a cat (her paws at `p`) is walking inside the sky tunnel: within the tube, measured
 * from its centre line, at about the height of its walkway. Pure, from the tunnel's shape.
 */
export function inTube(p: P): boolean {
  const L = SKY_TUNNEL.line
  const r = SKY_TUNNEL.r
  const c = { x: p.x, y: p.y + r - 0.03, z: p.z } // her paws on the walkway put the centre line this far above them
  for (let i = 0; i + 1 < L.length; i++) {
    const a = L[i]
    const b = L[i + 1]
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const len2 = d.x * d.x + d.y * d.y + d.z * d.z
    const k = ((c.x - a.x) * d.x + (c.y - a.y) * d.y + (c.z - a.z) * d.z) / len2
    if (k < 0 || k > 1) continue
    const dist = Math.hypot(c.x - a.x - d.x * k, c.y - a.y - d.y * k, c.z - a.z - d.z * k)
    if (dist < r * 0.6) return true
  }
  return false
}
