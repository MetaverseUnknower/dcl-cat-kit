# dcl-cat-kit

Living cats for Decentraland SDK7 scenes. These are the cats from the **MetaPetal Cat Cafe**, made into a kit any scene can use.

- They follow a **daily routine**: naps, strolls between favourite spots, grooming and stretching. It runs from a shared clock, so every visitor sees the same thing.
- They **walk your floors** and take your stairs, ramps and climbs, leaping up and down where they need to.
- **Click a cat close up** to pet her: she stays and purrs. **Click from further away** to call her (psspsspss), and she comes over.
- When you arrive, **one cat comes to say hello**.
- **Sit down for a while** and a cat may come and curl up beside you.
- They blink, look at you, and have voices (brrrow, mrra, growl, hiss).

Everyone in the scene sees the same cats doing the same things.

## Quick start

**1. Install the kit and copy the cats into your scene** (run both in your scene's folder):

```sh
npm install dcl-cat-kit
npx dcl-cat-kit-copy-assets
```

The second command copies the cats' models and voices (about 2.7 MB) into `assets/dcl-cat-kit/`. **Without this step the cats are invisible.** Run it again after you update the kit.

**2. Describe your floors and add some cats** in `src/index.ts`:

```ts
import { addCats, defineFloors, rect, stairs, spot, showFloors, CAFE_CATS } from 'dcl-cat-kit'

export function main() {
  const floors = defineFloors({
    floors: [
      // where a cat can walk: x0, z0, x1, z1 in scene metres; `avoid` keeps them out of furniture
      { name: 'ground', y: 0, walk: [rect(1, 1, 15, 15)], avoid: [rect(7, 5, 9, 7)] },
      { name: 'loft', y: 3, walk: [rect(1, 11, 15, 15)] }
    ],
    links: [stairs({ from: [2, 4], to: [2, 12], up: 3 })], // foot of the stairs, top of the stairs, height climbed
    spots: [
      spot.bed(12, 3), // the first spots are the cats' homes, one each, in order
      spot.bed(4, 8),
      spot.sunny(10, 9),
      spot.perch(8, 0.8, 6), // x, height, z: the top of the table
      spot.bed(12, 14, 0, { floor: 'loft' })
    ]
  })
  addCats({ floors, cats: [CAFE_CATS.faith, CAFE_CATS.haze] })
  showFloors(floors) // draws the walkable areas, stairs and spots; delete this line once they look right
}
```

**3. Run `npm run start`** and look around. `showFloors` draws thin stripes where the cats can walk, small orange posts along each link, and a cube on each spot (yellow for sunny spots, blue for the rest).

## The cats

`CAFE_CATS` has the cafe's seven residents, ready to go: `nermal`, `tigger`, `smoky`, `cloud`, `faith`, `haze` and `smudge`. Each has her own coat, size, voice and personality (how sociable she is, how much she naps, how far she roams). Use as many as you like, but each cat needs her own home spot.

## Describing floors

All positions are in **scene metres**: `x` and `z` across the ground from your scene's corner, and `y` up.

- **Floors.** Each floor is `{ name, y, walk, avoid? }`:
  - `y` is the height of the walking surface.
  - `walk` is the shapes a cat can walk on. They can overlap or touch, so an L-shaped room is two rectangles.
  - `avoid` is the shapes to keep out of (furniture, pillars, a pond).
  - Shapes are `rect(x0, z0, x1, z1)` and `circle(x, z, r)`.
  - The kit keeps cats about 30 cm away from every edge and obstacle, so draw shapes at the real edges.
- **Links** join one floor to another:
  - `stairs({ from: [x, z], to: [x, z], up })`: walked, in steps. `from` is on the lower floor, `to` is on the floor `up` metres above it.
  - `ramp({ from, to, up })`: walked, as a smooth slope.
  - `climb({ from, perches: [[x, y, z], …], to, up })`: a cat's own way up, hopping from perch to perch (shelves, a cat tree). Each perch's `y` is its height above the lower floor.
  - `narrow({ from, points, to, up })`: a passage only one cat fits through (a tunnel, a plank). Two cats meeting inside have a standoff, and one backs out.
- **Spots** are where the routine sends the cats:
  - `spot.bed(x, z, yaw?)`: a place to nap.
  - `spot.perch(x, height, z, yaw?)`: something to jump up onto (a table, a shelf). It can stand off the walkable area, but no more than 1.5 m from it.
  - `spot.sunny(x, z, yaw?)`: a sunny place to stretch out.
  - `spot.watch(x, z, yaw, target)`: a place to watch something move (see `watch` below).
  - Add `{ floor: 'loft' }` as the last argument for a spot on any floor but the first.
  - **The first spots are homes:** the first cat lives at spot 0, the second at spot 1, and so on. List at least one spot per cat.

If something doesn't fit, `defineFloors` stops with an error that names the item, says what's wrong, and ends with what to change. For example: `dcl-cat-kit: spot 4 (12, 14) isn't on floor "loft". Fix: move it inside that floor's walk shapes and out of its avoid shapes.`

### Measuring models

To find a model's footprint, run the kit's measure command with the position, rotation and scale it has in your scene:

```sh
npx dcl-cat-kit-measure assets/models/sofa.glb --at 10.5,0,7.5 --rot 180
```

It prints the model's size and, placed where you said, the `rect(...)` to put in a floor's `avoid`, a `spot.perch(...)` for its top, and the floor to use if it's a platform. `--rot` is in degrees. Use `--quat x,y,z,w` instead for a quaternion, which is how Creator Hub scenes store rotations, and `--scale` for a scaled model.

## Options

`addCats({ floors, cats, ... })` also takes:

| Option | What it does |
|---|---|
| `seats` | Lets a cat curl up by a seated visitor: a function returning where this visitor is sitting (`{ x, y, z }`), or `null` when they aren't. With [dcl-sittables](https://www.npmjs.com/package/dcl-sittables): `seats: () => currentSeat()?.position ?? null`. (An object with a `localSeat()` method works too.) |
| `sync` | The first synced-entity id the cats use. They take one id each, from 7300 by default. Change it if your scene already uses those ids. |
| `dayStartUtcHour` | The hour (UTC) the cats' day turns over. They're home asleep for the half hour before it. The default is 10. |
| `guests` | `{ cats, perDay }`: visiting cats. `perDay` of them come each day, chosen from `cats`. Add a home spot for each, after the residents' homes. |
| `watch` | `{ targets(now, target) }`: what a cat at a `spot.watch(…, target)` spot watches, as `{ x, z }` or `null`. Add `chatter(now, i)` to have her chatter at it. |
| `sounds` | A different folder for the voices, if you moved them. |

Call `addCats` **once** per scene.

## Troubleshooting

- **No cats at all.** Run `npx dcl-cat-kit-copy-assets` in your scene folder. If model files are missing, the kit logs `dcl-cat-kit: no model files for …` in the scene console.
- **The scene stops at `defineFloors`.** Read the error: it names the floor, link or spot that's wrong, and ends with `Fix:`, what to change. Turn on `showFloors(floors)` to see what the cats see.
- **Two cats share a bed.** There are fewer spots than cats. The scene console says so; add spots, since the first ones are the homes.
- **A cat walks through furniture.** Add the furniture to that floor's `avoid` list.
- **A cat never goes upstairs.** Add a link to that floor, and give her a spot up there.
- **Odd behaviour alongside another kit.** Two kits may be using the same synced-entity ids. Move the cats with `sync`.

## For AI agents

If you're an AI agent setting up cats in someone's scene, read [`AGENTS.md`](./AGENTS.md) first. It covers finding coordinates in a scene you can't see, a template, the rules, and every error with its fix. It ships in the npm package, at `node_modules/dcl-cat-kit/AGENTS.md`.

To install it as a skill for your agent: `npx skills add MetaverseUnknower/dcl-cat-kit`.

## Licences

- **Code:** MIT (`LICENSE`).
- **Cats (models, coats and voices):** CC BY 4.0 (`ASSETS-LICENSE.md`). Credit them with **"Cats and cat voices by MetaPetal (dcl-cat-kit), CC BY 4.0"**. A line in your scene's README, description or credits is enough.
