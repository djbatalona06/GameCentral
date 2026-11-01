// Reads a chapter script as data (without playing it). Tests use this to prove that every choice
// has a way forward, and the game uses it to find a choice by id when a checkpoint is restored.

import type { Condition } from "./Conditions";
import { CHARACTER_IDS, type CharacterId } from "./State";
import type { Action, ChapterScript, ChoiceDef, Line } from "./types";

/** Every action in a list, including the ones hidden inside branches. */
export function* walkActions(actions: Action[]): Generator<Action> {
  for (const a of actions) {
    yield a;
    if (a.type === "branch") {
      yield* walkActions(a.then);
      if (a.otherwise) yield* walkActions(a.otherwise);
    }
  }
}

/** All the action lists a chapter owns: the start script plus every event. */
export function allActionLists(script: ChapterScript): Action[][] {
  return [script.onStart, ...Object.values(script.events)];
}

export function collectChoices(script: ChapterScript): ChoiceDef[] {
  const out: ChoiceDef[] = [];
  for (const list of allActionLists(script)) for (const a of walkActions(list)) if (a.type === "choice") out.push(a);
  return out;
}

export function collectLines(script: ChapterScript): Line[] {
  const out: Line[] = [];
  for (const list of allActionLists(script)) {
    for (const a of walkActions(list)) {
      if (a.type === "dialogue") out.push(...a.lines);
      if (a.type === "cutscene" && a.lines) out.push(...a.lines);
    }
  }
  for (const t of script.downtime ?? []) out.push(...t.lines);
  return out;
}

/** The name of the event raised when the player picks an option. */
export const choiceEvent = (choiceId: string, optionId: string): string => `${choiceId}:${optionId}`;

/** Every "only if" rule in a chapter: on lines, branches, choice options and quiet talks. */
export function collectConditions(script: ChapterScript): Condition[] {
  const out: Condition[] = [];
  const lines = (ls: Line[]) => ls.forEach((l) => l.if && out.push(l.if));
  for (const list of allActionLists(script)) {
    for (const a of walkActions(list)) {
      if (a.type === "branch") out.push(a.if);
      if (a.type === "dialogue") lines(a.lines);
      if (a.type === "cutscene" && a.lines) lines(a.lines);
      if (a.type === "choice") a.options.forEach((o) => o.requires && out.push(o.requires));
    }
  }
  for (const t of script.downtime ?? []) {
    if (t.requires) out.push(t.requires);
    lines(t.lines);
  }
  return out;
}

/** Everything a chapter can change in the story: flags it sets and the best and worst relationship gains. */
export function collectEffects(script: ChapterScript): { flags: Set<string>; best: Record<CharacterId, number>; worst: Record<CharacterId, number> } {
  const flags = new Set<string>();
  const best: Record<CharacterId, number> = { bram: 0, kessa: 0 };
  const worst: Record<CharacterId, number> = { bram: 0, kessa: 0 };
  for (const list of allActionLists(script)) {
    for (const a of walkActions(list)) {
      if (a.type === "set") flags.add(a.flag);
      if (a.type === "choice") {
        a.options.forEach((o) => o.effects?.set?.forEach((f) => flags.add(f)));
        for (const id of CHARACTER_IDS) {
          const deltas = a.options.map((o) => o.effects?.rel?.[id] ?? 0);
          best[id] += Math.max(...deltas);
          worst[id] += Math.min(...deltas);
        }
      }
    }
  }
  // A player can take one talk per chapter, so count the biggest one.
  const talks = script.downtime ?? [];
  for (const t of talks) t.effects?.set?.forEach((f) => flags.add(f));
  for (const id of CHARACTER_IDS) {
    best[id] += Math.max(0, ...talks.map((t) => t.effects?.rel?.[id] ?? 0));
    worst[id] += Math.min(0, ...talks.map((t) => t.effects?.rel?.[id] ?? 0));
  }
  return { flags, best, worst };
}
