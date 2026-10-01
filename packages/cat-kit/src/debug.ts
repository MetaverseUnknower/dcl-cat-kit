import { engine, Entity, Transform, MeshRenderer, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { Floors, strips } from './floors'

/**
 * Draw the cats' map in the scene, to check it: thin stripes where they can walk (one colour per floor), a small orange
 * post at every point of every link, and a cube on every spot (yellow: sunny, blue: the rest). Returns a function that
 * removes it all again. For development: remove it (or hide it behind a key) before you deploy.
 */
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
    for (const run of strips(a)) put((run.x0 + run.x1) / 2, a.y + 0.02, run.z, Vector3.create(run.x1 - run.x0 - a.cell * 0.1, 0.01, a.cell * 0.9), colour) // a box per run
  })
  if (o.links !== false) for (const l of f.links) for (const p of l.points) put(p.x, p.y + 0.1, p.z, Vector3.create(0.06, 0.2, 0.06), Color4.create(1, 0.6, 0.1, 1))
  if (o.spots !== false) for (const s of f.spots) put(s.x, s.y + 0.1, s.z, Vector3.create(0.18, 0.18, 0.18), s.sun ? Color4.create(1, 0.9, 0.2, 1) : Color4.create(0.3, 0.5, 1, 1))
  return () => made.forEach((e) => engine.removeEntity(e))
}
