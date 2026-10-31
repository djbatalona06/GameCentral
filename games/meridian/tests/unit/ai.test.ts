import { describe, expect, it } from "vitest";
import { SquadDirector } from "../../src/sim/ai/SquadDirector";
import { visibility, updateSuspicion } from "../../src/sim/ai/Perception";
import { NavGrid } from "../../src/sim/ai/NavGrid";
import { World } from "../../src/sim/world/World";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";

const member = (id: string, d: number) => ({ id, arena: "a", alive: true, distanceToPlayer: d, wantsToShoot: true, lastShotAgo: 0 });

describe("squad director", () => {
  it("never lets more enemies shoot at once than the difficulty allows", () => {
    for (let diff = 0; diff < 4; diff++) {
      const sq = new SquadDirector(diff);
      const members = Array.from({ length: 8 }, (_, i) => member(`e${i}`, 5 + i));
      sq.update(1 / 60, members);
      expect(sq.activeTokens).toBe(sq.maxShooters);
      expect(sq.activeTokens).toBeLessThanOrEqual(diff + 1);
    }
  });

  it("rotates tokens so everyone gets a turn", () => {
    const sq = new SquadDirector(0);
    const members = [member("near", 3), member("far", 20)];
    sq.update(1 / 60, members, 0.5);
    expect(sq.holds("near")).toBe(true);
    members[0].lastShotAgo = 0;
    members[1].lastShotAgo = 10;
    sq.update(0.6, members, 0.5);
    expect(sq.holds("far")).toBe(true);
  });

  it("allows only one flanker per arena", () => {
    const sq = new SquadDirector(1);
    expect(sq.requestFlank("a", "x")).toBe(true);
    expect(sq.requestFlank("a", "y")).toBe(false);
    sq.releaseFlank("a", "x");
    expect(sq.requestFlank("a", "y")).toBe(true);
  });
});

describe("perception", () => {
  const los = () => true;
  const base = { eye: { x: 0, y: 1.7, z: 0 }, facingYaw: 0, crouched: false, inGrass: false, alerted: false, los };

  it("sees targets in front, not behind", () => {
    expect(visibility({ ...base, targetPoints: [{ x: 0, y: 1.5, z: 8 }] })).toBeGreaterThan(0.5);
    expect(visibility({ ...base, targetPoints: [{ x: 0, y: 1.5, z: -8 }] })).toBe(0);
  });

  it("crouching in tall grass hides the player completely", () => {
    expect(visibility({ ...base, crouched: true, inGrass: true, targetPoints: [{ x: 0, y: 1, z: 6 }] })).toBe(0);
  });

  it("walls block sight", () => {
    expect(visibility({ ...base, los: () => false, targetPoints: [{ x: 0, y: 1.5, z: 5 }] })).toBe(0);
  });

  it("suspicion fills while seen and drains when not", () => {
    let s = 0;
    for (let i = 0; i < 60; i++) s = updateSuspicion(s, 0.8, 1 / 60, 1);
    expect(s).toBeGreaterThan(0.5);
    const peak = s;
    for (let i = 0; i < 60; i++) s = updateSuspicion(s, 0, 1 / 60, 1);
    expect(s).toBeLessThan(peak);
  });
});

describe("nav grid", () => {
  it("paths around a wall", () => {
    const b = new LevelBuilder("nav", { top: "", bottom: "", fog: "", fogDensity: 0 });
    b.box([-10, -1, -10], [10, 0, 10], "ground");
    b.box([-6, 0, -0.5], [10, 3, 0.5], "rock"); // wall with a gap on the left
    b.arena("a", [-10, -1, -10], [10, 4, 10]);
    const world = new World(b.build());
    const nav = new NavGrid(world.data.arenas[0]);
    nav.sync(world);
    const path = nav.findPath({ x: 5, y: 0, z: -5 }, { x: 5, y: 0, z: 5 });
    expect(path).not.toBeNull();
    // The path must go around through x < -6.
    expect(Math.min(...path!.map((p) => p.x))).toBeLessThan(-6);
    for (const p of path!) expect(Math.abs(p.z) > 0.5 || p.x < -6).toBe(true);
  });
});
