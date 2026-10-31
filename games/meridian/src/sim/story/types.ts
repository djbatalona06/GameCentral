// Story content is data: each chapter is a level plus a script of "when X happens, do Y".

import type { V3 } from "../math";
import type { LevelData } from "../world/types";
import type { WeaponId } from "../combat/weapons";
import type { ButtonAction } from "../../input/actions";

export type Speaker = "Ines" | "Bram" | "Varek" | "Kessa" | "Gilt Radio" | "Mercenary" | "Narrator";

export interface Line {
  speaker: Speaker;
  text: string;
  /** Seconds on screen; defaults to a reading-speed estimate. */
  duration?: number;
}

export interface CameraShot {
  from: V3;
  to: V3;
  /** Point the camera looks at. */
  target: V3;
  duration: number;
}

export type MusicMood = "none" | "explore" | "tension" | "combat" | "wonder";

export type Action =
  | { type: "dialogue"; lines: Line[] }
  | { type: "objective"; text: string; target?: V3 }
  | { type: "spawn"; wave: string }
  | { type: "remove"; group: string; delay?: number }
  | { type: "reveal"; group: string }
  | { type: "revealInteract"; id: string }
  | { type: "journal"; id: string }
  | { type: "cutscene"; shots: CameraShot[]; lines?: Line[] }
  | { type: "emit"; event: string; delay: number }
  | { type: "tutorial"; text: string; action?: ButtonAction }
  | { type: "music"; mood: MusicMood }
  | { type: "shake"; amount: number }
  | { type: "give"; weapon?: WeaponId; ammo?: number; grenades?: number; bottles?: number }
  | { type: "stealth"; active: boolean }
  | { type: "checkpoint"; id: string }
  | { type: "complete" };

/** Actions that change the world and must be replayed when restoring a checkpoint. */
export const WORLD_ACTIONS: Action["type"][] = ["remove", "reveal", "revealInteract", "objective", "spawn", "give", "music"];

export type PuzzleDef =
  | { id: string; type: "pillars"; pillars: string[]; solution: number[]; initial: number[]; onSolve: string; hint: string }
  | { id: string; type: "sequence"; levers: string[]; order: string[]; onSolve: string; hint: string }
  | { id: string; type: "plates"; plates: Array<{ min: V3; max: V3 }>; onSolve: string; hint: string };

export interface JournalEntry {
  id: string;
  title: string;
  text: string;
  /** Simple sketch rendered as SVG in the journal (lines in a 100x100 box). */
  sketch?: Array<[number, number, number, number]>;
}

export interface Loadout {
  sidearm: WeaponId | null;
  long: WeaponId | null;
  sidearmAmmo?: number;
  longAmmo?: number;
  grenades: number;
  bottles: number;
}

export interface ChapterScript {
  startLoadout: Loadout;
  onStart: Action[];
  events: Record<string, Action[]>;
  puzzles: PuzzleDef[];
  journal: JournalEntry[];
  /** Medal goals shown on the results screen. */
  parTimeMinutes: number;
}

export interface ChapterDef {
  id: string;
  number: number;
  title: string;
  location: string;
  synopsis: string;
  /** Rough minutes for a first playthrough including exploration. */
  estMinutes: number;
  playable: boolean;
  build?: () => LevelData;
  script?: ChapterScript;
}
