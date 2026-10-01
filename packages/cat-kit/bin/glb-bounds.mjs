// A .glb model's bounding box in Decentraland's axes, and its footprint once placed in a scene.
// Used by `npx dcl-cat-kit-measure` to turn a model into defineFloors shapes (avoid rects, perch heights).

/** Column-major 4x4 matrices, as glTF stores them. */
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function mul(a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function trs(n) {
  if (n.matrix) return n.matrix
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1
  ]
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]

/** Read a GLB's JSON chunk. */
export function glbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a .glb file (binary glTF)')
  const len = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'))
}

/**
 * The model's bounding box `{ x0, x1, y0, y1, z0, z1 }` in metres, in Decentraland's axes: glTF is right-handed and
 * Decentraland left-handed, so glTF's x is mirrored (as the explorer's loader does).
 */
export function glbBounds(buf) {
  const j = glbJson(buf)
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }
  const visit = (i, parent) => {
    const n = j.nodes[i]
    const m = mul(parent, trs(n))
    if (n.mesh !== undefined)
      for (const p of j.meshes[n.mesh].primitives) {
        const a = j.accessors[p.attributes.POSITION]
        if (!a?.min || !a?.max) continue
        for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
          const [x, y, z] = apply(m, [cx, cy, cz])
          b.x0 = Math.min(b.x0, -x); b.x1 = Math.max(b.x1, -x)
          b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y)
          b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z)
        }
      }
    for (const c of n.children ?? []) visit(c, m)
  }
  const roots = j.scenes?.[j.scene ?? 0]?.nodes ?? j.nodes.map((_, i) => i)
  for (const r of roots) visit(r, IDENT)
  if (b.x0 === Infinity) throw new Error('the model has no meshes with bounds')
  return b
}

/**
 * Where a model's box lands in the scene when its entity is at `at` ([x, y, z]), turned `rot` degrees about y (as
 * Quaternion.fromEulerDegrees(0, rot, 0)) and scaled `scale` (a number, or [x, y, z]): the footprint as
 * `{ x0, x1, z0, z1 }` (to avoid, or to walk on) and `top`, the height of its highest point (to perch on).
 */
export function placed(b, { at = [0, 0, 0], rot = 0, scale = 1 }) {
  const [sx, sy, sz] = Array.isArray(scale) ? scale : [scale, scale, scale]
  const a = (rot * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const p = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }
  for (const x of [b.x0 * sx, b.x1 * sx]) for (const z of [b.z0 * sz, b.z1 * sz]) {
    const X = at[0] + x * c + z * s
    const Z = at[2] - x * s + z * c
    p.x0 = Math.min(p.x0, X); p.x1 = Math.max(p.x1, X)
    p.z0 = Math.min(p.z0, Z); p.z1 = Math.max(p.z1, Z)
  }
  return { ...p, top: at[1] + b.y1 * sy }
}

/**
 * A rotation quaternion [x, y, z, w] (as in a Transform, or the Creator Hub's main.composite) as degrees about y, for
 * `placed`. `pure` is false when it also tilts the model, so a footprint from the yaw alone is only approximate.
 */
export function yawOf([x, y, z, w]) {
  const n = Math.hypot(x, y, z, w) || 1
  const deg = (2 * Math.atan2(y / n, w / n) * 180) / Math.PI
  return { deg: ((deg + 540) % 360) - 180, pure: Math.abs(x / n) < 1e-3 && Math.abs(z / n) < 1e-3 }
}
