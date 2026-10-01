import { CatSpec } from './routine'
import { Floors } from './floors'

/** A cat for the kit: the routine's spec, where her models are (a path prefix, e.g. assets/dcl-cat-kit/cats/faith) and
 * her voice (the name her sound files start with). `home` is optional: the floors hand out homes. */
export type KitCat = Omit<CatSpec, 'home'> & { home?: number; models: string; voice: string }
type Seat = { x: number; y: number; z: number }
/** Where this visitor is sitting: a function (with dcl-sittables, `() => currentSeat()?.position ?? null`), or an object with `localSeat()`. */
export type Seats = { localSeat(): Seat | null } | (() => Seat | null)
export type Quat = { x: number; y: number; z: number; w: number }
/** For toys: where a cat playing (`play`), chasing (`chase`) or catching (`catch`) with this visitor should go. */
export type TargetProvider = (kind: 'play' | 'chase' | 'catch', userId: string, at: Seat, rotation: Quat | null) => Seat | null
export type AddCatsOptions = {
  floors: Floors
  cats: KitCat[]
  seats?: Seats
  guests?: { cats: KitCat[]; perDay: number }
  /** Watch spots (optional): what's to look at from a spot.watch(…, target) spot, by its target number. */
  watch?: { targets(now: number, target: number): { x: number; z: number } | null; chatter?(now: number, i: number): boolean }
  /** The hour (UTC) the cats' day turns over; they're home asleep for the half hour before it. Default 10. */
  dayStartUtcHour?: number
  targets?: TargetProvider
  /** The first of the synced entity ids the cats use (one per cat). Default 7300; change it if your scene uses those. */
  sync?: number
  sounds?: string
}
export const seatOf = (s: Seats | undefined): (() => Seat | null) => (!s ? () => null : typeof s === 'function' ? s : () => s.localSeat())
export const syncBase = (o: { sync?: number }) => o.sync ?? 7300
export type Playmate = { i: number; x: number; y: number; z: number; asleep: boolean; busy: boolean; free: boolean }

/** The cats whose models aren't in the scene's files (a content list, any case): copy-assets wasn't run, or ran elsewhere. */
export function missingModels(files: string[], cats: KitCat[]): string[] {
  const have = new Set(files.map((f) => f.toLowerCase()))
  return cats.filter((c) => !have.has(`${c.models}-body.glb`.toLowerCase())).map((c) => c.key)
}

/**
 * Best effort: say which cats' model files aren't in the scene (copy-assets not run), rather than leave them
 * invisible. `getInfo` is the runtime's getSceneInformation, whose answer may or may not be a promise; whatever
 * it does (answers, rejects, throws, returns junk), this never throws and never stops the cats.
 */
export function reportMissingModels(getInfo: () => unknown, cats: KitCat[], log: (msg: string) => void) {
  void (async () => {
    const info = (await getInfo()) as { content?: unknown } | undefined
    if (!Array.isArray(info?.content)) return
    const missing = missingModels(info!.content.map((c: { file?: unknown }) => String(c?.file ?? '')), cats)
    if (missing.length) log(`dcl-cat-kit: no model files for ${missing.join(', ')}: run \`npx dcl-cat-kit-copy-assets\` in your scene folder`)
  })().catch(() => {})
}
