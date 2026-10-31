// Adaptive music, written by code. Each chapter has its own key, scale and tempo. The score is
// built from layers that fade in and out with the action:
//   pad (always) -> melody (exploring) -> bass pulse (tension) -> drums (combat)
// Notes are scheduled slightly ahead on the audio clock, so timing stays tight even if a frame
// is late.

import type { MusicMood } from "../sim/story/types";
import type { Mixer } from "./Mixer";

interface Palette {
  /** Root frequency in Hz. */
  root: number;
  /** Scale steps in semitones. */
  scale: number[];
  bpm: number;
  lead: OscillatorType;
}

export const PALETTES: Record<string, Palette> = {
  ch01: { root: 220, scale: [0, 2, 3, 5, 7, 9, 10], bpm: 92, lead: "triangle" }, // A dorian, sea air
  ch02: { root: 233.1, scale: [0, 1, 4, 5, 7, 8, 10], bpm: 100, lead: "sawtooth" }, // Bb phrygian dominant
  ch03: { root: 196, scale: [0, 2, 4, 7, 9], bpm: 88, lead: "triangle" }, // G pentatonic, jungle
  ch04: { root: 207.7, scale: [0, 1, 4, 5, 7, 8, 11], bpm: 104, lead: "sawtooth" }, // Ab double harmonic
  ch05: { root: 174.6, scale: [0, 2, 3, 5, 7, 8, 10], bpm: 76, lead: "sine" }, // F aeolian, cold
  ch06: { root: 185, scale: [0, 2, 3, 5, 7, 8, 11], bpm: 116, lead: "square" }, // F# harmonic minor
  ch07: { root: 164.8, scale: [0, 1, 3, 5, 6, 8, 10], bpm: 96, lead: "sawtooth" }, // E locrian, menace
};
const DEFAULT = PALETTES.ch01;

/** 0 calm .. 1 full combat, from the story mood plus what is happening right now. */
export function intensity(mood: MusicMood, inCombat: boolean, suspicion: number): number {
  if (mood === "none") return 0;
  if (inCombat || mood === "combat") return 1;
  if (mood === "tension" || suspicion > 0.3) return 0.6;
  return mood === "wonder" ? 0.15 : 0.3;
}

export class Music {
  private palette: Palette = DEFAULT;
  private layers: Record<"pad" | "melody" | "bass" | "drums", GainNode>;
  private padOsc: OscillatorNode[] = [];
  private nextBeat = 0;
  private step = 0;
  private level = 0;
  mood: MusicMood = "none";

  constructor(private mx: Mixer) {
    const ctx = mx.ctx;
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(mx.bus("music"));
      return g;
    };
    this.layers = { pad: mk(), melody: mk(), bass: mk(), drums: mk() };
  }

  setChapter(id: string): void {
    this.palette = PALETTES[id] ?? DEFAULT;
    this.restartPad();
  }

  setMood(m: MusicMood): void {
    if (m === this.mood) return;
    this.mood = m;
    this.restartPad();
  }

  private restartPad(): void {
    const ctx = this.mx.ctx;
    const t = ctx.currentTime;
    for (const o of this.padOsc) o.stop(t + 2);
    this.padOsc = [];
    if (this.mood === "none") return;
    const minor = this.palette.scale.includes(3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.connect(this.layers.pad);
    for (const [semi, type] of [[0, "sawtooth"], [minor ? 3 : 4, "triangle"], [7, "triangle"], [12, "sine"]] as Array<[number, OscillatorType]>) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = (this.palette.root / 2) * Math.pow(2, semi / 12);
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(lp);
      o.start(t);
      this.padOsc.push(o);
    }
  }

  /** Call every frame. Fades layers toward the current intensity and schedules notes. */
  update(dt: number, inCombat: boolean, suspicion: number): void {
    const ctx = this.mx.ctx;
    const want = intensity(this.mood, inCombat, suspicion);
    this.level += (want - this.level) * Math.min(1, dt * 0.8);
    const L = this.level;
    const t = ctx.currentTime;
    const on = this.mood !== "none";
    this.layers.pad.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.5);
    this.layers.melody.gain.setTargetAtTime(on ? Math.max(0.15, 1 - Math.abs(L - 0.35) * 1.4) * 0.5 : 0, t, 0.5);
    this.layers.bass.gain.setTargetAtTime(on ? Math.max(0, (L - 0.35) * 1.6) * 0.7 : 0, t, 0.4);
    this.layers.drums.gain.setTargetAtTime(on ? Math.max(0, (L - 0.75) * 4) * 0.6 : 0, t, 0.3);
    if (!on) return;

    const beat = 60 / (this.palette.bpm * (L > 0.75 ? 1.25 : 1)) / 2; // eighth notes
    if (this.nextBeat < t) this.nextBeat = t + 0.05;
    while (this.nextBeat < t + 0.2) {
      this.schedule(this.nextBeat, beat);
      this.nextBeat += beat;
      this.step++;
    }
  }

  private note(i: number, octave = 0): number {
    const s = this.palette.scale;
    const n = ((i % s.length) + s.length) % s.length;
    const oct = Math.floor(i / s.length) + octave;
    return this.palette.root * Math.pow(2, (s[n] + oct * 12) / 12);
  }

  private schedule(at: number, beat: number): void {
    const mx = this.mx;
    const ctx = mx.ctx;
    const st = this.step;
    // Melody: a slow wandering line, two notes per bar with a rest.
    if (st % 4 === 0 && (st >> 2) % 4 !== 3) {
      const phrase = [0, 2, 4, 3, 1, 4, 5, 2, 0, -1, 1, 4];
      const n = phrase[(st >> 2) % phrase.length];
      this.voice(this.layers.melody, this.note(n, 1), beat * 3.5, this.palette.lead, 0.16, at);
    }
    // Bass: a pulse on the root and fifth.
    if (st % 2 === 0) this.voice(this.layers.bass, this.note(st % 16 < 8 ? 0 : 4, -2), beat * 1.6, "sawtooth", 0.25, at);
    // Drums: kick on the beat, hats on the off-beat, a snare-like hit on 2 and 4.
    if (st % 2 === 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(120, at);
      o.frequency.exponentialRampToValueAtTime(40, at + 0.15);
      g.gain.setValueAtTime(0.9, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      o.connect(g).connect(this.layers.drums);
      o.start(at);
      o.stop(at + 0.25);
    }
    this.drumNoise(st % 2 === 1 ? 7000 : st % 8 === 4 ? 1800 : 0, st % 8 === 4 ? 0.18 : 0.05, st % 8 === 4 ? 0.5 : 0.18, at);
  }

  private voice(dest: GainNode, freq: number, dur: number, type: OscillatorType, gain: number, at: number): void {
    const ctx = this.mx.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(lp).connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private drumNoise(freq: number, dur: number, gain: number, at: number): void {
    if (!freq) return;
    const ctx = this.mx.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.mx.noise;
    const f = ctx.createBiquadFilter();
    f.type = freq > 4000 ? "highpass" : "bandpass";
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(f).connect(g).connect(this.layers.drums);
    src.start(at, Math.random());
    src.stop(at + dur + 0.02);
  }

  /** A short rising motif when a fight is won or a chapter ends. */
  victory(): void {
    [0, 2, 4, 7].forEach((n, i) => this.mx.tone("music", this.note(n, 1), 0.6, "triangle", 0.35, i * 0.13));
  }

  /** A falling motif on death. */
  defeat(): void {
    [4, 2, 1, 0].forEach((n, i) => this.mx.tone("music", this.note(n, 0), 0.7, "sine", 0.35, i * 0.18));
  }
}
