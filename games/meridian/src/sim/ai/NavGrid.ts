// Grid navigation for enemies. Each combat arena gets a 2D grid of walkable cells built from the
// level geometry; A* finds paths across it. Greybox arenas are mostly flat, so a grid is
// simpler and more predictable than a full navigation mesh, and it runs headless in tests.

import type { V3 } from "../math";
import type { World } from "../world/World";
import type { ArenaDef } from "../world/types";

const CELL = 1;
const AGENT_RADIUS = 0.35;
const AGENT_HEIGHT = 1.7;
const MAX_STEP = 0.6;

export class NavGrid {
  readonly arena: ArenaDef;
  readonly w: number;
  readonly h: number;
  /** Ground height per cell, or NaN when not walkable. */
  heights: Float32Array;
  private builtRevision = -1;

  constructor(arena: ArenaDef) {
    this.arena = arena;
    this.w = Math.max(1, Math.ceil((arena.max.x - arena.min.x) / CELL));
    this.h = Math.max(1, Math.ceil((arena.max.z - arena.min.z) / CELL));
    this.heights = new Float32Array(this.w * this.h).fill(NaN);
  }

  cellCenter(ix: number, iz: number): V3 {
    const y = this.heights[iz * this.w + ix];
    return { x: this.arena.min.x + (ix + 0.5) * CELL, y, z: this.arena.min.z + (iz + 0.5) * CELL };
  }

  cellOf(p: V3): { ix: number; iz: number } | null {
    const ix = Math.floor((p.x - this.arena.min.x) / CELL);
    const iz = Math.floor((p.z - this.arena.min.z) / CELL);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return null;
    return { ix, iz };
  }

  walkable(ix: number, iz: number): boolean {
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return false;
    return !Number.isNaN(this.heights[iz * this.w + ix]);
  }

  /** Rebuilds the grid if the world geometry changed (destroyed cover, collapsed floors). */
  sync(world: World): void {
    if (this.builtRevision === world.revision) return;
    this.builtRevision = world.revision;
    const a = this.arena;
    for (let iz = 0; iz < this.h; iz++) {
      for (let ix = 0; ix < this.w; ix++) {
        const x = a.min.x + (ix + 0.5) * CELL;
        const z = a.min.z + (iz + 0.5) * CELL;
        const g = world.groundHeight(x, z, a.max.y, AGENT_RADIUS);
        let y = NaN;
        if (g.y >= a.min.y && g.y <= a.max.y) {
          const body = {
            min: { x: x - AGENT_RADIUS, y: g.y + 0.05, z: z - AGENT_RADIUS },
            max: { x: x + AGENT_RADIUS, y: g.y + AGENT_HEIGHT, z: z + AGENT_RADIUS },
          };
          if (!world.overlapsSolid(body)) y = g.y;
        }
        this.heights[iz * this.w + ix] = y;
      }
    }
  }

  /** Nearest walkable cell to a world point (searching outward in rings). */
  nearestWalkable(p: V3): { ix: number; iz: number } | null {
    const c = this.cellOf({
      x: Math.min(Math.max(p.x, this.arena.min.x), this.arena.max.x - 0.01),
      y: p.y,
      z: Math.min(Math.max(p.z, this.arena.min.z), this.arena.max.z - 0.01),
    });
    if (!c) return null;
    for (let r = 0; r < 8; r++) {
      let best: { ix: number; iz: number; d: number } | null = null;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = c.ix + dx;
          const iz = c.iz + dz;
          if (!this.walkable(ix, iz)) continue;
          const cc = this.cellCenter(ix, iz);
          const d = Math.hypot(cc.x - p.x, cc.z - p.z) + Math.abs(cc.y - p.y) * 2;
          if (!best || d < best.d) best = { ix, iz, d };
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** A* over 8-connected cells. Returns world-space waypoints (excluding the start cell). */
  findPath(from: V3, to: V3): V3[] | null {
    const s = this.nearestWalkable(from);
    const g = this.nearestWalkable(to);
    if (!s || !g) return null;
    const W = this.w;
    const start = s.iz * W + s.ix;
    const goal = g.iz * W + g.ix;
    if (start === goal) return [this.cellCenter(g.ix, g.iz)];
    const N = W * this.h;
    const gScore = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [start];
    const fScore = new Float32Array(N).fill(Infinity);
    gScore[start] = 0;
    const hfn = (i: number) => {
      const dx = Math.abs((i % W) - g.ix);
      const dz = Math.abs(Math.floor(i / W) - g.iz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    fScore[start] = hfn(start);
    let iterations = 0;
    while (open.length > 0 && iterations++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W;
      const cz = Math.floor(cur / W);
      const cy = this.heights[cur];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.walkable(nx, nz)) continue;
          if (dx && dz && (!this.walkable(cx + dx, cz) || !this.walkable(cx, cz + dz))) continue;
          const ni = nz * W + nx;
          if (closed[ni]) continue;
          if (Math.abs(this.heights[ni] - cy) > MAX_STEP) continue;
          const tentative = gScore[cur] + (dx && dz ? 1.414 : 1);
          if (tentative < gScore[ni]) {
            gScore[ni] = tentative;
            came[ni] = cur;
            fScore[ni] = tentative + hfn(ni);
            open.push(ni);
          }
        }
      }
    }
    if (came[goal] === -1) return null;
    const path: V3[] = [];
    for (let i = goal; i !== start && i !== -1; i = came[i]) path.push(this.cellCenter(i % W, Math.floor(i / W)));
    return path.reverse();
  }
}
