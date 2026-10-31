# Meridian

An original treasure-hunting action-adventure for phones and browsers, built with TypeScript and Babylon.js.

> Ines Calder, a salvage diver, follows the 400-year-old route of navigator Catalina de Ordaz to the Drowned City of Meridia, racing the Gilt Company mercenaries.

**This build:** every core system plus **all of Act I, chapters 1–7** (about 3 hours), with a 22-chapter / 25-hour story outlined. Plays in portrait or landscape. The look is realistic-leaning but drawn entirely by code (no art files), and every sound and note of music is synthesised. It also builds as Android and iOS apps.

## Play it
```bash
cd games/meridian
npm install
npm run dev          # opens a local server; on a phone, open the "Network" URL it prints
```
Shortcuts: `?chapter=4` jumps straight to chapter 4 (any of 1–7). Add the game to your home screen to install it (it works offline after the first load).

### Phone apps
```bash
npm run cap:sync      # build + copy into android/ and ios/
npm run android:open  # Android Studio  (or download the APK GitHub Actions builds)
npm run ios:open      # Xcode, on a Mac
```
Store steps (accounts, signing, listing text): `docs/store-release.md`.

## Controls
| Action | Touch | Keyboard / mouse | Gamepad |
|---|---|---|---|
| Move | Left thumb (floating stick, push far to sprint) | WASD (Alt = walk) | Left stick |
| Look | Swipe right side | Mouse (click to lock) | Right stick |
| Jump / climb | JUMP | Space | A |
| Cover / roll | COVER | Q | B |
| Melee / takedown / counter | MELEE | F | X |
| Use / grapple / push crate / get in jeep | USE | E | Y |
| Drive the jeep (Ch4) | stick: gas + steer, push far to boost | W/S gas/brake, A/D steer, Shift boost | Left stick |
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
src/render/           Babylon.js renderer (reads the sim): PBR materials, sky, water, skinned figures, set pieces, quality tiers
src/render/assets/    optional glTF drop-in models (see docs/art-pipeline.md)
src/platform/         Capacitor bridge (haptics, Back button, full screen)
src/input/            touch, gamepad, keyboard → actions
src/audio/            synthesised mixer + reverb spaces, adaptive music, sfx and ambience
src/ui/               HUD + menus (screens/*.html are plain HTML templates)
src/styles/           CSS
src/save/             IndexedDB saves with versioned migrations
tests/unit/           135 Vitest tests, including route tests for every chapter
tests/e2e/smoke.mjs   Playwright smoke test: phone in landscape and portrait, chapters 1-7, rotation
android/ ios/         Capacitor native projects
.github/workflows/    (repo root) builds the Android APK and checks the iOS build
```

## Tests
```bash
npm test                          # unit tests
npm run build && npm run preview  # then, in another terminal:
npm run e2e                       # browser smoke test; screenshots in tests/e2e/screenshots/
```
