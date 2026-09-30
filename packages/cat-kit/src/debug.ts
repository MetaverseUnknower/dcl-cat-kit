import { engine, Entity, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { Floors } from './floors'

/** Draw a scene's floors for checking them: a tile on every walkable cell, a pole at every link point, a cube per spot. */
export function showFloors(f: Floors, o: { spots?: boolean; links?: boolean } = {}): () => void {
  const made: Entity[] = []
  const put = (x: number, y: number, z: number, s: Vector3, color: Color4) => {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(x, y, z), scale: s })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, { albedoColor: color })
    made.push(e)
  }
  f.nav.areas.forEach((a, k) => {
    const colour = Color4.create(0.2 + 0.3 * k, 0.8, 0.4, 0.5)
    for (let r = 0; r < a.rows; r++)
      for (let c = 0; c < a.cols; c++)
        if (a.walk[r * a.cols + c] === '1') put(a.x0 + (c + 0.5) * a.cell, a.y + 0.02, a.z0 + (r + 0.5) * a.cell, Vector3.create(a.cell * 0.9, 0.01, a.cell * 0.9), colour)
  })
  if (o.links !== false) for (const l of f.links) for (const p of l.points) put(p.x, p.y + 0.1, p.z, Vector3.create(0.06, 0.2, 0.06), Color4.create(1, 0.6, 0.1, 1))
  if (o.spots !== false) for (const s of f.spots) put(s.x, s.y + 0.1, s.z, Vector3.create(0.18, 0.18, 0.18), s.sun ? Color4.create(1, 0.9, 0.2, 1) : Color4.create(0.3, 0.5, 1, 1))
  return () => made.forEach((e) => engine.removeEntity(e))
}
