// Phone-friendly water: no reflection render pass. Waves are two layers of scrolling noise in
// the shader, turned into a normal; the colour blends deep and shallow tones by viewing angle
// (fresnel) and adds a sun glint. One draw call per water surface.

import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

Effect.ShadersStore["meridianWaterVertexShader"] = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
varying vec3 vWorld;
void main(void) {
  vec4 w = world * vec4(position, 1.0);
  w.y += sin(w.x * 0.35 + time * 1.1) * 0.05 + sin(w.z * 0.27 + time * 0.8) * 0.05;
  vWorld = w.xyz;
  gl_Position = viewProjection * w;
}`;

Effect.ShadersStore["meridianWaterFragmentShader"] = `
precision highp float;
varying vec3 vWorld;
uniform vec3 cameraPosition;
uniform vec3 sunDir;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 skyTint;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float waves(vec2 p) {
  return noise(p * 0.6 + vec2(time * 0.25, time * 0.18)) * 0.6 + noise(p * 1.7 - vec2(time * 0.31, -time * 0.22)) * 0.4;
}
void main(void) {
  vec2 p = vWorld.xz;
  float e = 0.15;
  float h = waves(p);
  vec3 n = normalize(vec3(h - waves(p + vec2(e, 0.0)), e * 1.6, h - waves(p + vec2(0.0, e))));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 c = mix(mix(deep, shallow, h * 0.5), skyTint, 0.15 + fres * 0.6);
  vec3 r = reflect(-v, n);
  float spec = pow(max(dot(r, normalize(-sunDir)), 0.0), 120.0);
  c += vec3(1.0, 0.95, 0.85) * spec * 1.6;
  float d = length(cameraPosition - vWorld);
  float f = clamp(exp(-pow(fogDensity * d, 2.0)), 0.0, 1.0);
  c = mix(fogColor, c, f);
  gl_FragColor = vec4(c, 0.82 + fres * 0.15);
}`;

export interface WaterLook {
  deep: string;
  shallow: string;
  sky: string;
  fog: string;
  fogDensity: number;
}

export function createWaterMaterial(scene: Scene, look: WaterLook, sunDir: Vector3): ShaderMaterial {
  const m = new ShaderMaterial("water", scene, "meridianWater", {
    attributes: ["position"],
    uniforms: ["world", "viewProjection", "time", "cameraPosition", "sunDir", "deep", "shallow", "skyTint", "fogColor", "fogDensity"],
    needAlphaBlending: true,
  });
  m.setColor3("deep", Color3.FromHexString(look.deep));
  m.setColor3("shallow", Color3.FromHexString(look.shallow));
  m.setColor3("skyTint", Color3.FromHexString(look.sky));
  m.setColor3("fogColor", Color3.FromHexString(look.fog));
  m.setFloat("fogDensity", look.fogDensity);
  m.setVector3("sunDir", sunDir);
  m.backFaceCulling = false;
  let t = 0;
  m.onBindObservable.add(() => {
    t += scene.getEngine().getDeltaTime() / 1000;
    m.setFloat("time", t);
    const cam = scene.activeCamera;
    if (cam) m.setVector3("cameraPosition", cam.globalPosition);
  });
  return m;
}
