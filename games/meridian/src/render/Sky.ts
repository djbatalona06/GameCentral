// A cheap sky: one big sphere with a gradient shader (zenith -> horizon haze -> ground) and a
// soft sun or moon disc. No textures, one draw call, and it blends into the scene fog.

import { Effect } from "@babylonjs/core/Materials/effect";
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
void main(void) {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(horizon, bottom, clamp(-y * 3.0, 0.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (pow(s, 900.0 / sunSize) * 2.5 + pow(s, 12.0) * 0.18);
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

export function createSky(scene: Scene, colors: SkyColors, sunDir: Vector3, night: boolean): Mesh {
  const mat = new ShaderMaterial("skyMat", scene, "meridianSky", { attributes: ["position"], uniforms: ["worldViewProjection", "top", "horizon", "bottom", "sunDir", "sunColor", "sunSize"] });
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
