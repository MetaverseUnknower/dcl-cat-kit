import { engine, Transform, MeshRenderer, MeshCollider, Material } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { addCats, defineFloors, rect, stairs, spot, showFloors, CAFE_CATS } from 'dcl-cat-kit'

// A room with a loft, a table, and stairs up the side: enough to see the cats nap, stroll, climb and come when called.
function slab(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: Color4) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz) })
  MeshRenderer.setBox(e)
  MeshCollider.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: color })
}

export function main() {
  slab(8, -0.05, 8, 16, 0.1, 16, Color4.create(0.86, 0.8, 0.7, 1)) // floor
  slab(8, 2.95, 13, 14, 0.1, 5, Color4.create(0.7, 0.55, 0.4, 1)) // loft
  slab(8, 0.4, 6, 2, 0.8, 2, Color4.create(0.5, 0.35, 0.25, 1)) // table

  const floors = defineFloors({
    floors: [
      { name: 'ground', y: 0, walk: [rect(1, 1, 15, 15)], avoid: [rect(7, 5, 9, 7)] },
      { name: 'loft', y: 3, walk: [rect(1.2, 10.6, 14.8, 15.4)] }
    ],
    links: [stairs({ from: [2, 4], to: [2, 12], up: 3 })],
    spots: [spot.bed(12, 3), spot.bed(4, 8), spot.sunny(10, 9), spot.perch(8, 0.8, 6), spot.bed(12, 14, 0, { floor: 'loft' }), spot.bed(5, 13, 0, { floor: 'loft' })]
  })
  addCats({ floors, cats: [CAFE_CATS.faith, CAFE_CATS.haze, CAFE_CATS.tigger] })
  showFloors(floors) // remove this line once the floors look right
}
