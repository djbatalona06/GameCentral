// Realistic-looking surfaces without a single image file. Each level material (stone, wood,
// sand...) is painted once at load time from tileable noise into three small textures:
//   albedo   - base colour with stains, grain or block patterns
//   normal   - bumps derived from a height field (mortar lines, wood grain, rock strata)
//   ORM      - R: cavity "ambient occlusion", G: roughness, B: metalness (glTF packing)
// The pixel data is cached, so loading the next chapter costs nothing.

import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "../../sim/world/types";

// ------------------------------------------------------------------ tileable noise

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Value noise that wraps every `period` cells, so the texture tiles without seams. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const w = (i: number) => ((i % period) + period) % period;
  const a = hash(w(xi), w(yi), seed);
  const b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed);
  const d = hash(w(xi + 1), w(yi + 1), seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Fractal noise in 0..1. u, v are 0..1 across the tile. */
function fbm(u: number, v: number, baseFreq: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = baseFreq;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(u * f, v * f, f, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ------------------------------------------------------------------ material recipes

interface Sample {
  /** Height 0..1 (drives the normal map and cavity). */
  h: number;
  /** Albedo in linear-ish 0..1 RGB. */
  r: number;
  g: number;
  b: number;
  rough: number;
  metal: number;
}

type Recipe = (u: number, v: number) => Sample;

const hex = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const S = (c: [number, number, number], h: number, rough: number, metal = 0): Sample => ({ r: c[0], g: c[1], b: c[2], h, rough, metal });

/** One tile covers 2 x 2 metres of the level. */
const RECIPES: Record<Material, Recipe> = {
  sand: (u, v) => {
    const n = fbm(u, v, 4, 5, 1);
    const ripple = 0.5 + 0.5 * Math.sin((v * 9 + n * 2.2) * Math.PI * 2);
    const h = 0.55 * ripple + 0.45 * n;
    return S(mix(hex("#c9ab73"), hex("#e6cf98"), 0.35 + 0.5 * n + 0.15 * ripple), h, 0.92);
  },
  ground: (u, v) => {
    const n = fbm(u, v, 4, 5, 2);
    const patch = fbm(u, v, 2, 3, 3);
    const c = mix(mix(hex("#4e5b31"), hex("#6f7d43"), n), hex("#6b5a3d"), Math.max(0, patch - 0.55) * 2.2);
    return S(c, n, 0.95);
  },
  rock: (u, v) => {
    const n = fbm(u, v, 3, 6, 4);
    const strata = 0.5 + 0.5 * Math.sin((v * 5 + n * 1.6) * Math.PI * 2);
    const ridge = 1 - Math.abs(fbm(u, v, 6, 4, 5) * 2 - 1);
    const h = 0.45 * n + 0.3 * strata + 0.25 * ridge;
    const c = mix(hex("#5f5a52"), hex("#9a9284"), 0.25 + 0.6 * h);
    return S(c, h, 0.85 - 0.15 * ridge);
  },
  stone: (u, v) => {
    // Cut blocks: four rows per tile, alternate rows offset by half a block.
    const rows = 4;
    const row = Math.floor(v * rows);
    const bu = u * 2 + (row % 2) * 0.5;
    const col = Math.floor(bu);
    const fu = bu - col;
    const fv = v * rows - row;
    const edge = Math.min(fu, 1 - fu, (fv * 2) / rows, ((1 - fv) * 2) / rows) * 10;
    const mortar = Math.min(1, Math.max(0, edge - 0.15));
    const n = fbm(u, v, 8, 4, 6);
    const tint = hash(((col % 2) + 2) % 2, row, 7);
    const h = mortar * (0.75 + 0.25 * n);
    const c = mix(hex("#6e675b"), mix(hex("#a39a86"), hex("#b8ae98"), tint), mortar * (0.85 + 0.15 * n));
    return S(c, h, 0.8 + 0.12 * (1 - mortar));
  },
  wood: (u, v) => {
    // Planks along U with fine grain, a dark gap between planks.
    const planks = 4;
    const p = v * planks;
    const pi = Math.floor(p);
    const fp = p - pi;
    const gap = Math.min(1, Math.min(fp, 1 - fp) * 30);
    const n = fbm(u * 0.5, v, 6, 4, 8 + pi);
    const grain = 0.5 + 0.5 * Math.sin((v * 60 + n * 6 + hash(pi, 1, 9) * 10) * Math.PI);
    const c = mix(hex("#3c2615"), mix(hex("#7a4e2b"), hex("#a8754a"), grain * 0.6 + hash(pi, 2, 9) * 0.4), gap);
    return S(c, gap * (0.8 + 0.2 * grain), 0.7 - 0.1 * grain);
  },
  metal: (u, v) => {
    // Riveted panels with patches of rust.
    const fu = (u * 2) % 1;
    const fv = (v * 2) % 1;
    const seam = Math.min(1, Math.min(fu, 1 - fu, fv, 1 - fv) * 40);
    const rivet = [0.08, 0.92].some((a) => [0.08, 0.92].some((b) => Math.hypot(fu - a, fv - b) < 0.025)) ? 1 : 0;
    const n = fbm(u, v, 6, 5, 10);
    const rust = Math.max(0, Math.min(1, (fbm(u, v, 3, 4, 11) - 0.66) * 5));
    const c = mix(mix(hex("#59636b"), hex("#7d8891"), n), hex("#7a3f1c"), rust);
    const h = seam * 0.6 + rivet * 0.4 + n * 0.1;
    return S(c, h, 0.45 + 0.45 * rust + 0.1 * n, (1 - rust) * 0.85);
  },
  plaster: (u, v) => {
    const n = fbm(u, v, 5, 5, 12);
    const stain = Math.max(0, fbm(u, v, 2, 3, 13) - 0.5) * 1.5;
    const crack = Math.abs(fbm(u, v, 3, 5, 14) * 2 - 1) < 0.02 ? 1 : 0;
    const c = mix(mix(hex("#d8c7a6"), hex("#ebdfc7"), n), hex("#9c8a6c"), stain + crack * 0.6);
    return S(c, 0.6 + 0.3 * n - crack * 0.5, 0.9);
  },
  foliage: (u, v) => {
    const n = fbm(u, v, 8, 5, 15);
    const c = mix(hex("#24401c"), hex("#4f7b3b"), n);
    return S(c, n, 0.8);
  },
  snow: (u, v) => {
    const n = fbm(u, v, 4, 5, 16);
    const drift = fbm(u, v, 2, 3, 17);
    const c = mix(hex("#a9b8c6"), hex("#dfe7ee"), 0.4 + 0.6 * n);
    return S(c, 0.6 * drift + 0.4 * n, 0.55 + 0.3 * n);
  },
};

// ------------------------------------------------------------------ baking

interface Baked {
  albedo: Uint8Array;
  normal: Uint8Array;
  orm: Uint8Array;
}

const cache = new Map<string, Baked>();

/** Paints one material's three textures (RGBA8). Exported for tests. */
export function bakeMaterial(mat: Material, size: number): Baked {
  const key = `${mat}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const recipe = RECIPES[mat];
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = recipe(x / size, y / size);
      const i = y * size + x;
      height[i] = s.h;
      albedo[i * 4] = Math.min(255, s.r * 255);
      albedo[i * 4 + 1] = Math.min(255, s.g * 255);
      albedo[i * 4 + 2] = Math.min(255, s.b * 255);
      albedo[i * 4 + 3] = 255;
      orm[i * 4 + 1] = Math.min(255, s.rough * 255);
      orm[i * 4 + 2] = Math.min(255, s.metal * 255);
      orm[i * 4 + 3] = 255;
    }
  }
  // Normal map and cavity from the height field (wrapping, so it tiles).
  const normal = new Uint8Array(n * 4);
  const strength = size / 64;
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      normal[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      normal[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
      // Cavity: darker where this pixel sits below its neighbours.
      const avg = (at(x + 2, y) + at(x - 2, y) + at(x, y + 2) + at(x, y - 2)) / 4;
      orm[i] = Math.max(90, Math.min(255, 255 - Math.max(0, avg - height[y * size + x]) * 900));
    }
  }
  const baked = { albedo, normal, orm };
  cache.set(key, baked);
  return baked;
}

const raw = (data: Uint8Array, size: number, name: string, scene: Scene, srgb: boolean): RawTexture => {
  const t = new RawTexture(data, size, size, Engine.TEXTUREFORMAT_RGBA, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Engine.TEXTURETYPE_UNSIGNED_BYTE, undefined, undefined, srgb);
  t.name = name;
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = 4;
  // Level UVs are in metres; one texture tile covers 2 m.
  t.uScale = t.vScale = 0.5;
  return t;
};

/** A physically based material for one surface type. */
export function proceduralPBR(scene: Scene, mat: Material, size: number): PBRMaterial {
  const b = bakeMaterial(mat, size);
  const m = new PBRMaterial(`pbr-${mat}`, scene);
  m.albedoTexture = raw(b.albedo, size, `${mat}-albedo`, scene, true);
  m.bumpTexture = raw(b.normal, size, `${mat}-normal`, scene, false);
  m.metallicTexture = raw(b.orm, size, `${mat}-orm`, scene, false);
  m.useAmbientOcclusionFromMetallicTextureRed = true;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = true;
  m.metallic = 1;
  m.roughness = 1;
  m.albedoColor = Color3.White();
  m.environmentIntensity = 0.6;
  return m;
}
