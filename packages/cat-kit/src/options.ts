import { CatSpec } from './routine'
import { Floors } from './floors'

/** A cat for the kit: the routine's spec, where her models are (a path prefix, e.g. assets/dcl-cat-kit/cats/faith) and
 * her voice (the name her sound files start with). `home` is optional: the floors hand out homes. */
export type KitCat = Omit<CatSpec, 'home'> & { home?: number; models: string; voice: string }
type Seat = { x: number; y: number; z: number }
/** Where this visitor is sitting: a dcl-sittables instance, or a function. */
export type Seats = { localSeat(): Seat | null } | (() => Seat | null)
export type Quat = { x: number; y: number; z: number; w: number }
/** For toys: where a cat playing (`play`), chasing (`chase`) or catching (`catch`) with this visitor should go. */
export type TargetProvider = (kind: 'play' | 'chase' | 'catch', userId: string, at: Seat, rotation: Quat | null) => Seat | null
export type AddCatsOptions = {
  floors: Floors
  cats: KitCat[]
  seats?: Seats
  guests?: { cats: KitCat[]; perDay: number }
  watch?: { targets(now: number, spot: number): { x: number; z: number } | null; chatter?(now: number, i: number): boolean }
  targets?: TargetProvider
  sync?: number
  sounds?: string
}
export const seatOf = (s: Seats | undefined): (() => Seat | null) => (!s ? () => null : typeof s === 'function' ? s : () => s.localSeat())
export const syncBase = (o: { sync?: number }) => o.sync ?? 7300
export type Playmate = { i: number; x: number; y: number; z: number; asleep: boolean; busy: boolean; free: boolean }
