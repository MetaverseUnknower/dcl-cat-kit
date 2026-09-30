/** How loud Faith purrs, by seconds since she was last petted. */
export const PURR_SECONDS = 5
const RISE = 0.4
const FADE = 1.5

export function purrVolume(sincePet: number): number {
  if (!isFinite(sincePet) || sincePet <= 0) return 0
  if (sincePet < RISE) return sincePet / RISE
  if (sincePet <= PURR_SECONDS) return 1
  return Math.max(0, 1 - (sincePet - PURR_SECONDS) / FADE)
}
