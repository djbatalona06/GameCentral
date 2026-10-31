// The Ch4 jeep and the enemy jeeps that chase it. Both ride along a track: a centre line plus a
// sideways offset. That keeps driving simple on a phone (steer left/right, gas, brake) while the
// level still decides where the road goes.

import { TUNING } from "../../config/tuning";
import { type V3, add, approach, clamp, dist, norm, scale, sub, yawOf } from "../math";
import type { Aabb, World } from "../world/World";
import type { PursuerDef, TrackDef } from "../world/types";

const V = TUNING.vehicle;

// ------------------------------------------------------------------ track geometry

export interface TrackInfo {
  def: TrackDef;
  /** Distance along the track at each point. */
  cum: number[];
  length: number;
}

export function trackInfo(def: TrackDef): TrackInfo {
  const cum = [0];
  for (let i = 1; i < def.points.length; i++) cum.push(cum[i - 1] + dist(def.points[i - 1], def.points[i]));
  return { def, cum, length: cum[cum.length - 1] };
}

/** Position and forward direction at distance `s` along the track. */
export function trackAt(t: TrackInfo, s: number): { pos: V3; dir: V3; right: V3 } {
  const pts = t.def.points;
  const d = clamp(s, 0, t.length);
  let i = 1;
  while (i < pts.length - 1 && t.cum[i] < d) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const segLen = t.cum[i] - t.cum[i - 1] || 1;
  const k = (d - t.cum[i - 1]) / segLen;
  const dir = norm(sub(b, a));
  return { pos: add(a, scale(sub(b, a), k)), dir, right: { x: dir.z, y: 0, z: -dir.x } };
}

// ------------------------------------------------------------------ the player's jeep

export interface VehicleState {
  track: TrackInfo;
  s: number;
  lateral: number;
  speed: number;
  hp: number;
  /** Short pause after a crash so one wall doesn't hit you five times. */
  crashCooldown: number;
  pos: V3;
  yaw: number;
  done: boolean;
}

export interface VehicleInput {
  steer: number; // -1 left .. 1 right
  throttle: number; // -1 brake .. 1 gas
  boost: boolean;
}

export type VehicleEvent = { type: "crash"; pos: V3; wrecked: boolean } | { type: "end" };

export function newVehicle(track: TrackDef): VehicleState {
  const info = trackInfo(track);
  const at = trackAt(info, 0);
  return { track: info, s: 0, lateral: 0, speed: track.mode === "gunner" ? track.speed : 0, hp: V.hp, crashCooldown: 0, pos: at.pos, yaw: yawOf(at.dir), done: false };
}

export const vehicleBox = (pos: V3): Aabb => ({
  min: { x: pos.x - V.halfWidth, y: pos.y + 0.3, z: pos.z - V.halfWidth },
  max: { x: pos.x + V.halfWidth, y: pos.y + V.height, z: pos.z + V.halfWidth },
});

/**
 * Drives the jeep one step. In gunner mode Bram drives: steady speed and a gentle weave.
 * Hitting solid level geometry is a crash: the jeep slows, takes damage and bounces sideways.
 */
export function stepVehicle(v: VehicleState, inp: VehicleInput, world: World, dt: number, time: number): VehicleEvent[] {
  const ev: VehicleEvent[] = [];
  if (v.done) return ev;
  const def = v.track.def;
  const half = def.width / 2 - V.halfWidth;
  v.crashCooldown = Math.max(0, v.crashCooldown - dt);

  if (def.mode === "gunner") {
    v.speed = approach(v.speed, def.speed, V.accel * dt);
    const want = Math.sin(time * 0.6) * Math.min(V.gunnerWeave, half);
    v.lateral = approach(v.lateral, want, 2 * dt);
  } else {
    const top = def.speed * (inp.boost ? V.boostSpeed : 1);
    if (inp.throttle > 0.05) v.speed = approach(v.speed, top * inp.throttle, V.accel * dt);
    else if (inp.throttle < -0.05) v.speed = approach(v.speed, 0, V.brake * dt * -inp.throttle);
    else v.speed = Math.max(0, v.speed - v.speed * V.drag * dt);
    // Steering moves sideways faster at speed, like a real car, but never spins out.
    const grip = clamp(v.speed / 8, 0.25, 1);
    v.lateral += inp.steer * V.steerRate * grip * dt;
  }
  v.lateral = clamp(v.lateral, -half, half);

  const before = v.s;
  v.s = Math.min(v.track.length, v.s + v.speed * dt);
  const at = trackAt(v.track, v.s);
  const pos = add(at.pos, scale(at.right, v.lateral));
  const hit = world.overlapsSolid(vehicleBox(pos));
  if (hit && v.crashCooldown <= 0) {
    v.crashCooldown = 0.6;
    v.hp -= V.crashDamage;
    v.speed *= V.crashSlow;
    v.s = before;
    // Bounce away from whatever we hit.
    const c = { x: (hit.min.x + hit.max.x) / 2, z: (hit.min.z + hit.max.z) / 2 };
    const side = (pos.x - c.x) * at.right.x + (pos.z - c.z) * at.right.z >= 0 ? 1 : -1;
    v.lateral = clamp(v.lateral + side * 1.2, -half, half);
    ev.push({ type: "crash", pos, wrecked: v.hp <= 0 });
  } else if (!hit) {
    v.pos = pos;
  } else {
    // Still scraping along an obstacle during the cooldown: hold position.
    v.s = before;
  }
  v.yaw = yawOf(at.dir) + (def.mode === "drive" ? clamp(inp.steer, -1, 1) * 0.15 : 0);
  if (v.s >= v.track.length - 0.01) {
    v.done = true;
    ev.push({ type: "end" });
  }
  return ev;
}

/** Where the player sits (or stands at the mounted gun) on the jeep. */
export const seatPos = (v: VehicleState): V3 => ({ x: v.pos.x, y: v.pos.y + V.seatHeight, z: v.pos.z });

// ------------------------------------------------------------------ pursuers

export interface Pursuer {
  def: PursuerDef;
  track: TrackInfo;
  s: number;
  lateral: number;
  pos: V3;
  yaw: number;
  hp: number;
  alive: boolean;
  fireTimer: number;
  hitFlash: number;
}

export function newPursuer(def: PursuerDef, track: TrackDef, playerS: number): Pursuer {
  const info = trackInfo(track);
  const s = clamp(playerS + def.gap - 25, 0, info.length);
  const at = trackAt(info, s);
  return { def, track: info, s, lateral: def.lateral, pos: add(at.pos, scale(at.right, def.lateral)), yaw: yawOf(at.dir), hp: def.hp, alive: true, fireTimer: 2, hitFlash: 0 };
}

/** Hit box for shooting a pursuer (the jeep body plus its gunner). */
export const pursuerBox = (p: Pursuer): Aabb => ({
  min: { x: p.pos.x - V.halfWidth, y: p.pos.y + 0.3, z: p.pos.z - V.halfWidth },
  max: { x: p.pos.x + V.halfWidth, y: p.pos.y + V.height + 0.9, z: p.pos.z + V.halfWidth },
});

/** Gunner's head, for headshots that take the jeep out faster. */
export const pursuerHead = (p: Pursuer): { c: V3; r: number } => ({ c: { x: p.pos.x, y: p.pos.y + V.height + 0.7, z: p.pos.z }, r: 0.28 });

/**
 * Pursuers try to hold their gap to the player's jeep and fire bursts. Returns true when this
 * pursuer fires a shot this step.
 */
export function stepPursuer(p: Pursuer, playerS: number, playerSpeed: number, dt: number, rand: () => number, time: number): boolean {
  if (!p.alive) return false;
  p.hitFlash = Math.max(0, p.hitFlash - dt);
  const want = playerS + p.def.gap;
  const speed = Math.max(0, playerSpeed + (want - p.s) * TUNING.pursuer.catchUp);
  p.s = clamp(p.s + speed * dt, 0, p.track.length);
  const half = p.track.def.width / 2 - V.halfWidth;
  p.lateral = clamp(p.def.lateral + Math.sin(time * 0.8 + p.def.gap) * 1.2, -half, half);
  const at = trackAt(p.track, p.s);
  p.pos = add(at.pos, scale(at.right, p.lateral));
  p.yaw = yawOf(at.dir);
  p.fireTimer -= dt;
  if (p.fireTimer <= 0) {
    const [a, b] = TUNING.pursuer.fireInterval;
    p.fireTimer = a + rand() * (b - a);
    return true;
  }
  return false;
}
