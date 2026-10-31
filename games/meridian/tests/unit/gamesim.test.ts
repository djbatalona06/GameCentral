import { describe, expect, it } from "vitest";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { newSim, frame, DT } from "./helpers";
import type { GameSim } from "../../src/sim/GameSim";

function arenaLevel(enemy: "rifleman" | "brute" = "rifleman", opts: { alerted?: boolean; yaw?: number; z?: number } = {}) {
  return () => {
    const b = new LevelBuilder("arena", { top: "", bottom: "", fog: "", fogDensity: 0 });
    b.box([-20, -1, -20], [20, 0, 40], "ground");
    b.arena("a", [-20, -1, -20], [20, 4, 40]);
    b.enemy(enemy, [0, 0, opts.z ?? 10], opts.yaw ?? 180, "a", { alerted: opts.alerted });
    b.checkpoint("start", [0, 0, 0], 0, "Start");
    return b.build();
  };
}

const step = (s: GameSim, n: number, f = frame()) => {
  for (let i = 0; i < n; i++) s.step(DT, f);
};

describe("combat in the full simulation", () => {
  it("aimed headshots kill an enemy and count in stats", () => {
    const s = newSim({ aimAssist: "off" }, arenaLevel("rifleman", { yaw: 0 }));
    const e = s.enemies[0];
    // Point the camera at the enemy's head.
    step(s, 1, frame({ held: ["aim"] }));
    for (let i = 0; i < 120 && e.alive; i++) {
      const head = e.head().c;
      const d = { x: head.x - s.cam.position.x, y: head.y - s.cam.position.y, z: head.z - s.cam.position.z };
      s.cam.yaw = Math.atan2(d.x, d.z);
      s.cam.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      step(s, 1, frame({ held: ["aim"], pressed: ["fire"] }));
      step(s, 12, frame({ held: ["aim"] }));
    }
    expect(e.alive).toBe(false);
    expect(s.stats.kills).toBe(1);
    expect(s.stats.headshots).toBeGreaterThan(0);
  });

  it("sneaking up behind an unaware enemy allows a silent takedown", () => {
    const s = newSim({}, arenaLevel("rifleman", { yaw: 0, z: 1.2 }));
    step(s, 2);
    expect(s.takedownTarget()?.kind).toBe("behind");
    expect(s.prompt?.label).toBe("Takedown");
    step(s, 1, frame({ pressed: ["melee"] }));
    expect(s.enemies[0].alive).toBe(false);
    expect(s.stats.takedowns).toBe(1);
  });

  it("an alerted enemy fights back and can kill the player", () => {
    const s = newSim({ difficulty: 3, enemyAccuracyScale: 3 }, arenaLevel("rifleman", { alerted: true }));
    for (let i = 0; i < 60 * 40 && !s.dead; i++) s.step(DT, frame());
    expect(s.dead).toBe(true);
    expect(s.events.some((e) => e.type === "playerDied")).toBe(true);
  });

  it("countering a brute's wind-up stuns it", () => {
    const s = newSim({}, arenaLevel("brute", { alerted: true, z: 6 }));
    let countered = false;
    for (let i = 0; i < 60 * 10 && !countered; i++) {
      const e = s.enemies[0];
      s.step(DT, e.counterable ? frame({ pressed: ["melee"] }) : frame());
      if (e.state === "stunned") countered = true;
    }
    expect(countered).toBe(true);
  });

  it("a bottle thrown near a guard makes them investigate", () => {
    const s = newSim({}, arenaLevel("rifleman", { yaw: 0, z: 14 }));
    s.bottles = 1;
    s.cam.yaw = 0;
    s.cam.pitch = 0.1;
    step(s, 1, frame({ pressed: ["throw"] }));
    step(s, 1, frame({ released: ["throw"] }));
    step(s, 120);
    expect(["investigate", "suspicious", "combat"]).toContain(s.enemies[0].state);
  });
});
