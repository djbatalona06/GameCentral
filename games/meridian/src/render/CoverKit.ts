// Cover that looks like cover. Boxes flagged as low or high cover are drawn as sandbag walls,
// plank barricades, stone block walls or ribbed metal, so players can tell at a glance what
// they can hide behind. The shapes fill exactly the box the game collides with.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BoxDef } from "../sim/world/types";
import { type Shape, boxShape, mergeShapes } from "./meshUtil";

/** Small deterministic random numbers from a box id, so the same wall looks the same every time. */
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const shade = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
};

type Style = "sandbags" | "planks" | "blocks" | "ribbed";

export function coverStyle(b: BoxDef): Style {
  if (b.material === "metal") return "ribbed";
  if (b.material === "wood") return "planks";
  if (b.cover === "low" && b.material !== "plaster") return "sandbags";
  return "blocks";
}

/**
 * Shapes for one cover box, centred on the box (x right, y up, z forward).
 * `alongX` is true when the wall runs along X (its long side faces +Z/-Z).
 */
export function coverShapes(b: BoxDef): Shape[] {
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const d = b.max.z - b.min.z;
  const alongX = w >= d;
  const len = alongX ? w : d;
  const thick = alongX ? d : w;
  const rnd = seeded(b.id);
  const out: Shape[] = [];
  // Places a piece given its position along the wall (u), height (y) and depth offset (t).
  const put = (u: number, y: number, t: number, sl: number, sh: number, st: number, color: string) => {
    if (alongX) out.push(boxShape(sl, sh, st, u, y, t, color));
    else out.push(boxShape(st, sh, sl, t, y, u, color));
  };
  const style = coverStyle(b);

  if (style === "sandbags") {
    const rows = Math.max(2, Math.round(h / 0.21));
    const rh = h / rows;
    const bag = 0.56;
    for (let r = 0; r < rows; r++) {
      const y = -h / 2 + rh * (r + 0.5);
      const off = r % 2 ? bag / 2 : 0; // brick pattern
      const n = Math.ceil((len + off) / bag);
      for (let i = 0; i < n; i++) {
        const u0 = Math.max(-len / 2, -len / 2 - off + i * bag);
        const u1 = Math.min(len / 2, -len / 2 - off + (i + 1) * bag);
        if (u1 - u0 < 0.08) continue;
        const k = 0.85 + rnd() * 0.25;
        // Bags bulge a touch and sit slightly unevenly, but never past the collision box.
        put((u0 + u1) / 2, y, (rnd() - 0.5) * 0.04, u1 - u0 - 0.03, rh * 0.94, thick * (0.9 + rnd() * 0.08), shade("#a8946a", k));
      }
    }
    // A darker strap of ground-level bags reads as the base of the wall.
    put(0, -h / 2 + 0.03, 0, len, 0.06, thick, "#6e5f44");
  } else if (style === "planks") {
    const planks = Math.max(3, Math.round(h / 0.18));
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const k = 0.8 + rnd() * 0.3;
      put((rnd() - 0.5) * 0.06, -h / 2 + ph * (i + 0.5), 0, len - 0.04, ph * 0.86, thick * 0.7, shade("#8a6238", k));
    }
    // Two upright posts hold the planks.
    for (const u of [-len / 2 + 0.08, len / 2 - 0.08]) put(u, 0, 0, 0.14, h, thick, "#5c3f22");
  } else if (style === "ribbed") {
    put(0, 0, 0, len, h, thick * 0.92, "#5d6b74");
    const ribs = Math.max(2, Math.floor(len / 0.35));
    for (let i = 0; i <= ribs; i++) put(-len / 2 + (len * i) / ribs, 0, 0, 0.05, h * 0.98, thick, "#47535a");
    put(0, h / 2 - 0.04, 0, len, 0.08, thick, "#3c464c");
  } else {
    // Stone blocks with a mortar core showing between them.
    put(0, 0, 0, len - 0.02, h - 0.02, thick * 0.86, "#6f685d");
    const rows = Math.max(2, Math.round(h / 0.4));
    const rh = h / rows;
    const blk = 0.7;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? blk / 2 : 0;
      const n = Math.ceil((len + off) / blk);
      for (let i = 0; i < n; i++) {
        const u0 = Math.max(-len / 2, -len / 2 - off + i * blk);
        const u1 = Math.min(len / 2, -len / 2 - off + (i + 1) * blk);
        if (u1 - u0 < 0.1) continue;
        const k = 0.82 + rnd() * 0.3;
        put((u0 + u1) / 2, -h / 2 + rh * (r + 0.5), 0, u1 - u0 - 0.04, rh - 0.04, thick, shade("#a59b88", k));
      }
    }
    // A cap stone along the top makes the edge you can lean over easy to read.
    if (b.cover === "low") put(0, h / 2 - 0.04, 0, len, 0.08, thick + 0.04, "#c4b9a3");
  }
  return out;
}

/** One merged, vertex-coloured mesh for a cover box, positioned in the world. */
export function coverMesh(scene: Scene, b: BoxDef): Mesh {
  const m = mergeShapes(scene, `cover-${b.id}`, coverShapes(b), { roughness: 0.85, metallic: b.material === "metal" ? 0.5 : 0.05 });
  m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  return m;
}
