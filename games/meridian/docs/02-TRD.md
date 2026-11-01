# 02 — Technical Requirements

## Stack
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Type safety across ~10k lines; runs everywhere a browser does |
| 3D engine | Babylon.js 9 (`@babylonjs/core`, tree-shaken imports) | Mature WebGL/WebGPU renderer with shadows, post-processing and thin instances |
| Build | Vite 8 | Fast dev server; bundles to static files |
| Tests | Vitest (unit, headless simulation) and Playwright (browser smoke test) | The game's logic runs without a GPU, so most behaviour is unit-tested |
| Distribution | Progressive Web App (manifest + service worker) **and** Capacitor 8 native apps (Android, iOS) | One web build ships as a website, an installed web app and store apps |
| Native bridge | `@capacitor/app`, `haptics`, `status-bar`, `splash-screen` (`src/platform/native.ts`) | Back button, haptic engine, full screen; every call falls back to web APIs |
| Models (optional) | `@babylonjs/loaders` glTF, prepared with `@gltf-transform/cli` (`npm run assets`) | Real models replace procedural ones slot by slot; no decoders needed |
| CI | GitHub Actions: Android debug APK (+ signed AAB with secrets), iOS simulator compile | Builds the phone apps on machines that have the SDKs |
| Storage | IndexedDB (in-memory fallback) | Saves and settings survive reloads; works offline |
| Audio | Web Audio API, fully synthesised: buses + convolution reverb per space, adaptive scheduled music, ambience beds | No audio files to license or download |
| Speech | Web Speech API | Menu narration and optional spoken dialogue |

C# (Unity) and native C++ were considered. They would need tools this project's environment does not have, and a web build reaches every phone without an app store. The simulation is engine-independent, so it could be ported later.

## Architecture
```
input/      devices -> abstract actions (InputFrame)
   │
sim/        GameSim: pure TypeScript, fixed 60 Hz, deterministic seed, no Babylon imports
   │          world collision · player controller · combat · AI · story · puzzles
   │ emits SimEvents
   ├── render/   Babylon scene (reads sim state, never writes)
   ├── audio/    synthesised sound + music
   ├── ui/       HUD and menus (HTML templates + CSS)
   └── core/Game: app flow, saving, settings
```
Key rule: **the simulation never knows how it is drawn.** That is what makes every jump, fight and puzzle unit-testable.

## Simulation details
- Fixed timestep of 1/60 s, at most 4 steps per rendered frame (to avoid a "spiral of death" on slow devices).
- Geometry is axis-aligned boxes (greybox). Collision is moved one axis at a time, with step-up and ground snapping.
- Ledges are explicit segments with outward normals. The level DSL generates them from box edges.
- Enemy navigation uses a 1 m grid per combat arena with A* pathfinding. The grid is rebuilt when cover is destroyed. A grid is simpler and more predictable than a navmesh for greybox arenas.
- Deterministic random numbers (mulberry32) make combat repeatable in tests.

## Performance budgets
| Budget | Target |
|---|---|
| Frame time | 33 ms (30 fps, phone default), 16.6 ms at 60 fps; never below 20 fps on a 2021 mid-range phone |
| Draw calls | ≤150 per frame (measured 30–95 across Ch1–7); static level merged per material; characters are 1 skinned mesh each |
| Triangles | ≤300k visible (measured 5k–36k) |
| Textures | Procedural, 256 px (Low/Medium) or 512 px (High/Ultra); models ≤1024 px |
| JS bundle | ~330 KB gzipped |
| Memory | Under 300 MB on a mid-range phone |
| Enemies | Sleep when more than 90 m away and unaware |

## Platforms
- iOS Safari 16+, Android Chrome 110+, desktop Chrome/Edge/Firefox/Safari.
- Requires WebGL 2. Falls back to a friendly error message if it is unavailable.
- Landscape only. A touch phone held upright shows a "turn your phone" prompt (`#rotate`, shown by `@media (orientation: portrait) and (pointer: coarse)`) and the game pauses, then resumes by itself when the phone is turned. Computers can use any window shape (the camera widens its view on narrow windows).
- Android 7+ (API 24) and iOS 15+ via Capacitor; full screen, landscape only (Android `sensorLandscape`, iOS landscape orientations with `UIRequiresFullScreen`, web manifest `landscape`).
- Quality tiers Low / Medium / High / Ultra (`src/render/Quality.ts`); see `docs/realistic-art-on-phones.md`.

## Security and privacy
- No network calls, accounts, analytics or ads. Saves stay on the device.
- Imported saves are parsed defensively and version-checked.

## Commands
```
npm install
npm run dev        # local dev server
npm run build      # typecheck + production build into dist/
npm test           # unit tests (simulation, saves, input, chapter routes)
npm run preview    # serve dist/ on :4173
npm run e2e        # browser smoke test (needs preview running)
npm run assets     # optimise models in assets-src/ into public/assets/
npm run cap:sync   # build and copy into the Android/iOS projects
npm run android:open / ios:open   # open in Android Studio / Xcode
```
