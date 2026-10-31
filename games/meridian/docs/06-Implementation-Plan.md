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
| 10 | Chapters 4–7 (Act I) | Next |
| 11 | Art pass: character models, animation, environment kits | Planned |
| 12 | Audio pass: composed music, voice acting | Planned |
| 13 | Store builds via Capacitor (iOS/Android), cloud saves | Planned |
| 14 | Chapters 8–22, New Game+, challenge modes | Planned |

## How to add a chapter (repeatable recipe)
1. Copy `src/sim/chapters/ch03.ts` to `chNN.ts`.
2. Lay out the level with the `LevelBuilder` DSL: `box`, `block`, `pillar`, `handholds`, `rope`, `zipline`, `beam`, `water`, `grass`, `cover`, `barrel`, `crate`, `enemy`, `arena`, `trigger`, `checkpoint`, `treasure`, `interact`.
3. Write the script: `onStart` actions plus `events` keyed by trigger/interact/puzzle names.
4. Register it in `registry.ts` (set `playable: true`, `build`, `script`).
5. Add route tests in `tests/unit/chapters.test.ts` for each new traversal challenge. The integrity tests (checkpoints, event handlers, waves, treasures) run automatically.
6. Run `npm test`, then `npm run build && npm run preview` and `npm run e2e`. Look at the screenshots.

## Tuning
All feel numbers (speeds, jump height, coyote time, recoil, AI reaction time…) are in `src/config/tuning.ts`. Change one number and the route tests tell you if a level became impossible.

## Known limitations of this build
- Greybox art and synthesised audio by design.
- Enemy navigation is grid-based per arena. Multi-level arenas would need a layered grid or a navmesh (recast) later.
- Under very low frame rates (below 15 fps), the simulation slows down rather than skipping ahead.
- Spoken dialogue uses the device's text-to-speech voice.
