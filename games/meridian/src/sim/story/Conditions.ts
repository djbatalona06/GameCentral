// "Only if..." rules for story content: used on dialogue lines, choice options and branches.

import type { ChapterStats } from "../GameSim";
import { STYLE_MIN_SECONDS, styleOf, type CharacterId, type PlayStyle, type StoryState } from "./State";

export type Condition =
  | { flag: string }
  /** `min` and `max` are both inclusive; give either or both. */
  | { rel: CharacterId; min?: number; max?: number }
  | { stance: "keeper" | "seeker" }
  /** The player picked this option earlier. */
  | { chose: string; option: string }
  /** How the player is playing right now (or played last chapter, if this one is just starting). */
  | { style: PlayStyle }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface ConditionContext {
  story: StoryState;
  stats: ChapterStats;
}

export function evaluate(c: Condition, ctx: ConditionContext): boolean {
  if ("flag" in c) return ctx.story.flags[c.flag] === true;
  if ("rel" in c) {
    const v = ctx.story.rel[c.rel];
    return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);
  }
  if ("stance" in c) return c.stance === "keeper" ? ctx.story.stance < 0 : ctx.story.stance > 0;
  if ("chose" in c) return ctx.story.choices[c.chose] === c.option;
  if ("style" in c) return currentStyle(ctx) === c.style;
  if ("all" in c) return c.all.every((x) => evaluate(x, ctx));
  if ("any" in c) return c.any.some((x) => evaluate(x, ctx));
  return !evaluate(c.not, ctx);
}

/** Judge the chapter in progress once there is enough of it to judge; until then use the last one. */
export function currentStyle(ctx: ConditionContext): PlayStyle {
  return ctx.stats.time >= STYLE_MIN_SECONDS ? styleOf(ctx.stats) : ctx.story.style;
}

/** Every flag, choice id and relationship a condition looks at. Tests use this to find rules nothing can satisfy. */
export function conditionReads(c: Condition, out: { flags: Set<string>; choices: Set<string> } = { flags: new Set(), choices: new Set() }) {
  if ("flag" in c) out.flags.add(c.flag);
  else if ("chose" in c) out.choices.add(c.chose);
  else if ("all" in c) c.all.forEach((x) => conditionReads(x, out));
  else if ("any" in c) c.any.forEach((x) => conditionReads(x, out));
  else if ("not" in c) conditionReads(c.not, out);
  return out;
}
