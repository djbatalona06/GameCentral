// Player settings: gameplay assists, controls, accessibility, audio and video.
// Stored separately from save files so they apply to every slot.

import { DEFAULT_KEYS, DEFAULT_PAD, type ButtonAction } from "../input/actions";
import { defaultGameplay, type GameplayOptions } from "../sim/GameSim";
import type { KeyValueStore } from "../save/storage";

export type ColorblindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";
export type TouchLayout = "standard" | "oneHandedRight" | "oneHandedLeft";
export type SubtitleSize = "small" | "medium" | "large" | "xl";
export type Quality = "auto" | "low" | "medium" | "high";
export type Orientation = "landscape" | "portrait";
export type TouchPositions = Record<string, { x: number; y: number }>;

export interface Settings {
  version: 2;
  firstRunDone: boolean;
  gameplay: GameplayOptions;
  controls: {
    keys: Record<ButtonAction, string[]>;
    pad: Record<ButtonAction, number[]>;
    toggleAim: boolean;
    toggleSprint: boolean;
    toggleCrouch: boolean;
    lookSensitivity: number;
    aimSensitivity: number;
    gyroAim: boolean;
    vibration: boolean;
    touchLayout: TouchLayout;
    touchScale: number;
    touchOpacity: number;
    /** Custom button positions from the layout editor, kept separately for each orientation. */
    touchPositions: Record<Orientation, TouchPositions>;
  };
  a11y: {
    subtitles: boolean;
    subtitleSize: SubtitleSize;
    subtitleBackground: number;
    speakerNames: boolean;
    speakerColors: boolean;
    colorblind: ColorblindMode;
    colorblindStrength: number;
    highContrast: boolean;
    textScale: number;
    reduceMotion: boolean;
    cameraShake: number;
    menuNarration: boolean;
    voiceLines: boolean;
    soundIndicators: boolean;
    threatIndicators: boolean;
    tutorialHints: boolean;
    largeReticle: boolean;
  };
  audio: { master: number; music: number; sfx: number; voice: number; ui: number; mono: boolean };
  video: { quality: Quality; fpsCap: 30 | 60; dynamicResolution: boolean; showFps: boolean; brightness: number };
}

export const defaultSettings = (): Settings => ({
  version: 2,
  firstRunDone: false,
  gameplay: defaultGameplay(),
  controls: {
    keys: structuredClone(DEFAULT_KEYS),
    pad: structuredClone(DEFAULT_PAD),
    toggleAim: false,
    toggleSprint: true,
    toggleCrouch: true,
    lookSensitivity: 1,
    aimSensitivity: 0.7,
    gyroAim: false,
    vibration: true,
    touchLayout: "standard",
    touchScale: 1,
    touchOpacity: 0.55,
    touchPositions: { landscape: {}, portrait: {} },
  },
  a11y: {
    subtitles: true,
    subtitleSize: "medium",
    subtitleBackground: 0.6,
    speakerNames: true,
    speakerColors: true,
    colorblind: "none",
    colorblindStrength: 1,
    highContrast: false,
    textScale: 1,
    reduceMotion: false,
    cameraShake: 1,
    menuNarration: false,
    voiceLines: false,
    soundIndicators: false,
    threatIndicators: true,
    tutorialHints: true,
    largeReticle: false,
  },
  audio: { master: 0.8, music: 0.6, sfx: 0.9, voice: 1, ui: 0.7, mono: false },
  video: { quality: "auto", fpsCap: 60, dynamicResolution: true, showFps: false, brightness: 1 },
});

/** One-tap starting points for players with different needs; every option can still be changed. */
export const PRESETS: Record<"vision" | "hearing" | "motor", { label: string; description: string; apply: (s: Settings) => void }> = {
  vision: {
    label: "Vision",
    description: "High contrast, large text and subtitles, menu narration, strong aim assist and a large reticle.",
    apply: (s) => {
      s.a11y.highContrast = true;
      s.a11y.textScale = 1.35;
      s.a11y.subtitleSize = "xl";
      s.a11y.subtitleBackground = 0.9;
      s.a11y.menuNarration = true;
      s.a11y.voiceLines = true;
      s.a11y.largeReticle = true;
      s.a11y.threatIndicators = true;
      s.gameplay.aimAssist = "high";
      s.gameplay.autoTraversal = true;
    },
  },
  hearing: {
    label: "Hearing",
    description: "Subtitles with speaker names and colours, on-screen sound indicators, threat arrows and stronger vibration cues.",
    apply: (s) => {
      s.a11y.subtitles = true;
      s.a11y.speakerNames = true;
      s.a11y.speakerColors = true;
      s.a11y.subtitleBackground = 0.8;
      s.a11y.soundIndicators = true;
      s.a11y.threatIndicators = true;
      s.controls.vibration = true;
    },
  },
  motor: {
    label: "Motor",
    description: "Toggle instead of hold, traversal and pickup assists, high aim assist with auto-fire, slow-motion aiming and early puzzle skip.",
    apply: (s) => {
      s.controls.toggleAim = true;
      s.controls.toggleSprint = true;
      s.controls.toggleCrouch = true;
      s.gameplay.autoTraversal = true;
      s.gameplay.autoPickup = true;
      s.gameplay.aimAssist = "high";
      s.gameplay.autoFireOnTarget = true;
      s.gameplay.slowMoAim = true;
      s.gameplay.puzzleSkipAfter = 1;
    },
  },
};

/** Fills in any settings added in newer versions so old saved settings keep working. */
function mergeDefaults<T>(base: T, saved: unknown): T {
  if (saved === null || typeof saved !== "object" || Array.isArray(base)) return (saved ?? base) as T;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = b !== null && typeof b === "object" && !Array.isArray(b) ? mergeDefaults(b, v) : v;
  }
  return out as T;
}

/** Upgrades settings saved by older versions. v1 had one set of touch positions (landscape only). */
export function migrateSettings(saved: unknown): unknown {
  const s = structuredClone(saved) as { version?: number; controls?: { touchPositions?: Record<string, unknown> } };
  if ((s.version ?? 1) < 2) {
    const old = s.controls?.touchPositions;
    if (s.controls) s.controls.touchPositions = { landscape: old && !("landscape" in old) ? old : {}, portrait: {} };
    s.version = 2;
  }
  return s;
}

export class SettingsStore {
  current: Settings = defaultSettings();
  private listeners: Array<(s: Settings) => void> = [];

  constructor(private store: KeyValueStore) {}

  async load(): Promise<Settings> {
    const saved = await this.store.get<unknown>("settings");
    this.current = saved ? mergeDefaults(defaultSettings(), migrateSettings(saved)) : defaultSettings();
    return this.current;
  }

  async save(): Promise<void> {
    await this.store.set("settings", this.current);
    for (const l of this.listeners) l(this.current);
  }

  onChange(fn: (s: Settings) => void): void {
    this.listeners.push(fn);
  }

  async reset(): Promise<void> {
    const firstRun = this.current.firstRunDone;
    this.current = defaultSettings();
    this.current.firstRunDone = firstRun;
    await this.save();
  }
}
