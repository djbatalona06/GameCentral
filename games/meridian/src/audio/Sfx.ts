// Sound effects and ambience beds, all synthesised.
//   - gunshots in three layers (crack, body, low thump) with a room tail from the reverb
//   - footsteps that change with the surface (sand, snow, stone, wood, metal, water...)
//   - looping beds: wind, sea, jungle insects, train rumble, jeep engines

import type { WeaponId } from "../sim/combat/weapons";
import type { Material } from "../sim/world/types";
import type { V3 } from "../sim/math";
import type { Mixer } from "./Mixer";

export function gunshot(mx: Mixer, weapon: WeaponId, pos: V3 | undefined, enemy: boolean, muffled: boolean): void {
  const cfg: Record<WeaponId, { crack: number; body: number; thump: number; dur: number; gain: number }> = {
    pistol: { crack: 3200, body: 1600, thump: 140, dur: 0.16, gain: 0.7 },
    revolver: { crack: 2600, body: 1100, thump: 110, dur: 0.3, gain: 0.95 },
    rifle: { crack: 3600, body: 1400, thump: 120, dur: 0.14, gain: 0.65 },
    shotgun: { crack: 2000, body: 650, thump: 80, dur: 0.38, gain: 1 },
    marksman: { crack: 4200, body: 900, thump: 90, dur: 0.5, gain: 1 },
  };
  const c = cfg[weapon];
  const g = enemy ? c.gain * 0.7 : c.gain;
  mx.noiseHit("sfx", 0.03, "highpass", c.crack, g * 0.9, pos, 0.7, undefined, 0, muffled);
  mx.noiseHit("sfx", c.dur, "bandpass", c.body, g, pos, 0.8, c.body * 0.5, 0, muffled);
  mx.tone("sfx", c.thump, c.dur * 0.9, "sine", g * 0.9, 0, pos, c.thump * 0.4);
}

/** One footstep. `heavy` for sprinting and landings. */
export function footstep(mx: Mixer, surface: Material | "water", heavy: boolean): void {
  const v = heavy ? 1.6 : 1;
  switch (surface) {
    case "sand":
      mx.noiseHit("sfx", 0.12, "lowpass", 1400, 0.16 * v);
      break;
    case "snow":
      // Crunch: a few tiny grains in quick succession.
      for (let i = 0; i < 3; i++) mx.noiseHit("sfx", 0.04, "bandpass", 1800 + i * 500, 0.14 * v, undefined, 2, undefined, i * 0.025);
      break;
    case "wood":
      mx.tone("sfx", 180, 0.08, "triangle", 0.2 * v, 0, undefined, 120);
      mx.noiseHit("sfx", 0.05, "bandpass", 900, 0.12 * v);
      break;
    case "metal":
      mx.tone("sfx", 1100 + Math.random() * 200, 0.12, "sine", 0.06 * v);
      mx.noiseHit("sfx", 0.05, "bandpass", 2400, 0.14 * v, undefined, 3);
      break;
    case "stone":
    case "rock":
    case "plaster":
      mx.noiseHit("sfx", 0.05, "bandpass", 2200, 0.16 * v, undefined, 1.4);
      mx.noiseHit("sfx", 0.07, "lowpass", 380, 0.16 * v);
      break;
    case "foliage":
      mx.noiseHit("sfx", 0.14, "highpass", 3000, 0.1 * v);
      break;
    case "water":
      mx.noiseHit("sfx", 0.2, "bandpass", 900, 0.22 * v, undefined, 0.6, 400);
      break;
    default:
      mx.noiseHit("sfx", 0.07, "lowpass", 650, 0.2 * v);
  }
}

// ------------------------------------------------------------------ looping beds

interface Bed {
  gain: GainNode;
  stop: () => void;
}

export interface AmbienceState {
  wind: number;
  sea: number;
  insects: number;
  train: number;
  /** Jeep engine: 0 = off, otherwise speed in m/s. */
  engine: number;
  /** Loudest enemy jeep (0..1). */
  pursuit: number;
}

export class Ambience {
  private beds: Record<keyof AmbienceState, Bed>;
  private engineOsc: OscillatorNode[] = [];
  private pursuitOsc: OscillatorNode | null = null;
  private clatter = 0;
  private gull = 4;

  constructor(private mx: Mixer) {
    const ctx = mx.ctx;
    const loop = (type: BiquadFilterType, freq: number, q: number, lfoHz = 0, lfoDepth = 0): Bed => {
      const src = ctx.createBufferSource();
      src.buffer = mx.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = 1;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(amp).connect(gain).connect(mx.bus("ambience"));
      let lfo: OscillatorNode | null = null;
      if (lfoHz) {
        lfo = ctx.createOscillator();
        lfo.frequency.value = lfoHz;
        const d = ctx.createGain();
        d.gain.value = lfoDepth;
        lfo.connect(d).connect(amp.gain);
        lfo.start();
      }
      src.start();
      return { gain, stop: () => (src.stop(), lfo?.stop()) };
    };
    this.beds = {
      wind: loop("bandpass", 500, 0.6, 0.13, 0.5),
      sea: loop("lowpass", 420, 0.5, 0.09, 0.8),
      insects: loop("bandpass", 5200, 9, 17, 0.9),
      train: loop("lowpass", 160, 0.8),
      engine: this.engineBed(),
      pursuit: this.pursuitBed(),
    };
  }

  private engineBed(): Bed {
    const ctx = this.mx.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    lp.connect(gain).connect(this.mx.bus("sfx"));
    for (const [type, mul] of [["sawtooth", 1], ["square", 0.5]] as Array<[OscillatorType, number]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40 * mul;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(lp);
      o.start();
      this.engineOsc.push(o);
    }
    return { gain, stop: () => this.engineOsc.forEach((o) => o.stop()) };
  }

  private pursuitBed(): Bed {
    const ctx = this.mx.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 450;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = 55;
    o.connect(lp).connect(gain).connect(this.mx.bus("sfx"));
    o.start();
    this.pursuitOsc = o;
    return { gain, stop: () => o.stop() };
  }

  update(dt: number, s: AmbienceState): void {
    const t = this.mx.ctx.currentTime;
    const level: Record<keyof AmbienceState, number> = {
      wind: 0.05 + s.wind * 0.35,
      sea: s.sea * 0.4,
      insects: s.insects * 0.05,
      train: s.train * 0.5,
      engine: s.engine > 0 ? 0.12 + Math.min(1, s.engine / 25) * 0.18 : 0,
      pursuit: s.pursuit * 0.15,
    };
    for (const k of Object.keys(this.beds) as Array<keyof AmbienceState>) this.beds[k].gain.gain.setTargetAtTime(level[k], t, 0.4);
    // Engine pitch follows speed, like revs.
    const rpm = 38 + Math.min(1, s.engine / 25) * 70;
    this.engineOsc[0]?.frequency.setTargetAtTime(rpm, t, 0.1);
    this.engineOsc[1]?.frequency.setTargetAtTime(rpm * 0.5, t, 0.1);
    this.pursuitOsc?.frequency.setTargetAtTime(50 + s.pursuit * 30, t, 0.2);
    // Rail joints: a double click roughly every second on the train.
    if (s.train > 0) {
      this.clatter -= dt;
      if (this.clatter <= 0) {
        this.clatter = 1.05;
        this.mx.noiseHit("ambience", 0.06, "bandpass", 900, 0.35 * s.train, undefined, 1.2);
        this.mx.noiseHit("ambience", 0.06, "bandpass", 800, 0.3 * s.train, undefined, 1.2, undefined, 0.16);
      }
    }
    // Gulls over the sea.
    if (s.sea > 0) {
      this.gull -= dt;
      if (this.gull <= 0) {
        this.gull = 5 + Math.random() * 9;
        const f = 1500 + Math.random() * 500;
        this.mx.tone("ambience", f, 0.35, "sine", 0.05, 0, undefined, f * 0.7);
        this.mx.tone("ambience", f * 1.05, 0.25, "sine", 0.04, 0.4, undefined, f * 0.75);
      }
    }
  }

  stop(): void {
    for (const b of Object.values(this.beds)) b.stop();
  }
}

/** Which beds suit each chapter (before weather and vehicles are added on top). */
export function chapterBeds(chapterId: string): Pick<AmbienceState, "sea" | "insects" | "train"> {
  return {
    sea: chapterId === "ch01" || chapterId === "ch07" ? 1 : chapterId === "ch02" ? 0.4 : 0,
    insects: chapterId === "ch03" ? 1 : 0,
    train: chapterId === "ch06" ? 1 : 0,
  };
}
