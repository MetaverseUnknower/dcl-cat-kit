import { engine, Transform, AudioSource } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/players'
import { CatSpec, Pose, makeRoutine } from './routine'
import { AddCatsOptions, KitCat, Playmate, seatOf, syncBase } from './options'
import { setSoundRoot, callClip } from './voices'
import { initIntents, readIntent, writeIntent } from './shared'
import { NONE, canClaim, claim, extend, isActive } from './intents'
import { CatState, inTubeFor, newCatState, pickLoser, setNarrow, startStandoff, stepCat } from './controller'
import { Rig, createRig, dressRig, poseRig, setHover, CALL_RANGE, PET_RANGE } from './rig'
import { brrrowClip, chatterClip, growlClip, hissClip, mrraClip, mrraOnPet } from './voices'

import { purrVolume } from './purr'
import { dist, inBoxes } from './geom'
import { pickGreeter } from './greet'

const STANDOFF_NEAR = 1.2 // metres apart in the tube when they notice each other and stop

/**
 * The cats: the residents first, then today's guests (if any). Their routine
 * comes from the clock and their reactions from the shared intents (one per slot),
 * so everyone sees the same cats. This client writes an intent only for its own
 * visitor: arriving, calling, petting or sitting down.
 */
const SIT_AFTER = 15
export type { KitCat, AddCatsOptions }

/** What toys need from the cats (filled in by addCats): who each is and what she's up to, and claiming her. */
export const playApi = {
  view: (): (Playmate & { playing: boolean; pouncing: boolean })[] => [],
  claim: (_i: number, _kind: 'play' | 'chase' = 'play'): boolean => false,
  release: (_i: number): void => {},
  catchCat: (_i: number): boolean => false
}

export function addCats(o: AddCatsOptions) {
  if (o.sounds) setSoundRoot(o.sounds)
  setNarrow(o.floors.narrow)
  const homes = o.floors.homes(o.cats.length + (o.guests?.perDay ?? 0))
  const RESIDENTS: CatSpec[] = o.cats.map((c, k) => ({ ...c, home: c.home ?? homes[k] }))
  const REGULARS = (o.guests?.cats ?? []).map(({ home: _home, ...c }) => c)
  const GUEST_SLOTS = o.guests?.perDay ?? 0
  const GUEST_HOMES = homes.slice(RESIDENTS.length)
  const SLOTS = RESIDENTS.length + GUEST_SLOTS
  const { nav: NAV, links: LINKS, spots: SPOTS } = o.floors
  const localSeat = seatOf(o.seats)
  const inTube = o.floors.narrow
  const inPlot = (p: { x: number; z: number }) => inBoxes(p, o.floors.bounds)
  const kit = new Map<string, KitCat>([...o.cats, ...(o.guests?.cats ?? [])].map((c) => [c.key, c]))
  const voiceOf = (c: CatSpec) => kit.get(c.key)?.voice ?? c.key
  const routine = makeRoutine(RESIDENTS, REGULARS, GUEST_HOMES, SPOTS, NAV, LINKS)
  const intents = initIntents(SLOTS, syncBase(o))
  let cats: CatSpec[] = []
  let states: (CatState | null)[] = Array(SLOTS).fill(null)
  let wasHere = false
  const sincePet = Array(SLOTS).fill(Infinity)
  const sinceMrra = Array(SLOTS).fill(Infinity)
  const chattering: boolean[] = Array(SLOTS).fill(false)
  let seatedFor = 0
  let clock = 0
  const call = engine.addEntity()
  Transform.create(call, { parent: engine.PlayerEntity, position: Vector3.create(0, 1.5, 0) })
  AudioSource.create(call, { audioClipUrl: callClip(), loop: false, playing: false, volume: 0.8 })

  const me = () => getPlayer()?.userId ?? ''
  const present = (id: string) => !!getPlayer({ userId: id })
  const myPos = () => {
    const p = Transform.getOrNull(engine.PlayerEntity)
    return p ? { x: p.position.x, z: p.position.z } : null
  }
  let lastPoses: Pose[] = []
  // For toys: who each cat is and what she's up to, and claiming her to play (or chase, or catch).
  const mineToPlayWith = (cur: ReturnType<typeof readIntent>) => (cur.kind === 'play' || cur.kind === 'chase') && cur.userId === me()
  playApi.view = () =>
    cats.map((_, i) => {
      const s = states[i]
      const cur = readIntent(intents[i])
      const now = Date.now()
      const mine = mineToPlayWith(cur)
      return {
        i, x: s?.pos.x ?? 0, y: s?.y ?? 0, z: s?.pos.z ?? 0, asleep: asleep(i),
        busy: !!lastPoses[i]?.busy, free: !isActive(cur, now, present) || mine, playing: mine && isActive(cur, now, present),
        pouncing: !!s && s.mode === 'chasing' && s.pounceT >= 0 // mid-pounce at a laser dot
      }
    })
  playApi.claim = (i: number, kind: 'play' | 'chase' = 'play') => tryClaim(i, kind)
  playApi.release = (i: number) => {
    if (mineToPlayWith(readIntent(intents[i]))) writeIntent(intents[i], NONE)
  }
  playApi.catchCat = (i: number) => {
    const cur = readIntent(intents[i])
    if (cur.kind !== 'chase' || cur.userId !== me()) return false
    writeIntent(intents[i], claim('catch', me(), Date.now()))
    return true
  }
  const tryClaim = (i: number, kind: 'visit' | 'pet' | 'sit' | 'play' | 'chase') => {
    const now = Date.now()
    const cur = readIntent(intents[i])
    if (!me() || !canClaim(cur, now, me(), present)) return false
    writeIntent(intents[i], cur.userId === me() && cur.kind === kind ? extend(cur, now, 30_000) : claim(kind, me(), now))
    return true
  }
  const onClick = (i: number) => () => {
    const p = myPos()
    const s = states[i]
    if (!p || !s || !cats[i] || asleep(i)) return // let sleeping cats lie
    const d = dist(p, s.pos)
    if (d <= PET_RANGE) {
      sincePet[i] = 0
      if (mrraOnPet(Math.random, sinceMrra[i])) {
        sinceMrra[i] = 0
        AudioSource.playSound(rigs[i].voice, mrraClip(voiceOf(cats[i])), true)
      }
      tryClaim(i, 'pet')
    } else if (d <= CALL_RANGE) {
      AudioSource.playSound(call, callClip(), true)
      tryClaim(i, 'visit')
    }
  }
  const asleep = (i: number) => !!states[i]?.asleep
  const rigs: Rig[] = Array.from({ length: SLOTS }, (_, i) => createRig(onClick(i), i + 1))

  engine.addSystem((dt: number) => {
    clock += dt
    const now = Date.now()
    const today = routine.at(now)
    lastPoses = today.poses
    // A new day (or first frame): dress each slot as today's cat, or undress an empty guest slot.
    if (today.cats.map((c) => c.key).join() !== cats.map((c) => c.key).join()) {
      cats = today.cats
      for (let i = 0; i < SLOTS; i++) {
        const c = cats[i]
        dressRig(rigs[i], c ? kit.get(c.key)?.models ?? null : null, c?.name ?? '', c?.scale ?? 1)
        states[i] = c ? newCatState(today.poses[i]) : null
      }
    }
    const mine = myPos()
    const seat = localSeat()
    // Who's in a narrow passage: nobody steps in while another cat is inside.
    const inside = cats.map((_, i) => {
      const o = states[i]
      return !!o && inTube({ x: o.pos.x, y: o.y, z: o.pos.z })
    })
    seatedFor = seat ? seatedFor + dt : 0
    cats.forEach((c, i) => {
      const s = states[i]!
      sincePet[i] += dt
      sinceMrra[i] += dt
      const cur = readIntent(intents[i])
      const who = isActive(cur, now, present) ? getPlayer({ userId: cur.userId }) : null
      const at = who && who.position ? { x: who.position.x, y: who.position.y, z: who.position.z } : null
      // Playing, chasing or catching: wherever the toy says (a wand's feather, a laser's dot); otherwise, them.
      const toy = cur.kind === 'play' || cur.kind === 'chase' || cur.kind === 'catch'
      const target = !at ? null : toy ? o.targets?.(cur.kind as 'play' | 'chase' | 'catch', cur.userId, at, Transform.getOrNull(who!.entity)?.rotation ?? null) ?? (cur.kind === 'play' ? at : null) : at
      // A visitor who has left the plot no longer steers the cat, for anyone.
      const active = at && inPlot(at) ? cur : null
      const others = states.flatMap((o, j) => (o && j !== i && j < cats.length ? [{ x: o.pos.x, y: o.y, z: o.pos.z }] : []))
      const tubeBusy = inside.some((x, j) => x && j !== i)
      stepCat(s, { routine: today.poses[i], intent: active, target, dt, scale: c.scale, tubeBusy }, NAV, LINKS, others)
      if (s.chirp) AudioSource.playSound(rigs[i].voice, brrrowClip(voiceOf(c), Math.random), true)
      if (s.growl) AudioSource.playSound(rigs[i].voice, growlClip(voiceOf(c)), true)
      if (s.hiss) AudioSource.playSound(rigs[i].voice, hissClip(voiceOf(c)), true)

      if (mine) {
        const d = dist(mine, s.pos)
        setHover(rigs[i], asleep(i) ? 'asleep' : d <= PET_RANGE ? 'pet' : d <= CALL_RANGE ? 'call' : null)
        if (cur.kind !== '' && cur.userId === me() && isActive(cur, now, present)) {
          const gone = !inPlot(mine) || (cur.kind === 'visit' && d > CALL_RANGE + 5) || (cur.kind === 'sit' && !seat)
          if (gone) writeIntent(intents[i], NONE)
        }
      }
      const v = purrVolume(sincePet[i])
      const purr = AudioSource.getMutable(rigs[i].purr)
      purr.volume = 0.9 * v
      purr.playing = v > 0
      // At a watch spot (optional): eyes on what's there, tail flicking, and now and then a chatter.
      const pose = today.poses[i]
      const watching = s.mode === 'routine' && !pose.moving && SPOTS[pose.spot]?.watch !== undefined
      const bird = watching && o.watch ? o.watch.targets(now, pose.spot) ?? undefined : undefined
      if (bird) s.lookAt = { x: bird.x, z: bird.z }
      const chat = !!bird && !!o.watch?.chatter?.(now, i)
      if (chat && !chattering[i]) AudioSource.playSound(rigs[i].voice, chatterClip(voiceOf(c)), true)
      chattering[i] = chat
      poseRig(rigs[i], s, clock, dt, v, mine, !!bird, inTube({ x: s.pos.x, y: s.y, z: s.pos.z }))
    })
    // Two cats meeting in a narrow passage stop and stand off; then one backs down and runs back out.
    for (let i = 0; i < cats.length; i++)
      for (let j = i + 1; j < cats.length; j++) {
        const a = states[i]
        const b = states[j]
        if (!a || !b || [a.mode, b.mode].some((m) => m === 'standoff' || m === 'retreat')) continue
        if (!inTube({ x: a.pos.x, y: a.y, z: a.pos.z }) || !inTube({ x: b.pos.x, y: b.y, z: b.pos.z })) continue
        if (dist(a.pos, b.pos) > STANDOFF_NEAR) continue
        const loser = pickLoser({ mode: a.mode, inTubeFor: inTubeFor(a) }, { mode: b.mode, inTubeFor: inTubeFor(b) })
        startStandoff(a, b.pos, loser === 0)
        startStandoff(b, a.pos, loser === 1)
      }
    // Arriving (once we know who you are and you're on the plot): at most one cat comes to say hello.
    const here = !!me() && !!mine && inPlot(mine)
    if (here && !wasHere && mine) {
      const pick = pickGreeter(
        cats.map((c, i) => ({ i, d: dist(mine, states[i]!.pos), social: c.social, free: !isActive(readIntent(intents[i]), now, present), asleep: asleep(i) })),
        Math.random
      )
      if (pick >= 0) tryClaim(pick, 'visit')
    }
    wasHere = here
    // Sitting a while: the nearest free cat may come and curl up beside you (one cat per sitter).
    if (seat && seatedFor > SIT_AFTER && Math.random() < dt / 20) {
      const mineActive = cats.some((_, i) => {
        const x = readIntent(intents[i])
        return x.userId === me() && isActive(x, now, present)
      })
      if (!mineActive) {
        const order = cats
          .map((c, i) => ({ i, d: dist({ x: seat.x, z: seat.z }, states[i]!.pos), social: c.social }))
          .filter((o) => o.d < 15 && !asleep(o.i))
          .sort((a, b) => a.d - b.d)
        for (const o of order) if (Math.random() < o.social && tryClaim(o.i, 'sit')) break
      }
      seatedFor = 0
    }
  })
  return { playApi }
}
