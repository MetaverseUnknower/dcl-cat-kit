# Working on dcl-cat-kit

These instructions are for agents (and people) changing the kit itself. **Setting up cats in a scene?** Read [`packages/cat-kit/AGENTS.md`](./packages/cat-kit/AGENTS.md) instead.

## Layout

- `packages/cat-kit/src/`: the package. Some files are pure logic and can be tested in Node. The others use the scene runtime and can only run in a scene.
  - **Pure, tested:**
    - `floors.ts`: `defineFloors`, shapes, links and spots.
    - `routine.ts`: the daily routine.
    - `controller.ts`: each cat's behaviour, frame by frame.
    - `path.ts`: routes over the floors.
    - `intents.ts`: the claims (visit, pet, sit, play, chase, catch).
    - `greet.ts`, `gaze.ts`, `blink.ts`, `hover.ts`, `purr.ts`, `voices.ts`, `geom.ts`, `leap.ts`.
    - `options.ts`: option types, and the set-up checks that `addCats` logs.
    - `catalog.ts`: `CAFE_CATS`.
    - `shape.ts`: the prebuilt models' proportions (`RIG`, `POSE`).
    - `version.ts`.
  - **Scene runtime only** (they import `@dcl/sdk/ecs` or `~system/*`):
    - `cats.ts`: `addCats`, which wires everything together.
    - `rig.ts`: the cats' models and posing.
    - `shared.ts`: the synced claims.
    - `debug.ts`: `showFloors`.
    - `index.ts`.
- `packages/cat-kit/bin/`: the commands. `copy-assets.mjs` copies the cats into a scene. `measure.mjs` uses the logic in `glb-bounds.mjs`, which is tested.
- `packages/cat-kit/assets/`: the cats' models (`cats/<key>-<part>.glb` and one shared texture) and voices (`sounds/`). These are CC BY 4.0, not MIT.
- `packages/cat-kit/test/`: the vitest tests. `fixtures/` holds a real scene's floors (the MetaPetal Cat Cafe's), used by the older tests.
- `example/`: a scene that uses the kit and dcl-sittables. It's the manual test.
- `skills/dcl-cat-kit/SKILL.md` and the root `README.md` are **generated** from `packages/cat-kit/AGENTS.md` and `README.md` by `node scripts/sync-docs.mjs`. Edit the package's copies, then run the script. A test fails if they drift.

## Commands

Use Node 18 or later (the SDK and vitest fail on Node 16).

```sh
npm install
npm test                    # all tests (vitest, in packages/cat-kit)
npm run build               # the package, into packages/cat-kit/dist
node scripts/sync-docs.mjs  # after editing the package's README.md or AGENTS.md
npm run example             # build, copy assets into the example, and start its preview
```

## Rules

- **Keep logic out of the runtime files.** Anything that imports `@dcl/sdk/ecs` or `~system/*` can't load in vitest. Put decisions in a pure module and test them there; keep `cats.ts` and `rig.ts` to wiring.
- **Test first.** Write the failing test, watch it fail, then make it pass. Run the whole suite before you commit.
- **The scene runtime isn't Node:**
  - `console` has only `log` and `error`; there's no `warn` or `info`.
  - `~system` functions may answer without a promise. Use `await` inside a `try`, never `.then` on their result.
  - Check runtime changes in the example's preview. Unit tests can't catch these.
- **Messages people see start `dcl-cat-kit: `.** An error a person can fix ends with ` Fix: ` and what to change; a test checks this.
- **Doc comments are part of the API.** They ship in the `.d.ts` files, and agents read them there. Keep them accurate when behaviour changes.
- **No café-specific code.** The kit started as the MetaPetal Cat Cafe's cats. Anything specific to one scene belongs in an option or a callback.
- **Licences:** code is MIT, and assets are CC BY 4.0 (`ASSETS-LICENSE.md`). New assets need their source added to that file.
