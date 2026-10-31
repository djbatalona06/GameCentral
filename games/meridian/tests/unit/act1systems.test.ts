// Tests for the systems added for Act 1 (Chapters 4-7): moving platforms, sweeping hazards,
// the jeep chase, weather, the bell puzzle and searchlights.

import { describe, expect, it } from "vitest";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { GameSim, defaultGameplay } from "../../src/sim/GameSim";
import type { ChapterScript } from "../../src/sim/story/types";
import type { LevelData } from "../../src/sim/world/types";
import { DT, frame, testChapter } from "./helpers";
import type { InputFrame } from "../../src/input/actions";

const SKY = { top: "", bottom: "", fog: "", fogDensity: 0 };

function sim(build: () => LevelData, script: Partial<ChapterScript> = {}, opts = {}) {
  const ch = testChapter(build);
  ch.script = { ...ch.script!, ...script };
  return new GameSim(ch, { ...defaultGameplay(), ...opts });
}

const step = (s: GameSim, n: number, f: InputFrame | ((i: number) => InputFrame) = frame()) => {
  for (let i = 0; i < n; i++) s.step(DT, typeof f === "function" ? f(i) : f);
};

describe("moving platforms", () => {
  const level = () => {
    const b = new LevelBuilder("movers", SKY);
    b.box([-10, -1, -10], [10, 0, 10], "ground");
    // A container that slides 6 m along +X and back, with a ledge on its south face.
    b.box([-1, 2, 2], [1, 3, 4], "metal", { group: "crate", ledges: ["s"] });
    b.mover("m1", "crate", [[0, 0, 0], [6, 0, 0]], 2, { pause: 0 });
    b.checkpoint("start", [0, 3, 3], 0, "Start");
    return b.build();
  };

  it("carries a player standing on top", () => {
    const s = sim(level);
    step(s, 30);
    const x0 = s.player.pos.x;
    step(s, 60);
    expect(s.player.pos.x - x0).toBeGreaterThan(1.5);
    expect(s.player.pos.y).toBeCloseTo(3, 1);
  });

  it("moves its ledges too, so a hanging player comes along", () => {
    const s = sim(level);
    const ledge = s.world.ledges.find((l) => l.group === "crate")!;
    const ax = ledge.a.x;
    step(s, 60);
    expect(ledge.a.x).toBeGreaterThan(ax + 1.5);
  });
});

describe("sweeping hazards", () => {
  const level = () => {
    const b = new LevelBuilder("train", SKY);
    b.box([-2, -1, -30], [2, 4, 30], "metal"); // a long train roof at y = 4
    // Tunnel mouth: everything above roof + 1.3 m, sweeping from the front to the back.
    b.hazard("tunnel", "tunnel", [-6, 5.3, 25], [6, 12, 27], { vel: [0, 0, -20], travel: 60, warn: "Tunnel! Get down!" });
    b.checkpoint("start", [0, 4, 0], 0, "Start");
    return b.build();
  };

  it("kills a player standing up and warns first", () => {
    const s = sim(level);
    s.step(DT, frame());
    step(s, 120);
    expect(s.dead).toBe(true);
  });

  it("passes harmlessly over a crouching player", () => {
    const s = sim(level);
    s.step(DT, frame({ pressed: ["crouch"] }));
    expect(s.player.crouched).toBe(true);
    step(s, 200);
    expect(s.dead).toBe(false);
  });

  it("can start a sweep from the story with a warning", () => {
    const b = level().hazards[0];
    b.startActive = false;
    const s = sim(() => ({ ...level(), hazards: [b] }), { events: { go: [{ type: "hazard", id: "tunnel", active: true }] } });
    s.fireEvent("go");
    s.step(DT, frame());
    expect(s.hazards[0].sweeping).toBe(true);
  });
});

describe("jeep chase", () => {
  const level = (mode: "drive" | "gunner", obstacle = false) => () => {
    const b = new LevelBuilder("road", SKY);
    b.box([-20, -1, -10], [20, 0, 260], "sand");
    b.track("road", [[0, 0, 0], [0, 0, 120], [10, 0, 220]], 10, mode, 20, "chaseDone");
    if (obstacle) b.box([-6, 0, 40], [6, 2, 41], "rock");
    b.pursuer("road", "p1", -10, 2.5, 60);
    b.checkpoint("start", [0, 0, -5], 0, "Start");
    return b.build();
  };
  const script = (): Partial<ChapterScript> => ({
    onStart: [{ type: "vehicle", track: "road" }],
    events: { chaseDone: [{ type: "objective", text: "Made it" }] },
  });

  it("drives to the end of the road, then lets the player out", () => {
    const s = sim(level("drive"), script());
    expect(s.riding).toBe(true);
    expect(s.player.mode).toBe("vehicle");
    step(s, 60 * 20, () => (s.riding ? frame({ move: [0, 1] }) : frame()));
    expect(s.riding).toBe(false);
    expect(s.player.mode).toBe("ground");
    expect(s.objective?.text).toBe("Made it");
  });

  it("crashing into a wall hurts the jeep and slows it down", () => {
    const s = sim(level("drive", true), script());
    step(s, 60 * 5, frame({ move: [0, 1] }));
    expect(s.vehicle!.hp).toBeLessThan(100);
    expect(s.events.some((e) => e.type === "vehicle" && e.kind === "crash")).toBe(true);
  });

  it("in gunner mode the player can shoot enemy jeeps off the road", () => {
    const s = sim(level("gunner"), { ...script(), onStart: [{ type: "vehicle", track: "road" }, { type: "pursuit", group: "p1" }], events: { "pursuitClear:p1": [{ type: "objective", text: "Clear" }] } }, { aimAssist: "off" });
    const pu = s.pursuers[0];
    expect(pu).toBeDefined();
    step(s, 120);
    for (let i = 0; i < 400 && pu.alive; i++) {
      const head = { x: pu.pos.x, y: pu.pos.y + 1.4, z: pu.pos.z };
      const d = { x: head.x - s.cam.position.x, y: head.y - s.cam.position.y, z: head.z - s.cam.position.z };
      s.cam.yaw = Math.atan2(d.x, d.z);
      s.cam.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      s.step(DT, frame({ held: ["aim", "fire"], pressed: ["fire"] }));
      if (i % 30 === 0) s.step(DT, frame({ pressed: ["reload"] }));
    }
    expect(pu.alive).toBe(false);
    expect(s.objective?.text).toBe("Clear");
  });
});

describe("weather", () => {
  const level = (storm: boolean) => () => {
    const b = new LevelBuilder("dunes", SKY);
    b.box([-30, -1, -30], [30, 0, 40], "sand");
    b.arena("a", [-30, -1, -30], [30, 5, 40]);
    b.enemy("rifleman", [0, 0, 16], 180, "a");
    if (storm) b.weather("storm", "sandstorm", [-30, -1, -30], [30, 20, 40]);
    b.checkpoint("start", [0, 0, 0], 0, "Start");
    return b.build();
  };

  it("a sandstorm hides the player from a guard who would see them in clear air", () => {
    const clear = sim(level(false));
    step(clear, 120);
    const storm = sim(level(true));
    step(storm, 120);
    expect(clear.enemies[0].suspicion).toBeGreaterThan(0);
    expect(storm.weather?.kind).toBe("sandstorm");
    expect(storm.enemies[0].suspicion).toBe(0);
  });
});

describe("bell puzzle", () => {
  const level = () => {
    const b = new LevelBuilder("tower", SKY);
    b.box([-10, -1, -10], [10, 0, 10], "stone");
    b.interact("bell0", [-2, 1, 2], "bell", "Ring", "bell", { once: false });
    b.interact("bell1", [0, 1, 2], "bell", "Ring", "bell", { once: false });
    b.interact("bell2", [2, 1, 2], "bell", "Ring", "bell", { once: false });
    b.interact("lectern", [0, 1, -2], "examine", "Read the hymn", "listen", { once: false });
    b.checkpoint("start", [0, 0, 0], 0, "Start");
    return b.build();
  };
  const puzzle = { id: "bells", type: "bells" as const, bells: ["bell0", "bell1", "bell2"], order: [2, 0, 1], listen: "lectern", onSolve: "solved", hint: "high, low, middle" };
  const ring = (s: GameSim, id: string) => {
    const i = s.world.data.interacts.find((x) => x.id === id)!;
    s.player.teleport({ x: i.pos.x, y: 0, z: i.pos.z - 1 }, 0);
    s.step(DT, frame());
    s.step(DT, frame({ pressed: ["interact"] }));
  };

  it("plays the tune with on-screen captions, then solves when rung in order", () => {
    const s = sim(level, { puzzles: [puzzle], events: { solved: [{ type: "objective", text: "Tower open" }] } });
    ring(s, "lectern");
    s.events.length = 0;
    step(s, 200);
    const notes = s.events.filter((e) => e.type === "bell");
    expect(notes.map((n) => (n.type === "bell" ? n.index : -1))).toEqual([2, 0, 1]);
    expect(notes[0].type === "bell" && notes[0].caption).toContain("high");
    ring(s, "bell0"); // wrong first note
    expect(s.puzzles[0].failures).toBe(1);
    ring(s, "bell2");
    ring(s, "bell0");
    ring(s, "bell1");
    expect(s.puzzles[0].solved).toBe(true);
    expect(s.objective?.text).toBe("Tower open");
  });
});

describe("searchlights", () => {
  const level = (grass: boolean) => () => {
    const b = new LevelBuilder("docks", SKY);
    b.box([-30, -1, -30], [30, 0, 40], "metal");
    b.arena("yard", [-30, -1, -30], [30, 5, 40]);
    b.enemy("rifleman", [20, 0, 30], 90, "yard");
    // Light 15 m in front of the player, pointing straight back at them, barely sweeping.
    b.searchlight("sl", [0, 6, 15], 180, 1, 8, "yard");
    if (grass) b.grass([-2, 0, -2], [2, 1.2, 2]);
    b.checkpoint("start", [0, 0, 0], 0, "Start");
    return b.build();
  };

  it("standing in the beam raises the alarm for the whole arena", () => {
    const s = sim(level(false));
    step(s, 100);
    expect(s.events.some((e) => e.type === "searchlightAlarm")).toBe(true);
    expect(s.enemies[0].state).toBe("combat");
  });

  it("crouching in tall grass keeps you hidden", () => {
    const s = sim(level(true));
    s.step(DT, frame({ pressed: ["crouch"] }));
    step(s, 150);
    expect(s.searchlightExposure).toBe(0);
    expect(s.enemies[0].state).not.toBe("combat");
  });
});
