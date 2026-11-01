// Story content is data: each chapter is a level plus a script of "when X happens, do Y".

import type { V3 } from "../math";
import type { LevelData } from "../world/types";
import type { WeaponId } from "../combat/weapons";
import type { ButtonAction } from "../../input/actions";
import type { Condition } from "./Conditions";
import type { CharacterId, Effects } from "./State";

export type Speaker = "Ines" | "Bram" | "Varek" | "Kessa" | "Catalina" | "Vendor" | "Caravaneer" | "Gilt Radio" | "Mercenary" | "Narrator";

export interface Line {
  speaker: Speaker;
  text: string;
  /** Seconds on screen; defaults to a reading-speed estimate. */
  duration?: number;
  /** Only said when this is true (so earlier choices and playstyle are acknowledged). */
  if?: Condition;
}

export interface ChoiceOption {
  id: string;
  /** What the button says. Keep it short; it is also read aloud. */
  label: string;
  /** One quiet line under the label, e.g. "Bram will remember this". */
  hint?: string;
  /** The option is hidden unless this is true. */
  requires?: Condition;
  /** Applied once when picked. */
  effects?: Effects;
}

/**
 * A question put to the player. Picking an option applies its `effects`, remembers the answer and then
 * raises the story event `"<id>:<option id>"`, so the script's `events` decide what the world does next.
 */
export interface ChoiceDef {
  id: string;
  prompt: string;
  /** Who is asking (shown above the prompt). */
  speaker?: Speaker;
  options: ChoiceOption[];
  /** Used when the player runs out of time (only if "Timed choices" is on) and when a chapter is replayed. */
  defaultOption: string;
  /** Seconds to answer. Ignored unless the player turned timed choices on. */
  timeoutSec?: number;
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
  | { type: "mover"; id: string; active: boolean }
  | { type: "hazard"; id: string; active: boolean }
  | { type: "weather"; id: string; active: boolean }
  | { type: "searchlight"; id: string; active: boolean }
  /** Puts the player in a vehicle on the given track (Ch4 chase). */
  | { type: "vehicle"; track: string }
  /** Brings in the enemy jeeps of a group. */
  | { type: "pursuit"; group: string }
  /** Asks the player something. The game waits for dialogue to finish and for any fight to end first. */
  | ({ type: "choice" } & ChoiceDef)
  /** Runs `then` or `otherwise` depending on the story so far. */
  | { type: "branch"; if: Condition; then: Action[]; otherwise?: Action[] }
  | { type: "set"; flag: string }
  | { type: "rel"; who: CharacterId; delta: number }
  | { type: "stance"; delta: number }
  | { type: "complete" };

/**
 * Actions that change the world and must be replayed when restoring a checkpoint.
 * Hazards are left out on purpose: a sweep (a tunnel, an avalanche) is a moment, not a state,
 * and replaying it would start it again on top of the player.
 */
export const WORLD_ACTIONS: Action["type"][] = ["remove", "reveal", "revealInteract", "objective", "spawn", "give", "music", "mover", "weather", "searchlight", "branch"];

export type PuzzleDef =
  | { id: string; type: "pillars"; pillars: string[]; solution: number[]; initial: number[]; onSolve: string; hint: string }
  | { id: string; type: "sequence"; levers: string[]; order: string[]; onSolve: string; hint: string }
  | { id: string; type: "plates"; plates: Array<{ min: V3; max: V3 }>; onSolve: string; hint: string }
  /**
   * Ring bells in the right order. `order` lists bell indexes (0 = lowest note). `listen` is an
   * interact that plays the tune again; every note is shown on screen as well as heard.
   */
  | { id: string; type: "bells"; bells: string[]; order: number[]; listen: string; onSolve: string; hint: string };

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
  /** Quiet talks offered after the chapter (at most three are shown). */
  downtime?: DowntimeTalk[];
  /** Medal goals shown on the results screen. */
  parTimeMinutes: number;
}

/** Every chapter follows the same shape, so a writer always knows where a character moment goes. */
export interface ChapterBeats {
  hook: string;
  rising: string;
  setPiece: string;
  choice: string;
  fallout: string;
}

/** A short talk after a chapter. The player picks one; skipping is always allowed. */
export interface DowntimeTalk {
  id: string;
  /** Button text, e.g. "Sit with Bram". */
  label: string;
  /** Only offered when true. */
  requires?: Condition;
  lines: Line[];
  effects?: Effects;
}

export interface ChapterDef {
  id: string;
  number: number;
  title: string;
  location: string;
  synopsis: string;
  /** Rough minutes for a first playthrough including exploration. */
  estMinutes: number;
  /** The five story beats of the chapter (see docs/story/outline.md). */
  beats?: ChapterBeats;
  /** Design notes for chapters that are not built yet: where the story can branch. */
  branchNotes?: string;
  playable: boolean;
  build?: () => LevelData;
  script?: ChapterScript;
}
