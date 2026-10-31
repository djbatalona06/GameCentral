// Full-screen colour pass: colour-blind correction ("daltonization") and brightness.
// Daltonization shifts colour information a player can't see into channels they can,
// so red/green (or blue/yellow) cues stay distinguishable.

import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { ColorblindMode } from "../core/Settings";

Effect.ShadersStore["meridianColorFragmentShader"] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform int mode;
uniform float strength;
uniform float brightness;

vec3 simulate(vec3 c) {
  // Colour-vision deficiency simulation matrices (Viénot/Brettel style, applied in linear-ish RGB).
  if (mode == 1) return mat3(0.152, 0.115, -0.004, 1.053, 0.786, -0.048, -0.205, 0.099, 1.052) * c; // protanopia
  if (mode == 2) return mat3(0.367, 0.280, -0.012, 0.861, 0.673, 0.043, -0.228, 0.047, 0.969) * c;  // deuteranopia
  if (mode == 3) return mat3(1.256, -0.078, 0.005, -0.077, 0.931, 0.691, -0.179, 0.148, 0.304) * c; // tritanopia
  return c;
}

void main(void) {
  vec3 c = texture2D(textureSampler, vUV).rgb;
  if (mode > 0) {
    vec3 sim = simulate(c);
    vec3 err = c - sim;
    // Redistribute the lost information into visible channels.
    vec3 shift = vec3(0.0, err.r * 0.7 + err.g, err.r * 0.7 + err.b);
    if (mode == 3) shift = vec3(err.b * 0.7 + err.r, err.b * 0.7 + err.g, 0.0);
    c = clamp(c + shift * strength, 0.0, 1.0);
  }
  c *= brightness;
  gl_FragColor = vec4(c, 1.0);
}
`;

const MODES: Record<ColorblindMode, number> = { none: 0, protanopia: 1, deuteranopia: 2, tritanopia: 3 };

export class ColorPostProcess {
  readonly pp: PostProcess;
  mode = 0;
  strength = 1;
  brightness = 1;

  constructor(camera: Camera) {
    this.pp = new PostProcess("meridianColor", "meridianColor", ["mode", "strength", "brightness"], null, 1, camera);
    this.pp.onApply = (effect) => {
      effect.setInt("mode", this.mode);
      effect.setFloat("strength", this.strength);
      effect.setFloat("brightness", this.brightness);
    };
  }

  set(mode: ColorblindMode, strength: number, brightness: number): void {
    this.mode = MODES[mode];
    this.strength = strength;
    this.brightness = brightness;
  }
}
