/** Each cat's own brrrow and mrra (Faith's are her originals from the HQ). */
const EMPHASIS_CHANCE = 0.32
const MRRA_CHANCE = 0.35
export const MRRA_REST = 6
let root = 'assets/dcl-cat-kit/sounds'
/** Where the voices are (the package's copy-assets puts them in assets/dcl-cat-kit/sounds). */
export function setSoundRoot(r: string) {
  root = r.replace(/\/$/, '')
}
export function soundRoot(): string {
  return root
}
export const purrClip = () => `${root}/purr.mp3`
export const callClip = () => `${root}/psspsspss.mp3`
const file = (name: string, clip: string) => `${root}/${name.toLowerCase()}-${clip}.mp3`

export function brrrowClip(name: string, rand: () => number): string {
  if (rand() < EMPHASIS_CHANCE) return file(name, 'brrrow-long')
  return file(name, rand() < 0.5 ? 'brrrow-1' : 'brrrow-2')
}

export function mrraClip(name: string): string {
  return file(name, 'mrra')
}

export function mrraOnPet(rand: () => number, sinceLast: number): boolean {
  return sinceLast >= MRRA_REST && rand() < MRRA_CHANCE
}

/** A cat chattering at something she's watching (from a watch spot). */
export function chatterClip(name: string): string {
  return file(name, 'chatter')
}

/** A low warning growl, and a hiss: a standoff in a narrow passage. */
export function growlClip(name: string): string {
  return file(name, 'growl')
}

export function hissClip(name: string): string {
  return file(name, 'hiss')
}
