// What `npx dcl-cat-kit-check` concludes from a run of the scene outside Decentraland: what it logged, and what it
// sent to the renderer (as text, to find which cats' models it loaded).

const KIT = /dcl-cat-kit: .*/

/**
 * `logged`: everything the scene logged as errors. `sent`: the renderer messages, as latin1 text.
 * Returns `{ ok, cats, problems, other }`: the kit's own messages are problems; anything else is `other` (it may come
 * from running outside Decentraland, so it's shown but doesn't fail the check).
 */
export function verdict({ logged, sent }) {
  const problems = []
  const other = []
  for (const line of logged) {
    const m = line.match(KIT)
    if (m) problems.push(m[0])
    else other.push(line)
  }
  const cats = [...new Set([...sent.matchAll(/dcl-cat-kit\/cats\/([a-z0-9_-]+)-body\.glb/g)].map((m) => m[1]))]
  if (!cats.length && !problems.length) problems.push('no cats started, and the kit said nothing: is addCats called in main()?')
  return { ok: problems.length === 0, cats, problems, other }
}
