// A cheap sky: one big sphere with a gradient shader (zenith -> horizon haze -> ground) and a
// soft sun or moon disc. One draw call, and it blends into the scene fog.
//
// Each chapter can also show a 360-degree backdrop (mountains, a city, clouds) rendered in
// Blender (assets-src/blender/render_backgrounds.py). It is drawn above the horizon only; below
// it the gradient and fog take over, so the level always meets the backdrop with no seam. If the
// image is missing or still loading, the plain gradient is shown.

import { Effect } from "@babylonjs/core/Materials/effect";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

Effect.ShadersStore["meridianSkyVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

Effect.ShadersStore["meridianSkyFragmentShader"] = `
precision highp float;
varying vec3 vDir;
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 bottom;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunSize;
uniform sampler2D pano;
uniform float hasPano;
void main(void) {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(horizon, bottom, clamp(-y * 3.0, 0.0, 1.0));
  if (hasPano > 0.5) {
    // Equirectangular lookup: the image centre faces +z, the right quarter +x, the top row is straight up.
    vec2 uv = vec2(0.5 + atan(d.x, d.z) / 6.2831853, 0.5 + asin(clamp(y, -1.0, 1.0)) / 3.1415927);
    c = mix(c, texture2D(pano, uv).rgb, smoothstep(-0.03, 0.02, y));
  }
  float s = max(dot(d, normalize(sunDir)), 0.0);
  // The backdrop image already contains the soft glow around the sun, so only the disc is added.
  c += sunColor * (pow(s, 900.0 / sunSize) * 2.5 + (1.0 - hasPano) * pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(c, 1.0);
}`;

export interface SkyColors {
  top: string;
  horizon: string;
  bottom: string;
}

/** Brightness of a hex colour, 0..1 (used to tell night levels from day levels). */
export const luminance = (hex: string): number => {
  const c = Color3.FromHexString(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};

/** Where a chapter's 360-degree backdrop lives (built by assets-src/blender/render_backgrounds.py). */
export const panoramaUrl = (chapterId: string, small: boolean): string => `${import.meta.env.BASE_URL}backgrounds/${chapterId}-pano${small ? "-sm" : ""}.webp`;

export function createSky(scene: Scene, colors: SkyColors, sunDir: Vector3, night: boolean, panorama?: string): Mesh {
  const mat = new ShaderMaterial("skyMat", scene, "meridianSky", {
    attributes: ["position"],
    uniforms: ["worldViewProjection", "top", "horizon", "bottom", "sunDir", "sunColor", "sunSize", "hasPano"],
    samplers: ["pano"],
  });
  mat.setFloat("hasPano", 0);
  if (panorama) {
    // No mipmaps: the image is never shown smaller than it is, and mipmaps would draw a thin line
    // where the panorama's left and right edges meet.
    const tex = new Texture(panorama, scene, { noMipmap: true, samplingMode: Texture.BILINEAR_SAMPLINGMODE, onLoad: () => mat.setFloat("hasPano", 1) });
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    mat.setTexture("pano", tex);
  }
  mat.setColor3("top", Color3.FromHexString(colors.top));
  mat.setColor3("horizon", Color3.FromHexString(colors.horizon));
  mat.setColor3("bottom", Color3.FromHexString(colors.bottom).scale(0.6));
  mat.setVector3("sunDir", sunDir.scale(-1));
  mat.setColor3("sunColor", night ? new Color3(0.55, 0.62, 0.8) : new Color3(1.0, 0.86, 0.62));
  mat.setFloat("sunSize", night ? 0.6 : 1);
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  const sky = MeshBuilder.CreateSphere("sky", { diameter: 1000, segments: 16, sideOrientation: 1 }, scene);
  sky.material = mat;
  sky.infiniteDistance = true;
  sky.applyFog = false;
  sky.isPickable = false;
  sky.renderingGroupId = 0;
  return sky;
}
