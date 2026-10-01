import {
  engine, Transform, MeshRenderer, MeshCollider, Material, MaterialTransparencyMode, TextShape, Billboard, BillboardMode,
  inputSystem, InputAction, PointerEventType
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { FURNITURE, placeFurniture, currentSeat } from 'dcl-sittables'
import { addCats, defineFloors, rect, circle, stairs, climb, spot, showFloors, CAFE_CATS } from 'dcl-cat-kit'

// A cosy one-parcel cat room: a raised platform with steps and a cat tree, beds, sunny patches under the windows,
// a side table to jump onto, and a sofa to sit on (dcl-sittables), where a cat may come and curl up beside you.

const rgb = (r: number, g: number, b: number, a = 1) => Color4.create(r, g, b, a)
const OAK = rgb(0.72, 0.55, 0.38)
const WALNUT = rgb(0.5, 0.34, 0.22)
const CREAM = rgb(0.93, 0.88, 0.8)
const SISAL = rgb(0.8, 0.7, 0.52)
const CARPET = rgb(0.45, 0.55, 0.62)

type Look = { color: Color4; collide?: boolean; glow?: boolean; rotY?: number }

function paint(e: ReturnType<typeof engine.addEntity>, l: Look) {
  if (l.glow) {
    Material.setPbrMaterial(e, {
      albedoColor: l.color, emissiveColor: Color3.create(l.color.r, l.color.g, l.color.b), emissiveIntensity: 0.6,
      transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
    })
  } else {
    Material.setPbrMaterial(e, {
      albedoColor: l.color, roughness: 0.85, metallic: 0,
      ...(l.color.a < 1 ? { transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND } : {})
    })
  }
}

/** A box from its centre and size. */
function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, l: Look) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(sx, sy, sz), rotation: Quaternion.fromEulerDegrees(0, l.rotY ?? 0, 0) })
  MeshRenderer.setBox(e)
  if (l.collide !== false) MeshCollider.setBox(e)
  paint(e, l)
  return e
}

/** An upright cylinder standing on `y`, of radius r and height h. */
function cyl(x: number, y: number, z: number, r: number, h: number, l: Look, rTop = r) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y + h / 2, z), scale: Vector3.create(1, h, 1) })
  MeshRenderer.setCylinder(e, r, rTop)
  if (l.collide !== false) MeshCollider.setCylinder(e, r, rTop)
  paint(e, l)
  return e
}

function ball(x: number, y: number, z: number, r: number, l: Look) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, z), scale: Vector3.create(2 * r, 2 * r, 2 * r) })
  MeshRenderer.setSphere(e)
  paint(e, l)
}

/** A round cat bed: a cushion on a flat base, low enough that a curled-up cat sits in it rather than on top. */
function bed(x: number, y: number, z: number, base: Color4, cushion: Color4) {
  cyl(x, y, z, 0.42, 0.035, { color: base, collide: false })
  cyl(x, y + 0.035, z, 0.34, 0.02, { color: cushion, collide: false })
}

/** A soft patch of sunlight on the floor, from a window. */
const sunPatch = (x: number, y: number, z: number, sx: number, sz: number) =>
  box(x, y + 0.012, z, sx, 0.004, sz, { color: rgb(1, 0.9, 0.55, 0.32), glow: true, collide: false })

function plant(x: number, y: number, z: number) {
  cyl(x, y, z, 0.22, 0.4, { color: rgb(0.7, 0.42, 0.3) }, 0.28)
  ball(x, y + 0.75, z, 0.38, { color: rgb(0.3, 0.55, 0.32) })
  ball(x + 0.15, y + 1.0, z - 0.1, 0.26, { color: rgb(0.36, 0.62, 0.36) })
}

export function main() {
  // The room: a wooden floor, walls on two sides with windows, and the platform along the back.
  box(8, -0.05, 8, 16, 0.1, 16, { color: OAK })
  // West wall (x = 0), with a window between z 7 and 10
  box(0.1, 1.75, 3.5, 0.2, 3.5, 7, { color: CREAM })
  box(0.1, 1.75, 13, 0.2, 3.5, 6, { color: CREAM })
  box(0.1, 0.5, 8.5, 0.2, 1, 3, { color: CREAM })
  box(0.1, 2.85, 8.5, 0.2, 1.3, 3, { color: CREAM })
  box(0.1, 1.6, 8.5, 0.05, 1.2, 3, { color: rgb(0.75, 0.88, 1, 0.25), collide: false })
  // North wall (z = 16), with a window over the platform between x 9 and 11
  box(4.5, 1.75, 15.9, 9, 3.5, 0.2, { color: CREAM })
  box(13.5, 1.75, 15.9, 5, 3.5, 0.2, { color: CREAM })
  box(10, 1.0, 15.9, 2, 2, 0.2, { color: CREAM })
  box(10, 3.25, 15.9, 2, 0.5, 0.2, { color: CREAM })
  box(10, 2.5, 15.9, 2, 1, 0.05, { color: rgb(0.75, 0.88, 1, 0.25), collide: false })

  // The platform: 1.2 m up, so you can see the cats on it from the floor.
  const UP = 1.2
  box(11.25, UP - 0.075, 13.75, 8.5, 0.15, 4.5, { color: WALNUT })
  for (const x of [7.1, 11.25, 15.4]) box(x, (UP - 0.15) / 2, 11.6, 0.16, UP - 0.15, 0.16, { color: WALNUT })
  // Railings: along the front (with a gap where the cat tree reaches it) and the stairs' side
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(1, Math.round(len / 1))
    for (let k = 0; k <= n; k++) box(x0 + ((x1 - x0) * k) / n, UP + 0.45, z0 + ((z1 - z0) * k) / n, 0.05, 0.9, 0.05, { color: WALNUT })
    box((x0 + x1) / 2, UP + 0.9, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.06, 0.05, Math.abs(z1 - z0) + 0.06, { color: WALNUT })
  }
  rail(7.05, 11.55, 13.4, 11.55)
  rail(14.8, 11.55, 15.45, 11.55)
  rail(7.05, 11.55, 7.05, 12.8)

  // The steps up, built on the same stairs the cats take, so cats and visitors climb them alike.
  const steps = stairs({ from: [3.4, 13.5], to: [7.6, 13.5], up: UP })
  const tread = (7.6 - 3.4) / (steps.points.length + 1)
  for (const [x, y, z] of steps.points) box(x, y / 2, z, tread, y, 1.2, { color: WALNUT })

  // The cat tree: a cat's own way up, hopping from perch to perch.
  const tree = climb({ from: [12.6, 9.9], perches: [[13.3, 0.5, 10.5], [14.1, 0.92, 11.0]], to: [14.1, 12.1], up: UP })
  for (const [x, y, z] of tree.points) {
    cyl(x, 0, z, 0.08, y, { color: SISAL })
    cyl(x, y - 0.04, z, 0.28, 0.04, { color: CARPET })
  }
  cyl(13.7, 0, 10.75, 0.45, 0.04, { color: CARPET })

  // Beds, a side table to jump onto, sunny patches, a rug, food bowls and plants.
  bed(3, 0, 4.5, rgb(0.8, 0.55, 0.6), rgb(0.97, 0.9, 0.88))
  bed(13.5, 0, 3.5, rgb(0.45, 0.52, 0.62), rgb(0.9, 0.92, 0.95))
  bed(11.8, UP, 14.6, rgb(0.62, 0.5, 0.35), rgb(0.96, 0.92, 0.82))
  bed(14.6, UP, 13.2, rgb(0.55, 0.62, 0.48), rgb(0.95, 0.95, 0.88))
  box(1.3, 0.6, 11.2, 0.7, 0.05, 0.7, { color: WALNUT })
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) box(1.3 + dx, 0.29, 11.2 + dz, 0.05, 0.58, 0.05, { color: WALNUT })
  sunPatch(2.6, 0, 8.5, 1.8, 1.4)
  sunPatch(10, UP, 14.6, 1.6, 1.4)
  cyl(10.5, 0, 5.2, 2.2, 0.01, { color: rgb(0.62, 0.7, 0.56), collide: false })
  cyl(1.0, 0, 2.0, 0.14, 0.06, { color: rgb(0.85, 0.3, 0.3) }, 0.17)
  cyl(1.0, 0, 2.5, 0.14, 0.06, { color: rgb(0.3, 0.5, 0.85) }, 0.17)
  plant(0.8, 0, 15.2)
  plant(15.2, 0, 0.8)
  plant(15.0, UP, 15.3)

  // The sofa (dcl-sittables): sit, wait a little, and a cat may come and curl up beside you.
  placeFurniture(FURNITURE.petalSofa, { position: Vector3.create(10.5, 0, 7.5), facing: 180 })

  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(5, 1.9, 3.2) })
  TextShape.create(sign, {
    text: 'dcl-cat-kit\n\nClick a cat near you to pet her\nClick one further off to call her\nSit on the sofa for a while\nPress E to see where cats can walk',
    fontSize: 1.1, textColor: rgb(0.25, 0.18, 0.12), outlineWidth: 0.1, outlineColor: Color3.create(1, 0.97, 0.9)
  })
  Billboard.create(sign, { billboardMode: BillboardMode.BM_Y })

  const floors = defineFloors({
    floors: [
      {
        name: 'ground', y: 0, walk: [rect(0.5, 0.5, 15.5, 15.5)],
        avoid: [
          rect(3.7, 12.9, 7.3, 14.1), // the steps
          rect(8.9, 6.9, 12.1, 8.1), // the sofa
          rect(0.95, 10.85, 1.65, 11.55), // the side table
          rect(0.8, 1.8, 1.2, 2.7), // the food bowls
          circle(0.8, 15.2, 0.3), circle(15.2, 0.8, 0.3), // plants
          circle(7.1, 11.6, 0.1), circle(11.25, 11.6, 0.1), circle(15.4, 11.6, 0.1), // the platform's posts
          circle(13.3, 10.5, 0.1), circle(14.1, 11.0, 0.1) // the cat tree's posts
        ]
      },
      { name: 'platform', y: UP, walk: [rect(7, 11.5, 15.5, 15.8)], avoid: [circle(15.0, 15.3, 0.3)] }
    ],
    links: [steps, tree],
    spots: [
      // homes first: one each, in the order of the cats below
      spot.bed(3, 4.5),
      spot.bed(11.8, 14.6, 0, { floor: 'platform' }),
      spot.bed(13.5, 3.5),
      // and places to go during the day
      spot.sunny(2.6, 8.5, 90),
      spot.perch(1.3, 0.63, 11.2),
      spot.sunny(10, 14.6, 180, { floor: 'platform' }),
      spot.bed(14.6, 13.2, 0, { floor: 'platform' })
    ]
  })
  addCats({
    floors,
    cats: [CAFE_CATS.faith, CAFE_CATS.haze, CAFE_CATS.tigger],
    seats: () => currentSeat()?.position ?? null
  })

  // Press E to show (or hide) the cats' floors: where they can walk, the links between floors, and the spots.
  let hideFloors: (() => void) | null = null
  engine.addSystem(() => {
    if (!inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) return
    if (hideFloors) {
      hideFloors()
      hideFloors = null
    } else hideFloors = showFloors(floors)
  })
}
