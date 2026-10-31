// Builds the Settings screen from a list of option descriptions, so adding an option is one entry.

import { ACTION_LABELS, BUTTON_ACTIONS, type ButtonAction } from "../input/actions";
import { PRESETS, type Settings } from "../core/Settings";
import { DIFFICULTY_NAMES } from "../sim/GameSim";

type Tab = "a11y" | "gameplay" | "controls" | "audio" | "video";

interface Option {
  tab: Tab;
  section?: string;
  label: string;
  desc?: string;
  type: "toggle" | "slider" | "select";
  get: (s: Settings) => number | boolean | string;
  set: (s: Settings, v: number | boolean | string) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
  options?: Array<{ value: string; label: string }>;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const x = (v: number) => `${v.toFixed(2)}x`;

export const OPTIONS: Option[] = [
  // Accessibility: vision
  { tab: "a11y", section: "Text & subtitles", label: "Text size", type: "slider", min: 0.8, max: 1.6, step: 0.05, format: x, get: (s) => s.a11y.textScale, set: (s, v) => (s.a11y.textScale = v as number) },
  { tab: "a11y", label: "Subtitles", type: "toggle", get: (s) => s.a11y.subtitles, set: (s, v) => (s.a11y.subtitles = v as boolean) },
  { tab: "a11y", label: "Subtitle size", type: "select", options: [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "xl", label: "Extra large" }], get: (s) => s.a11y.subtitleSize, set: (s, v) => (s.a11y.subtitleSize = v as Settings["a11y"]["subtitleSize"]) },
  { tab: "a11y", label: "Subtitle background", type: "slider", min: 0, max: 1, step: 0.1, format: pct, get: (s) => s.a11y.subtitleBackground, set: (s, v) => (s.a11y.subtitleBackground = v as number) },
  { tab: "a11y", label: "Speaker names", type: "toggle", get: (s) => s.a11y.speakerNames, set: (s, v) => (s.a11y.speakerNames = v as boolean) },
  { tab: "a11y", label: "Speaker colours", type: "toggle", get: (s) => s.a11y.speakerColors, set: (s, v) => (s.a11y.speakerColors = v as boolean) },
  { tab: "a11y", section: "Vision", label: "Colour-blind mode", desc: "Shifts colours so important cues stay distinct.", type: "select", options: [{ value: "none", label: "Off" }, { value: "protanopia", label: "Protanopia (red)" }, { value: "deuteranopia", label: "Deuteranopia (green)" }, { value: "tritanopia", label: "Tritanopia (blue)" }], get: (s) => s.a11y.colorblind, set: (s, v) => (s.a11y.colorblind = v as Settings["a11y"]["colorblind"]) },
  { tab: "a11y", label: "Colour-blind strength", type: "slider", min: 0, max: 1, step: 0.1, format: pct, get: (s) => s.a11y.colorblindStrength, set: (s, v) => (s.a11y.colorblindStrength = v as number) },
  { tab: "a11y", label: "High contrast", desc: "Dark world, bright red enemies, yellow interactables, blue player. Applies on next level load.", type: "toggle", get: (s) => s.a11y.highContrast, set: (s, v) => (s.a11y.highContrast = v as boolean) },
  { tab: "a11y", label: "Large reticle", type: "toggle", get: (s) => s.a11y.largeReticle, set: (s, v) => (s.a11y.largeReticle = v as boolean) },
  { tab: "a11y", label: "Read menus aloud", desc: "Uses your device's voice to read focused menu items.", type: "toggle", get: (s) => s.a11y.menuNarration, set: (s, v) => (s.a11y.menuNarration = v as boolean) },
  { tab: "a11y", label: "Speak dialogue", desc: "Reads subtitles aloud with your device's voice.", type: "toggle", get: (s) => s.a11y.voiceLines, set: (s, v) => (s.a11y.voiceLines = v as boolean) },
  { tab: "a11y", section: "Hearing", label: "Sound indicators", desc: "Shows gunfire, explosions and noises on screen with direction.", type: "toggle", get: (s) => s.a11y.soundIndicators, set: (s, v) => (s.a11y.soundIndicators = v as boolean) },
  { tab: "a11y", label: "Threat indicators", desc: "Arrows point to enemies who are noticing or attacking you.", type: "toggle", get: (s) => s.a11y.threatIndicators, set: (s, v) => (s.a11y.threatIndicators = v as boolean) },
  { tab: "a11y", section: "Motion", label: "Reduce motion", desc: "Calmer camera and fewer animated effects.", type: "toggle", get: (s) => s.a11y.reduceMotion, set: (s, v) => (s.a11y.reduceMotion = v as boolean) },
  { tab: "a11y", label: "Camera shake", type: "slider", min: 0, max: 1, step: 0.1, format: pct, get: (s) => s.a11y.cameraShake, set: (s, v) => (s.a11y.cameraShake = v as number) },
  { tab: "a11y", label: "Field of view", type: "slider", min: 0.85, max: 1.25, step: 0.05, format: x, get: (s) => s.gameplay.fovScale, set: (s, v) => (s.gameplay.fovScale = v as number) },
  { tab: "a11y", label: "Tutorial hints", type: "toggle", get: (s) => s.a11y.tutorialHints, set: (s, v) => (s.a11y.tutorialHints = v as boolean) },

  // Gameplay
  { tab: "gameplay", section: "Difficulty", label: "Difficulty", type: "select", options: DIFFICULTY_NAMES.map((n, i) => ({ value: String(i), label: n })), get: (s) => String(s.gameplay.difficulty), set: (s, v) => (s.gameplay.difficulty = Number(v) as Settings["gameplay"]["difficulty"]) },
  { tab: "gameplay", label: "Enemy damage", type: "slider", min: 0.25, max: 2, step: 0.05, format: x, get: (s) => s.gameplay.enemyDamageScale, set: (s, v) => (s.gameplay.enemyDamageScale = v as number) },
  { tab: "gameplay", label: "Enemy accuracy", type: "slider", min: 0.25, max: 2, step: 0.05, format: x, get: (s) => s.gameplay.enemyAccuracyScale, set: (s, v) => (s.gameplay.enemyAccuracyScale = v as number) },
  { tab: "gameplay", label: "Player health", desc: "Applies from the next checkpoint.", type: "slider", min: 0.5, max: 3, step: 0.1, format: x, get: (s) => s.gameplay.playerHealthScale, set: (s, v) => (s.gameplay.playerHealthScale = v as number) },
  { tab: "gameplay", label: "Ammo amount", type: "slider", min: 0.5, max: 3, step: 0.1, format: x, get: (s) => s.gameplay.ammoScale, set: (s, v) => (s.gameplay.ammoScale = v as number) },
  { tab: "gameplay", label: "Invulnerable", desc: "You cannot be hurt. For exploring the story.", type: "toggle", get: (s) => s.gameplay.invulnerable, set: (s, v) => (s.gameplay.invulnerable = v as boolean) },
  { tab: "gameplay", section: "Assists", label: "Aim assist", type: "select", options: [{ value: "off", label: "Off" }, { value: "low", label: "Low" }, { value: "high", label: "High (snap to target)" }], get: (s) => s.gameplay.aimAssist, set: (s, v) => (s.gameplay.aimAssist = v as Settings["gameplay"]["aimAssist"]) },
  { tab: "gameplay", label: "Auto-fire on target", type: "toggle", get: (s) => s.gameplay.autoFireOnTarget, set: (s, v) => (s.gameplay.autoFireOnTarget = v as boolean) },
  { tab: "gameplay", label: "Slow-motion aiming", type: "toggle", get: (s) => s.gameplay.slowMoAim, set: (s, v) => (s.gameplay.slowMoAim = v as boolean) },
  { tab: "gameplay", label: "Traversal assist", desc: "Auto-balance on beams, smart ledge jumps, automatic rope swinging.", type: "toggle", get: (s) => s.gameplay.autoTraversal, set: (s, v) => (s.gameplay.autoTraversal = v as boolean) },
  { tab: "gameplay", label: "Auto pick-up", type: "toggle", get: (s) => s.gameplay.autoPickup, set: (s, v) => (s.gameplay.autoPickup = v as boolean) },
  { tab: "gameplay", label: "Offer puzzle skip after", type: "slider", min: 1, max: 6, step: 1, format: (v) => `${v} tries`, get: (s) => s.gameplay.puzzleSkipAfter, set: (s, v) => (s.gameplay.puzzleSkipAfter = v as number) },
  { tab: "gameplay", label: "Camera auto-centre", type: "toggle", get: (s) => s.gameplay.autoRecenter, set: (s, v) => (s.gameplay.autoRecenter = v as boolean) },

  // Controls
  { tab: "controls", section: "Camera", label: "Look sensitivity", type: "slider", min: 0.3, max: 2.5, step: 0.05, format: x, get: (s) => s.controls.lookSensitivity, set: (s, v) => (s.controls.lookSensitivity = v as number) },
  { tab: "controls", label: "Aim sensitivity", type: "slider", min: 0.2, max: 1.5, step: 0.05, format: x, get: (s) => s.controls.aimSensitivity, set: (s, v) => (s.controls.aimSensitivity = v as number) },
  { tab: "controls", label: "Invert vertical look", type: "toggle", get: (s) => s.gameplay.invertY, set: (s, v) => (s.gameplay.invertY = v as boolean) },
  { tab: "controls", label: "Gyro aiming", desc: "Tilt your phone to fine-tune aim while aiming.", type: "toggle", get: (s) => s.controls.gyroAim, set: (s, v) => (s.controls.gyroAim = v as boolean) },
  { tab: "controls", section: "Hold or toggle", label: "Toggle aim", type: "toggle", get: (s) => s.controls.toggleAim, set: (s, v) => (s.controls.toggleAim = v as boolean) },
  { tab: "controls", label: "Toggle sprint", type: "toggle", get: (s) => s.controls.toggleSprint, set: (s, v) => (s.controls.toggleSprint = v as boolean) },
  { tab: "controls", label: "Vibration", type: "toggle", get: (s) => s.controls.vibration, set: (s, v) => (s.controls.vibration = v as boolean) },
  { tab: "controls", section: "Touch screen", label: "Touch layout", type: "select", options: [{ value: "standard", label: "Two thumbs" }, { value: "oneHandedRight", label: "One hand (right)" }, { value: "oneHandedLeft", label: "One hand (left)" }], get: (s) => s.controls.touchLayout, set: (s, v) => (s.controls.touchLayout = v as Settings["controls"]["touchLayout"]) },
  { tab: "controls", label: "Button size", type: "slider", min: 0.7, max: 1.6, step: 0.05, format: x, get: (s) => s.controls.touchScale, set: (s, v) => (s.controls.touchScale = v as number) },
  { tab: "controls", label: "Button opacity", type: "slider", min: 0.15, max: 1, step: 0.05, format: pct, get: (s) => s.controls.touchOpacity, set: (s, v) => (s.controls.touchOpacity = v as number) },

  // Audio
  { tab: "audio", label: "Master volume", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.master, set: (s, v) => (s.audio.master = v as number) },
  { tab: "audio", label: "Music", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.music, set: (s, v) => (s.audio.music = v as number) },
  { tab: "audio", label: "Sound effects", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.sfx, set: (s, v) => (s.audio.sfx = v as number) },
  { tab: "audio", label: "Voice", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.voice, set: (s, v) => (s.audio.voice = v as number) },
  { tab: "audio", label: "Menu sounds", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.ui, set: (s, v) => (s.audio.ui = v as number) },
  { tab: "audio", label: "World sounds", desc: "Wind, sea, insects, the train.", type: "slider", min: 0, max: 1, step: 0.05, format: pct, get: (s) => s.audio.ambience, set: (s, v) => (s.audio.ambience = v as number) },
  { tab: "audio", label: "Mono audio", desc: "Plays everything in both ears.", type: "toggle", get: (s) => s.audio.mono, set: (s, v) => (s.audio.mono = v as boolean) },
  { tab: "audio", label: "Lower music during dialogue", type: "toggle", get: (s) => s.audio.duck, set: (s, v) => (s.audio.duck = v as boolean) },
  { tab: "audio", label: "Night mode", desc: "Evens out loud and quiet sounds so you can play at low volume.", type: "toggle", get: (s) => s.audio.nightMode, set: (s, v) => (s.audio.nightMode = v as boolean) },

  // Video
  { tab: "video", label: "Quality", desc: "Auto picks a level for your device. Applies on next level load.", type: "select", options: [{ value: "auto", label: "Auto" }, { value: "low", label: "Low (best battery)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "ultra", label: "Ultra (desktop)" }], get: (s) => s.video.quality, set: (s, v) => (s.video.quality = v as Settings["video"]["quality"]) },
  { tab: "video", label: "Target frame rate", type: "select", options: [{ value: "30", label: "30 fps (battery saver)" }, { value: "60", label: "60 fps" }], get: (s) => String(s.video.fpsCap), set: (s, v) => (s.video.fpsCap = Number(v) as 30 | 60) },
  { tab: "video", label: "Dynamic resolution", desc: "Lowers resolution briefly to keep the frame rate smooth.", type: "toggle", get: (s) => s.video.dynamicResolution, set: (s, v) => (s.video.dynamicResolution = v as boolean) },
  { tab: "video", label: "Brightness", type: "slider", min: 0.6, max: 1.5, step: 0.05, format: x, get: (s) => s.video.brightness, set: (s, v) => (s.video.brightness = v as number) },
  { tab: "video", label: "Show frame rate", type: "toggle", get: (s) => s.video.showFps, set: (s, v) => (s.video.showFps = v as boolean) },
];

export interface SettingsScreenHooks {
  settings: () => Settings;
  changed: () => void;
  editTouchLayout: () => void;
  listenForKey: (action: ButtonAction, device: "keys" | "pad", done: () => void) => void;
}

export function renderSettingsTab(panel: HTMLElement, tab: Tab, hooks: SettingsScreenHooks): void {
  const s = hooks.settings();
  panel.innerHTML = "";
  if (tab === "a11y") {
    const h = document.createElement("h2");
    h.textContent = "Presets";
    panel.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "preset-grid";
    for (const [key, p] of Object.entries(PRESETS)) {
      const b = document.createElement("button");
      b.innerHTML = `<strong></strong><small></small>`;
      b.querySelector("strong")!.textContent = p.label;
      b.querySelector("small")!.textContent = p.description;
      b.addEventListener("click", () => {
        PRESETS[key as keyof typeof PRESETS].apply(s);
        hooks.changed();
        renderSettingsTab(panel, tab, hooks);
      });
      grid.appendChild(b);
    }
    panel.appendChild(grid);
  }
  for (const o of OPTIONS.filter((x) => x.tab === tab)) {
    if (o.section) {
      const h = document.createElement("h2");
      h.textContent = o.section;
      panel.appendChild(h);
    }
    const row = document.createElement("label");
    row.className = "row";
    const text = document.createElement("span");
    text.textContent = o.label;
    if (o.desc) {
      const d = document.createElement("small");
      d.className = "desc";
      d.textContent = o.desc;
      text.appendChild(d);
    }
    row.appendChild(text);
    const value = o.get(s);
    if (o.type === "toggle") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value as boolean;
      input.setAttribute("aria-label", o.label);
      input.addEventListener("change", () => {
        o.set(s, input.checked);
        hooks.changed();
      });
      row.appendChild(input);
    } else if (o.type === "slider") {
      const wrap = document.createElement("span");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";
      const input = document.createElement("input");
      input.type = "range";
      input.min = String(o.min);
      input.max = String(o.max);
      input.step = String(o.step);
      input.value = String(value);
      input.setAttribute("aria-label", o.label);
      const out = document.createElement("output");
      out.textContent = o.format ? o.format(value as number) : String(value);
      input.addEventListener("input", () => {
        o.set(s, Number(input.value));
        out.textContent = o.format ? o.format(Number(input.value)) : input.value;
        hooks.changed();
      });
      wrap.append(input, out);
      row.appendChild(wrap);
    } else {
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", o.label);
      for (const opt of o.options ?? []) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        sel.appendChild(el);
      }
      sel.value = String(value);
      sel.addEventListener("change", () => {
        o.set(s, sel.value);
        hooks.changed();
      });
      row.appendChild(sel);
    }
    panel.appendChild(row);
  }
  if (tab === "controls") {
    const edit = document.createElement("button");
    edit.textContent = "Move touch buttons";
    edit.addEventListener("click", hooks.editTouchLayout);
    panel.appendChild(edit);
    const h = document.createElement("h2");
    h.textContent = "Button mapping";
    panel.appendChild(h);
    for (const a of BUTTON_ACTIONS) {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("span");
      label.textContent = ACTION_LABELS[a];
      row.appendChild(label);
      for (const dev of ["keys", "pad"] as const) {
        const b = document.createElement("button");
        b.className = "binding";
        const current = dev === "keys" ? s.controls.keys[a].join(" / ") : s.controls.pad[a].map(padName).join(" / ");
        b.textContent = current || "Unbound";
        b.setAttribute("aria-label", `${ACTION_LABELS[a]} ${dev === "keys" ? "keyboard" : "controller"}: ${current}. Press to change.`);
        b.addEventListener("click", () => {
          b.classList.add("listening");
          b.textContent = dev === "keys" ? "Press a key…" : "Press a button…";
          hooks.listenForKey(a, dev, () => renderSettingsTab(panel, tab, hooks));
        });
        row.appendChild(b);
      }
      panel.appendChild(row);
    }
  }
}

const PAD_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "D-up", "D-down", "D-left", "D-right"];
export const padName = (i: number) => PAD_NAMES[i] ?? `B${i}`;
