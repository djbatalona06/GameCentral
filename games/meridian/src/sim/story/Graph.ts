// Reads a chapter script as data (without playing it). Tests use this to prove that every choice
// has a way forward, and the game uses it to find a choice by id when a checkpoint is restored.

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
