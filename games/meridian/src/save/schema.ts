// Save file format. Every save carries a version number; older saves are upgraded by
// migrations.ts so players never lose progress when the game updates.

import type { ChapterStats, Difficulty, Snapshot } from "../sim/GameSim";

export const SAVE_VERSION = 2;
export const SLOT_COUNT = 3;
export const AUTOSAVE_SLOT = 99;

export interface ChapterProgress {
  completed: boolean;
  bestTimeSec?: number;
  treasures: string[];
  medals: string[];
  lastStats?: ChapterStats;
}

export interface SaveFile {
  version: typeof SAVE_VERSION;
  slot: number;
  createdAt: string;
  updatedAt: string;
  playtimeSec: number;
  difficulty: Difficulty;
  currentChapter: string;
  /** Mid-chapter checkpoint (null between chapters). */
  snapshot: Snapshot | null;
  chapters: Record<string, ChapterProgress>;
  journal: string[];
  unlocks: string[];
  newGamePlus: boolean;
}

/** The very first save format, kept so migration can be tested. */
export interface SaveFileV1 {
  version: 1;
  slot: number;
  chapter: string;
  checkpoint: string;
  time: number;
  treasures: string[];
  savedAt: number;
}

export function newSave(slot: number, difficulty: Difficulty, now = new Date()): SaveFile {
  return {
    version: SAVE_VERSION,
    slot,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    playtimeSec: 0,
    difficulty,
    currentChapter: "ch01",
    snapshot: null,
    chapters: {},
    journal: [],
    unlocks: [],
    newGamePlus: false,
  };
}

/** Light structural validation for imported saves (they come from outside the game). */
export function isSaveFile(x: unknown): x is SaveFile {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    s.version === SAVE_VERSION &&
    typeof s.slot === "number" &&
    typeof s.playtimeSec === "number" &&
    typeof s.currentChapter === "string" &&
    typeof s.chapters === "object" &&
    s.chapters !== null &&
    Array.isArray(s.journal) &&
    Array.isArray(s.unlocks)
  );
}
