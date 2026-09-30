/**
 * A cat's eyes: shut while she sleeps or purrs under someone's hand, and otherwise the slow blink
 * cats give, once in a while: a moment with her eyes closed, to her own rhythm (each cat's `seed`).
 * Pure: the same moment gives the same answer.
 */
const CYCLE = 10 // seconds: about one slow blink in each
const PURRING = 0.2 // purring this much (fading in as she's petted): eyes closed, content

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function eyesShut(o: { t: number; seed: number; asleep: boolean; purring: number }): boolean {
  if (o.asleep || o.purring > PURRING) return true
  const u = o.t + hash(o.seed) * CYCLE // her own offset
  const i = Math.floor(u / CYCLE)
  const at = hash(o.seed * 97 + i) * (CYCLE - 1.5) // when in this cycle she blinks
  const hold = 0.5 + 0.35 * hash(o.seed * 53 + i * 7) // and for how long (a slow blink)
  const k = u - i * CYCLE - at
  return k >= 0 && k < hold
}
