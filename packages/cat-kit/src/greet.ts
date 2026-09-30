/**
 * Who comes to say hello when someone arrives: at most one free cat within earshot,
 * chosen with a bias toward friendlier, closer cats; and sometimes nobody bothers
 * (the friendliest candidate's own mood decides that).
 */
export const HEAR = 12
export type Candidate = { i: number; d: number; social: number; free: boolean; asleep?: boolean }

export function pickGreeter(cats: Candidate[], rand: () => number): number {
  const near = cats.filter((c) => c.free && !c.asleep && c.d < HEAR) // let sleeping cats lie
  if (!near.length) return -1
  if (rand() > Math.max(...near.map((c) => c.social))) return -1
  const w = near.map((c) => c.social / (1 + c.d))
  let pick = rand() * w.reduce((a, b) => a + b, 0)
  for (let k = 0; k < near.length; k++) {
    pick -= w[k]
    if (pick <= 0) return near[k].i
  }
  return near[near.length - 1].i
}
