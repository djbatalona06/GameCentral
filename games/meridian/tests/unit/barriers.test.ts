// Walls, map edges and cover: the environment really protects and blocks.
import { describe, expect, it } from "vitest";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { World } from "../../src/sim/world/World";
import { slideMove } from "../../src/sim/world/collide";
import { coverShapes, coverStyle } from "../../src/render/CoverKit";
import { TUNING } from "../../src/config/tuning";
import { DT, frame, newSim } from "./helpers";

const sky = { top: "", bottom: "", fog: "", fogDensity: 0 };

describe("map edge (boundary boxes)", () => {
  const level = () => {
    const b = new LevelBuilder("edge", sky);
    b.box([-30, -1, -30], [30, 0, 30], "ground");
    b.box([5, -10, -30], [6, 200, 30], "rock", { boundary: true });
    b.checkpoint("start", [0, 0, 0], 0, "Start");
    return b.build();
  };

  it("stops the hero", () => {
    const s = newSim({}, level);
    s.cam.yaw = Math.PI / 2; // face +X
    for (let i = 0; i < 240; i++) s.step(DT, frame({ move: [0, 1] }));
    expect(s.player.pos.x).toBeLessThan(5);
    expect(s.player.pos.x).toBeGreaterThan(3);
  });

  it("lets bullets, sight and the camera pass, and is not ground", () => {
    const w = new World(level());
    expect(w.lineOfSight({ x: 0, y: 1, z: 0 }, { x: 20, y: 1, z: 0 })).toBe(true);
    expect(w.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 50)).toBeNull();
    expect(w.groundHeight(5.5, 0, 300).y).toBe(0); // the floor below, not the top of the edge
  });

  it("warns once when the hero gets close", () => {
    const s = newSim({}, level);
    s.cam.yaw = Math.PI / 2;
    const seen: boolean[] = [];
    for (let i = 0; i < 240; i++) {
      s.step(DT, frame({ move: [0, 1] }));
      for (const e of s.events) if (e.type === "boundary") seen.push(e.near);
      s.events.length = 0;
    }
    expect(seen).toEqual([true]);
  });
});

describe("walls stop everyone", () => {
  it("slideMove slides along a wall and never enters it", () => {
    const b = new LevelBuilder("w", sky);
    b.box([-10, -1, -10], [10, 0, 10], "ground");
    b.box([1, 0, -10], [2, 3, 10], "rock");
    const w = new World(b.build());
    const p = slideMove(w, { x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 1 }, 0.3, 1.8);
    expect(p.x).toBe(0); // blocked on X
    expect(p.z).toBe(1); // still slides along Z
  });

  it("an enemy chasing the hero cannot walk through a wall", () => {
    const s = newSim({}, () => {
      const b = new LevelBuilder("chase", sky);
      b.box([-20, -1, -20], [20, 0, 40], "ground");
      // A wall with no way round inside the enemy's arena.
      b.box([-20, 0, 5], [20, 6, 6], "rock");
      b.arena("a", [-20, -1, -20], [20, 8, 40]);
      b.enemy("brute", [0, 0, 12], 180, "a", { alerted: true });
      b.checkpoint("start", [0, 0, 0], 0, "Start");
      return b.build();
    });
    s.opts.invulnerable = true;
    for (let i = 0; i < 600; i++) s.step(DT, frame());
    expect(s.enemies[0].pos.z).toBeGreaterThan(6);
  });

  it("the hero and enemies don't overlap", () => {
    const s = newSim({}, () => {
      const b = new LevelBuilder("bump", sky);
      b.box([-20, -1, -20], [20, 0, 40], "ground");
      b.arena("a", [-20, -1, -20], [20, 4, 40]);
      b.enemy("rifleman", [0, 0, 3], 180, "a");
      b.checkpoint("start", [0, 0, 0], 0, "Start");
      return b.build();
    });
    for (let i = 0; i < 120; i++) s.step(DT, frame({ move: [0, 1] }));
    const e = s.enemies[0];
    const d = Math.hypot(e.pos.x - s.player.pos.x, e.pos.z - s.player.pos.z);
    expect(d).toBeGreaterThan(TUNING.player.radius + 0.25);
  });
});

describe("walls muffle sound", () => {
  it("a noise behind a wall carries less than half as far", () => {
    const build = (wall: boolean) => () => {
      const b = new LevelBuilder("snd", sky);
      b.box([-20, -1, -20], [20, 0, 40], "ground");
      if (wall) b.box([-20, 0, 7], [20, 8, 8], "stone");
      b.arena("a", [-20, -1, -20], [20, 10, 40]);
      b.enemy("rifleman", [0, 0, 14], 0, "a");
      b.checkpoint("start", [0, 0, 0], 0, "Start");
      return b.build();
    };
    for (const wall of [false, true]) {
      const s = newSim({}, build(wall));
      s.makeNoise({ pos: { x: 0, y: 0, z: 0 }, radius: 20, kind: "bottle" });
      expect(s.enemies[0].state === "investigate").toBe(!wall);
    }
  });
});

describe("cover protects", () => {
  it("only counts when tucked in on the side facing the shooter", () => {
    const s = newSim({}, () => {
      const b = new LevelBuilder("cov", sky);
      b.box([-20, -1, -20], [20, 0, 40], "ground");
      b.cover(0, 2, 4, 0.8, 0, "low");
      b.checkpoint("start", [0, 0, 0.9], 0, "Start");
      return b.build();
    });
    // Face the cover and press Cover.
    s.cam.yaw = 0;
    for (let i = 0; i < 10; i++) s.step(DT, frame({ move: [0, 1], pressed: i === 3 ? ["coverRoll"] : [] }));
    expect(s.player.mode).toBe("cover");
    for (let i = 0; i < 10; i++) s.step(DT, frame());
    expect(s.coverProtects({ x: 0, y: 1.4, z: 20 })).toBe(true); // shooter beyond the cover
    expect(s.coverProtects({ x: 0, y: 1.4, z: -20 })).toBe(false); // shooter behind the hero
  });

  it("breakable cover takes less damage the tougher its material is", () => {
    expect(TUNING.coverDamage.wood).toBeGreaterThan(TUNING.coverDamage.metal);
    expect(TUNING.coverDamage.metal).toBeGreaterThan(TUNING.coverDamage.stone);
  });

  it("cover pieces never stick out of the box the game collides with", () => {
    for (const [mat, kind] of [["stone", "low"], ["stone", "high"], ["wood", "low"], ["metal", "high"], ["plaster", "high"]] as const) {
      const box = { id: `c-${mat}-${kind}`, min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: kind === "low" ? 1.05 : 2.4, z: 0.8 }, material: mat, cover: kind };
      const hw = 1.5 + 0.03;
      const hh = (box.max.y - box.min.y) / 2 + 0.03;
      const hd = 0.4 + 0.03;
      for (const sh of coverShapes(box)) {
        const pos = sh.vd.positions!;
        for (let i = 0; i < pos.length; i += 3) {
          expect(Math.abs(pos[i])).toBeLessThanOrEqual(hw);
          expect(Math.abs(pos[i + 1])).toBeLessThanOrEqual(hh);
          expect(Math.abs(pos[i + 2])).toBeLessThanOrEqual(hd);
        }
      }
      expect(coverStyle(box)).toBeTruthy();
    }
  });
});
