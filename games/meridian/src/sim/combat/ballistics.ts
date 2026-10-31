// Grenade arcs, health regeneration and aim assist: pure functions shared by player and enemies.

import { TUNING } from "../../config/tuning";
import { type V3, angleDiff, lookDir, sub, len, yawOf } from "../math";
import type { World } from "../world/World";

export interface ArcPoint {
  pos: V3;
  t: number;
}

/**
 * Simulates a thrown object's path with gravity and bounces against world geometry.
 * Used both for the on-screen arc preview and for the real grenade, so they always match.
 */
export function simulateArc(world: World | null, start: V3, vel: V3, duration: number, step = 1 / 30): ArcPoint[] {
  const g = TUNING.sim.gravity;
  const pts: ArcPoint[] = [{ pos: { ...start }, t: 0 }];
  const p = { ...start };
  const v = { ...vel };
  for (let t = step; t <= duration + 1e-6; t += step) {
    v.y -= g * step;
    const next = { x: p.x + v.x * step, y: p.y + v.y * step, z: p.z + v.z * step };
    if (world) {
      const d = sub(next, p);
      const l = len(d);
      if (l > 1e-6) {
        const dir = { x: d.x / l, y: d.y / l, z: d.z / l };
        const hit = world.raycast(p, dir, l);
        if (hit) {
          // Reflect velocity on the hit normal and lose energy.
          const n = hit.normal;
          const vn = v.x * n.x + v.y * n.y + v.z * n.z;
          v.x = (v.x - 2 * vn * n.x) * TUNING.grenade.bounce;
          v.y = (v.y - 2 * vn * n.y) * TUNING.grenade.bounce;
          v.z = (v.z - 2 * vn * n.z) * TUNING.grenade.bounce;
          next.x = hit.point.x + n.x * 0.05;
          next.y = hit.point.y + n.y * 0.05;
          next.z = hit.point.z + n.z * 0.05;
        }
      }
    }
    p.x = next.x;
    p.y = next.y;
    p.z = next.z;
    pts.push({ pos: { ...p }, t });
  }
  return pts;
}

/** Initial throw velocity from the camera's yaw/pitch, biased upward for a lob. */
export function throwVelocity(yaw: number, pitch: number, speed = TUNING.grenade.throwSpeed): V3 {
  const d = lookDir(yaw, pitch + TUNING.grenade.throwPitch);
  return { x: d.x * speed, y: d.y * speed, z: d.z * speed };
}

export interface HealthState {
  hp: number;
  max: number;
  sinceDamage: number;
}

export function tickHealth(h: HealthState, dt: number, regenScale = 1): void {
  h.sinceDamage += dt;
  if (h.hp > 0 && h.sinceDamage >= TUNING.health.regenDelay && h.hp < h.max) {
    h.hp = Math.min(h.max, h.hp + TUNING.health.regenRate * regenScale * dt);
  }
}

export function applyDamage(h: HealthState, amount: number): boolean {
  if (h.hp <= 0) return false;
  h.hp = Math.max(0, h.hp - amount);
  h.sinceDamage = 0;
  return h.hp <= 0;
}

export type AimAssistLevel = "off" | "low" | "high";

export interface AssistTarget {
  pos: V3;
}

export interface AssistResult {
  /** Multiplier on look sensitivity (slow-down near targets). */
  sensitivity: number;
  /** Rotation to apply when aim starts (snap-to-target). */
  snapYaw: number;
  snapPitch: number;
  /** Bullet-magnetism correction for the next shot. */
  magnetYaw: number;
  magnetPitch: number;
}

/** Finds the target closest to the reticle and computes slowdown, snap and magnetism. */
export function aimAssist(level: AimAssistLevel, eye: V3, yaw: number, pitch: number, targets: AssistTarget[]): AssistResult {
  const none: AssistResult = { sensitivity: 1, snapYaw: 0, snapPitch: 0, magnetYaw: 0, magnetPitch: 0 };
  if (level === "off" || targets.length === 0) return none;
  const cfg = TUNING.aimAssist[level];
  let best: { dy: number; dp: number; ang: number } | null = null;
  for (const t of targets) {
    const d = sub(t.pos, eye);
    const dist = len(d);
    if (dist < 0.5 || dist > 60) continue;
    const ty = yawOf(d);
    const tp = Math.asin(d.y / dist);
    const dy = angleDiff(yaw, ty);
    const dp = tp - pitch;
    const ang = Math.hypot(dy, dp);
    if (!best || ang < best.ang) best = { dy, dp, ang };
  }
  if (!best) return none;
  const res = { ...none };
  if (best.ang < cfg.slowdownAngle) res.sensitivity = cfg.slowdownFactor;
  if (best.ang < cfg.snapAngle) {
    res.snapYaw = best.dy;
    res.snapPitch = best.dp;
  }
  if (best.ang < cfg.magnetAngle) {
    res.magnetYaw = best.dy;
    res.magnetPitch = best.dp;
  }
  return res;
}
