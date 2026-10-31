# Art pipeline: adding real 3D models

The game runs with **zero** art files. Everything is drawn from code. Real models are an optional upgrade: if a model is listed in the manifest, it replaces the code-drawn version. If it's missing or broken, the game quietly keeps the code version.

## Steps
1. **Get a model** you're allowed to use. CC0 from Poly Haven or Quaternius is simplest. See `realistic-art-on-phones.md` for sources.
2. **Put it in** `games/meridian/assets-src/` as `.glb` or `.gltf`.
3. **Optimise it:**
   ```bash
   cd games/meridian
   npm run assets
   ```
   This writes a phone-ready copy to `public/assets/`. It:
   - welds the vertices
   - shrinks the textures to at most 1024 px and converts them to WebP
   - stores the geometry as smaller numbers ("quantise")

   None of this needs a decoder in the browser.
4. **Tell the game which slot it fills** in `public/assets/manifest.json`:
   ```json
   {
     "version": 1,
     "slots": {
       "prop.crate": { "file": "old_crate.glb", "scale": 1.0, "yaw": 0, "y": -0.6, "license": "CC0", "author": "Poly Haven", "source": "https://polyhaven.com/a/..." }
     }
   }
   ```
5. **Record it** in `games/meridian/ASSETS.md` (name, author, licence, link).
6. Run `npm run dev` and look at it. Adjust `scale`, `yaw` (degrees) and `y` (metres) until it sits right.

## Slots
| Slot | Replaces | Origin should be | Size guide |
|---|---|---|---|
| `prop.crate` | Pushable crates | Centre of the crate | 1.2 m cube |
| `prop.barrel` | Explosive barrels | Centre | 0.7 × 1.0 m |
| `prop.jeep` | The Ch4 jeep | Ground, centre | 1.9 × 4 m, facing +Z |
| `prop.bell` | Saint Aurel bells | Top of the bell | about 0.6 m |
| `prop.searchlight` | Searchlight housings | Centre | about 1 m |
| `env.pine` | Train-line pines | Ground | 7 m tall |

The code-drawn mesh stays in place (made invisible) and the model is attached to it. So a model automatically moves, falls or swings wherever the code-drawn version would.

## Budgets per model
| Kind | Triangles | Textures |
|---|---|---|
| Small prop (crate, barrel, bell) | ≤ 2,000 | one 512–1024 px set |
| Vehicle | ≤ 15,000 | one 1024 px set |
| Rock / ruin piece | ≤ 5,000 | one 1024 px set, reuse it |
| Character (future) | ≤ 15,000 | one 1024 px set |

## Characters (future)
`src/render/Figure.ts` names its bones `hips, spine, chest, head, shoulderL/R, elbowL/R, thighL/R, kneeL/R`. A rigged glTF character whose bones use these names (and the same rest pose: standing, arms down, facing +Z) can reuse the code-driven animation.
