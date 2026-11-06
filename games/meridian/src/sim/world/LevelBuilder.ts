// A tiny greybox DSL. Chapters describe their levels with calls like
//   b.box([0,0,0], [10,1,10], "sand").ledge(...)
// and the builder produces plain LevelData.

import type { V3 } from "../math";
import type { ArchetypeId } from "../ai/archetypes";
import type { WeaponId } from "../combat/weapons";
import type {
  BoxDef,
  HazardDef,
  InteractKind,
  LevelData,
  Material,
  MoverDef,
  PickupType,
  SearchlightDef,
  TrackDef,
  WeatherDef,
} from "./types";

export type Vec = [number, number, number];
const v = (a: Vec): V3 => ({ x: a[0], y: a[1], z: a[2] });

type BoxOpts = Partial<Omit<BoxDef, "id" | "min" | "max" | "material">>;

/** A side of the playable area: an invisible barrier, drawn as a low rock lip you can see over. */
interface EdgeDef {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  /** +1 when the play area is on the + side of this edge (along `axis`), -1 when on the - side. */
  inward: 1 | -1;
  material: Material;
  /** "x": a side wall (thin in X, runs along Z). "z": an end cap (thin in Z, runs along X). */
  axis?: "x" | "z";
}

/** Height of the visible rock lip above the local floor: low enough to see the land beyond. */
export const LIP_HEIGHT = 1.1;

export class LevelBuilder {
  private n = 0;
  readonly data: LevelData;
  /**
   * Open-world mode: `walls()` no longer builds 34 m canyon walls. Each side becomes an invisible
   * barrier (same place, so no route shortcuts) drawn as a low lip of rock, and the Blender
   * terrain and sky carry the view out to the horizon.
   */
  private open = false;
  private edges: EdgeDef[] = [];
  private openings: Array<{ inward: 1 | -1; x: number; z0: number; z1: number }> = [];

  constructor(id: string, sky: LevelData["sky"], killY = -30) {
    this.data = {
      id,
      sky,
      boxes: [],
      ramps: [],
      ledges: [],
      climbWalls: [],
      ropes: [],
      ziplines: [],
      beams: [],
      water: [],
      grass: [],
      crates: [],
      pickups: [],
      collectibles: [],
      interacts: [],
      triggers: [],
      checkpoints: [],
      enemies: [],
      arenas: [],
      camHints: [],
      movers: [],
      hazards: [],
      tracks: [],
      pursuers: [],
      weather: [],
      searchlights: [],
      killY,
    };
  }

  private id(prefix: string): string {
    return `${prefix}${++this.n}`;
  }

  /** Solid box from min corner to max corner. Ledges listed in opts are generated on the top edges. */
  box(min: Vec, max: Vec, material: Material = "rock", opts: BoxOpts = {}): this {
    const box: BoxDef = { id: this.id("box"), min: v(min), max: v(max), material, ...opts };
    this.data.boxes.push(box);
    for (const side of opts.ledges ?? []) this.edgeLedge(box, side);
    return this;
  }

  /** Box described by its centre on the ground (x, z), base height, size and height. */
  block(x: number, z: number, w: number, d: number, y0: number, y1: number, material: Material = "rock", opts: BoxOpts = {}): this {
    return this.box([x - w / 2, y0, z - d / 2], [x + w / 2, y1, z + d / 2], material, opts);
  }

  /** A climbable pillar: ledges on all four top edges. */
  pillar(x: number, z: number, size: number, height: number, base = 0, material: Material = "stone"): this {
    return this.block(x, z, size, size, base, base + height, material, { ledges: ["n", "s", "e", "w"] });
  }

  private edgeLedge(b: BoxDef, side: "n" | "s" | "e" | "w", group?: string): void {
    const y = b.max.y;
    const inset = 0.05;
    let a: V3, c: V3, normal: V3;
    switch (side) {
      case "n":
        a = { x: b.min.x + inset, y, z: b.max.z };
        c = { x: b.max.x - inset, y, z: b.max.z };
        normal = { x: 0, y: 0, z: 1 };
        break;
      case "s":
        a = { x: b.min.x + inset, y, z: b.min.z };
        c = { x: b.max.x - inset, y, z: b.min.z };
        normal = { x: 0, y: 0, z: -1 };
        break;
      case "e":
        a = { x: b.max.x, y, z: b.min.z + inset };
        c = { x: b.max.x, y, z: b.max.z - inset };
        normal = { x: 1, y: 0, z: 0 };
        break;
      default:
        a = { x: b.min.x, y, z: b.min.z + inset };
        c = { x: b.min.x, y, z: b.max.z - inset };
        normal = { x: -1, y: 0, z: 0 };
    }
    this.data.ledges.push({ id: this.id("ledge"), a, b: c, normal, group: group ?? b.group });
  }

  /** Free-standing ledge (a handhold strip on a wall). */
  ledge(a: Vec, b: Vec, normal: Vec, opts: { crumble?: boolean; group?: string } = {}): this {
    this.data.ledges.push({ id: this.id("ledge"), a: v(a), b: v(b), normal: v(normal), ...opts });
    return this;
  }

  /**
   * A row of hand-holds up a wall face: thin protruding strips the player can hop between.
   * Useful for vertical climbs. `face` is the wall plane coordinate on `axis`.
   */
  handholds(axis: "x" | "z", face: number, normalSign: 1 | -1, from: number, to: number, heights: number[], width = 1.2, crumble: number[] = []): this {
    for (let i = 0; i < heights.length; i++) {
      const opts = { crumble: crumble.includes(i) };
      const h = heights[i];
      const t = heights.length === 1 ? 0.5 : i / (heights.length - 1);
      const along = from + (to - from) * t;
      const out = face + normalSign * 0.12;
      if (axis === "z") {
        this.box([along - width / 2, h - 0.15, Math.min(face, out)], [along + width / 2, h, Math.max(face, out)], "stone");
        this.ledge([along - width / 2 + 0.05, h, out], [along + width / 2 - 0.05, h, out], [0, 0, normalSign], opts);
      } else {
        this.box([Math.min(face, out), h - 0.15, along - width / 2], [Math.max(face, out), h, along + width / 2], "stone");
        this.ledge([out, h, along - width / 2 + 0.05], [out, h, along + width / 2 - 0.05], [normalSign, 0, 0], opts);
      }
    }
    return this;
  }

  ramp(min: Vec, max: Vec, axis: "x" | "z", dir: 1 | -1, material: Material = "sand", slide = false): this {
    this.data.ramps.push({ id: this.id("ramp"), min: v(min), max: v(max), axis, dir, slide, material });
    return this;
  }

  climbWall(min: Vec, max: Vec, normal: Vec): this {
    this.data.climbWalls.push({ id: this.id("wall"), min: v(min), max: v(max), normal: v(normal) });
    return this;
  }

  rope(anchor: Vec, length: number, grapple = false): this {
    this.data.ropes.push({ id: this.id("rope"), anchor: v(anchor), length, grapple });
    return this;
  }

  zipline(a: Vec, b: Vec): this {
    this.data.ziplines.push({ id: this.id("zip"), a: v(a), b: v(b) });
    return this;
  }

  /** Narrow balance beam between two points (top surface at the points' height). */
  beam(a: Vec, b: Vec): this {
    const w = 0.22;
    const min: Vec = [Math.min(a[0], b[0]) - w / 2, a[1] - 0.2, Math.min(a[2], b[2]) - w / 2];
    const max: Vec = [Math.max(a[0], b[0]) + w / 2, a[1], Math.max(a[2], b[2]) + w / 2];
    this.box(min, max, "wood");
    this.data.beams.push({ id: this.id("beam"), a: v(a), b: v(b) });
    return this;
  }

  water(min: Vec, max: Vec): this {
    this.data.water.push({ id: this.id("water"), min: v(min), max: v(max) });
    return this;
  }

  grass(min: Vec, max: Vec): this {
    this.data.grass.push({ id: this.id("grass"), min: v(min), max: v(max) });
    return this;
  }

  cover(x: number, z: number, w: number, d: number, y0: number, kind: "low" | "high", material: Material = "stone", hp?: number): this {
    const h = kind === "low" ? 1.05 : 2.4;
    return this.block(x, z, w, d, y0, y0 + h, material, { cover: kind, hp });
  }

  barrel(x: number, z: number, y0: number): this {
    return this.block(x, z, 0.7, 0.7, y0, y0 + 1.0, "metal", { explosive: true, hp: 20 });
  }

  crate(x: number, z: number, y0: number, size = 1.2): this {
    this.data.crates.push({
      id: this.id("crate"),
      min: { x: x - size / 2, y: y0, z: z - size / 2 },
      max: { x: x + size / 2, y: y0 + size, z: z + size / 2 },
    });
    return this;
  }

  pickup(pos: Vec, type: PickupType, amount: number, weapon?: WeaponId): this {
    this.data.pickups.push({ id: this.id("pickup"), pos: v(pos), type, amount, weapon });
    return this;
  }

  treasure(id: string, pos: Vec, name: string, description: string): this {
    this.data.collectibles.push({ id, pos: v(pos), name, description });
    return this;
  }

  interact(id: string, pos: Vec, kind: InteractKind, label: string, event: string, opts: { radius?: number; once?: boolean; hidden?: boolean } = {}): this {
    this.data.interacts.push({ id, pos: v(pos), kind, label, event, radius: opts.radius ?? 1.6, once: opts.once ?? true, hidden: opts.hidden });
    return this;
  }

  trigger(min: Vec, max: Vec, event: string, once = true): this {
    this.data.triggers.push({ id: this.id("trig"), min: v(min), max: v(max), event, once });
    return this;
  }

  checkpoint(id: string, pos: Vec, yawDeg: number, label: string): this {
    this.data.checkpoints.push({ id, pos: v(pos), yaw: (yawDeg * Math.PI) / 180, label });
    return this;
  }

  arena(id: string, min: Vec, max: Vec): this {
    this.data.arenas.push({ id, min: v(min), max: v(max) });
    return this;
  }

  enemy(archetype: ArchetypeId, pos: Vec, yawDeg: number, arena: string, opts: { patrol?: Vec[]; wave?: string; alerted?: boolean } = {}): this {
    this.data.enemies.push({
      id: this.id("enemy"),
      archetype,
      pos: v(pos),
      yaw: (yawDeg * Math.PI) / 180,
      arena,
      patrol: opts.patrol?.map(v),
      wave: opts.wave,
      alerted: opts.alerted,
    });
    return this;
  }

  camHint(min: Vec, max: Vec, opts: { pitch?: number; distance?: number }): this {
    this.data.camHints.push({ id: this.id("cam"), min: v(min), max: v(max), ...opts });
    return this;
  }

  // ------------------------------------------------------------------ open maps and loot

  /**
   * The invisible edge of the playable area: four very tall boxes around a rectangle. They stop
   * the player and enemies but nothing is drawn, so the land and sky look like they go on.
   */
  bounds(minX: number, maxX: number, z0: number, z1: number, y0 = -60, y1 = 240): this {
    const t = 2;
    const o = { boundary: true };
    this.box([minX - t, y0, z0 - t], [minX, y1, z1 + t], "rock", o);
    this.box([maxX, y0, z0 - t], [maxX + t, y1, z1 + t], "rock", o);
    this.box([minX, y0, z0 - t], [maxX, y1, z0], "rock", o);
    this.box([minX, y0, z1], [maxX, y1, z1 + t], "rock", o);
    return this;
  }

  /** Wide, walkable ground beside the main route: a thin slab whose top is at `y`. */
  apron(x0: number, x1: number, z0: number, z1: number, y: number, material: Material = "ground"): this {
    return this.box([Math.min(x0, x1), y - 1, Math.min(z0, z1)], [Math.max(x0, x1), y, Math.max(z0, z1)], material);
  }

  /** A loot crate opened once with Interact. `pos` is on the ground. */
  cache(id: string, pos: Vec, tier: "common" | "rare" | "boundary" = "common"): this {
    this.data.interacts.push({ id, pos: v([pos[0], pos[1] + 0.6, pos[2]]), kind: "cache", label: tier === "common" ? "Open crate" : "Open cache", event: `cache:${id}`, radius: 1.8, once: true, tier });
    return this;
  }

  /**
   * A rare cache out at the edge of the map, marked with a tall cairn, flag or buoy you can spot
   * from far away (the marker is solid, so it doubles as a little cover).
   */
  boundaryCache(id: string, pos: Vec): this {
    this.block(pos[0] + 1.3, pos[2], 0.5, 0.5, pos[1], pos[1] + 3.2, "stone", { group: `marker-${id}` });
    return this.cache(id, pos, "boundary");
  }

  /** A safe spot to buy, craft and upgrade. Using it also saves your progress. */
  camp(id: string, pos: Vec, label: string): this {
    this.data.interacts.push({ id, pos: v([pos[0], pos[1] + 0.8, pos[2]]), kind: "camp", label: `Rest at ${label}`, event: `camp:${id}`, radius: 2.2, once: false });
    return this;
  }

  /** Turns on open-world edges for this level (see `open`). Act I chapters call this first. */
  openWorld(): this {
    this.open = true;
    return this;
  }

  /**
   * The two sides of a corridor running along Z. In open-world mode they are invisible barriers
   * with a low rock lip; otherwise (test levels) they are the old tall rock walls.
   */
  walls(halfWidth: number, z0: number, z1: number, y0 = -8, y1 = 26, material: Material = "rock"): this {
    this.edgeWall(-halfWidth - 2, -halfWidth, z0, z1, 1, y0, y1, material);
    this.edgeWall(halfWidth, halfWidth + 2, z0, z1, -1, y0, y1, material);
    return this;
  }

  /** One side wall from x0 to x1 (thin in X) along z0..z1; `inward` points at the play area. */
  edgeWall(x0: number, x1: number, z0: number, z1: number, inward: 1 | -1, y0 = -8, y1 = 26, material: Material = "rock"): this {
    if (!this.open) return this.box([x0, y0, z0], [x1, y1, z1], material);
    this.edges.push({ x0, x1, z0, z1, y0, y1, inward, material });
    return this;
  }

  /** An end of the map (thin in Z, across X); `inward` is +1 when the play area is at larger Z. */
  edgeCap(min: Vec, max: Vec, inward: 1 | -1, material: Material = "rock"): this {
    if (!this.open) return this.box(min, max, material);
    this.edges.push({ x0: min[0], x1: max[0], z0: min[2], z1: max[2], y0: min[1], y1: max[1], inward, material, axis: "z" });
    return this;
  }

  /**
   * A side pocket: the edge on one side opens up into an extra patch of ground with a boundary
   * cache (and its marker) at the far end. Pockets are dead ends, so they never skip a climb.
   * `edgeX` is the inner face of that side's edge; `floorY` must match the corridor floor there.
   */
  pocket(id: string, side: "w" | "e", edgeX: number, z0: number, z1: number, depth: number, floorY: number, material: Material = "ground"): this {
    const inward: 1 | -1 = side === "w" ? 1 : -1;
    const sign = side === "w" ? -1 : 1;
    this.openings.push({ inward, x: edgeX, z0, z1 });
    const far = edgeX + sign * (depth + 2);
    const xa = Math.min(edgeX, far);
    const xb = Math.max(edgeX, far);
    this.box([xa, floorY - 3, z0], [xb, floorY, z1], material);
    // Edges around the pocket: the far side (with a lip) and both ends.
    const outer: [number, number] = side === "w" ? [xa - 2, xa] : [xb, xb + 2];
    this.edges.push({ x0: outer[0], x1: outer[1], z0: z0 - 2, z1: z1 + 2, y0: floorY - 10, y1: floorY + 30, inward, material: "rock" });
    this.box([xa, floorY - 40, z0 - 2], [xb, floorY + 150, z0], "rock", { boundary: true });
    this.box([xa, floorY - 40, z1], [xb, floorY + 150, z1 + 2], "rock", { boundary: true });
    this.box([xa, floorY - 3, z0 - 2], [xb, floorY + LIP_HEIGHT, z0], "rock");
    this.box([xa, floorY - 3, z1], [xb, floorY + LIP_HEIGHT, z1 + 2], "rock");
    // Some rocks to hide behind, and the loot at the far end.
    const mid = (z0 + z1) / 2;
    const cx = (xa + xb) / 2;
    this.cover(cx, mid - (z1 - z0) * 0.22, 2.4, 0.8, floorY, "low", "stone");
    this.cover(cx + sign * 1.2, mid + (z1 - z0) * 0.2, 0.8, 2.2, floorY, "high", "stone");
    return this.boundaryCache(id, [far - sign * 3.2, floorY, mid]);
  }

  /** Builds the invisible barriers and the low rock lips for every open-world edge. */
  private finishEdges(): void {
    // Floors only: not cover, barrels, or other tall walls and end caps.
    const solids = this.data.boxes.filter((b) => !b.boundary && !b.cover && !b.explosive && b.max.y - b.min.y <= 24);
    const water = this.data.water;
    for (const e of this.edges) {
      const ax = e.axis ?? "x";
      // Work in (u = along the edge, w = across it) so side walls and end caps share one routine.
      const u0 = ax === "x" ? e.z0 : e.x0;
      const u1 = ax === "x" ? e.z1 : e.x1;
      const inner = ax === "x" ? (e.inward === 1 ? e.x1 : e.x0) : e.inward === 1 ? e.z1 : e.z0;
      const holes = this.openings
        .filter((o) => ax === "x" && o.inward === e.inward && Math.abs(o.x - inner) < 0.01 && o.z1 > u0 && o.z0 < u1)
        .sort((a, b) => a.z0 - b.z0);
      const parts: Array<[number, number]> = [];
      let u = u0;
      for (const h of holes) {
        if (h.z0 > u) parts.push([u, h.z0]);
        u = Math.max(u, h.z1);
      }
      if (u < u1) parts.push([u, u1]);
      const rect = (a0: number, a1: number, ylo: number, yhi: number): [Vec, Vec] =>
        ax === "x" ? [[e.x0, ylo, a0], [e.x1, yhi, a1]] : [[a0, ylo, e.z0], [a1, yhi, e.z1]];
      for (const [ua, ub] of parts) {
        // The barrier: same footprint as the old wall and much taller, but invisible.
        const [bmin, bmax] = rect(ua, ub, e.y0 - 30, Math.max(e.y1, e.y0) + 120);
        this.box(bmin, bmax, e.material, { boundary: true });
        // The lip follows the floor beside it, in short slices.
        const step = 3;
        for (let s0 = ua; s0 < ub - 1e-6; s0 += step) {
          const s1 = Math.min(ub, s0 + step);
          const w0 = e.inward === 1 ? inner : inner - 1.5;
          const w1 = e.inward === 1 ? inner + 1.5 : inner;
          const [sx0, sx1, sz0, sz1] = ax === "x" ? [w0, w1, s0, s1] : [s0, s1, w0, w1];
          let floor = -Infinity;
          for (const b of solids) {
            if (b.max.y > e.y1 || b.max.x < sx0 || b.min.x > sx1 || b.max.z < sz0 || b.min.z > sz1) continue;
            floor = Math.max(floor, b.max.y);
          }
          for (const w of water) if (!(w.max.x < sx0 || w.min.x > sx1 || w.max.z < sz0 || w.min.z > sz1)) floor = Math.max(floor, w.max.y);
          if (!Number.isFinite(floor)) continue; // a chasm: nothing to stand on, no lip needed
          const [lmin, lmax] = rect(s0, s1, e.y0, floor + LIP_HEIGHT);
          this.box(lmin, lmax, e.material);
        }
      }
    }
    this.edges = [];
  }

  /** Makes every box and ledge in `group` travel along `path` (offsets from where they start). */
  mover(id: string, group: string, path: Vec[], speed: number, opts: Partial<Pick<MoverDef, "mode" | "pause" | "startActive">> = {}): this {
    this.data.movers.push({ id, group, path: path.map(v), speed, mode: opts.mode ?? "pingpong", pause: opts.pause ?? 1.5, startActive: opts.startActive ?? true });
    return this;
  }

  /** A box that kills (or hurts) on contact; give it a velocity to make it sweep. */
  hazard(id: string, kind: HazardDef["kind"], min: Vec, max: Vec, opts: Partial<Omit<HazardDef, "id" | "kind" | "min" | "max" | "vel">> & { vel?: Vec } = {}): this {
    this.data.hazards.push({
      id,
      kind,
      min: v(min),
      max: v(max),
      vel: v(opts.vel ?? [0, 0, 0]),
      travel: opts.travel ?? 0,
      every: opts.every ?? 0,
      damage: opts.damage ?? Infinity,
      startActive: opts.startActive ?? true,
      warn: opts.warn,
    });
    return this;
  }

  /** A vehicle chase road through the given centre points. */
  track(id: string, points: Vec[], width: number, mode: TrackDef["mode"], speed: number, onEnd: string): this {
    this.data.tracks.push({ id, points: points.map(v), width, mode, speed, onEnd });
    return this;
  }

  pursuer(track: string, group: string, gap: number, lateral: number, hp = 160): this {
    this.data.pursuers.push({ id: this.id("pursuer"), track, group, gap, lateral, hp });
    return this;
  }

  weather(id: string, kind: WeatherDef["kind"], min: Vec, max: Vec, opts: Partial<Pick<WeatherDef, "sightScale" | "noiseScale" | "fog" | "startActive">> & { wind?: Vec } = {}): this {
    const preset = { sandstorm: { sightScale: 0.35, noiseScale: 0.5, fog: 0.06 }, snow: { sightScale: 0.7, noiseScale: 0.6, fog: 0.01 }, rain: { sightScale: 0.8, noiseScale: 0.5, fog: 0.015 } }[kind];
    this.data.weather.push({ id, kind, min: v(min), max: v(max), ...preset, wind: v(opts.wind ?? [0, 0, 0]), startActive: opts.startActive ?? true });
    const w = this.data.weather[this.data.weather.length - 1];
    if (opts.sightScale !== undefined) w.sightScale = opts.sightScale;
    if (opts.noiseScale !== undefined) w.noiseScale = opts.noiseScale;
    if (opts.fog !== undefined) w.fog = opts.fog;
    return this;
  }

  searchlight(id: string, pos: Vec, yawDeg: number, sweepDeg: number, period: number, arena: string, range = 28, coneDeg = 9): this {
    const r = Math.PI / 180;
    const def: SearchlightDef = { id, pos: v(pos), yaw: yawDeg * r, sweep: sweepDeg * r, period, range, cone: coneDeg * r, arena };
    this.data.searchlights.push(def);
    return this;
  }

  /** Scenery streams past at this speed (metres per second); used for the moving train. */
  scroll(speed: number): this {
    this.data.scroll = { speed };
    return this;
  }

  build(): LevelData {
    if (this.edges.length) this.finishEdges();
    return this.data;
  }
}

