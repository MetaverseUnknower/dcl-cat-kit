import { engine, Entity, Schemas } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Intent, IntentKind, NONE } from './intents'

/** One synced intent per cat, under fixed ids so every client joins the same set. */
export const CatIntent = engine.defineComponent('catkit::CatIntent', {
  kind: Schemas.String,
  userId: Schemas.String,
  since: Schemas.Number,
  until: Schemas.Number
})
/** `base`: the first sync id (the scene's choice, so the kit's ids don't clash with its own). */
export function initIntents(n: number, base: number): Entity[] {
  const out: Entity[] = []
  for (let i = 0; i < n; i++) {
    const e = engine.addEntity()
    CatIntent.create(e, { ...NONE })
    syncEntity(e, [CatIntent.componentId], base + i)
    out.push(e)
  }
  return out
}

export function readIntent(e: Entity): Intent {
  const v = CatIntent.get(e)
  return { kind: v.kind as IntentKind, userId: v.userId, since: v.since, until: v.until }
}

export function writeIntent(e: Entity, i: Intent) {
  const v = CatIntent.getMutable(e)
  v.kind = i.kind
  v.userId = i.userId
  v.since = i.since
  v.until = i.until
}
