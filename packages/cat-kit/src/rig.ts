import {
  engine, Entity, Transform, GltfContainer, TextShape, Billboard, BillboardMode, MeshCollider, ColliderLayer,
  AudioSource, PointerEvents, pointerEventsSystem, InputAction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { RIG, POSE } from './shape'
import { CatState } from './controller'
import { eyesShut } from './blink'
import { headTarget } from './gaze'
import { purrClip } from './voices'
import { Hover, hoverText } from './hover'

const STRIDE = 0.3
const SWING = 24
const GAIT = [0, Math.PI, Math.PI, 0]
export const CALL_RANGE = 20
export const PET_RANGE = 4

export type Rig = {
  name: string; root: Entity; frame: Entity; body: Entity; head: Entity; tail: Entity; legs: Entity[]; lids: Entity
  target: Entity; label: Entity; purr: Entity; voice: Entity; headYaw: number; hover: Hover | null; dressed: string; shut: number
  /** Her own blink rhythm. */
  seed: number
  /** 0 to 1: her tail lowered to trail straight back, walking through a narrow passage. */
  tuck: number
}

function part(parent: Entity, p: { x: number; y: number; z: number }): Entity {
  const e = engine.addEntity()
  Transform.create(e, { parent, position: Vector3.create(p.x, p.y, p.z) })
  return e
}

/**
 * Dress a rig as a particular cat: its models, name label and size. `prefix` is the
 * cat's models prefix (her `models`, e.g. `assets/dcl-cat-kit/cats/faith`). Guest slots
 * are re-dressed each day; an empty slot is undressed (no models, no label).
 */
export function dressRig(r: Rig, prefix: string | null, name: string, scale: number) {
  if (r.dressed === (prefix ?? '')) return
  r.dressed = prefix ?? ''
  r.name = name
  const src = (p: string) => `${prefix}-${p}.glb` // the cat's models prefix, e.g. assets/dcl-cat-kit/cats/faith
  const parts: [Entity, string][] = [[r.body, 'body'], [r.head, 'head'], [r.tail, 'tail'], [r.lids, 'lids'], ...r.legs.map((l): [Entity, string] => [l, 'leg'])]
  for (const [e, p] of parts) {
    if (prefix) GltfContainer.createOrReplace(e, { src: src(p) })
    else GltfContainer.deleteFrom(e)
  }
  TextShape.getMutable(r.label).text = prefix ? name : ''
  const k = prefix ? scale : 0 // an empty slot shrinks away, taking its click target with it
  Transform.getMutable(r.root).scale = Vector3.create(k, k, k)
  r.hover = null
}

export function createRig(onClick: () => void, seed = 0): Rig {
  const root = engine.addEntity()
  Transform.create(root, {})
  const frame = engine.addEntity()
  Transform.create(frame, { parent: root, position: Vector3.create(0, POSE.lieY, 0) })
  const body = part(frame, { x: 0, y: 0, z: 0 })
  const head = part(frame, RIG.head)
  const tail = part(frame, RIG.tail)
  const legs = RIG.legs.map((h) => part(frame, h))
  const lids = part(head, { x: 0, y: 0, z: 0 }) // built in the head's frame
  Transform.getMutable(lids).scale = Vector3.Zero()
  const target = engine.addEntity()
  Transform.create(target, { parent: frame, position: Vector3.create(0, 0.05, -0.05), scale: Vector3.create(0.45, 0.45, 0.8) })
  MeshCollider.setBox(target, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: target, opts: { button: InputAction.IA_POINTER, hoverText: 'Pet', maxDistance: CALL_RANGE } },
    onClick
  )
  const label = engine.addEntity()
  Transform.create(label, { parent: root, position: Vector3.create(0, 0.75, 0) })
  TextShape.create(label, {
    text: '', fontSize: 1.3, textColor: Color4.create(0.98, 0.95, 0.86, 1), outlineWidth: 0.2,
    outlineColor: Color3.create(0.1, 0.1, 0.12)
  })
  Billboard.create(label, { billboardMode: BillboardMode.BM_Y })
  const purr = engine.addEntity()
  Transform.create(purr, { parent: root, position: Vector3.create(0, 0.2, 0) })
  AudioSource.create(purr, { audioClipUrl: purrClip(), loop: true, playing: false, volume: 0 })
  const voice = engine.addEntity()
  Transform.create(voice, { parent: head, position: Vector3.create(0, 0.06, -0.12) })
  AudioSource.create(voice, { audioClipUrl: purrClip(), loop: false, playing: false, volume: 0.85 })
  return { name: '', root, frame, body, head, tail, legs, lids, target, label, purr, voice, headYaw: 0, hover: null, dressed: '', shut: 0, tuck: 0, seed }
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/**
 * Pose the rig from the controller's state (first made for Faith at MetaPetal HQ), plus:
 * curled up (tipped onto her side, head turned back to her tail, tail wrapped round, paws
 * tucked), the play-bow stretch (chest down, rear up, forelegs out), and sleep (eyes shut,
 * slow deep breaths).
 */
export function poseRig(r: Rig, s: CatState, clock: number, dt: number, purring: number, player: { x: number; z: number } | null, watching = false, inTube = false) {
  const stand = smooth(Math.max(0, Math.min(1, s.stand)))
  const crouch = smooth(Math.max(0, Math.min(1, s.crouch)))
  const curl = smooth(Math.max(0, Math.min(1, s.curl)))
  const bow = smooth(Math.max(0, Math.min(1, s.stretch)))
  const walking = s.speed > 0.05 && stand > 0.9
  const phase = (s.stride / STRIDE) * 2 * Math.PI
  const root = Transform.getMutable(r.root)
  root.position = Vector3.create(s.pos.x, s.y, s.pos.z)
  // Yaw, then the leap's (or the stretch's) pitch about the body's own side-to-side axis (positive lifts the nose).
  root.rotation = Quaternion.multiply(Quaternion.fromEulerDegrees(0, s.yaw, 0), Quaternion.fromEulerDegrees(s.pitch - 16 * bow, 0, 0))
  const bob = walking ? 0.008 * Math.abs(Math.sin(phase)) : 0
  const lying = POSE.lieY + POSE.curlLift * curl // curled: lifted a touch, so her tucked paws rest on the floor
  const height = lying + (POSE.standY - lying) * Math.max(stand, 0.75 * bow) * (1 - 0.45 * crouch) // a crouch sinks toward the floor
  const frame = Transform.getMutable(r.frame)
  frame.position = Vector3.create(0, height + bob, 0)
  const wiggle = Math.max(0, Math.min(1, s.wiggle))
  frame.rotation = Quaternion.fromEulerDegrees(0, 6 * wiggle * Math.sin(clock * 2 * Math.PI * 3), POSE.curlRoll * curl) // curled: tipped onto her side; wiggling before a pounce
  const asleep = s.asleep ? 1 : 0
  // Eyes shut asleep, or purring under someone's hand; otherwise a slow blink now and then.
  r.shut = eyesShut({ t: clock, seed: r.seed, asleep: s.asleep, purring }) ? 1 : 0
  const lids = r.shut
  Transform.getMutable(r.lids).scale = Vector3.create(lids, lids, lids)
  const rate = asleep ? 0.9 : 1.4 + 2.2 * purring // sleeping: slow, deep breaths
  const depth = asleep ? 0.045 : (0.025 + 0.02 * purring) * (1 - 0.6 * stand)
  Transform.getMutable(r.body).scale = Vector3.create(1 + 0.5 * depth * Math.sin(clock * rate), 1 + depth * Math.sin(clock * rate), 1 - 0.08 * curl)
  r.legs.forEach((leg, i) => {
    const swing = walking ? SWING * Math.sin(phase + GAIT[i]) : 0
    // In the air the forelegs reach forward for the landing and the hind legs trail; crouching folds them a little.
    const leapLegs = s.flight ? (i < 2 ? 45 : -40) : 0
    const fold = crouch * (i < 2 ? 20 : 35)
    const pose = POSE.lieLegs[i] * (1 - stand) + (swing + leapLegs + fold) * stand
    const lie = pose + (POSE.curlLegs[i] - pose) * curl // curled: paws tucked in alongside
    const stretch = i < 2 ? 80 : 5 // the bow: forelegs stretched right out in front, hind legs straight
    const swipe = i === 0 ? Math.max(0, Math.min(1, s.bat)) : 0 // batting at the feather with her right forepaw
    const angle = lie + (stretch - lie) * bow
    Transform.getMutable(leg).rotation = Quaternion.fromEulerDegrees(angle + (-60 + 25 * Math.sin(clock * 2 * Math.PI * 2) - angle) * swipe, 0, 0)
  })
  const twitch = Math.sin(clock * 0.9) * Math.max(0, Math.sin(clock * 0.21)) * 14 * (1 - asleep) + 25 * wiggle * Math.sin(clock * 11)
    + (watching ? 18 * Math.sin(clock * 5.5) : 0) // watching something: the tail tip flicks and flicks
  r.tuck += ((inTube ? 1 : 0) - r.tuck) * Math.min(1, dt * 4) // in a narrow passage: tail down and trailing
  const tuck = smooth(r.tuck)
  const tailPitch = (18 * (1 - stand) - 62 * stand + (walking ? 4 * Math.sin(phase * 0.5) : 0)) * (1 - tuck) + 6 * tuck
  const tailYaw = ((55 + twitch) * (1 - stand) + 10 * Math.sin(clock * 1.3) * stand) * (1 - tuck)
    + s.fight * 35 * Math.sin(clock * 10) // a standoff: the tail lashes side to side
    + s.flick * 30 * Math.sin(clock * 9) // after a catch: a satisfied flick
  Transform.getMutable(r.tail).rotation = Quaternion.multiply(
    Quaternion.fromEulerDegrees(0, tailYaw + (150 - tailYaw) * curl, 0), // curled: wrapped round to her nose
    Quaternion.fromEulerDegrees(tailPitch + (38 - tailPitch) * curl - 70 * bow, 0, 0) // the bow: tail up
  )
  const look = s.lookAt ?? player
  const target = walking && !s.lookAt ? 0 : headTarget(s.pos, s.yaw, look, clock)
  r.headYaw += (target - r.headYaw) * Math.min(1, dt * 3)
  const pitch = walking ? -8 + 3 * Math.sin(phase * 2) : 4 + 3 * purring
  // curled: head turned back along her side toward her tail, chin down on her paws; the bow: looking ahead
  Transform.getMutable(r.head).rotation = Quaternion.fromEulerDegrees(
    pitch + (-16 - pitch) * curl + 14 * bow,
    r.headYaw + (-105 - r.headYaw) * curl,
    0
  )
}

export function setHover(r: Rig, action: Hover | null) {
  if (action === r.hover || action === null) return
  r.hover = action
  const info = PointerEvents.getMutable(r.target).pointerEvents[0]?.eventInfo
  if (info) info.hoverText = hoverText(action, r.name)
}
