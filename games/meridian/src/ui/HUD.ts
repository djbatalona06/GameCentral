// The in-game heads-up display. Reads the simulation each frame and reacts to its events.

import hudHtml from "./screens/hud.html?raw";
import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import { WEAPONS, currentSpread } from "../sim/combat/weapons";
import type { GameSim, SimEvent } from "../sim/GameSim";
import { angleDiff, yawOf, sub } from "../sim/math";
import type { Speaker } from "../sim/story/types";
import type { InputFrame } from "../input/actions";

const SPEAKER_COLORS: Record<Speaker, string> = {
  Ines: "#7fd1c7",
  Bram: "#f2c94c",
  Varek: "#ff8a80",
  Kessa: "#ffab40",
  Catalina: "#d7b8ff",
  "Gilt Radio": "#c5cae9",
  Mercenary: "#ef9a9a",
  Narrator: "#e0e0e0",
};

const PROMPT_KEYS: Record<InputFrame["device"], Record<"interact" | "melee" | "jump", string>> = {
  keyboard: { interact: "E", melee: "F", jump: "Space" },
  gamepad: { interact: "Y", melee: "X", jump: "A" },
  touch: { interact: "Use", melee: "Melee", jump: "Jump" },
};

export class HUD {
  readonly el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(role: string) => this.el.querySelector(`[data-role="${role}"]`) as T;
  private subtitleTimer = 0;
  private tutorialTimer = 0;
  private objectiveTimer = 0;
  private checkpointTimer = 0;
  private lastObjective = "";
  private damageEls: Array<{ el: HTMLElement; t: number; yaw: number }> = [];
  private soundEls: Array<{ el: HTMLElement; t: number; yaw: number }> = [];
  onSkip: (() => void) | null = null;
  speak: ((text: string, speaker: Speaker) => void) | null = null;

  constructor(parent: HTMLElement, private settings: () => Settings) {
    const wrap = document.createElement("div");
    wrap.innerHTML = hudHtml;
    this.el = wrap.firstElementChild as HTMLElement;
    parent.appendChild(this.el);
    this.q("skip").addEventListener("click", () => this.onSkip?.());
    this.show(false);
  }

  show(on: boolean): void {
    this.el.classList.toggle("hidden", !on);
  }

  private toast(title: string, body = ""): void {
    const t = document.createElement("div");
    t.className = "toast";
    const s = document.createElement("strong");
    s.textContent = title;
    t.appendChild(s);
    if (body) t.appendChild(document.createTextNode(body));
    this.q("toasts").appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  handleEvent(ev: SimEvent, sim: GameSim): void {
    const a = this.settings().a11y;
    switch (ev.type) {
      case "dialogue": {
        if (!a.subtitles && !a.voiceLines) break;
        const box = this.q("subtitles");
        box.innerHTML = "";
        if (a.subtitles) {
          const p = document.createElement("p");
          if (a.speakerNames) {
            const sp = document.createElement("span");
            sp.className = "speaker";
            sp.textContent = `${ev.line.speaker}:`;
            if (a.speakerColors) sp.style.color = SPEAKER_COLORS[ev.line.speaker];
            p.appendChild(sp);
          }
          p.appendChild(document.createTextNode(ev.line.text));
          box.appendChild(p);
        }
        this.subtitleTimer = ev.line.duration ?? Math.max(2.2, ev.line.text.split(" ").length * 0.32 + 0.8);
        if (a.voiceLines) this.speak?.(ev.line.text, ev.line.speaker);
        break;
      }
      case "objective":
        this.setObjective(ev.text);
        break;
      case "tutorial":
        if (!a.tutorialHints) break;
        this.q("tutorial").textContent = ev.text;
        this.q("tutorial").classList.add("show");
        this.tutorialTimer = Math.max(5, ev.text.split(" ").length * 0.35);
        break;
      case "checkpoint":
        this.q("checkpoint").textContent = `Checkpoint: ${ev.label}`;
        this.q("checkpoint").classList.add("show");
        this.checkpointTimer = 3;
        break;
      case "pickup":
        this.toast(ev.label);
        break;
      case "treasure":
        this.toast(`Treasure: ${ev.name}`, ` ${ev.description}`);
        break;
      case "journal":
        this.toast("Journal updated", " Open the journal from the pause menu.");
        break;
      case "puzzle":
        this.toast(ev.text);
        break;
      case "hitmarker": {
        const h = this.q("hitmarker");
        h.classList.remove("show");
        h.classList.toggle("kill", ev.kill);
        void h.offsetWidth;
        h.classList.add("show");
        break;
      }
      case "playerHurt": {
        const d = document.createElement("div");
        d.className = "dmg";
        this.q("damage").appendChild(d);
        this.damageEls.push({ el: d, t: 1.2, yaw: ev.fromYaw });
        break;
      }
      case "sound":
        if (!a.soundIndicators) break;
        if (ev.kind === "gunshot" && Math.hypot(ev.pos.x - sim.player.pos.x, ev.pos.z - sim.player.pos.z) < 1) break;
        this.addSound(ev.kind === "gunshot" ? "Gunfire" : ev.kind === "explosion" ? "Explosion" : ev.kind === "impact" ? "Noise" : "Sound", yawOf(sub(ev.pos, sim.player.pos)));
        break;
      case "alert":
        if (a.soundIndicators) this.addSound("Alert!", yawOf(sub(ev.pos, sim.player.pos)));
        break;
      case "grenade":
        if (!ev.byPlayer && a.soundIndicators) this.addSound("Grenade!", yawOf(sub(ev.pos, sim.player.pos)));
        break;
      case "cutscene":
        this.el.classList.toggle("cinematic", ev.active);
        break;
      case "warning":
        this.q("warning").textContent = ev.text;
        this.q("warning").classList.add("show");
        this.warningTimer = 3;
        if (a.voiceLines) this.speak?.(ev.text, "Narrator");
        break;
      case "bell": {
        // Every note is shown as text too, so the bell puzzle never needs hearing.
        const b = this.q("bell");
        b.textContent = `♪ ${ev.caption}`;
        b.classList.add("show");
        this.bellTimer = 1.6;
        break;
      }
      case "vehicle":
        if (ev.kind === "crash" && a.soundIndicators) this.addSound("Crash!", yawOf(sub(ev.pos, sim.player.pos)));
        break;
      case "searchlightAlarm":
        this.q("warning").textContent = "Spotted by the searchlight!";
        this.q("warning").classList.add("show");
        this.warningTimer = 2.5;
        break;
    }
  }

  private warningTimer = 0;
  private bellTimer = 0;

  private addSound(label: string, worldYaw: number): void {
    const s = document.createElement("div");
    s.className = "snd";
    s.dataset.label = label;
    this.q("sounds").appendChild(s);
    this.soundEls.push({ el: s, t: 1.6, yaw: worldYaw });
  }

  setObjective(text: string): void {
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    const o = this.q("objective");
    o.innerHTML = "<strong>Objective</strong>";
    o.appendChild(document.createTextNode(text));
    o.classList.add("show");
    this.objectiveTimer = 7;
  }

  /** Flash the current objective (e.g. when the player presses the navigation assist). */
  pingObjective(): void {
    this.q("objective").classList.add("show");
    this.objectiveTimer = 4;
  }

  update(dt: number, sim: GameSim, device: InputFrame["device"], fps: number): void {
    const s = this.settings();
    const p = sim.player;
    const timers: Array<[number, string]> = [
      [(this.subtitleTimer -= dt), "subtitles"],
      [(this.tutorialTimer -= dt), "tutorial"],
      [(this.objectiveTimer -= dt), "objective"],
      [(this.checkpointTimer -= dt), "checkpoint"],
      [(this.warningTimer -= dt), "warning"],
      [(this.bellTimer -= dt), "bell"],
    ];
    for (const [t, role] of timers) {
      if (t > 0) continue;
      if (role === "subtitles") this.q(role).innerHTML = "";
      else this.q(role).classList.remove("show");
    }
    const subs = this.q("subtitles");
    subs.dataset.size = s.a11y.subtitleSize;
    subs.style.setProperty("--sub-bg", String(s.a11y.subtitleBackground));

    // Searchlight exposure and jeep condition meters (only shown when they matter).
    const exposure = sim.searchlightExposure;
    this.q("spotted").classList.toggle("show", exposure > 0.02 && !sim.cutscene);
    this.q("spotted-fill").style.width = `${Math.round(exposure * 100)}%`;
    const jeep = sim.riding && sim.vehicle ? sim.vehicle.hp / 100 : -1;
    this.q("jeep").classList.toggle("show", jeep >= 0 && !sim.cutscene);
    if (jeep >= 0) this.q("jeep-fill").style.width = `${Math.round(Math.max(0, jeep) * 100)}%`;

    // Health: red vignette grows as health drops.
    const hpFrac = sim.health.hp / sim.health.max;
    this.q("vignette").style.opacity = String(Math.max(0, Math.min(1, (1 - hpFrac) * 1.3 - 0.1)));

    // Reticle reflects spread, enemy-under-reticle and scope.
    const w = sim.activeWeapon();
    const ret = this.q("reticle");
    const scoped = sim.aiming && sim.cam.scoped;
    this.q("scope").classList.toggle("on", scoped);
    ret.classList.toggle("hidden", !w || !!sim.cutscene || (!sim.aiming && p.mode !== "cover" && !sim.inCombat && !sim.throwAiming));
    ret.classList.toggle("hip", !sim.aiming);
    if (w) {
      const spread = currentSpread(
        WEAPONS[w.id],
        { aiming: sim.aiming, crouched: p.crouched, moving: Math.min(1, Math.hypot(p.vel.x, p.vel.z) / TUNING.player.runSpeed), airborne: p.mode === "air", blindFire: p.mode === "cover" && !sim.aiming, bloom: w.bloom },
        TUNING.cover.blindFireSpreadScale,
      );
      const px = (spread / (sim.cam.fov / 2)) * (window.innerHeight / 2);
      ret.style.setProperty("--spread", `${Math.max(6, Math.min(80, px))}px`);
    }
    ret.style.setProperty("--size", s.a11y.largeReticle ? "1.7" : "1");

    // Ammo.
    const ammo = this.q("ammo");
    ammo.style.display = w && !sim.cutscene ? "" : "none";
    if (w) {
      this.q("weapon-name").textContent = WEAPONS[w.id].name + (w.reloadLeft > 0 ? "  reloading…" : "");
      const mag = this.q("mag");
      mag.textContent = String(w.mag);
      mag.classList.toggle("low", w.mag <= Math.ceil(WEAPONS[w.id].magSize * 0.25));
      this.q("reserve").textContent = `/ ${w.reserve}`;
      this.q("throwables").textContent = `Grenades ${sim.grenades} · Bottles ${sim.bottles}`;
    }

    // Context prompt with the right button name for the current device.
    const pr = this.q("prompt");
    if (sim.prompt && !sim.cutscene) {
      const key = PROMPT_KEYS[device][sim.prompt.action];
      pr.innerHTML = "";
      if (device !== "touch") {
        const k = document.createElement("kbd");
        k.textContent = key;
        pr.appendChild(k);
      }
      pr.appendChild(document.createTextNode(sim.prompt.label));
      pr.classList.add("show");
    } else pr.classList.remove("show");

    // Beam balance meter.
    const bal = this.q("balance");
    bal.classList.toggle("show", !!p.beam && !sim.opts.autoTraversal);
    if (p.beam) this.q("balance-needle").style.left = `${50 + Math.max(-1, Math.min(1, p.beamSway)) * 48}%`;

    // Threat arrows around the reticle.
    const threats = this.q("threats");
    if (s.a11y.threatIndicators && !sim.cutscene) {
      const list = sim.threats();
      while (threats.children.length < list.length) threats.appendChild(Object.assign(document.createElement("div"), { className: "threat" }));
      [...threats.children].forEach((c, i) => {
        const t = list[i];
        const el = c as HTMLElement;
        el.style.display = t ? "" : "none";
        if (!t) return;
        el.style.transform = `rotate(${t.yaw}rad)`;
        el.style.setProperty("--c", t.danger >= 1 ? "#ff3b30" : t.tagged ? "#ffd75e" : `hsl(${50 - t.danger * 50}, 100%, 55%)`);
        el.style.setProperty("--r", `${Math.min(window.innerHeight * 0.3, 160)}px`);
      });
    } else threats.innerHTML = "";

    // Damage arcs rotate with the camera; sound labels move around a ring but stay upright.
    const ring = Math.min(window.innerHeight * 0.34, 190);
    for (const d of this.damageEls) {
      d.t -= dt;
      d.el.style.transform = `rotate(${angleDiff(sim.cam.yaw, d.yaw)}rad)`;
      d.el.style.opacity = String(Math.min(1, d.t));
      if (d.t <= 0) d.el.remove();
    }
    for (const d of this.soundEls) {
      d.t -= dt;
      const a = angleDiff(sim.cam.yaw, d.yaw);
      d.el.style.left = `${Math.sin(a) * ring * 1.6}px`;
      d.el.style.top = `${-Math.cos(a) * ring}px`;
      d.el.style.opacity = String(Math.min(1, d.t));
      if (d.t <= 0) d.el.remove();
    }
    this.damageEls = this.damageEls.filter((d) => d.t > 0);
    this.soundEls = this.soundEls.filter((d) => d.t > 0);

    const hint = this.q("hint");
    const h = sim.activeHint();
    hint.classList.toggle("show", !!h);
    if (h) hint.textContent = `Hint: ${h}`;

    const f = this.q("fps");
    f.classList.toggle("show", s.video.showFps);
    if (s.video.showFps) f.textContent = `${fps.toFixed(0)} fps`;
  }

  reset(): void {
    this.q("subtitles").innerHTML = "";
    this.q("toasts").innerHTML = "";
    this.q("damage").innerHTML = "";
    this.q("sounds").innerHTML = "";
    this.q("tutorial").classList.remove("show");
    this.el.classList.remove("cinematic");
    this.damageEls = [];
    this.soundEls = [];
    this.lastObjective = "";
  }
}
