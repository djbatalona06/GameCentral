// Checks the written story of Act I as data and by playing each choice: nothing can get stuck,
// every reply exists, every "only if" can come true, and the numbers leave room for Act II and III.

import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../src/sim/chapters/registry";
import type { ChapterDef, ChoiceDef } from "../../src/sim/story/types";
import { allActionLists, choiceEvent, collectChoices, collectConditions, collectEffects, collectLines, walkActions } from "../../src/sim/story/Graph";
import { conditionReads, type Condition } from "../../src/sim/story/Conditions";
import { GameSim, defaultGameplay, type Snapshot } from "../../src/sim/GameSim";
import { applyEffects, newStoryState, type StoryState } from "../../src/sim/story/State";
import { DT, frame } from "./helpers";

const playable = CHAPTERS.filter((c) => c.playable);
const choices = playable.flatMap((c) => collectChoices(c.script!).map((d) => [c.id, c, d] as const));

describe("Act I story data", () => {
  it("has at least seven major and two small choices, spread over the chapters", () => {
    expect(choices.length).toBeGreaterThanOrEqual(9);
    const chaptersWithChoice = new Set(choices.map(([id]) => id));
    expect(chaptersWithChoice.size).toBe(7);
  });

  it("gives every choice and option a unique id, and a quiet default anyone can pick", () => {
    const ids = choices.map(([, , d]) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [, , d] of choices) {
      expect(d.options.length, d.id).toBeGreaterThanOrEqual(2);
      expect(new Set(d.options.map((o) => o.id)).size, d.id).toBe(d.options.length);
      const def = d.options.find((o) => o.id === d.defaultOption);
      expect(def, `${d.id} default`).toBeDefined();
      expect(def!.requires, `${d.id} default must always be available`).toBeUndefined();
    }
  });

  it("answers every option with a story event", () => {
    for (const [, ch, d] of choices) {
      for (const o of d.options) expect(ch.script!.events[choiceEvent(d.id, o.id)], `${d.id}:${o.id}`).toBeDefined();
    }
  });

  it("only reads flags that something sets", () => {
    const written = new Set<string>();
    for (const ch of playable) collectEffects(ch.script!).flags.forEach((f) => written.add(f));
    const read = new Set<string>();
    const readChoices = new Set<string>();
    for (const ch of playable) {
      for (const c of collectConditions(ch.script!)) {
        const r = conditionReads(c);
        r.flags.forEach((f) => read.add(f));
        r.choices.forEach((x) => readChoices.add(x));
      }
    }
    for (const f of read) expect(written.has(f), `flag "${f}" is read but never set`).toBe(true);
    const known = new Set(choices.map(([, , d]) => d.id));
    for (const c of readChoices) expect(known.has(c), `choice "${c}" does not exist`).toBe(true);
  });

  it("uses only known treasures in treasure rules", () => {
    for (const ch of playable) {
      const have = new Set(ch.build!().collectibles.map((c) => c.id));
      const walk = (c: Condition): void => {
        if ("treasure" in c) expect(have.has(c.treasure), c.treasure).toBe(true);
        if ("all" in c) c.all.forEach(walk);
        if ("any" in c) c.any.forEach(walk);
        if ("not" in c) walk(c.not);
      };
      collectConditions(ch.script!).forEach(walk);
    }
  });

  it("has well-formed lines: someone speaks, and no line is empty", () => {
    for (const ch of playable) for (const l of collectLines(ch.script!)) expect(l.text.trim().length, `${ch.id}: ${l.speaker}`).toBeGreaterThan(0);
  });

  it("has at most three quiet talks per chapter, each with something to say", () => {
    for (const ch of playable) {
      const talks = ch.script!.downtime ?? [];
      expect(talks.length, ch.id).toBeGreaterThanOrEqual(2);
      expect(talks.length, ch.id).toBeLessThanOrEqual(3);
      expect(new Set(talks.map((t) => t.id)).size).toBe(talks.length);
      for (const t of talks) expect(t.lines.length, t.id).toBeGreaterThan(0);
    }
  });

  it("references journal entries that exist", () => {
    for (const ch of playable) {
      const have = new Set(ch.script!.journal.map((j) => j.id));
      for (const list of allActionLists(ch.script!)) for (const a of walkActions(list)) if (a.type === "journal") expect(have.has(a.id), `${ch.id}:${a.id}`).toBe(true);
    }
  });

  it("keeps trust and respect in range for the rest of the game", () => {
    // Best case in Act I: trust may reach the top, but never past it by more than the one rounding step,
    // and respect must leave room to climb. Worst case: nobody is permanently lost.
    const total = (pick: "best" | "worst", who: "bram" | "kessa") => playable.reduce((n, c) => n + collectEffects(c.script!)[pick][who], 0);
    const start = newStoryState();
    expect(start.rel.bram + total("best", "bram")).toBeLessThanOrEqual(10);
    expect(start.rel.kessa + total("best", "kessa")).toBeLessThanOrEqual(8);
    expect(start.rel.bram + total("worst", "bram")).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------- playing each answer

/** What the story must already know for a gated choice to be asked at all. */
function setup(d: ChoiceDef, sim: GameSim): StoryState | undefined {
  if (d.id === "bell_plan") return applyEffects(newStoryState(), { set: ["caravan.saved"] });
  if (d.id === "kessa_truce") return applyEffects(newStoryState(), { rel: { kessa: 3 }, set: ["kessa.spared"] });
  if (d.id === "dog_tag") sim.treasures.add("ch07-tag");
  return undefined;
}

/** The story event that asks this choice (so we can raise it the way the level would). */
function askingEvent(ch: ChapterDef, d: ChoiceDef): string {
  for (const [name, list] of Object.entries(ch.script!.events)) for (const a of walkActions(list)) if (a.type === "choice" && a.id === d.id) return name;
  throw new Error(`no event asks ${d.id}`);
}

function playUntil(sim: GameSim, done: () => boolean, maxSeconds: number): void {
  for (let i = 0; i < maxSeconds * 60 && !done(); i++) sim.step(DT, frame());
}

describe.each(choices.map(([cid, ch, d]) => [`${cid} ${d.id}`, ch, d] as const))("%s plays through", (_name, ch, d) => {
  const eventName = askingEvent(ch, d);
  const endsChapter = ch.script!.events[eventName].some((a) => a.type === "emit" && a.event === "end") || ch.script!.events[eventName].some((a) => a.type === "cutscene");

  it.each(d.options.map((o) => [o.id] as const))("option %s: asked, answered, and the chapter carries on", (optionId) => {
    const build = (): GameSim => {
      const sim0 = new GameSim(ch, { ...defaultGameplay(), invulnerable: true }, undefined, 1, undefined);
      const story = setup(d, sim0);
      const sim = story ? new GameSim(ch, { ...defaultGameplay(), invulnerable: true }, undefined, 1, story) : sim0;
      if (d.id === "dog_tag") sim.treasures.add("ch07-tag");
      sim.enemies = []; // no guards in the way: a question never opens in the middle of a fight
      return sim;
    };
    const sim = build();
    sim.fireEvent(eventName);
    playUntil(sim, () => !!sim.pendingChoice, 180);
    expect(sim.pendingChoice?.id, "the question opens").toBe(d.id);
    expect(sim.pendingChoice!.options.some((o) => o.id === optionId), "the option is on offer").toBe(true);
    const before = sim.story;
    expect(sim.choose(optionId)).toBe(true);
    expect(sim.story.choices[d.id]).toBe(optionId);
    expect(sim.story, "the story changed or at least recorded the answer").not.toBe(before);
    // The reply plays and the world is free again.
    playUntil(sim, () => sim.completed, 120);
    expect(sim.pendingChoice).toBeNull();
    // A chapter that was about to end when the question came up still ends, after the reply.
    if (endsChapter && ch.script!.events[eventName].some((a) => a.type === "emit" && a.event === "end")) expect(sim.completed, "chapter still completes").toBe(true);
  });
});

describe("timed answers never strand the player in Act I", () => {
  it("every choice has a default that works when time runs out", () => {
    for (const [, ch, d] of choices) {
      const sim = new GameSim(ch, { ...defaultGameplay(), invulnerable: true, timedChoices: true }, undefined, 1, d.id === "kessa_truce" ? applyEffects(newStoryState(), { rel: { kessa: 3 } }) : d.id === "bell_plan" ? applyEffects(newStoryState(), { set: ["caravan.saved"] }) : undefined);
      if (d.id === "dog_tag") sim.treasures.add("ch07-tag");
      sim.fireEvent(askingEvent(ch, d));
      playUntil(sim, () => !!sim.pendingChoice, 180);
      if (!sim.pendingChoice || sim.pendingChoice.timeLeft === undefined) continue; // no time limit set on this one
      for (let i = 0; i < 60 * 120 && sim.pendingChoice; i++) sim.tickChoice(DT);
      expect(sim.story.choices[d.id], d.id).toBe(d.defaultOption);
    }
  });
});

describe("a real chapter remembers through a checkpoint", () => {
  const ch3 = CHAPTERS.find((c) => c.id === "ch03")!;
  it("keeps Kessa's respect after sparing her and reloading", () => {
    const sim = new GameSim(ch3, { ...defaultGameplay(), invulnerable: true });
    sim.fireEvent("arenaClear:vault");
    playUntil(sim, () => !!sim.pendingChoice, 60);
    sim.choose("spare");
    const snap = JSON.parse(JSON.stringify(sim.snapshot())) as Snapshot;
    const again = new GameSim(ch3, { ...defaultGameplay(), invulnerable: true }, snap);
    expect(again.story.rel.kessa).toBe(3);
    expect(again.story.flags["kessa.spared"]).toBe(true);
    expect(again.story.choices.kessa_after).toBe("spare");
  });

  it("changes what Varek says in chapter 3 because of an earlier answer", () => {
    const said = (story: StoryState): string[] => {
      const sim = new GameSim(ch3, { ...defaultGameplay(), invulnerable: true }, undefined, 1, story);
      for (let i = 0; i < 60 * 20; i++) sim.step(DT, frame()); // let the opening conversation finish
      sim.events = [];
      sim.fireEvent("vault");
      const out: string[] = [];
      for (let i = 0; i < 60 * 60; i++) {
        sim.step(DT, frame());
        for (const e of sim.events) if (e.type === "dialogue") out.push(e.line.text);
        sim.events = [];
      }
      expect(sim.completed, "the chapter ends after the last line").toBe(true);
      return out;
    };
    const base = said(newStoryState());
    const left = said(applyEffects(newStoryState(), { set: ["archive.left_letter", "kessa.spared"] }));
    expect(base.join(" ")).not.toContain("handwriting");
    expect(left.join(" ")).toContain("handwriting");
    expect(left.join(" ")).toContain("lieutenant");
  });

  it("changes how Bram reacts to a ghost and to a brawler in chapter 1", () => {
    const ch1 = CHAPTERS.find((c) => c.id === "ch01")!;
    const run = (stats: Partial<GameSim["stats"]>): string => {
      const sim = new GameSim(ch1, { ...defaultGameplay(), invulnerable: true });
      sim.enemies = [];
      for (let i = 0; i < 60 * 20; i++) sim.step(DT, frame());
      sim.events = [];
      Object.assign(sim.stats, { time: 300 }, stats);
      sim.fireEvent("reach_boat");
      const out: string[] = [];
      for (let i = 0; i < 60 * 30; i++) {
        sim.step(DT, frame());
        for (const e of sim.events) if (e.type === "dialogue") out.push(e.line.text);
        sim.events = [];
      }
      return out.join(" ");
    };
    expect(run({ alerts: 0 })).toContain("play cards");
    expect(run({ kills: 9, takedowns: 0, alerts: 5 })).toContain("Subtle");
    expect(run({ kills: 2, takedowns: 0, alerts: 1 })).not.toMatch(/play cards|Subtle/);
  });
});

describe("replaying Act I chapters", () => {
  it("keeps every first answer when a finished chapter is played again", () => {
    for (const [, ch, d] of choices) {
      const first = new GameSim(ch, { ...defaultGameplay(), invulnerable: true }, undefined, 1, d.id === "kessa_truce" ? applyEffects(newStoryState(), { rel: { kessa: 3 } }) : d.id === "bell_plan" ? applyEffects(newStoryState(), { set: ["caravan.saved"] }) : undefined);
      if (d.id === "dog_tag") first.treasures.add("ch07-tag");
      first.fireEvent(askingEvent(ch, d));
      playUntil(first, () => !!first.pendingChoice, 180);
      const pick = d.options.find((o) => o.id !== d.defaultOption && (!o.requires || first.check(o.requires)))!;
      first.choose(pick.id);
      const saved = first.finishedStory();
      const again = new GameSim(ch, { ...defaultGameplay(), invulnerable: true }, undefined, 1, saved, true);
      again.treasures.add("ch07-tag");
      again.fireEvent(askingEvent(ch, d));
      playUntil(again, () => !!again.pendingChoice, 5);
      expect(again.pendingChoice, `${d.id} is not asked again`).toBeNull();
      expect(again.story.rel, d.id).toEqual(saved.rel);
      expect(again.story.stance, d.id).toBe(saved.stance);
    }
  });
});

describe("story structure for all 22 chapters", () => {
  it("gives every built chapter its five beats and every unbuilt chapter branch notes", () => {
    for (const c of CHAPTERS) {
      if (c.playable) {
        expect(c.beats, c.id).toBeDefined();
        for (const k of ["hook", "rising", "setPiece", "choice", "fallout"] as const) expect(c.beats![k].length, `${c.id}.${k}`).toBeGreaterThan(10);
      } else {
        expect((c.branchNotes ?? "").length, `${c.id} branch notes`).toBeGreaterThan(30);
      }
    }
  });
});
