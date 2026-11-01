import { describe, expect, it } from "vitest";
import { GameSim, defaultGameplay, type GameplayOptions, type Snapshot } from "../../src/sim/GameSim";
import type { Action, ChapterDef, ChapterScript } from "../../src/sim/story/types";
import { applyEffects, newStoryState, normaliseStory, styleOf, type StoryState } from "../../src/sim/story/State";
import { evaluate } from "../../src/sim/story/Conditions";
import { ENDINGS, resolveEnding } from "../../src/sim/story/Endings";
import { CHARACTERS, feeling } from "../../src/sim/story/Characters";
import { collectChoices } from "../../src/sim/story/Graph";
import { migrate } from "../../src/save/migrations";
import { newSave } from "../../src/save/schema";
import { DT, frame, testChapter } from "./helpers";
import { newStats } from "../../src/sim/GameSim";

const stats = newStats();
const ctx = (story: StoryState, s = stats) => ({ story, stats: s });

// A tiny chapter with one question, used to test the machinery without any real level content.
const OFFER: Action = {
  type: "choice",
  id: "offer",
  prompt: "Varek offers a deal.",
  speaker: "Varek",
  defaultOption: "stall",
  timeoutSec: 10,
  options: [
    { id: "refuse", label: "Refuse", effects: { stance: -1, rel: { bram: 1 }, set: ["refused"] } },
    { id: "stall", label: "Stall" },
    { id: "insider", label: "Use the key", requires: { flag: "has_key" } },
  ],
};

function chapterWith(script: Partial<ChapterScript>): ChapterDef {
  const base = testChapter();
  return { ...base, script: { ...base.script!, ...script } };
}

const standard = (): ChapterDef =>
  chapterWith({
    onStart: [
      { type: "dialogue", lines: [{ speaker: "Varek", text: "A deal, Miss Calder?" }] },
      OFFER,
    ],
    events: {
      "offer:refuse": [{ type: "objective", text: "Refused" }, { type: "set", flag: "after_refuse" }],
      "offer:stall": [{ type: "objective", text: "Stalled" }],
      "offer:insider": [{ type: "objective", text: "Insider" }],
    },
  });

function sim(ch = standard(), opts: Partial<GameplayOptions> = {}, snapshot?: Snapshot, story?: StoryState, lock = false) {
  return new GameSim(ch, { ...defaultGameplay(), invulnerable: true, ...opts }, snapshot, 1234, story, lock);
}

/** Steps until a question opens (dialogue has to finish first). */
function untilAsked(s: GameSim, max = 600) {
  for (let i = 0; i < max && !s.pendingChoice; i++) s.step(DT, frame());
}

describe("story state", () => {
  it("applies effects without changing the old state, and keeps numbers in range", () => {
    const a = newStoryState();
    const b = applyEffects(a, { rel: { bram: 2, kessa: 1 }, stance: -1, set: ["x"] });
    expect(a.rel.bram).toBe(5);
    expect(a.flags.x).toBeUndefined();
    expect(b.rel).toEqual({ bram: 7, kessa: 1 });
    expect(b.stance).toBe(a.stance - 1);
    expect(b.flags.x).toBe(true);
    const c = applyEffects(applyEffects(b, { rel: { bram: 99 } }), { rel: { kessa: -99 }, stance: -99 });
    expect(c.rel).toEqual({ bram: 10, kessa: 0 });
    expect(c.stance).toBe(-5);
  });

  it("repairs a damaged or missing story instead of crashing", () => {
    expect(normaliseStory(undefined)).toEqual(newStoryState());
    const odd = normaliseStory({ rel: { bram: Number.NaN, kessa: 50 }, stance: "x" as unknown as number, style: "nonsense" as never, flags: null as never });
    expect(odd.rel).toEqual({ bram: 5, kessa: 10 });
    expect(odd.stance).toBe(newStoryState().stance);
    expect(odd.style).toBe("mixed");
    expect(odd.flags).toEqual({});
  });

  it("reads how a chapter was played", () => {
    expect(styleOf({ ...stats })).toBe("ghost");
    expect(styleOf({ ...stats, alerts: 2 })).toBe("mixed");
    expect(styleOf({ ...stats, kills: 8, takedowns: 1 })).toBe("brawler");
    expect(styleOf({ ...stats, kills: 8, takedowns: 6 })).toBe("ghost");
  });

  it("describes feelings in words, never raw numbers", () => {
    const s = newStoryState();
    expect(feeling("bram", s)).toBe("Steady");
    expect(feeling("kessa", s)).toBe("Enemy");
    expect(feeling("bram", applyEffects(s, { rel: { bram: 5 } }))).toBe("Family");
    expect(Object.keys(CHARACTERS).sort()).toEqual(["bram", "kessa"]);
  });
});

describe("conditions", () => {
  const s = applyEffects(newStoryState(), { rel: { bram: 3 }, set: ["f"] });
  const withChoice = { ...s, choices: { offer: "refuse" } };

  it("checks flags, feelings, stance and earlier answers", () => {
    expect(evaluate({ flag: "f" }, ctx(s))).toBe(true);
    expect(evaluate({ flag: "g" }, ctx(s))).toBe(false);
    expect(evaluate({ rel: "bram", min: 8 }, ctx(s))).toBe(true);
    expect(evaluate({ rel: "bram", min: 9 }, ctx(s))).toBe(false);
    expect(evaluate({ rel: "kessa", max: 0 }, ctx(s))).toBe(true);
    expect(evaluate({ stance: "seeker" }, ctx(s))).toBe(true);
    expect(evaluate({ stance: "keeper" }, ctx(s))).toBe(false);
    expect(evaluate({ chose: "offer", option: "refuse" }, ctx(withChoice))).toBe(true);
    expect(evaluate({ chose: "offer", option: "stall" }, ctx(withChoice))).toBe(false);
  });

  it("combines rules", () => {
    expect(evaluate({ all: [{ flag: "f" }, { not: { flag: "g" } }] }, ctx(s))).toBe(true);
    expect(evaluate({ any: [{ flag: "g" }, { flag: "h" }] }, ctx(s))).toBe(false);
  });

  it("judges playstyle only once there is enough chapter to judge", () => {
    const brawling = { ...stats, kills: 9, time: 30 };
    expect(evaluate({ style: "mixed" }, ctx(s, brawling))).toBe(true); // too early: the last chapter's style
    expect(evaluate({ style: "brawler" }, ctx(s, { ...brawling, time: 200 }))).toBe(true);
  });
});

describe("endings", () => {
  const base = newStoryState();
  const set = (fx: Parameters<typeof applyEffects>[1]) => applyEffects(base, fx);

  it("can reach all three", () => {
    expect(resolveEnding(set({ stance: 4 }))).toBe("lantern");
    expect(resolveEnding(set({ set: ["final:share"], rel: { bram: 5, kessa: 9 } }))).toBe("sharer");
    expect(resolveEnding(set({ set: ["final:keep"], stance: -4 }))).toBe("keeper");
    expect(new Set(["lantern", "sharer", "keeper"].map((e) => ENDINGS[e as keyof typeof ENDINGS].id)).size).toBe(3);
  });

  it("does not give Open Water to someone nobody trusts", () => {
    expect(resolveEnding(set({ set: ["final:share"] }))).toBe("keeper");
  });

  it("lets a player who wants to keep Meridia keep it, however seeker-minded they were", () => {
    expect(resolveEnding(set({ set: ["final:keep"], stance: 5 }))).toBe("keeper");
  });
});

describe("asking the player a question", () => {
  it("waits for dialogue to finish, then freezes the world until answered", () => {
    const s = sim();
    s.step(DT, frame());
    expect(s.pendingChoice, "dialogue still on screen").toBeNull();
    untilAsked(s);
    expect(s.pendingChoice?.id).toBe("offer");
    expect(s.pendingChoice?.speaker).toBe("Varek");
    const t = s.time;
    for (let i = 0; i < 120; i++) s.step(DT, frame());
    expect(s.time).toBe(t);
    expect(s.pendingChoice).not.toBeNull();
  });

  it("only offers options whose rules are met", () => {
    const s = sim();
    untilAsked(s);
    expect(s.pendingChoice!.options.map((o) => o.id)).toEqual(["refuse", "stall"]);
    expect(s.choose("insider")).toBe(false);
    const has = sim(standard(), {}, undefined, applyEffects(newStoryState(), { set: ["has_key"] }));
    untilAsked(has);
    expect(has.pendingChoice!.options.map((o) => o.id)).toEqual(["refuse", "stall", "insider"]);
  });

  it("applies effects once, remembers the answer and runs that answer's story event", () => {
    const s = sim();
    untilAsked(s);
    expect(s.choose("refuse")).toBe(true);
    expect(s.choose("refuse"), "cannot answer twice").toBe(false);
    expect(s.pendingChoice).toBeNull();
    expect(s.story.rel.bram).toBe(6);
    expect(s.story.stance).toBe(newStoryState().stance - 1);
    expect(s.story.choices.offer).toBe("refuse");
    expect(s.story.flags.refused).toBe(true);
    expect(s.story.flags.after_refuse).toBe(true);
    expect(s.objective?.text).toBe("Refused");
    const types = s.events.map((e) => e.type);
    expect(types).toContain("choice");
    expect(types).toContain("choiceResolved");
    // The world runs again.
    const t = s.time;
    s.step(DT, frame());
    expect(s.time).toBeGreaterThan(t);
  });

  it("keeps waiting forever unless the player turned on timed choices", () => {
    const s = sim();
    untilAsked(s);
    expect(s.pendingChoice!.timeLeft).toBeUndefined();
    for (let i = 0; i < 60 * 60; i++) s.tickChoice(DT);
    expect(s.pendingChoice).not.toBeNull();
  });

  it("with timed choices on, picks the quiet default when time runs out", () => {
    const s = sim(standard(), { timedChoices: true });
    untilAsked(s);
    expect(s.pendingChoice!.timeLeft).toBe(10);
    for (let i = 0; i < 60 * 11 && s.pendingChoice; i++) s.tickChoice(DT);
    expect(s.pendingChoice).toBeNull();
    expect(s.story.choices.offer).toBe("stall");
    expect(s.objective?.text).toBe("Stalled");
  });

  it("says conditional lines only when their rule holds", () => {
    const ch = chapterWith({
      onStart: [
        {
          type: "dialogue",
          lines: [
            { speaker: "Varek", text: "always" },
            { speaker: "Varek", text: "only if refused", if: { chose: "offer", option: "refuse" } },
            { speaker: "Varek", text: "only if ghost", if: { style: "ghost" } },
          ],
        },
      ],
    });
    const said = (s: GameSim) => {
      const out: string[] = [];
      for (let i = 0; i < 60 * 20; i++) {
        s.step(DT, frame());
        for (const e of s.events) if (e.type === "dialogue") out.push(e.line.text);
        s.events = [];
      }
      return out;
    };
    expect(said(sim(ch))).toEqual(["always"]);
    expect(said(sim(ch, {}, undefined, { ...newStoryState(), choices: { offer: "refuse" }, style: "ghost" }))).toEqual(["always", "only if refused", "only if ghost"]);
  });

  it("branches on the story so far", () => {
    const ch = chapterWith({
      onStart: [
        { type: "branch", if: { rel: "bram", min: 8 }, then: [{ type: "objective", text: "trusting" }], otherwise: [{ type: "objective", text: "wary" }] },
      ],
    });
    expect(sim(ch).objective?.text).toBe("wary");
    expect(sim(ch, {}, undefined, applyEffects(newStoryState(), { rel: { bram: 4 } })).objective?.text).toBe("trusting");
  });
});

describe("checkpoints and choices", () => {
  it("restores the story exactly and does not count an answer twice", () => {
    const a = sim();
    untilAsked(a);
    a.choose("refuse");
    const snap = JSON.parse(JSON.stringify(a.snapshot())) as Snapshot; // as if saved to disk
    const b = sim(standard(), {}, snap);
    expect(b.story).toEqual(a.story);
    expect(b.story.rel.bram).toBe(6);
    expect(b.story.stance).toBe(a.story.stance);
    expect(b.objective?.text).toBe("Refused"); // world effects of the answer are replayed
    expect(b.pendingChoice).toBeNull();
    for (let i = 0; i < 200; i++) b.step(DT, frame());
    expect(b.pendingChoice, "not asked again").toBeNull();
    expect(b.story.rel.bram).toBe(6);
  });

  it("asks again after a reload if the question was still open", () => {
    const a = sim();
    untilAsked(a);
    const snap = JSON.parse(JSON.stringify(a.snapshot())) as Snapshot;
    expect(snap.openChoices).toEqual(["offer"]);
    const b = sim(standard(), {}, snap);
    untilAsked(b);
    expect(b.pendingChoice?.id).toBe("offer");
  });

  it("opens an old snapshot that has no story in it", () => {
    const a = sim(chapterWith({}));
    const snap = JSON.parse(JSON.stringify(a.snapshot())) as Partial<Snapshot>;
    delete snap.story;
    delete snap.openChoices;
    const kept = applyEffects(newStoryState(), { rel: { bram: 2 } });
    expect(sim(chapterWith({}), {}, snap as Snapshot, kept).story.rel.bram).toBe(7);
  });
});

describe("replaying a finished chapter", () => {
  it("keeps the first answer, replays its world events and adds nothing to the story", () => {
    const first = sim();
    untilAsked(first);
    first.choose("refuse");
    const saved = first.finishedStory();

    const again = sim(standard(), {}, undefined, saved, true);
    expect(again.pendingChoice).toBeNull();
    expect(again.objective?.text).toBe("Refused");
    for (let i = 0; i < 300; i++) again.step(DT, frame());
    expect(again.pendingChoice, "no question on a replay").toBeNull();
    expect(again.story.rel).toEqual(saved.rel);
    expect(again.story.stance).toBe(saved.stance);
  });

  it("falls back to the quiet default if the earlier answer is no longer available", () => {
    const again = sim(standard(), {}, undefined, { ...newStoryState(), choices: { offer: "insider" } }, true);
    expect(again.objective?.text).toBe("Stalled");
  });
});

describe("chapter graph helpers", () => {
  it("finds choices even inside branches", () => {
    const script = chapterWith({ onStart: [{ type: "branch", if: { flag: "x" }, then: [OFFER] }] }).script!;
    expect(collectChoices(script).map((c) => c.id)).toEqual(["offer"]);
  });
});

describe("save version 3", () => {
  it("upgrades a version 2 save and keeps all its progress", () => {
    const v2 = { ...newSave(1, 2), version: 2 } as Record<string, unknown>;
    delete v2.story;
    delete v2.endingsSeen;
    v2.currentChapter = "ch04";
    const out = migrate(JSON.parse(JSON.stringify(v2)));
    expect(out.version).toBe(3);
    expect(out.currentChapter).toBe("ch04");
    expect(out.difficulty).toBe(2);
    expect(out.story).toEqual(newStoryState());
    expect(out.endingsSeen).toEqual([]);
  });

  it("upgrades a version 1 save all the way", () => {
    const out = migrate({ version: 1, slot: 0, chapter: "ch02", checkpoint: "c1", time: 99, treasures: ["a"], savedAt: 1 });
    expect(out.version).toBe(3);
    expect(out.story).toEqual(newStoryState());
    expect(out.chapters.ch02.treasures).toEqual(["a"]);
  });
});
