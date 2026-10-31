// Colours and procedural textures for the greybox art style. No image files are used:
// every texture is drawn into a canvas at load time.

import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "../sim/world/types";

export const MATERIAL_COLORS: Record<Material, string> = {
  sand: "#d8c48f",
  ground: "#7c8c57",
  rock: "#8a8378",
  stone: "#a59c8a",
  wood: "#8e5d32",
  metal: "#6d7983",
  plaster: "#dfcdae",
  foliage: "#4f7b3b",
};

export const HIGH_CONTRAST_ENV = "#3a3a3a";

export const PALETTE = {
  chalk: "#f4ecd6",
  crumble: "#f0a35e",
  player: "#2a9d8f",
  playerHigh: "#3fa9ff",
  treasure: "#f2c94c",
  interact: "#ffd166",
  water: "#3a7ca5",
  grass: "#5e8f3a",
  enemyHigh: "#ff3b30",
  tracerPlayer: "#ffe9a8",
  tracerEnemy: "#ff8a65",
  laser: "#ff2d55",
};

/** A tiling greybox grid: base colour with a darker 1 m line and a faint half-metre line. */
export function gridTexture(scene: Scene, base: string, name: string): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

/** Hand-hold pattern for free-climb walls: rows of pale knobs. */
export function climbTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture("climbTex", { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = PALETTE.chalk;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const ox = (y % 2) * 16;
      ctx.fillRect(x * 32 + ox + 8, y * 32 + 10, 14, 7);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

export function flatMaterial(scene: Scene, name: string, color: string, opts: { emissive?: number; alpha?: number; specular?: number } = {}): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  const c = Color3.FromHexString(color);
  m.diffuseColor = c;
  m.specularColor = new Color3(opts.specular ?? 0.05, opts.specular ?? 0.05, opts.specular ?? 0.05);
  if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
  if (opts.alpha !== undefined) m.alpha = opts.alpha;
  return m;
}
