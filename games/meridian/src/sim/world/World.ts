// The World owns all level geometry at runtime and answers collision questions:
// "what is under me?", "what does this ray hit?", "does this box overlap anything?".

import { TUNING } from "../../config/tuning";
import { type V3, v3, clamp } from "../math";
import type { BoxDef, LedgeDef, LevelData, RampDef, VolumeDef } from "./types";

export interface Aabb {
  min: V3;
  max: V3;
}

export interface RuntimeBox extends BoxDef {
  removed: boolean;
  hpLeft: number;
}

export interface RuntimeCrate {
  id: string;
  min: V3;
  max: V3;
}

export interface RuntimeLedge extends LedgeDef {
  removed: boolean;
  crumbleTimer: number;
}

export interface RayHit {
  t: number;
  point: V3;
  normal: V3;
  box?: RuntimeBox;
  crate?: RuntimeCrate;
}

export const overlaps = (a: Aabb, b: Aabb, eps = 0): boolean =>
  a.min.x < b.max.x - eps &&
  a.max.x > b.min.x + eps &&
  a.min.y < b.max.y - eps &&
  a.max.y > b.min.y + eps &&
  a.min.z < b.max.z - eps &&
  a.max.z > b.min.z + eps;

export const inside = (p: V3, b: Aabb): boolean =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;

/** Ray vs AABB using the slab method. Returns entry distance and the face normal, or null. */
export function rayAabb(origin: V3, dir: V3, b: Aabb, maxT: number): { t: number; normal: V3 } | null {
  let tmin = 0;
  let tmax = maxT;
  let normal = v3();
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  for (const ax of axes) {
    const o = origin[ax];
    const d = dir[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < b.min[ax] || o > b.max[ax]) return null;
      continue;
    }
    let t1 = (b.min[ax] - o) / d;
    let t2 = (b.max[ax] - o) / d;
    let sign = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      normal = v3();
      normal[ax] = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, normal };
}

/** Height of a ramp's surface at (x, z), or null if outside its footprint. */
export function rampHeight(r: RampDef, x: number, z: number): number | null {
  if (x < r.min.x || x > r.max.x || z < r.min.z || z > r.max.z) return null;
  const lo = r.axis === "x" ? r.min.x : r.min.z;
  const hi = r.axis === "x" ? r.max.x : r.max.z;
  const p = r.axis === "x" ? x : z;
  let t = (p - lo) / (hi - lo);
  if (r.dir < 0) t = 1 - t;
  return r.min.y + clamp(t, 0, 1) * (r.max.y - r.min.y);
}

export class World {
  readonly data: LevelData;
  boxes: RuntimeBox[];
  crates: RuntimeCrate[];
  ledges: RuntimeLedge[];
  /** Changes whenever geometry is added or removed, so the renderer and nav grid can resync. */
  revision = 0;
  readonly events: string[] = [];

  constructor(data: LevelData) {
    this.data = data;
    this.boxes = data.boxes.map((b) => ({ ...b, removed: !!b.hidden, hpLeft: b.hp ?? Infinity }));
    this.crates = data.crates.map((c) => ({ id: c.id, min: { ...c.min }, max: { ...c.max } }));
    this.ledges = data.ledges.map((l) => ({ ...l, removed: false, crumbleTimer: 0 }));
  }

  activeBoxes(): RuntimeBox[] {
    return this.boxes.filter((b) => !b.removed);
  }

  /** Remove (collapse) every box and ledge in a group. */
  removeGroup(group: string): void {
    for (const b of this.boxes) if (b.group === group) b.removed = true;
    for (const l of this.ledges) if (l.group === group) l.removed = true;
    this.revision++;
  }

  /** Reveal hidden boxes in a group (for example a bridge lowered by a lever). */
  revealGroup(group: string): void {
    for (const b of this.boxes) if (b.group === group) b.removed = false;
    for (const l of this.ledges) if (l.group === group) l.removed = false;
    this.revision++;
  }

  damageBox(box: RuntimeBox, amount: number): boolean {
    if (box.removed || !isFinite(box.hpLeft)) return false;
    box.hpLeft -= amount;
    if (box.hpLeft <= 0) {
      box.removed = true;
      this.revision++;
      return true;
    }
    return false;
  }

  /** All solid AABBs: active boxes plus crates (optionally skipping one crate). */
  solids(skipCrate?: RuntimeCrate): Aabb[] {
    const out: Aabb[] = [];
    for (const b of this.boxes) if (!b.removed) out.push(b);
    for (const c of this.crates) if (c !== skipCrate) out.push(c);
    return out;
  }

  overlapsSolid(a: Aabb, skipCrate?: RuntimeCrate): Aabb | null {
    for (const b of this.boxes) if (!b.removed && overlaps(a, b, 1e-4)) return b;
    for (const c of this.crates) if (c !== skipCrate && overlaps(a, c, 1e-4)) return c;
    return null;
  }

  /**
   * Highest walkable surface under a footprint, at or below `fromY`.
   * Returns -Infinity when there is nothing underneath.
   */
  groundHeight(x: number, z: number, fromY: number, radius = 0): { y: number; ramp?: RampDef; box?: RuntimeBox } {
    let best = -Infinity;
    let ramp: RampDef | undefined;
    let box: RuntimeBox | undefined;
    const r = radius * 0.7;
    const test = (b: Aabb, rb?: RuntimeBox) => {
      if (x + r < b.min.x || x - r > b.max.x || z + r < b.min.z || z - r > b.max.z) return;
      if (b.max.y <= fromY + 1e-4 && b.max.y > best) {
        best = b.max.y;
        box = rb;
        ramp = undefined;
      }
    };
    for (const b of this.boxes) if (!b.removed) test(b, b);
    for (const c of this.crates) test(c);
    for (const rp of this.data.ramps) {
      const h = rampHeight(rp, x, z);
      if (h !== null && h <= fromY + TUNING.player.stepHeight && h > best) {
        best = h;
        ramp = rp;
        box = undefined;
      }
    }
    return { y: best, ramp, box };
  }

  /** Lowest ceiling above a footprint starting at `fromY`. */
  ceilingHeight(x: number, z: number, fromY: number, radius: number): number {
    let best = Infinity;
    for (const b of this.solids()) {
      if (x + radius <= b.min.x || x - radius >= b.max.x || z + radius <= b.min.z || z - radius >= b.max.z) continue;
      if (b.min.y >= fromY - 1e-4 && b.min.y < best) best = b.min.y;
    }
    return best;
  }

  raycast(origin: V3, dir: V3, maxT: number, opts: { ignoreCrates?: boolean } = {}): RayHit | null {
    let best: RayHit | null = null;
    for (const b of this.boxes) {
      if (b.removed) continue;
      const h = rayAabb(origin, dir, b, best ? best.t : maxT);
      if (h && (!best || h.t < best.t)) best = { t: h.t, normal: h.normal, point: v3(), box: b };
    }
    if (!opts.ignoreCrates) {
      for (const c of this.crates) {
        const h = rayAabb(origin, dir, c, best ? best.t : maxT);
        if (h && (!best || h.t < best.t)) best = { t: h.t, normal: h.normal, point: v3(), crate: c };
      }
    }
    if (best) {
      best.point = { x: origin.x + dir.x * best.t, y: origin.y + dir.y * best.t, z: origin.z + dir.z * best.t };
    }
    return best;
  }

  /** True when nothing solid blocks the straight line between two points. */
  lineOfSight(a: V3, b: V3): boolean {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const l = Math.hypot(d.x, d.y, d.z);
    if (l < 1e-6) return true;
    const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
    return this.raycast(a, dir, l - 0.05) === null;
  }

  inVolume(list: VolumeDef[], p: V3): VolumeDef | undefined {
    return list.find((v) => inside(p, v));
  }

  activeLedges(): RuntimeLedge[] {
    return this.ledges.filter((l) => !l.removed);
  }
}
