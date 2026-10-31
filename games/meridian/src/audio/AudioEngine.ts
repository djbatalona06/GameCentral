// All sound is synthesised with the Web Audio API: no audio files to license or download.
// Buses: music, sfx, voice and ui, each with its own volume slider, plus a mono option.

import type { Settings } from "../core/Settings";
import type { MusicMood } from "../sim/story/types";
import type { SimEvent } from "../sim/GameSim";
import type { WeaponId } from "../sim/combat/weapons";
import type { V3 } from "../sim/math";

type Bus = "music" | "sfx" | "voice" | "ui";

const SCALES: Record<Exclude<MusicMood, "none">, { root: number; notes: number[]; tempo: number }> = {
  explore: { root: 220, notes: [0, 3, 7, 10, 12, 15], tempo: 0.55 },
  tension: { root: 196, notes: [0, 1, 5, 7, 8], tempo: 0.42 },
  combat: { root: 164.8, notes: [0, 3, 5, 7, 10], tempo: 0.2 },
  wonder: { root: 261.6, notes: [0, 4, 7, 11, 14, 16], tempo: 0.7 },
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses = new Map<Bus, GainNode>();
  private noiseBuffer: AudioBuffer | null = null;
  private mood: MusicMood = "none";
  private musicTimer = 0;
  private musicStep = 0;
  private pad: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  listener = { pos: { x: 0, y: 0, z: 0 } as V3, yaw: 0 };

  constructor(private settings: () => Settings) {}

  /** Browsers only allow audio after a user gesture; call this from the first tap/click. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    for (const b of ["music", "sfx", "voice", "ui"] as Bus[]) {
      const g = ctx.createGain();
      g.connect(this.master);
      this.buses.set(b, g);
    }
    const len = ctx.sampleRate * 1.5;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  applyVolumes(): void {
    if (!this.ctx || !this.master) return;
    const a = this.settings().audio;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(a.master, t, 0.05);
    this.buses.get("music")!.gain.setTargetAtTime(a.music * 0.5, t, 0.05);
    this.buses.get("sfx")!.gain.setTargetAtTime(a.sfx, t, 0.05);
    this.buses.get("voice")!.gain.setTargetAtTime(a.voice, t, 0.05);
    this.buses.get("ui")!.gain.setTargetAtTime(a.ui, t, 0.05);
  }

  // ------------------------------------------------------------------ building blocks

  /** Routes a source through optional 3D panning based on the listener (camera) position. */
  private out(bus: Bus, pos?: V3, gain = 1): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const g = ctx.createGain();
    let level = gain;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.pos.x;
      const dz = pos.z - this.listener.pos.z;
      const d = Math.hypot(dx, dz, pos.y - this.listener.pos.y);
      level *= 1 / (1 + d * 0.06);
      const ang = Math.atan2(dx, dz) - this.listener.yaw;
      pan = Math.sin(ang);
    }
    g.gain.value = level;
    if (pos && !this.settings().audio.mono && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.buses.get(bus)!);
    } else g.connect(this.buses.get(bus)!);
    return g;
  }

  private noise(bus: Bus, dur: number, filter: BiquadFilterType, freq: number, gain: number, pos?: V3, q = 1, sweepTo?: number): void {
    const ctx = this.ctx;
    const dest = this.out(bus, pos, gain);
    if (!ctx || !dest || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    src.connect(f).connect(env).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private tone(bus: Bus, freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, pos?: V3, slideTo?: number): void {
    const ctx = this.ctx;
    const dest = this.out(bus, pos, gain);
    if (!ctx || !dest) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ sound effects

  gunshot(weapon: WeaponId, pos?: V3, enemy = false): void {
    const cfg: Record<WeaponId, [number, number, number]> = {
      pistol: [1800, 0.16, 0.7],
      revolver: [1200, 0.3, 0.9],
      rifle: [1500, 0.14, 0.6],
      shotgun: [700, 0.35, 1],
      marksman: [900, 0.5, 1],
    };
    const [freq, dur, gain] = cfg[weapon];
    const g = enemy ? gain * 0.7 : gain;
    this.noise("sfx", dur, "bandpass", freq, g, pos, 0.8);
    this.tone("sfx", 120, dur * 0.8, "sine", g * 0.8, 0, pos, 45);
  }

  explosion(pos: V3): void {
    this.noise("sfx", 1.2, "lowpass", 900, 1.3, pos, 0.7, 80);
    this.tone("sfx", 70, 0.9, "sine", 1, 0, pos, 30);
  }

  ui(kind: "move" | "select" | "back" | "error"): void {
    const f = { move: 660, select: 880, back: 440, error: 180 }[kind];
    this.tone("ui", f, 0.07, kind === "error" ? "square" : "triangle", 0.25);
    if (kind === "select") this.tone("ui", f * 1.5, 0.08, "triangle", 0.2, 0.05);
  }

  /** Reacts to simulation events with sound and returns nothing (fire-and-forget). */
  handleEvent(ev: SimEvent): void {
    if (!this.ctx) return;
    switch (ev.type) {
      case "shot":
        this.gunshot(ev.weapon, ev.byPlayer ? undefined : ev.from, !ev.byPlayer);
        if (!ev.byPlayer && !ev.hit) {
          // Near-miss whizz.
          this.noise("sfx", 0.12, "highpass", 3000, 0.15, ev.to, 1, 6000);
        }
        break;
      case "hitmarker":
        this.tone("sfx", ev.kill ? 1300 : 2200, 0.05, "square", ev.kill ? 0.25 : 0.15);
        if (ev.headshot) this.tone("sfx", 2800, 0.06, "triangle", 0.2, 0.03);
        break;
      case "explosion":
        this.explosion(ev.pos);
        break;
      case "playerHurt":
        this.tone("sfx", 200, 0.15, "sawtooth", 0.25, 0, undefined, 90);
        break;
      case "playerDied":
        this.tone("sfx", 300, 1.2, "sawtooth", 0.4, 0, undefined, 60);
        break;
      case "reload":
        this.tone("sfx", 900, 0.04, "square", 0.2);
        this.tone("sfx", 600, 0.05, "square", 0.2, 0.25);
        break;
      case "dryFire":
        this.tone("sfx", 1500, 0.03, "square", 0.2);
        break;
      case "swap":
        this.noise("sfx", 0.15, "bandpass", 2500, 0.2);
        break;
      case "pickup":
        this.tone("ui", 700, 0.08, "triangle", 0.3);
        this.tone("ui", 1050, 0.1, "triangle", 0.3, 0.07);
        break;
      case "treasure":
        [0, 4, 7, 12].forEach((s, i) => this.tone("ui", 523 * Math.pow(2, s / 12), 0.35, "sine", 0.3, i * 0.09));
        break;
      case "checkpoint":
        this.tone("ui", 784, 0.3, "sine", 0.2);
        break;
      case "journal":
        this.noise("ui", 0.3, "bandpass", 4000, 0.15, undefined, 2);
        break;
      case "alert":
        this.tone("sfx", 520, 0.12, "square", 0.25);
        this.tone("sfx", 780, 0.18, "square", 0.25, 0.12);
        break;
      case "melee":
        if (ev.kind === "whiff") this.noise("sfx", 0.1, "bandpass", 1200, 0.2);
        else {
          this.noise("sfx", 0.12, "lowpass", 500, 0.7, ev.pos);
          this.tone("sfx", 110, 0.15, "sine", 0.6, 0, ev.pos, 60);
        }
        break;
      case "grenade":
        this.noise("sfx", 0.2, "bandpass", 1800, 0.2, ev.pos, 2);
        break;
      case "boxBroken":
        this.noise("sfx", 0.4, "bandpass", 600, 0.6, ev.pos);
        break;
      case "interact":
        this.noise("sfx", 0.35, "lowpass", 300, 0.5, ev.pos);
        this.tone("sfx", 90, 0.4, "triangle", 0.3, 0, ev.pos);
        break;
      case "puzzle":
        if (ev.solved) [0, 7, 12, 19].forEach((s, i) => this.tone("ui", 392 * Math.pow(2, s / 12), 0.5, "sine", 0.25, i * 0.12));
        break;
      case "sound":
        if (ev.kind === "impact") this.noise("sfx", 0.25, "highpass", 2500, 0.5, ev.pos);
        break;
      case "music":
        this.setMood(ev.mood);
        break;
      case "player":
        this.playerSound(ev.ev.type);
        break;
    }
  }

  private playerSound(t: string): void {
    switch (t) {
      case "step":
      case "sprintStep":
        this.noise("sfx", 0.06, "lowpass", 700, t === "sprintStep" ? 0.35 : 0.2);
        break;
      case "jump":
      case "wallJump":
        this.noise("sfx", 0.1, "lowpass", 900, 0.25);
        break;
      case "land":
        this.noise("sfx", 0.12, "lowpass", 400, 0.4);
        break;
      case "hardLand":
        this.noise("sfx", 0.25, "lowpass", 300, 0.8);
        break;
      case "grab":
      case "ledgeHop":
        this.noise("sfx", 0.08, "bandpass", 1500, 0.3);
        break;
      case "climbUp":
        this.noise("sfx", 0.25, "lowpass", 800, 0.3);
        break;
      case "roll":
        this.noise("sfx", 0.3, "lowpass", 600, 0.35);
        break;
      case "splash":
        this.noise("sfx", 0.6, "bandpass", 1200, 0.6, undefined, 0.5, 300);
        break;
      case "zip":
        this.noise("sfx", 1.5, "bandpass", 1500, 0.3, undefined, 4, 3500);
        break;
      case "rope":
        this.tone("sfx", 140, 0.3, "triangle", 0.2, 0, undefined, 110);
        break;
      case "crumble":
        this.noise("sfx", 0.8, "lowpass", 500, 0.7);
        break;
      case "coverIn":
        this.noise("sfx", 0.1, "lowpass", 600, 0.3);
        break;
    }
  }

  // ------------------------------------------------------------------ music

  setMood(mood: MusicMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.musicStep = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (this.pad) {
      const old = this.pad;
      old.gain.gain.setTargetAtTime(0, t, 0.8);
      setTimeout(() => old.osc.forEach((o) => o.stop()), 3000);
      this.pad = null;
    }
    if (mood === "none") return;
    const s = SCALES[mood];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.18, t, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = mood === "combat" ? 900 : 600;
    gain.connect(lp).connect(this.buses.get("music")!);
    const osc = [0, 7, 12].map((semi, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sawtooth" : "triangle";
      o.frequency.value = (s.root / 2) * Math.pow(2, (semi + (mood === "tension" ? 1 : 0) * (i === 1 ? -1 : 0)) / 12);
      o.detune.value = (i - 1) * 6;
      o.connect(gain);
      o.start();
      return o;
    });
    this.pad = { osc, gain };
  }

  /** Steps the arpeggio and percussion. Called every frame with the frame time. */
  update(dt: number, combat: boolean): void {
    if (!this.ctx || this.mood === "none") return;
    const mood = combat ? "combat" : this.mood;
    const s = SCALES[mood as Exclude<MusicMood, "none">];
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = s.tempo;
    const n = s.notes[(this.musicStep * 3 + (this.musicStep >> 2)) % s.notes.length];
    this.tone("music", s.root * Math.pow(2, n / 12), s.tempo * 1.8, "triangle", 0.22);
    if (combat) {
      if (this.musicStep % 2 === 0) this.tone("music", 55, 0.18, "sine", 0.8, 0, undefined, 40);
      if (this.musicStep % 4 === 2) this.noise("music", 0.12, "highpass", 5000, 0.25);
    }
    this.musicStep++;
  }

  // ------------------------------------------------------------------ speech

  /** Reads text aloud with the system voice (menu narration and optional spoken dialogue). */
  speak(text: string, opts: { pitch?: number; rate?: number; interrupt?: boolean } = {}): void {
    if (!("speechSynthesis" in window)) return;
    if (opts.interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = opts.pitch ?? 1;
    u.rate = opts.rate ?? 1.05;
    u.volume = this.settings().audio.voice * this.settings().audio.master;
    speechSynthesis.speak(u);
  }

  stopSpeech(): void {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
}
