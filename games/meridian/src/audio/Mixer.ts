// The audio graph. Every sound goes into a bus (music, sfx, voice, ui, ambience) with its own
// volume slider. Buses also feed a shared reverb, so a gunshot rings in a cave but stays dry on
// a beach. Options: mono output, dialogue ducking and "night mode" (squashed loud peaks).
//
//   source -> [panner] -> bus -> master -> compressor -> (mono merge) -> speakers
//                           \-> reverb send -> convolver -/

import type { Settings } from "../core/Settings";
import type { V3 } from "../sim/math";
import { SPACES, type SpaceId, impulseResponse } from "./Spaces";

export type Bus = "music" | "sfx" | "voice" | "ui" | "ambience";
const BUSES: Bus[] = ["music", "sfx", "voice", "ui", "ambience"];

export class Mixer {
  readonly ctx: AudioContext;
  readonly noise: AudioBuffer;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private mono: GainNode;
  private buses = new Map<Bus, GainNode>();
  private sends = new Map<Bus, GainNode>();
  private convolver: ConvolverNode;
  private wet: GainNode;
  private duck = 1;
  space: SpaceId = "open";
  listener = { pos: { x: 0, y: 0, z: 0 } as V3, yaw: 0 };

  constructor(ctx: AudioContext, private settings: () => Settings) {
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.mono = ctx.createGain();
    this.comp.connect(this.mono).connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.convolver = ctx.createConvolver();
    this.wet = ctx.createGain();
    this.convolver.connect(this.wet).connect(this.master);
    for (const b of BUSES) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(b, g);
      const s = ctx.createGain();
      g.connect(s).connect(this.convolver);
      this.sends.set(b, s);
    }
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.setSpace("open", true);
    this.applySettings();
  }

  applySettings(): void {
    const a = this.settings().audio;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    const vol: Record<Bus, number> = { music: a.music * 0.5 * this.duck, sfx: a.sfx, voice: a.voice, ui: a.ui, ambience: a.ambience * (0.6 + 0.4 * this.duck) };
    for (const b of BUSES) this.buses.get(b)!.gain.setTargetAtTime(vol[b], t, 0.08);
    // Night mode: a much stronger compressor so explosions don't wake the house.
    this.comp.threshold.setTargetAtTime(a.nightMode ? -32 : -14, t, 0.05);
    this.comp.ratio.setTargetAtTime(a.nightMode ? 12 : 4, t, 0.05);
    this.comp.knee.setTargetAtTime(a.nightMode ? 6 : 20, t, 0.05);
    // Mono: fold everything to one channel so nothing is lost with one earbud or one ear.
    this.mono.channelCount = a.mono ? 1 : 2;
    this.mono.channelCountMode = a.mono ? "explicit" : "max";
    this.mono.channelInterpretation = "speakers";
  }

  /** Lowers music while someone is talking (if the player has ducking on). */
  setDucking(talking: boolean): void {
    const want = talking && this.settings().audio.duck ? 0.45 : 1;
    if (Math.abs(want - this.duck) < 0.01) return;
    this.duck = want;
    this.applySettings();
  }

  /** Changes the room sound (reverb length and how much of each bus is sent to it). */
  setSpace(id: SpaceId, force = false): void {
    if (id === this.space && !force) return;
    this.space = id;
    const s = SPACES[id];
    this.convolver.buffer = impulseResponse(this.ctx, s.seconds, s.decay, s.brightness);
    const t = this.ctx.currentTime;
    this.wet.gain.setTargetAtTime(s.wet, t, 0.3);
    for (const b of BUSES) this.sends.get(b)!.gain.setTargetAtTime(b === "ui" || b === "voice" ? 0 : b === "music" ? 0.15 : 1, t, 0.3);
  }

  /** Output node for one sound: distance falloff and stereo panning from the camera. */
  out(bus: Bus, pos?: V3, gain = 1, muffled = false): AudioNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let level = gain;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.pos.x;
      const dz = pos.z - this.listener.pos.z;
      const d = Math.hypot(dx, dz, pos.y - this.listener.pos.y);
      level *= 1 / (1 + d * 0.06);
      pan = Math.sin(Math.atan2(dx, dz) - this.listener.yaw);
    }
    g.gain.value = level;
    let tail: AudioNode = g;
    // Sounds behind walls lose their high end.
    if (muffled) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      tail.connect(lp);
      tail = lp;
    }
    if (pos && !this.settings().audio.mono) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.buses.get(bus)!);
    return g;
  }

  /** A burst of filtered noise with a decaying envelope (hits, steps, wind gusts). */
  noiseHit(bus: Bus, dur: number, type: BiquadFilterType, freq: number, gain: number, pos?: V3, q = 1, sweepTo?: number, delay = 0, muffled = false): void {
    const ctx = this.ctx;
    const dest = this.out(bus, pos, gain, muffled);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    const t = ctx.currentTime + delay;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f).connect(env).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** A pitched note with an attack/decay envelope. */
  tone(bus: Bus, freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, pos?: V3, slideTo?: number, attack = 0.01, at?: number): void {
    const ctx = this.ctx;
    const dest = this.out(bus, pos, gain);
    const o = ctx.createOscillator();
    o.type = type;
    const t = at ?? ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Frequency-modulated bell: metallic overtones that ring and slowly fade. */
  bell(freq: number, gain: number, pos?: V3): void {
    const ctx = this.ctx;
    const dest = this.out("sfx", pos, gain);
    const t = ctx.currentTime;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * 1.4;
    modGain.gain.setValueAtTime(freq * 2.2, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 3.5);
    mod.connect(modGain).connect(car.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    car.connect(env).connect(dest);
    // A quieter octave hum underneath, like a real bell.
    this.tone("sfx", freq / 2, 4, "sine", gain * 0.35, 0, pos);
    car.start(t);
    mod.start(t);
    car.stop(t + 4.6);
    mod.stop(t + 4.6);
  }

  bus(b: Bus): GainNode {
    return this.buses.get(b)!;
  }
}
