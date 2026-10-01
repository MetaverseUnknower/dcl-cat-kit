---
name: dcl-cat-kit
description: Add living cats to a Decentraland SDK7 scene with dcl-cat-kit (defineFloors, addCats, CAFE_CATS). Use when a scene should have cats or pets, or when setting up its floors, links and spots for them.
---

# dcl-cat-kit: instructions for AI agents

You're adding living cats to someone's Decentraland SDK7 scene. This page is everything you need: the steps, how to find the coordinates you can't see, a template, the rules, and how to check the result. The README is the reference for people. The doc comments in the package's `.d.ts` files say the same things, next to each function.

## What you're making

There are two calls, both in `main()`:

1. **`defineFloors({ floors, links, spots })`**: the cats' map of the scene.
   - `floors`: where a cat can walk, and at what height.
   - `links`: how floors join (stairs, ramps, cat trees).
   - `spots`: where the routine sends the cats (beds, perches, sunny places).
2. **`addCats({ floors, cats, seats? })`**: brings the cats to life.

The cats do everything else themselves: their routine, walking, petting, calling, greeting, and curling up by seated visitors.

## Steps

1. **Install the kit, then copy its assets.** In the scene folder (the one with `scene.json`):
   ```sh
   npm install dcl-cat-kit
   npx dcl-cat-kit-copy-assets
   ```
   If `node_modules/dcl-cat-kit` already exists, it's installed: skip `npm install`, but still run the copy. The copy step is required: without it the cats are invisible. Check that `assets/dcl-cat-kit/cats/faith-body.glb` exists afterwards.
   - **Commit `assets/dcl-cat-kit/`** (about 2.7 MB) with the scene: the scene deploys whatever is in its folder, and the cats need these files. Don't add it to `.gitignore`.
   - **Keeping it up to date:** add `"postinstall": "dcl-cat-kit-copy-assets"` to the scene's `package.json` scripts, so the copy runs again after every install or update.
2. **Find the scene's size.** Read `scene.json`: `scene.parcels` lists the parcels, and `scene.base` is the corner parcel. Each parcel is 16 × 16 m. Scene coordinates start at the base parcel's corner, with x running east and z north.
   - One parcel spans x 0–16, z 0–16.
   - Parcels `"0,0"` and `"1,0"` span x 0–32, z 0–16.
3. **Find the floors and the furniture** (see "Finding coordinates" below). For each walkable surface, note its height and outline. For each obstacle, note its footprint. For anything a cat could jump onto, note its height.
4. **Write `defineFloors` and `addCats`** in `main()`. Start from the template below.
5. **Build and check:** run `npm run build && npx dcl-cat-kit-check`.
   - `npm run build` only checks types. `dcl-cat-kit-check` runs the built scene outside Decentraland and reports every mistake the kit finds: floors, links, spots, missing model files, and too few spots. It ends with `OK` and the cats' names, or lists each problem with its fix. Repeat until it says `OK`.
   - Then, if a person is available, run the preview (`npm run start`) with `showFloors(floors)` on, and ask them to look. The check can't see how things line up; they can. Ask specific questions: do the stripes cover the floors, and do any run under furniture?
   - If no one is available, say in your summary that the floor view still needs a look.
6. **Remove `showFloors`** when they're happy, or put it behind a key.
7. **Credit the cats.** They're CC BY 4.0: add "Cats and cat voices by MetaPetal (dcl-cat-kit), CC BY 4.0" to the scene's description or README.

## Finding coordinates

You can't see the scene, so take the numbers from these places, in this order:

- **The scene's code.** Look for `Transform.create(entity, { position, rotation, scale })` next to `GltfContainer` or `MeshRenderer` calls.
  - **Boxes:** a `MeshRenderer.setBox` entity is a box `scale` metres in size, centred on `position`. It covers x from `position.x - scale.x/2` to `position.x + scale.x/2`, and the same for z. Its top is at `position.y + scale.y/2`.
  - **Parents:** if an entity has a `parent`, add the parent's position, and allow for the parent's rotation and scale.
- **The Creator Hub's files.** Scenes built in the Creator Hub keep their placed items in `assets/scene/main.composite`, a JSON file. Its `core::Transform` component holds each entity's position, rotation (a quaternion) and scale. Its `core::GltfContainer` component holds each entity's model file (`src`). Its `core-schema::Name` component gives each entity's name ("Sofa", "Table"). All three are keyed by entity number.
- **The models themselves.** For a `.glb`, run the kit's measure command with the position, rotation and scale you found:
  ```sh
  npx dcl-cat-kit-measure assets/models/sofa.glb --at 10.5,0,7.5 --rot 180
  npx dcl-cat-kit-measure assets/models/sofa.glb --at 10.5,0,7.5 --quat 0,1,0,0   # a Creator Hub rotation
  ```
  It prints the model's size, the `rect(...)` to put in `avoid`, the `spot.perch(...)` for its top, and the floor to use if it's a platform. `--rot` is the entity's turn about y in degrees, as in `Quaternion.fromEulerDegrees(0, rot, 0)`.
  - **dcl-sittables furniture** is turned by `facing` plus the model's `yawOffset`, which you can see in `FURNITURE` in the dcl-sittables package. Pass that sum as `--rot`.
- **The person.** If a size or position isn't in any file (for example, a model placed by another tool), ask them. Don't guess.

## Template

```ts
import { addCats, defineFloors, rect, circle, stairs, spot, showFloors, CAFE_CATS } from 'dcl-cat-kit'

export function main() {
  // ...the scene's own code...

  const floors = defineFloors({
    floors: [
      {
        name: 'ground',
        y: 0, // height of the walking surface
        walk: [rect(0.5, 0.5, 15.5, 15.5)], // where a cat can stand: x0, z0, x1, z1 (scene metres)
        avoid: [rect(8.94, 6.9, 12.06, 7.98)] // furniture etc., e.g. from dcl-cat-kit-measure
      }
      // { name: 'upstairs', y: 3, walk: [rect(...)] },
    ],
    links: [
      // stairs({ from: [x, z] on the lower floor, to: [x, z] on the upper floor, up: upper y minus lower y }),
    ],
    spots: [
      spot.bed(3, 4.5), // the first spots are homes: cat 1 lives here,
      spot.bed(13.5, 3.5), // cat 2 here...
      spot.sunny(2.6, 8.5), // then places to go during the day
      spot.perch(1.3, 0.6, 11.2) // x, height above its floor, z: a table top
      // spot.bed(x, z, 0, { floor: 'upstairs' }),
    ]
  })
  addCats({ floors, cats: [CAFE_CATS.faith, CAFE_CATS.haze] })
  showFloors(floors) // for checking; remove before deploying
}
```

## Rules

- **Scene coordinates, in metres.** `x` and `z` run across the ground from the base parcel's corner, and `y` is up. They aren't parcel numbers, and they aren't world coordinates.
- **`walk` shapes go where cats can really stand.**
  - Keep them inside the scene's parcels. They can run right up to the scene's edge; the margin keeps cats 0.3 m inside it.
  - Shapes may overlap or touch: an L-shaped room is two `rect`s.
  - Draw them at the real edges: cats keep 0.3 m from every edge and avoid shape by themselves.
- **"Walkable ground"** in the rules below means what's left after that margin: inside the walk shapes, more than 0.3 m from every edge and avoid shape. It's what the stripes in `showFloors` show.
- **Furniture goes in `avoid`**, on the floor it stands on. Something a cat could jump onto (a table, a shelf, a counter) also gets a `spot.perch(x, heightAboveItsFloor, z)`.
  - The perch's x and z can be anywhere on its top; the centre is fine.
  - It must be within 1.5 m of walkable ground. For a deep counter, use a point near its front edge.
  - Skip soft or curved tops (sofas, beds, round lamps) unless you know they're flat.
- **A platform people walk on (a stage, a loft) is a floor**, with its own `y`, not a perch.
  - Put its footprint in the lower floor's `avoid` too, unless cats can walk underneath it (a loft high overhead).
  - Join it to the floor below with a link.
- **If the scene already has steps**, put the step blocks in the lower floor's `avoid`, and lay a `stairs` link over them:
  - `from`: a point on the lower floor about 0.5 m before the bottom step.
  - `to`: a point about 0.5 m onto the upper floor.
  - For example, steps rising eastward from x 19.5 to 20.7, at z 9–11, onto a stage starting at x 21 and 0.9 m up: `stairs({ from: [19, 10], to: [21.5, 10], up: 0.9 })`.
- **Every upper floor needs a link**, or cats never get there.
  - **`stairs` and `ramp`:** `from` is on the lower floor and `to` is on the upper floor. `up` is exactly the upper floor's `y` minus the lower floor's. Each end must be within 1 m of its floor's walkable ground; the cats start and finish on the nearest walkable point.
  - **`climb`** (a cat tree, wall shelves): perches are `[x, heightAboveLowerFloor, z]`, in climbing order.
  - **Building the steps:** if the scene needs visible steps, build them from `stairs(...).points` (each step's `[x, y, z]`), so the cats' path and the steps match.
- **Spots: homes first.** Cat 1 lives at spot 0, cat 2 at spot 1, and so on. Guests' homes come after the residents'.
  - List at least as many spots as cats. Homes are usually beds, and they can be on any floor.
  - After the homes, add two or three more spots per cat (sunny places, perches, other beds), spread around the scene. With more spots, the cats wander more.
  - Add `{ floor: 'name' }` as the last argument to any spot that isn't on the first floor.
  - A spot needn't be exactly on walkable ground: one up to 1 m away (in furniture's margin, say) is moved onto the nearest walkable point.
- **Call `addCats` once**, in `main()`, with all the cats.
- **Cats:** use `CAFE_CATS.nermal`, `.tigger`, `.smoky`, `.cloud`, `.faith`, `.haze` or `.smudge`. Each cat needs a home spot. Pick by personality (see "The cats" in the README). For a lively scene, Tigger, Faith and Cloud are the most sociable, and Haze roams the most. Smoky is shy and sleepy.
- **Seats are optional.** Leave `seats` out if the scene has nothing that tracks who's sitting; everything else still works. If it does, pass `seats`: a function that returns where this visitor is sitting, as `{ x, y, z }`, or `null`.
  - With dcl-sittables, it's `seats: () => currentSeat()?.position ?? null`.
  - Don't pass the dcl-sittables module itself.
- **Synced ids:** the cats use synced-entity ids 7300 and up, one per cat. If the scene already calls `syncEntity` with ids in that range, pass `sync: <a free starting id>`.
- **Don't catch or hide errors from `defineFloors`.** Each one names the floor, link or spot and ends with `Fix:`, saying what to change. Do what it says, then build again.

## Errors and what they mean

| The message starts | What to do |
|---|---|
| `dcl-cat-kit: floor "…" has no walk shapes` | Give that floor `walk: [rect(...)]`. |
| `dcl-cat-kit: floor "…" has no walkable cells` | Its walk shapes are too small, or its avoid shapes cover them. Make walk bigger than 0.6 m across, or avoid smaller. |
| `dcl-cat-kit: link N … its foot … isn't on a floor` | Move that link's `from` onto the lower floor, within 1 m of its walkable ground. |
| `dcl-cat-kit: link N … its top … isn't on a floor` | Fix `up` (the upper floor's `y` minus the lower floor's), or move `to` inside the upper floor. |
| `dcl-cat-kit: spot N … isn't on floor "…"` | Move the spot inside the floor's walk shapes and out of its avoid shapes, or name its floor with `{ floor: '…' }`. |
| `dcl-cat-kit: spot N names no floor named "…"` | Use one of the floor names, as the message lists them. |
| `dcl-cat-kit: spot N (a perch …) is too far from floor "…"` | The perch is more than 1.5 m from walkable floor. Check its x and z (`spot.perch` takes x, height, z) and its floor. |
| `dcl-cat-kit: N cats … but only M spots` (scene console) | Add spots: the first N are the homes. |
| `dcl-cat-kit: no model files for …` (scene console) | Run `npx dcl-cat-kit-copy-assets` in the scene folder. |
| `dcl-cat-kit: addCats was called again` (scene console) | Call `addCats` once, with all the cats. |

## Checking your work

- `npm run build` passes with no type errors.
- `npx dcl-cat-kit-check` says `OK`, naming every cat you added.
- In the preview, with `showFloors` on, ask the person to confirm each of these:
  - the thin stripes cover the floors;
  - no stripes run under furniture;
  - each link shows as a line of small orange posts from floor to floor;
  - every spot's cube (yellow for sunny spots, blue for the rest) sits where it should.
- The cats appear within a few seconds. Clicking one close up makes her purr, and clicking from further away calls her over.
- If there are no cats, look in the scene console for `dcl-cat-kit:` messages.
