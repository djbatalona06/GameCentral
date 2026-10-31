# Meridian

An original treasure-hunting action-adventure for phones and browsers, built with TypeScript and Babylon.js.

> Ines Calder, a salvage diver, follows the 400-year-old route of navigator Catalina de Ordaz to the Drowned City of Meridia, racing the Gilt Company mercenaries.

**This build:** every core system plus chapters 1–3 (about 75 minutes), with a 22-chapter / 25-hour story outlined. The art is deliberately greybox (simple shapes); sound is synthesised in code.

## Play it
```bash
cd games/meridian
npm install
npm run dev          # opens a local server; on a phone, open the "Network" URL it prints
```
Shortcuts: `?chapter=2` jumps straight to chapter 2. Add the game to your home screen to install it (it works offline after the first load).

## Controls
| Action | Touch | Keyboard / mouse | Gamepad |
|---|---|---|---|
| Move | Left thumb (floating stick, push far to sprint) | WASD (Alt = walk) | Left stick |
| Look | Swipe right side | Mouse (click to lock) | Right stick |
| Jump / climb | JUMP | Space | A |
| Cover / roll | COVER | Q | B |
| Melee / takedown / counter | MELEE | F | X |
| Use / grapple / push crate | USE | E | Y |
| Aim / fire | AIM / FIRE (drag to aim) | Right / left mouse | LT / RT |
| Throw (hold to aim arc) | THROW | G | LB |
| Reload / swap | RELOAD / SWAP | R / 1-2 or wheel | RB / D-pad ← → |
| Crouch | CROUCH | C | D-pad ↓ |
| Point to objective | GOAL | H | D-pad ↑ |
| Pause / journal | II | Esc / J | Menu / View |

Everything is remappable, and there are one-handed touch layouts. See Settings → Controls.

## Project layout
```
docs/                 PRD, TRD, app flow, UI/UX brief, data schema, implementation plan,
                      accessibility matrix, story outline
src/config/tuning.ts  every gameplay number in one place
src/sim/              the game itself, with no graphics (testable): world, player, combat, ai, story, chapters
src/render/           Babylon.js renderer (reads the sim)
src/input/            touch, gamepad, keyboard → actions
src/audio/            synthesised sound and music
src/ui/               HUD + menus (screens/*.html are plain HTML templates)
src/styles/           CSS
src/save/             IndexedDB saves with versioned migrations
tests/unit/           78 Vitest tests, including chapter route tests
tests/e2e/smoke.mjs   Playwright smoke test on a phone-sized touch screen
```

## Tests
```bash
npm test                          # unit tests
npm run build && npm run preview  # then, in another terminal:
npm run e2e                       # browser smoke test; screenshots in tests/e2e/screenshots/
```
