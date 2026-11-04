# 06 — Implementation Plan

## Phase status
| Phase | What | Status |
|---|---|---|
| 0 | Planning docs (this folder) | Done |
| 1 | Scaffold: Vite, TypeScript strict, Babylon, PWA | Done |
| 2 | Simulation core: world, collision, level DSL | Done |
| 3 | Player: movement, traversal, cover, camera | Done |
| 4 | Combat: weapons, ballistics, aim assist, melee, takedowns | Done |
| 5 | AI: perception, nav grid, enemy brain, squad director, boss phases | Done |
| 6 | Story: scripting, puzzles, journal, checkpoints, save system | Done |
| 7 | Client: input devices, renderer, audio, HUD, menus, settings | Done |
| 8 | Content: chapters 1–3 + 22-chapter outline | Done |
| 9 | Tests: 78 unit tests, browser smoke test | Done |
| 10 | Portrait + landscape (camera FOV, HUD, touch layouts per orientation) | Done, then replaced: the game is now landscape only (see phase 20) |
| 11 | Act I systems: moving platforms, sweeping hazards, jeep chase + pursuers, weather, bell puzzle, searchlights | Done |
| 12 | Chapters 4–7 (Act I complete) with route tests | Done |
| 13 | Art pass: procedural PBR, sky, water, skinned characters, set pieces, quality tiers, glTF drop-in pipeline | Done |
| 14 | Audio pass: reverb per space, adaptive per-chapter music, surface footsteps, ambience, ducking, night mode | Done |
| 15 | Store builds: Capacitor Android/iOS, icons, CI builds (debug APK, iOS compile check) | Done (store accounts and signing are the owner's step) |
| 16 | Real models via the asset slots (Poly Haven / ambientCG), KTX2 textures | Next |
| 17 | Chapters 8–15 (Act II): new systems for diving/air, boats, heist stealth | Planned |
| 18 | Chapters 16–22 (Act III), New Game+, challenge modes, cloud saves | Planned |
| 19 | Recorded voice acting, audio description of cutscenes | Planned |
| 20 | Landscape only: turn-your-phone prompt, platform orientation locks, portrait layouts removed, new left-side gun/goal/walk controls | Done |

## How to add a chapter (repeatable recipe)
1. Copy `src/sim/chapters/ch03.ts` to `chNN.ts`.
2. Lay out the level with the `LevelBuilder` DSL: `box`, `block`, `pillar`, `handholds`, `rope`, `zipline`, `beam`, `water`, `grass`, `cover`, `barrel`, `crate`, `enemy`, `arena`, `trigger`, `checkpoint`, `treasure`, `interact`. Act I added `mover` (moving platforms), `hazard` (tunnels, avalanches, kill zones), `track` + `pursuer` (vehicle chases), `weather`, `searchlight` and `scroll` (scenery streaming past a "moving" level).
3. Write the script: `onStart` actions plus `events` keyed by trigger/interact/puzzle names.
4. Register it in `registry.ts` (set `playable: true`, `build`, `script`).
5. Add route tests in `tests/unit/chapters.test.ts` for each new traversal challenge. The integrity tests (checkpoints, event handlers, waves, treasures) run automatically.
6. Run `npm test`, then `npm run build && npm run preview` and `npm run e2e`. Look at the screenshots.

## Tuning
All feel numbers (speeds, jump height, coyote time, recoil, AI reaction time…) are in `src/config/tuning.ts`. Change one number and the route tests tell you if a level became impossible.

## Known limitations of this build
- Art is procedural (no model or texture files yet); the asset slots in `docs/art-pipeline.md` are ready for real models.
- The train in Ch6 is stationary in the simulation and the scenery scrolls; this keeps collision exact.
- Store release needs the owner's Google Play / Apple accounts and signing key (`docs/store-release.md`).
- Enemy navigation is grid-based per arena. Multi-level arenas would need a layered grid or a navmesh (recast) later.
- Under very low frame rates (below 15 fps), the simulation slows down rather than skipping ahead.
- Spoken dialogue uses the device's text-to-speech voice.
