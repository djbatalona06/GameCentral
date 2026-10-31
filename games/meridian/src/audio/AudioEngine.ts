// All sound is synthesised with the Web Audio API: no audio files to license or download.
// This class is the front door; the real work lives in:
//   Mixer.ts   - buses, reverb, ducking, night mode, mono
//   Spaces.ts  - room sound per location (cave, courtyard, street...)
//   Sfx.ts     - guns, footsteps per surface, ambience beds, engines
//   Music.ts   - adaptive, per-chapter score

import type { Settings } from "../core/Settings";
import type { MusicMood } from "../sim/story/types";
import type { GameSim, SimEvent } from "../sim/GameSim";
import type { V3 } from "../sim/math";
import { Mixer } from "./Mixer";
import { Music } from "./Music";
import { Ambience, chapterBeds, footstep, gunshot } from "./Sfx";
import { spaceAt } from "./Spaces";

/** Bell pitches (G major), lowest to highest. */
const BELL_HZ = [196, 246.9, 293.7, 392, 493.9];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private mx: Mixer | null = null;
  private music: Music | null = null;
  private ambience: Ambience | null = null;
  private sim: GameSim | null = null;
  private chapter = "";
  private pendingMood: MusicMood = "none";

  constructor(private settings: () => Settings) {}

  set listener(l: { pos: V3; yaw: number }) {
    if (this.mx) this.mx.listener = l;
  }

  /** Browsers only allow audio after a user gesture; call this from the first tap/click. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.mx = new Mixer(this.ctx, this.settings);
    this.music = new Music(this.mx);
    this.ambience = new Ambience(this.mx);
    this.music.setMood(this.pendingMood);
  }

  applyVolumes(): void {
    this.mx?.applySettings();
  }

  ui(kind: "move" | "select" | "back" | "error"): void {
    const mx = this.mx;
    if (!mx) return;
    const f = { move: 660, select: 880, back: 440, error: 180 }[kind];
    mx.tone("ui", f, 0.07, kind === "error" ? "square" : "triangle", 0.25);
    if (kind === "select") mx.tone("ui", f * 1.5, 0.08, "triangle", 0.2, 0.05);
  }

  setMood(mood: MusicMood): void {
    this.pendingMood = mood;
    this.music?.setMood(mood);
  }

  /** True when a wall stands between the camera and the sound (it gets muffled). */
  private muffled(pos: V3 | undefined): boolean {
    if (!pos || !this.sim || !this.mx) return false;
    return !this.sim.world.lineOfSight(this.mx.listener.pos, pos);
  }

  /** Reacts to simulation events with sound (fire-and-forget). */
  handleEvent(ev: SimEvent): void {
    const mx = this.mx;
    if (!mx) return;
    switch (ev.type) {
      case "shot":
        gunshot(mx, ev.weapon, ev.byPlayer ? undefined : ev.from, !ev.byPlayer, !ev.byPlayer && this.muffled(ev.from));
        if (!ev.byPlayer && !ev.hit) mx.noiseHit("sfx", 0.12, "highpass", 3000, 0.15, ev.to, 1, 6000);
        break;
      case "hitmarker":
        mx.tone("sfx", ev.kill ? 1300 : 2200, 0.05, "square", ev.kill ? 0.22 : 0.13);
        if (ev.headshot) mx.tone("sfx", 2800, 0.06, "triangle", 0.18, 0.03);
        break;
      case "explosion":
        mx.noiseHit("sfx", 1.4, "lowpass", 1100, 1.3, ev.pos, 0.7, 70);
        mx.tone("sfx", 70, 1, "sine", 1, 0, ev.pos, 28);
        mx.noiseHit("sfx", 0.6, "highpass", 2500, 0.3, ev.pos, 1, undefined, 0.15);
        break;
      case "playerHurt":
        mx.tone("sfx", 200, 0.15, "sawtooth", 0.22, 0, undefined, 90);
        break;
      case "playerDied":
        mx.tone("sfx", 300, 1.2, "sawtooth", 0.35, 0, undefined, 60);
        this.music?.defeat();
        break;
      case "reload":
        mx.noiseHit("sfx", 0.04, "bandpass", 3000, 0.25, undefined, 3);
        mx.noiseHit("sfx", 0.05, "bandpass", 1800, 0.3, undefined, 3, undefined, 0.25);
        break;
      case "dryFire":
        mx.tone("sfx", 1500, 0.03, "square", 0.2);
        break;
      case "swap":
        mx.noiseHit("sfx", 0.15, "bandpass", 2500, 0.2);
        break;
      case "pickup":
        mx.tone("ui", 700, 0.08, "triangle", 0.3);
        mx.tone("ui", 1050, 0.1, "triangle", 0.3, 0.07);
        break;
      case "treasure":
        [0, 4, 7, 12].forEach((s, i) => mx.tone("ui", 523 * Math.pow(2, s / 12), 0.35, "sine", 0.3, i * 0.09));
        break;
      case "checkpoint":
        mx.tone("ui", 784, 0.3, "sine", 0.2);
        break;
      case "journal":
        mx.noiseHit("ui", 0.3, "bandpass", 4000, 0.15, undefined, 2);
        break;
      case "alert":
        mx.tone("sfx", 520, 0.12, "square", 0.22);
        mx.tone("sfx", 780, 0.18, "square", 0.22, 0.12);
        break;
      case "melee":
        if (ev.kind === "whiff") mx.noiseHit("sfx", 0.1, "bandpass", 1200, 0.2);
        else {
          mx.noiseHit("sfx", 0.12, "lowpass", 500, 0.7, ev.pos);
          mx.tone("sfx", 110, 0.15, "sine", 0.6, 0, ev.pos, 60);
        }
        break;
      case "grenade":
        mx.noiseHit("sfx", 0.2, "bandpass", 1800, 0.2, ev.pos, 2);
        break;
      case "boxBroken":
        mx.noiseHit("sfx", 0.4, "bandpass", 600, 0.6, ev.pos);
        mx.tone("sfx", 160, 0.2, "triangle", 0.3, 0, ev.pos, 90);
        break;
      case "interact":
        if (ev.kind === "bell") break;
        if (ev.kind === "panel") {
          mx.noiseHit("sfx", 0.3, "highpass", 3000, 0.4, ev.pos, 2);
          mx.tone("sfx", 220, 0.6, "sawtooth", 0.2, 0.05, ev.pos, 50);
        } else {
          mx.noiseHit("sfx", 0.35, "lowpass", 300, 0.5, ev.pos);
          mx.tone("sfx", 90, 0.4, "triangle", 0.3, 0, ev.pos);
        }
        break;
      case "puzzle":
        if (ev.solved) [0, 7, 12, 19].forEach((s, i) => mx.tone("ui", 392 * Math.pow(2, s / 12), 0.5, "sine", 0.25, i * 0.12));
        break;
      case "bell":
        mx.bell(BELL_HZ[Math.min(ev.index, BELL_HZ.length - 1)] ?? 220, 0.9, ev.pos);
        break;
      case "warning":
        // A rising roar for tunnels and avalanches.
        mx.noiseHit("sfx", 2.6, "lowpass", 120, 0.9, undefined, 0.8, 900);
        break;
      case "vehicle":
        if (ev.kind === "enter") mx.tone("sfx", 45, 0.8, "sawtooth", 0.4, 0, undefined, 90);
        if (ev.kind === "crash" || ev.kind === "wreck") {
          mx.noiseHit("sfx", 0.5, "lowpass", 900, 1, undefined, 0.8, 120);
          mx.tone("sfx", 900, 0.4, "sine", 0.15, 0.02, undefined, 500);
        }
        break;
      case "pursuerDown":
        mx.noiseHit("sfx", 0.6, "bandpass", 700, 0.5, ev.pos, 0.8, 200);
        break;
      case "searchlightAlarm":
        mx.tone("sfx", 600, 1.4, "square", 0.18, 0, undefined, 1100);
        mx.tone("sfx", 600, 1.4, "square", 0.18, 1.4, undefined, 1100);
        break;
      case "complete":
        this.music?.victory();
        break;
      case "music":
        this.setMood(ev.mood);
        break;
      case "player":
        this.playerSound(ev.ev.type);
        break;
    }
  }

  /** Surface under the player, for footsteps. */
  private surface(): Parameters<typeof footstep>[1] {
    const sim = this.sim;
    if (!sim) return "ground";
    const p = sim.player;
    if (p.inWater) return "water";
    if (p.inGrass) return "foliage";
    const g = sim.world.groundHeight(p.pos.x, p.pos.z, p.pos.y + 0.05, 0.2);
    if (g.box) return g.box.material;
    if (g.ramp) return g.ramp.material;
    return "ground";
  }

  private playerSound(t: string): void {
    const mx = this.mx!;
    switch (t) {
      case "step":
      case "sprintStep":
        footstep(mx, this.surface(), t === "sprintStep");
        break;
      case "jump":
      case "wallJump":
        mx.noiseHit("sfx", 0.1, "lowpass", 900, 0.22);
        break;
      case "land":
        footstep(mx, this.surface(), true);
        break;
      case "hardLand":
        mx.noiseHit("sfx", 0.25, "lowpass", 300, 0.8);
        footstep(mx, this.surface(), true);
        break;
      case "grab":
      case "ledgeHop":
        mx.noiseHit("sfx", 0.08, "bandpass", 1500, 0.28);
        break;
      case "climbUp":
        mx.noiseHit("sfx", 0.25, "lowpass", 800, 0.28);
        break;
      case "roll":
        mx.noiseHit("sfx", 0.3, "lowpass", 600, 0.33);
        break;
      case "splash":
        mx.noiseHit("sfx", 0.6, "bandpass", 1200, 0.6, undefined, 0.5, 300);
        break;
      case "zip":
        mx.noiseHit("sfx", 1.5, "bandpass", 1500, 0.3, undefined, 4, 3500);
        break;
      case "rope":
        mx.tone("sfx", 140, 0.3, "triangle", 0.2, 0, undefined, 110);
        break;
      case "crumble":
        mx.noiseHit("sfx", 0.8, "lowpass", 500, 0.7);
        break;
      case "coverIn":
        mx.noiseHit("sfx", 0.1, "lowpass", 600, 0.3);
        break;
    }
  }

  /** Every frame: music intensity, ambience beds, room sound and ducking follow the game. */
  update(dt: number, sim: GameSim | null, playing: boolean): void {
    this.sim = sim;
    const mx = this.mx;
    if (!mx || !this.music || !this.ambience) return;
    if (!sim) {
      this.music.update(dt, false, 0);
      this.ambience.update(dt, { wind: 0, sea: 0, insects: 0, train: 0, engine: 0, pursuit: 0 });
      return;
    }
    if (sim.chapter.id !== this.chapter) {
      this.chapter = sim.chapter.id;
      this.music.setChapter(this.chapter);
    }
    const suspicion = sim.enemies.reduce((m, e) => (e.alive ? Math.max(m, e.suspicion) : m), 0);
    this.music.update(dt, playing && sim.inCombat, Math.max(suspicion, sim.searchlightExposure));
    const tunnel = sim.hazards.some((h) => h.def.kind === "tunnel" && h.sweeping && Math.abs((h.def.min.z + h.def.max.z) / 2 + h.offset.z - sim.player.pos.z) < 6);
    mx.setSpace(spaceAt(sim.chapter.id, sim.player.pos, tunnel));
    mx.setDucking(!!sim.currentLine);
    const w = sim.weather;
    const beds = chapterBeds(sim.chapter.id);
    let pursuit = 0;
    for (const p of sim.pursuers) if (p.alive && sim.riding) pursuit = Math.max(pursuit, 1 / (1 + Math.hypot(p.pos.x - sim.player.pos.x, p.pos.z - sim.player.pos.z) * 0.05));
    this.ambience.update(dt, {
      wind: w ? (w.kind === "sandstorm" ? 1 : 0.55) : sim.player.pos.y > 15 ? 0.35 : 0,
      ...beds,
      engine: sim.riding ? Math.max(1, sim.vehicle!.speed) : 0,
      pursuit,
    });
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
