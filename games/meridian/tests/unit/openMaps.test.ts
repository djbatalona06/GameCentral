// Open maps: the canyon walls are gone, but the edges still hold, loot sits on solid ground,
// and no climb, swim or puzzle can be skipped by walking around it.
import { describe, expect, it } from "vitest";
import { CHAPTERS } from "../../src/sim/chapters/registry";
import { World } from "../../src/sim/world/World";
import { LIP_HEIGHT } from "../../src/sim/world/LevelBuilder";
import type { LevelData } from "../../src/sim/world/types";

const ACT1 = CHAPTERS.filter((c) => c.playable && c.build);

/**
 * Every spot a hero could reach on foot from `start`: walking, stepping up at most 0.4 m and
 * dropping down at most 3 m, on a 1 m grid. No jumping, climbing, ropes or crates.
 */
function walkable(level: LevelData, start: { x: number; y: number; z: number }) {
  const w = new World(level);
  const R = 0.3;
  const free = (x: number, y: number, z: number) => !w.overlapsSolid({ min: { x: x - R, y: y + 0.05, z: z - R }, max: { x: x + R, y: y + 1.6, z: z + R } });
  const seen = new Map<string, { x: number; y: number; z: number }>();
  const key = (ix: number, iz: number, y: number) => `${ix},${iz},${Math.round(y * 4)}`;
  const g0 = w.groundHeight(start.x, start.z, start.y + 0.3, R);
  const queue: Array<{ ix: number; iz: number; y: number }> = [{ ix: Math.round(start.x), iz: Math.round(start.z), y: g0.y }];
  seen.set(key(queue[0].ix, queue[0].iz, g0.y), { x: queue[0].ix, y: g0.y, z: queue[0].iz });
  let guard = 0;
  while (queue.length && guard++ < 400000) {
    const c = queue.shift()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ix = c.ix + dx;
      const iz = c.iz + dz;
      const g = w.groundHeight(ix, iz, c.y + 0.4, R);
      if (!Number.isFinite(g.y) || g.y < c.y - 3 || g.y < level.killY) continue;
      // The body must fit at the new spot and halfway there (no squeezing through walls).
      if (!free(ix, g.y, iz) || !free(c.ix + dx / 2, Math.max(g.y, c.y), c.iz + dz / 2)) continue;
      const k = key(ix, iz, g.y);
      if (seen.has(k)) continue;
      seen.set(k, { x: ix, y: g.y, z: iz });
      queue.push({ ix, iz, y: g.y });
    }
  }
  return [...seen.values()];
}

const reaches = (spots: Array<{ x: number; y: number; z: number }>, p: { x: number; y: number; z: number }) =>
  spots.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 1.6 && Math.abs(s.y - p.y) < 1);

/** [chapter, start checkpoint, a checkpoint that must need a climb or traversal to reach]. */
const GATES: Array<[string, string, string]> = [
  ["ch01", "c3", "c4"], // the sea cliff
  ["ch01", "c1", "c2"], // the first climb and the swim to the wreck
  ["ch02", "c1", "c3"], // crate up to the rooftops
  ["ch03", "c1", "c2"], // the temple wall
  ["ch04", "c4", "c5"], // the waystation tower
  ["ch05", "c2", "c3"], // the monastery cliff
  ["ch07", "c2", "c3"], // the crane containers over the harbour
];

describe("open maps", () => {
  for (const ch of ACT1) {
    const level = ch.build!();
    describe(ch.id, () => {
      it("has no canyon walls: every side wall is a low lip with an invisible edge behind it", () => {
        // A side wall is thin in X. None of them may tower over the floor beside it any more.
        const world = new World(level);
        const tall = level.boxes.filter((b) => {
          if (b.boundary || b.material !== "rock" || b.max.x - b.min.x > 2.01 || b.max.z - b.min.z < 4) return false;
          const inner = b.min.x < 0 ? b.max.x + 0.75 : b.min.x - 0.75;
          const floor = world.groundHeight(inner, (b.min.z + b.max.z) / 2, b.max.y - 0.01).y;
          return Number.isFinite(floor) && b.max.y - floor > 6;
        });
        expect(tall.map((b) => `${b.id} ${JSON.stringify([b.min, b.max])}`)).toEqual([]);
        if (ch.id !== "ch06") expect(level.boxes.some((b) => b.boundary)).toBe(true);
        void LIP_HEIGHT;
      });

      it("has camps and caches, each standing on solid ground", () => {
        const world = new World(level);
        const camps = level.interacts.filter((i) => i.kind === "camp");
        const caches = level.interacts.filter((i) => i.kind === "cache");
        expect(camps.length).toBeGreaterThanOrEqual(1);
        expect(camps.length).toBeLessThanOrEqual(2);
        expect(caches.length).toBeGreaterThanOrEqual(3);
        expect(caches.some((c) => c.tier === "boundary"), "an edge cache").toBe(true);
        for (const i of [...camps, ...caches]) {
          const foot = i.pos.y - (i.kind === "camp" ? 0.8 : 0.6);
          const g = world.groundHeight(i.pos.x, i.pos.z, foot + 0.2);
          expect(Math.abs(g.y - foot), i.id).toBeLessThan(0.05);
        }
        // Camps sit beside a checkpoint, so resting there saves somewhere sensible.
        for (const c of camps) {
          const near = level.checkpoints.some((cp) => Math.hypot(cp.pos.x - c.pos.x, cp.pos.z - c.pos.z) < 10);
          expect(near, c.id).toBe(true);
        }
      });

      it("edge caches can be reached on foot from a nearby checkpoint", () => {
        for (const c of level.interacts.filter((i) => i.kind === "cache" && i.tier === "boundary" && i.id.includes("edge"))) {
          const foot = { x: c.pos.x, y: c.pos.y - 0.6, z: c.pos.z };
          const cps = [...level.checkpoints].sort((a, b) => Math.hypot(a.pos.x - foot.x, a.pos.z - foot.z) - Math.hypot(b.pos.x - foot.x, b.pos.z - foot.z));
          const spots = walkable(level, (cps.find((cp) => Math.abs(cp.pos.y - foot.y) < 0.5) ?? cps[0]).pos);
          expect(reaches(spots, foot), c.id).toBe(true);
        }
      });
    });
  }

  for (const [chId, from, gated] of GATES) {
    it(`${chId}: you can't walk around the climb from ${from} to ${gated}`, () => {
      const level = CHAPTERS.find((c) => c.id === chId)!.build!();
      const a = level.checkpoints.find((c) => c.id === from)!;
      const b = level.checkpoints.find((c) => c.id === gated)!;
      const spots = walkable(level, a.pos);
      expect(spots.length).toBeGreaterThan(30); // the walk itself works
      expect(reaches(spots, b.pos)).toBe(false);
    });
  }
});
