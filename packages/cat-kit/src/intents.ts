/**
 * What a cat has been asked to do, shared by everyone in the cafe: go and say
 * hello to someone (visit), stay put while being petted (pet), curl up by a
 * seated visitor (sit), come and play with the Feather Wand (play), chase a
 * Laser Ring's dot (chase), or catch it as it's switched off on her (catch). The first claim wins; it lapses on its
 * own, or as soon as its visitor leaves the scene.
 */
export type IntentKind = '' | 'visit' | 'pet' | 'sit' | 'play' | 'chase' | 'catch'
export type Intent = { kind: IntentKind; userId: string; since: number; until: number }

export const NONE: Intent = { kind: '', userId: '', since: 0, until: 0 }
export const LASTS = { visit: 150_000, pet: 30_000, sit: 180_000, play: 20_000, chase: 20_000, catch: 3_000 }

export function isActive(i: Intent, now: number, present: (id: string) => boolean): boolean {
  return i.kind !== '' && now < i.until && present(i.userId)
}

export function canClaim(i: Intent, now: number, me: string, present: (id: string) => boolean): boolean {
  return !isActive(i, now, present) || i.userId === me
}

export function claim(kind: Exclude<IntentKind, ''>, me: string, now: number): Intent {
  return { kind, userId: me, since: now, until: now + LASTS[kind] }
}

export function extend(i: Intent, now: number, ms: number): Intent {
  return { ...i, until: Math.max(i.until, now + ms) }
}
