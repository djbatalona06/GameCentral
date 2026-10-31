// Prepares drop-in 3D models for phones.
//   1. Put .glb or .gltf files in games/meridian/assets-src/
//   2. Run: npm run assets
//   3. Optimised copies land in public/assets/ ; list them in public/assets/manifest.json
//
// Each model is welded, has its textures shrunk to 1024 px and converted to WebP, and its
// geometry quantised (smaller numbers). None of these need a decoder in the browser.

import { execFileSync } from "node:child_process";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "assets-src");
const out = join(root, "public", "assets");
mkdirSync(out, { recursive: true });

const files = readdirSync(src).filter((f) => [".glb", ".gltf"].includes(extname(f).toLowerCase()));
if (!files.length) {
  console.log("No models in assets-src/. Add .glb or .gltf files and run again.");
  process.exit(0);
}
for (const f of files) {
  const target = join(out, `${basename(f, extname(f))}.glb`);
  console.log(`Optimising ${f} ...`);
  execFileSync(
    "npx",
    ["gltf-transform", "optimize", join(src, f), target, "--compress", "quantize", "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "false"],
    { stdio: "inherit", cwd: root },
  );
  const kb = (n) => `${Math.round(statSync(n).size / 1024)} KB`;
  console.log(`  ${kb(join(src, f))} -> ${kb(target)}`);
}
