import { describe, expect, it } from "vitest";
import { CHAPTERS, totalStoryMinutes } from "../../src/sim/chapters/registry";
import { World } from "../../src/sim/world/World";
import { PlayerController } from "../../src/sim/player/PlayerController";
import { GameSim, defaultGameplay } from "../../src/sim/GameSim";
import type { ChapterDef } from "../../src/sim/story/types";
import { DT, frame, run } from "./helpers";
import type { InputFrame } from "../../src/input/actions";

const playable = CHAPTERS.filter((c) => c.playable);
const byId = (id: string) => CHAPTERS.find((c) => c.id === id)!;

function at(ch: ChapterDef, pos: [number, number, number], yaw = 0) {
  const world = new World(ch.build!());
  const p = new PlayerController({ x: pos[0], y: pos[1], z: pos[2] }, yaw);
  return { world, p };
}

function sim(ch: ChapterDef, pos?: [number, number, number], yaw = 0) {
  const s = new GameSim(ch, { ...defaultGameplay(), invulnerable: true });
  if (pos) s.player.teleport({ x: pos[0], y: pos[1], z: pos[2] }, yaw);
  s.cam.yaw = yaw;
  return s;
}

function simRun(s: GameSim, frames: number, f: InputFrame | ((i: number) => InputFrame)) {
  for (let i = 0; i < frames; i++) s.step(DT, typeof f === "function" ? f(i) : f);
}

/** Keeps pressing jump with "up" until the player stands on top of the climb. */
function climbToTop(p: PlayerController, world: World, camYaw: number, maxSteps = 40) {
  for (let i = 0; i < maxSteps && p.mode !== "ground"; i++) {
    if (p.mode === "hang") run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }), camYaw);
    run(p, world, 30, frame({ move: [0, 1] }), camYaw);
  }
}

describe("chapter registry", () => {
  it("has 22 chapters numbered in order with unique ids", () => {
    expect(CHAPTERS).toHaveLength(22);
    CHAPTERS.forEach((c, i) => expect(c.number).toBe(i + 1));
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(22);
  });

  it("outlines at least 25 hours of main story", () => {
    expect(totalStoryMinutes()).toBeGreaterThanOrEqual(25 * 60);
  });

  it("chapters 1 to 3 are playable", () => {
    expect(playable.map((c) => c.id)).toEqual(["ch01", "ch02", "ch03"]);
  });
});

describe.each(playable.map((c) => [c.id, c] as const))("%s level integrity", (_id, ch) => {
  const level = ch.build!();
  const script = ch.script!;

  it("every checkpoint has solid ground and the player stands still on it", () => {
    for (const cp of level.checkpoints) {
      const { world, p } = at(ch, [cp.pos.x, cp.pos.y, cp.pos.z], cp.yaw);
      run(p, world, 90, frame());
      expect(p.grounded, cp.id).toBe(true);
      expect(Math.abs(p.pos.y - cp.pos.y), cp.id).toBeLessThan(0.05);
    }
  });

  it("every trigger and interact event has a script handler", () => {
    const puzzleInteracts = new Set(script.puzzles.flatMap((p) => (p.type === "pillars" ? p.pillars : p.type === "sequence" ? p.levers : [])));
    for (const t of level.triggers) expect(script.events[t.event], `trigger ${t.event}`).toBeDefined();
    for (const i of level.interacts) {
      if (puzzleInteracts.has(i.id)) continue;
      expect(script.events[i.event], `interact ${i.id}`).toBeDefined();
    }
    for (const p of script.puzzles) expect(script.events[p.onSolve], `puzzle ${p.id}`).toBeDefined();
  });

  it("spawned waves, groups and journal entries all exist", () => {
    const waves = new Set(level.enemies.map((e) => e.wave).filter(Boolean));
    const groups = new Set(level.boxes.map((b) => b.group).filter(Boolean));
    const journal = new Set(script.journal.map((j) => j.id));
    const all = [...script.onStart, ...Object.values(script.events).flat()];
    for (const a of all) {
      if (a.type === "spawn") expect(waves.has(a.wave), a.wave).toBe(true);
      if (a.type === "remove" || a.type === "reveal") expect(groups.has(a.group), a.group).toBe(true);
      if (a.type === "journal") expect(journal.has(a.id), a.id).toBe(true);
      if (a.type === "checkpoint") expect(level.checkpoints.some((c) => c.id === a.id), a.id).toBe(true);
    }
    expect(all.some((a) => a.type === "complete")).toBe(true);
  });

  it("has five treasures with unique ids", () => {
    expect(level.collectibles).toHaveLength(5);
    expect(new Set(level.collectibles.map((c) => c.id)).size).toBe(5);
  });

  it("every enemy stands inside its arena", () => {
    for (const e of level.enemies) {
      const a = level.arenas.find((x) => x.id === e.arena);
      expect(a, e.id).toBeDefined();
      expect(e.pos.x >= a!.min.x && e.pos.x <= a!.max.x && e.pos.z >= a!.min.z && e.pos.z <= a!.max.z, e.id).toBe(true);
    }
  });
});

describe("chapter 1 route", () => {
  const ch = byId("ch01");

  it("climbs the beach rock", () => {
    const { world, p } = at(ch, [0, 0, 16.5]);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    for (let i = 0; i < 60 && p.mode !== "hang"; i++) run(p, world, 1, frame({ move: [0, 1] }));
    expect(p.mode).toBe("hang");
    climbToTop(p, world, 0);
    expect(p.pos.y).toBeCloseTo(2.6, 1);
  });

  it("swims to the wreck and climbs aboard", () => {
    const { world, p } = at(ch, [0, -3, 46]);
    run(p, world, 20, frame());
    expect(p.mode).toBe("swim");
    run(p, world, 200, frame({ move: [0, 1] }));
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    expect(p.mode).toBe("hang");
    climbToTop(p, world, 0);
    expect(p.pos.y).toBeCloseTo(3, 1);
  });

  it("climbs the cliff handholds, including the crumbling one", () => {
    const { world, p } = at(ch, [-5, 1, 80.6]);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    for (let i = 0; i < 60 && p.mode !== "hang"; i++) run(p, world, 1, frame({ move: [0, 1] }));
    expect(p.mode).toBe("hang");
    climbToTop(p, world, 0);
    expect(p.mode).toBe("ground");
    expect(p.pos.y).toBeCloseTo(12, 1);
  });

  it("swings across the chasm on the rope", () => {
    const { world, p } = at(ch, [0, 12, 96]);
    let jumped = false;
    let released = false;
    for (let i = 0; i < 600; i++) {
      let f = frame({ move: [0, 1], held: ["sprint"] });
      if (!jumped && p.pos.z > 99.4) {
        f = frame({ move: [0, 1], pressed: ["jump"] });
        jumped = true;
      }
      if (p.mode === "rope" && p.rope && p.rope.hand.z > 106 && p.rope.vel.z > 0 && !released) {
        f = frame({ move: [0, 1], pressed: ["jump"] });
        released = true;
      }
      run(p, world, 1, f);
      if (p.mode === "hang") climbToTop(p, world, 0);
      if (released && p.grounded && p.pos.z > 108.5) break;
    }
    expect(released).toBe(true);
    expect(p.pos.z).toBeGreaterThan(108.5);
    expect(p.pos.y).toBeCloseTo(12, 1);
  });

  it("crosses the beam with balance assist", () => {
    const { world, p } = at(ch, [0, 12, 123]);
    for (let i = 0; i < 400 && p.pos.z < 135; i++) p.update(DT, frame({ move: [0, 0.5] }), 0, world, false, { autoTraversal: true, holdToToggle: false });
    expect(p.pos.z).toBeGreaterThan(134);
    expect(p.pos.y).toBeCloseTo(12, 1);
  });

  it("rides the zipline down to the cove", () => {
    const { world, p } = at(ch, [0, 13.2, 173]);
    run(p, world, 10, frame());
    expect(p.tryZipFromGround(world)).toBe(true);
    run(p, world, 600, frame());
    expect(p.grounded).toBe(true);
    expect(p.pos.z).toBeGreaterThan(195);
    expect(p.pos.y).toBeCloseTo(1.5, 1);
  });
});

describe("chapter 2 route", () => {
  const ch = byId("ch02");

  it("pushes the crate to the wall and climbs onto roof A", () => {
    const { world, p } = at(ch, [-5, 0, 22.9]);
    run(p, world, 400, frame({ move: [0, 1], held: ["interact"] }));
    const crate = world.crates[0];
    expect(crate.max.z).toBeGreaterThan(29.9);
    run(p, world, 10, frame());
    // Back up, take a run-up, jump onto the crate and grab the roof ledge.
    run(p, world, 40, frame({ move: [0, -1] }));
    let jumped = false;
    for (let i = 0; i < 120 && !jumped; i++) {
      jumped = crate.min.z - p.pos.z < 1.3;
      run(p, world, 1, jumped ? frame({ pressed: ["jump"], move: [0, 1] }) : frame({ move: [0, 1] }));
    }
    run(p, world, 40, frame({ move: [0, 0.3] }));
    expect(p.pos.y).toBeCloseTo(1, 1);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    for (let i = 0; i < 60 && p.mode !== "hang"; i++) run(p, world, 1, frame({ move: [0, 1] }));
    expect(p.mode).toBe("hang");
    climbToTop(p, world, 0);
    expect(p.pos.y).toBeCloseTo(4, 1);
  });

  it("jumps from roof A to roof B", () => {
    const yaw = Math.PI / 2;
    const { world, p } = at(ch, [-6, 4, 40], yaw);
    let jumped = false;
    for (let i = 0; i < 200 && p.mode !== "hang"; i++) {
      const f = !jumped && p.pos.x > -2.5 ? frame({ move: [0, 1], pressed: ["jump"] }) : frame({ move: [0, 1] });
      if (!jumped && p.pos.x > -2.5) jumped = true;
      run(p, world, 1, f, yaw);
    }
    expect(p.mode).toBe("hang");
    climbToTop(p, world, yaw);
    expect(p.pos.y).toBeCloseTo(5.5, 1);
  });

  it("crosses the beam to roof C", () => {
    const { world, p } = at(ch, [4, 5.5, 54]);
    for (let i = 0; i < 400 && p.pos.z < 62; i++) p.update(DT, frame({ move: [0, 0.5] }), 0, world, false, { autoTraversal: true, holdToToggle: false });
    expect(p.pos.z).toBeGreaterThan(61);
    expect(p.pos.y).toBeCloseTo(5.5, 1);
  });

  it("can climb out of the canal back onto roof C", () => {
    const { world, p } = at(ch, [-6, -3, 57]);
    run(p, world, 20, frame());
    expect(p.mode).toBe("swim");
    run(p, world, 120, frame({ move: [0, 1] }));
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    expect(p.mode).toBe("hang");
    climbToTop(p, world, 0);
    expect(p.pos.y).toBeCloseTo(5.5, 1);
  });

  it("the awning collapses into the market and saves a checkpoint", () => {
    const s = sim(ch, [-1, 5.5, 75]);
    simRun(s, 300, frame({ move: [0, 0.6] }));
    expect(s.player.pos.y).toBeLessThan(0.5);
    expect(s.checkpointId).toBe("c4");
  });
});

describe("chapter 3 route", () => {
  const ch = byId("ch03");

  it("free-climbs the temple wall", () => {
    const { world, p } = at(ch, [0, 0, 43.4]);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    expect(p.mode).toBe("wall");
    run(p, world, 400, frame({ move: [0, 1] }));
    expect(p.mode).toBe("ground");
    expect(p.pos.y).toBeCloseTo(8, 1);
  });

  it("wall-jumps up the optional chimney", () => {
    const { world, p } = at(ch, [-8, 0, 19]);
    let reached = false;
    let heading = 1; // which wall we're travelling toward (+z or -z)
    for (let i = 0; i < 600 && !reached; i++) {
      const touching = p.mode === "air" && p.lastWall !== null && p.lastWall.time < 0.05 && Math.sign(p.lastWall.normal.z) === -heading;
      if (touching) heading = -heading;
      const f = i === 0 || touching ? frame({ pressed: ["jump"], move: [0, heading] }) : frame({ move: [0, heading] });
      run(p, world, 1, f);
      if (p.mode === "hang") {
        climbToTop(p, world, p.yaw);
        reached = p.pos.y > 5;
      }
    }
    expect(reached).toBe(true);
  });

  it("solving the pillar puzzle raises the bridge", () => {
    const s = sim(ch, [0, 8, 56]);
    const turn = (pos: [number, number, number], times: number) => {
      s.player.teleport({ x: pos[0], y: pos[1], z: pos[2] }, 0);
      simRun(s, 5, frame());
      for (let i = 0; i < times; i++) {
        simRun(s, 1, frame({ pressed: ["interact"] }));
        simRun(s, 2, frame());
      }
    };
    turn([-5, 8, 56.4], 2);
    turn([0, 8, 60.4], 1);
    turn([5, 8, 56.4], 3);
    expect(s.puzzles[0].solved).toBe(true);
    expect(s.world.boxes.filter((b) => b.group?.startsWith("b")).every((b) => !b.removed)).toBe(true);
  });

  it("outruns the collapsing bridge", () => {
    const s = sim(ch, [0, 8, 67]);
    for (let g = 1; g <= 6; g++) s.world.revealGroup(`b${g}`);
    simRun(s, 500, frame({ move: [0, 1], held: ["sprint"] }));
    expect(s.dead).toBe(false);
    expect(s.player.pos.z).toBeGreaterThan(101);
    expect(s.player.pos.y).toBeCloseTo(8, 1);
  });

  it("grapples across the gap to the vault", () => {
    const s = sim(ch, [0, 8, 128.5]);
    simRun(s, 5, frame());
    expect(s.prompt?.label).toBe("Grapple");
    simRun(s, 1, frame({ pressed: ["interact"] }));
    expect(s.player.mode).toBe("rope");
    let released = false;
    for (let i = 0; i < 600; i++) {
      const p = s.player;
      if (!released && p.mode === "rope" && p.rope && p.rope.hand.z > 137 && p.rope.vel.z > 0) {
        simRun(s, 1, frame({ pressed: ["jump"], move: [0, 1] }));
        released = true;
        continue;
      }
      simRun(s, 1, frame({ move: [0, 1] }));
      if (p.mode === "hang") {
        for (let k = 0; k < 10 && p.mode !== "ground"; k++) {
          simRun(s, 1, frame({ pressed: ["jump"], move: [0, 1] }));
          simRun(s, 30, frame({ move: [0, 1] }));
        }
      }
      if (released && p.grounded) break;
    }
    expect(s.player.pos.z).toBeGreaterThan(139);
    expect(s.player.pos.y).toBeCloseTo(8, 1);
  });

  it("a crate and the player on the plates open the vault door", () => {
    const s = sim(ch, [6, 8, 158.9]);
    // Clear the arena of enemies (none spawn before the boss trigger).
    const crate = s.world.crates.find((c) => c.min.x > 0)!;
    for (let i = 0; i < 1200 && crate.min.z + 0.6 < 177.9; i++) s.step(DT, frame({ move: [0, 1], held: ["interact"] }));
    expect(crate.min.z + 0.6).toBeGreaterThan(177.2);
    s.player.teleport({ x: -6, y: 8, z: 178 }, 0);
    simRun(s, 10, frame());
    expect(s.puzzles.find((p) => p.def.id === "plates")!.solved).toBe(true);
    expect(s.world.boxes.find((b) => b.group === "vaultdoor")!.removed).toBe(true);
  });
});
