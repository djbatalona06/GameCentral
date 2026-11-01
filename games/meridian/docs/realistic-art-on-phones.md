# Realistic 3D on a phone at 20–30 fps

This document answers one question: how realistic can Meridian look while still running at 20–30 frames per second on an ordinary phone? It covers what we measured, what the game does today, and what to add next.

## The budget
Target device: a mid-range Android phone from 2021 (for example a Snapdragon 7-series), plus any iPhone from the last five years.

| Budget | Value | Why |
|---|---|---|
| Frame rate | 30 fps steady, never below 20 | Phones throttle when hot. A steady 30 feels better than a 60 that jumps around. Phones default to 30 (Settings → Video). |
| Draw calls | ≤ 150 per frame | On mobile, every separate object costs CPU time in WebGL. |
| Triangles on screen | ≤ 300,000 | Mobile GPUs handle this comfortably at 30 fps. |
| Texture size | ≤ 1024 px (512 on Low) | Memory and download size. |
| Shadow-casting lights | 1 (the sun) | Each shadow light re-draws the scene. |

### Measured (headless Chromium, software GPU, 844×390)
| Chapter | Draw calls | Triangles |
|---|---|---|
| Ch1 Breakwater | 44–55 | 12k–19k |
| Ch4 Salt Road | 47–80 | 13k–20k |
| Ch5 Saint Aurel | 52–80 | 20k–31k |
| Ch6 Night Train | 36–51 | 5k–12k |
| Ch7 Ironwood Docks | 30–95 | 24k–36k |

Every chapter uses less than a third of the budget, so there is plenty of headroom for real models. Turn on `?debug` and call `__meridian.renderer.stats()` in the browser console to see the numbers for yourself. It also reports `fps`, `p95FrameMs` (how bad the worst frames are), `avgCostMs` and the current render `scaling`. Run it on a real phone before trusting any of these figures.

## What the game does today (no image files at all)
| Technique | What it gives | Cost | File |
|---|---|---|---|
| **PBR materials painted from noise** | Stone blocks with mortar, wood grain, rusty riveted metal, rippled sand, snow. Each has colour, bumps, roughness and crevice shading. | Generated once per material at load (cached). 256 or 512 px. | `src/render/materials/ProceduralPBR.ts` |
| **ACES tone mapping and exposure** | A "filmic" look: highlights roll off instead of clipping to white. | Free (done in the shader). | `SceneRenderer.load` |
| **Gradient sky with sun or moon** | A believable horizon that blends into the fog. | 1 draw call. | `src/render/Sky.ts` |
| **Sun shadows that follow the player** | Sharp shadows near you, and none wasted far away. | 1 extra pass. Off on Low (soft "blob" shadows instead). | `SceneRenderer` |
| **Shader water** | Moving waves, a fresnel tint, sun glints and fog, with no reflection pass. | 1 draw call per water surface. | `src/render/WaterShader.ts` |
| **Skinned procedural characters** | Jointed bodies that walk, crouch, hang, aim, swim and drive, merged into one mesh. | 1 draw call per character, skinned on the GPU. | `src/render/Figure.ts` |
| **Merged static level** | The whole level becomes one mesh per material. | About 10 draw calls for the whole level. | `SceneRenderer.buildEnvironment` |
| **Weather particles** | Snow, sand and rain around the camera. | 200–900 particles depending on tier. | `src/render/SetPieces.ts` |
| **Quality tiers** | Low / Medium / High / Ultra switch every expensive feature from one table. | — | `src/render/Quality.ts` |
| **Frame pacing and dynamic resolution** | The 30/60 fps cap is a time grid, so it holds on 60, 90 and 120 Hz screens. If frames run late, the render resolution drops in small steps (never below 60% of full) and rises again when there is headroom. | — | `src/render/FrameGovernor.ts` |

## What makes things look "real" (in order of payoff)
1. **Lighting and tone mapping.** Light that falls off like real light, a sky colour that tints the shadows, and a filmic curve. This alone is most of the jump from "greybox" to "game". ✅ Done.
2. **Surface detail.** Bumps, roughness and crevice darkening, so a wall reads as stone and not as a coloured box. ✅ Done procedurally. A photo-scanned texture set is the next step.
3. **Silhouettes.** Real shapes instead of boxes: rocks, ruins, trees, props. This needs **models**. The pipeline is ready (below).
4. **Characters.** Shape and motion matter more than polygon count. ✅ Jointed and animated now. A rigged scanned character is the next step.
5. **Atmosphere.** Fog, weather, light shafts and bloom. ✅ Fog and weather on every tier; bloom on High and above.

## Where realistic models can come from (licence-safe)
| Source | What | Licence | Notes |
|---|---|---|---|
| Poly Haven | Photo-scanned models, textures, sky HDRIs | CC0 (public domain) | Best quality. Download on your own computer (this cloud session can't reach it). |
| ambientCG | Photo-scanned PBR texture sets | CC0 | Swap them in for the procedural textures. |
| Quaternius | Stylised low-poly characters and props | CC0 | Stylised rather than realistic, but rigged and animated. |
| Kenney | Props and kits | CC0 | Stylised. |
| AI generation (for example Higgsfield image → 3D) | One-off realistic props (statues, relics, crates) | Check the provider's terms | Static meshes only (not rigged). Costs credits. Always clean up and decimate the result. |

**Never** use Adobe, Mixamo or ripped game assets. Record every model you add in `ASSETS.md`.

## Hard limits on phones (and what to do instead)
| Want | Why not on phones | Instead |
|---|---|---|
| Real-time reflections (SSR, planar mirrors) | Re-draws the scene | Fresnel tint plus a sun glint (what the water does) |
| Real-time global illumination | Far too expensive | Hemisphere light tinted by the sky, plus baked crevice shading in the textures |
| Many dynamic lights with shadows | Each light re-draws the scene | One sun; emissive "fake" lights for lamps |
| 4K textures | Memory | 1024 px max; reuse tiling materials |
| Full-screen ambient occlusion (SSAO) | Several extra passes | Ultra tier only (desktops) |

## Next steps (in order)
1. Swap the procedural textures for **ambientCG** scans (the same 3-texture layout: colour, normal, ORM).
2. Add **Poly Haven rocks and ruins** through the asset slots, prepared with `npm run assets`.
3. Add **KTX2 compressed textures**: they use 4–6× less GPU memory, but need the Basis transcoder shipped in the app.
4. Use the **WebGPU engine** on devices that support it (Babylon has it built in). This cuts CPU cost per draw call.
5. Add **rigged scanned characters** with the same bone names as `Figure.ts`, so the code-driven animation keeps working.
