# dcl-cat-kit: instructions for AI agents

Read this before adding cats to someone's Decentraland SDK7 scene. The README has the full reference. This page covers the steps, the rules that agents tend to get wrong, and how to check your work.

## Steps

1. **Install the kit, then copy its assets.** In the scene folder (the one with `scene.json`), run `npm install dcl-cat-kit` and then `npx dcl-cat-kit-copy-assets`. The copy step is required: without it the cats are invisible and nothing fails loudly. Check that `assets/dcl-cat-kit/cats/faith-body.glb` exists afterwards.
2. **Read the scene before you describe its floors.** Find the walkable surfaces in the scene's code and models: the ground, raised floors, mezzanines and balconies, plus their heights. Find the obstacles too: furniture, walls, pillars and water. Read `scene.json` for the parcels. Each parcel is 16 × 16 m, and the scene's coordinates start at the corner of its base parcel.
3. **Write `defineFloors`** inside `main()`. The rules are below.
4. **Call `addCats` once**, also inside `main()`.
5. **Add `showFloors(floors)`** while you work, and ask the person to look at the scene in the preview (`npm run start`). Remove it once they're happy.

## Rules

- **Use scene coordinates in metres**: `x` and `z` across the ground, `y` up. They aren't parcel numbers, and they aren't world coordinates.
- **Every floor needs `walk` shapes** where cats can really stand. Stay inside the scene's parcels, and draw shapes at the real edges: the kit adds its own margin, about 30 cm.
- **Put furniture in `avoid`** on the floor it stands on. Something a cat should jump onto, like a table or a shelf, is a `spot.perch` instead: `spot.perch(x, heightAboveFloor, z)`, no more than 1.5 m from walkable floor.
- **Join every upper floor with a link.** For `stairs` and `ramp`, `from` is a point on the lower floor, `to` is a point on the upper floor, and `up` is exactly the difference between their `y` values. Without a link, cats never get there.
- **List the homes first.** Cat 1 lives at spot 0, cat 2 at spot 1, and so on, so list at least as many spots as cats, with the beds first. Add `{ floor: 'name' }` to any spot that isn't on the first floor.
- **Keep `defineFloors` errors.** If it throws, the message names the item and the problem. Fix the description; don't catch the error or silence it.
- **Synced ids:** the cats use synced-entity ids 7300 and up, one per cat. If the scene already uses `syncEntity` with ids in that range, pass `sync` with a free range.
- **Seats:** if the scene has seating, pass `seats`: a function returning where this visitor is sitting, or `null`. With dcl-sittables it's `seats: () => currentSeat()?.position ?? null`. Don't pass the dcl-sittables module itself.
- **Credit:** the cats are CC BY 4.0. Add "Cats and cat voices by MetaPetal (dcl-cat-kit), CC BY 4.0" to the scene's description or README.

## Checking your work

- `npm run build` passes with no type errors.
- In the preview, with `showFloors` on:
  - the thin green stripes cover the walkable floors;
  - no stripes run under furniture;
  - each link shows as a line of small orange posts from floor to floor;
  - every spot's cube (yellow for sunny spots, blue for the rest) sits where it should.
- The cats appear within a few seconds. Clicking one close up makes her purr, and clicking from further away calls her over.
- If there are no cats, look in the scene console for `dcl-cat-kit:` messages, and check that the asset copy was done.
