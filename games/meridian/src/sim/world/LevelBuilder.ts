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

export class LevelBuilder {
  private n = 0;
  readonly data: LevelData;

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

  /** Tall boundary walls on both sides of a corridor running along Z. */
  walls(halfWidth: number, z0: number, z1: number, y0 = -8, y1 = 26): this {
    this.box([-halfWidth - 2, y0, z0], [-halfWidth, y1, z1], "rock");
    this.box([halfWidth, y0, z0], [halfWidth + 2, y1, z1], "rock");
    return this;
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
    const preset = { sandstorm: { sightScale: 0.35, noiseScale: 0.5, fog: 0.06 }, snow: { sightScale: 0.7, noiseScale: 0.6, fog: 0.025 }, rain: { sightScale: 0.8, noiseScale: 0.5, fog: 0.015 } }[kind];
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
    return this.data;
  }
}

