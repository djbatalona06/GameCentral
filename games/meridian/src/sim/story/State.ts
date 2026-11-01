// What the story remembers about the player. Small, plain data so it saves and loads easily.
// Nothing in here knows about rendering or the level: it is just numbers, flags and answers.

import type { ChapterStats } from "../GameSim";

/** Characters whose feelings about Ines are tracked. (Varek and Catalina react, but do not keep a score.) */
export type CharacterId = "bram" | "kessa";
export const CHARACTER_IDS: CharacterId[] = ["bram", "kessa"];

/** How the player handled a chapter, read from its stats. Characters comment on it. */
export type PlayStyle = "ghost" | "brawler" | "mixed";

export interface StoryState {
  /** Things that happened ("qasr.helped_vendor"). */
  flags: Record<string, true>;
  /** 0..10 for each tracked character (Bram: trust, Kessa: respect). */
  rel: Record<CharacterId, number>;
  /** Keeper (negative) to Seeker (positive), -5..5. Decides which ending Ines can reach. */
  stance: number;
  /** Every choice made so far: choice id -> option id. */
  choices: Record<string, string>;
  /** How the last finished chapter was played. */
  style: PlayStyle;
}

/** Changes a choice can make. Applied once, when the player chooses. */
export interface Effects {
  rel?: Partial<Record<CharacterId, number>>;
  stance?: number;
  set?: string[];
}

export const REL_MIN = 0;
export const REL_MAX = 10;
export const STANCE_MIN = -5;
export const STANCE_MAX = 5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function newStoryState(): StoryState {
  return { flags: {}, rel: { bram: 4, kessa: 0 }, stance: 2, choices: {}, style: "mixed" };
}

/** Returns a new state; the old one is never changed. */
export function applyEffects(s: StoryState, fx: Effects | undefined): StoryState {
  if (!fx) return s;
  const next: StoryState = { ...s, flags: { ...s.flags }, rel: { ...s.rel }, choices: { ...s.choices } };
  for (const id of CHARACTER_IDS) {
    const d = fx.rel?.[id];
    if (d) next.rel[id] = clamp(next.rel[id] + d, REL_MIN, REL_MAX);
  }
  if (fx.stance) next.stance = clamp(next.stance + fx.stance, STANCE_MIN, STANCE_MAX);
  for (const f of fx.set ?? []) next.flags[f] = true;
  return next;
}

export const recordChoice = (s: StoryState, choiceId: string, optionId: string): StoryState => ({ ...s, choices: { ...s.choices, [choiceId]: optionId } });

/** Ghost: never spotted. Brawler: five or more gun kills. Everything else is mixed. */
export function styleOf(stats: ChapterStats): PlayStyle {
  if (stats.kills - stats.takedowns >= 5) return "brawler";
  if (stats.alerts === 0 && !stats.stealthBroken) return "ghost";
  return "mixed";
}

/** Chapters shorter than this many seconds are too short to judge; the previous style is kept. */
export const STYLE_MIN_SECONDS = 90;

/** Copy that is safe to save or compare (a JSON round trip drops anything odd). */
export const cloneStory = (s: StoryState): StoryState => ({
  flags: { ...s.flags },
  rel: { ...s.rel },
  stance: s.stance,
  choices: { ...s.choices },
  style: s.style,
});

/** Fills in anything a saved copy is missing, so older or hand-edited saves never crash the game. */
export function normaliseStory(raw: Partial<StoryState> | undefined | null): StoryState {
  const base = newStoryState();
  if (!raw || typeof raw !== "object") return base;
  const rel = { ...base.rel };
  for (const id of CHARACTER_IDS) {
    const v = raw.rel?.[id];
    if (typeof v === "number" && Number.isFinite(v)) rel[id] = clamp(v, REL_MIN, REL_MAX);
  }
  return {
    flags: raw.flags && typeof raw.flags === "object" ? { ...raw.flags } : {},
    rel,
    stance: typeof raw.stance === "number" && Number.isFinite(raw.stance) ? clamp(raw.stance, STANCE_MIN, STANCE_MAX) : base.stance,
    choices: raw.choices && typeof raw.choices === "object" ? { ...raw.choices } : {},
    style: raw.style === "ghost" || raw.style === "brawler" || raw.style === "mixed" ? raw.style : base.style,
  };
}
