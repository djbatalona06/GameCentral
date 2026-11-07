// Aim assist: helps stick and touch players aim about as well as a mouse, without taking control
// away from them. Four parts, each gentle and each off for mouse players (except the High setting,
// which players pick as an accessibility option):
//  1. Friction: the camera turns a little slower while the reticle crosses an enemy, so you don't
//     sweep past them. It fades in smoothly (no sudden "sticky" edge).
//  2. Tracking: while you are steering, the reticle follows part of an enemy's sideways movement.
//  3. Snap (High only): when you start aiming close to an enemy, the camera eases onto them.
//  4. Magnetism: a shot that only just misses bends onto the enemy.
// Every zone is measured in "target sizes", the angle an enemy's body covers from the camera, so a
// far-away enemy gets a small zone and a close one a big zone. See docs/input-feel.md.

import { TUNING } from "../../config/tuning";
import { type V3, angleDiff, clamp, dot, lookDir, sub, len, yawOf } from "../math";

export type AimAssistLevel = "off" | "low" | "high";
export type AssistDevice = "touch" | "gamepad" | "keyboard";

export interface AssistTarget {
  /** Stable id (enemy id), so tracking can follow the same target from tick to tick. */
  id?: string;
  /** The point to aim at (centre of mass). */
  pos: V3;
  /** Body radius in metres; defaults to TUNING.aimAssist.targetRadius. */
  radius?: number;
}

/** The target the assist picked this tick. Angles are where it is, seen from the eye. */
export interface AssistPick {
  id: string;
  /** Absolute yaw and pitch to the target. */
  yaw: number;
  pitch: number;
  /** Turn needed to put the reticle on it. */
  dy: number;
  dp: number;
  /** Angle between the reticle and the target, in radians. */
  angle: number;
  /** One "target size" at this distance, in radians. */
  size: number;
  dist: number;
  /** Body radius in metres. */
  radius: number;
}

export interface AssistResult {
  /** Multiplier on look speed (friction near a target). 1 = no change. */
  sensitivity: number;
  /** The full turn a snap would make (the caller eases it in, see AimAssistState). */
  snapYaw: number;
  snapPitch: number;
  /** Bullet-magnetism correction for the next shot. */
  magnetYaw: number;
  magnetPitch: number;
  pick: AssistPick | null;
}

export interface AssistOptions {
  /** Which device is aiming. Mouse ("keyboard") gets no friction or tracking. */
  device?: AssistDevice;
}

/** One target size: the angle a body of `radius` covers at `dist`, never smaller than `minZone`. */
export const targetSize = (dist: number, radius: number, minZone = 0): number => Math.max(minZone, Math.atan(radius / Math.max(dist, 0.01)));

/**
 * Friction curve. `x` is the reticle's distance from the target in zone widths (0 = dead centre,
 * 1 = edge of the zone). Returns the look-speed multiplier: 1 - alpha at the centre, rising
 * smoothly to exactly 1 at the edge, so there is no jolt when the reticle leaves the zone.
 */
export function frictionScale(x: number, alpha: number, k: number): number {
  if (x >= 1 || alpha <= 0) return 1;
  const e1 = Math.exp(-k);
  const w = (Math.exp(-k * Math.max(0, x)) - e1) / (1 - e1);
  return 1 - alpha * w;
}

/** Picks the best target and works out friction, snap and magnetism for this tick. */
export function aimAssist(level: AimAssistLevel, eye: V3, yaw: number, pitch: number, targets: AssistTarget[], opts: AssistOptions = {}): AssistResult {
  const none: AssistResult = { sensitivity: 1, snapYaw: 0, snapPitch: 0, magnetYaw: 0, magnetPitch: 0, pick: null };
  if (level === "off" || targets.length === 0) return none;
  const A = TUNING.aimAssist;
  const cfg = A[level];
  const fwd = lookDir(yaw, pitch);
  const cosMax = Math.cos(A.maxAngle);
  let best: (AssistPick & { score: number }) | null = null;
  targets.forEach((t, i) => {
    const d = sub(t.pos, eye);
    const dist = len(d);
    if (dist < 0.5 || dist > A.maxRange) return;
    // Alignment from the dot product of the view direction and the direction to the target.
    const c = dot(fwd, d) / dist;
    if (c < cosMax) return;
    const angle = Math.acos(clamp(c, -1, 1));
    const radius = t.radius ?? A.targetRadius;
    const size = targetSize(dist, radius, cfg.minZone);
    const score = A.weightAngle * (angle / size) + A.weightDistance * (dist / A.maxRange);
    if (best && score >= best.score) return;
    const ty = yawOf(d);
    const tp = Math.asin(clamp(d.y / dist, -1, 1));
    best = { id: t.id ?? `#${i}`, yaw: ty, pitch: tp, dy: angleDiff(yaw, ty), dp: tp - pitch, angle, size, dist, radius, score };
  });
  if (!best) return none;
  const b = best as AssistPick & { score: number };
  const { score: _score, ...pick } = b;
  const res: AssistResult = { ...none, pick };
  const mouse = opts.device === "keyboard";
  const zones = b.angle / b.size;
  // A mouse is already precise: friction would only feel like mud. Only High (an accessibility
  // choice) helps mouse players, with snap and magnetism.
  if (!mouse) res.sensitivity = frictionScale(zones / cfg.zone, cfg.frictionAlpha, cfg.frictionK);
  const helpMouse = !mouse || level === "high";
  if (helpMouse && zones < cfg.snapZone) {
    res.snapYaw = b.dy;
    res.snapPitch = b.dp;
  }
  // Magnetism only rescues near misses: a shot that already hits the body (or aims at the head on
  // purpose) is left alone. The body's real size decides that, not the enlarged far-target zone.
  const hits = b.angle < Math.atan(b.radius / b.dist);
  if (helpMouse && !hits && zones < cfg.magnetZone) {
    res.magnetYaw = b.dy;
    res.magnetPitch = b.dp;
  }
  return res;
}

/** Largest tracking turn in one tick, so a target popping out from behind another never yanks the view. */
const MAX_TRACK_STEP = 0.04;

/**
 * The parts of aim assist that need memory between ticks: rotational tracking (it needs the
 * target's angle last tick to know how fast it moves across the view) and the eased snap.
 */
export class AimAssistState {
  private last: { id: string; yaw: number; pitch: number } | null = null;
  private snap: { id: string; left: number } | null = null;
  private wasAiming = false;

  reset(): void {
    this.last = null;
    this.snap = null;
    this.wasAiming = false;
  }

  /**
   * Extra camera turn for this tick. `steering` is true while the player moves the stick, swipes
   * or walks: tracking never aims on its own while the player is idle.
   */
  update(level: AimAssistLevel, aiming: boolean, res: AssistResult, opts: { device: AssistDevice; steering: boolean; dt: number }): { yaw: number; pitch: number } {
    const out = { yaw: 0, pitch: 0 };
    const pick = res.pick;
    const startedAiming = aiming && !this.wasAiming;
    this.wasAiming = aiming;
    if (!aiming || level === "off" || !pick) {
      this.last = null;
      if (!aiming) this.snap = null;
      return out;
    }
    const cfg = TUNING.aimAssist[level];

    // Eased snap: each tick turn a share of what is left, so the camera arrives exactly when the
    // snap time runs out, and keeps pointing at a target that moves meanwhile.
    if (startedAiming && (res.snapYaw || res.snapPitch)) this.snap = { id: pick.id, left: cfg.snapTime };
    if (this.snap) {
      if (this.snap.id !== pick.id) this.snap = null;
      else {
        const share = Math.min(1, opts.dt / Math.max(this.snap.left, 1e-4));
        out.yaw += pick.dy * share;
        out.pitch += pick.dp * share;
        this.snap.left -= opts.dt;
        if (this.snap.left <= 0) this.snap = null;
      }
    }

    // Tracking: follow part of the target's movement across the view while the player steers.
    const zones = pick.angle / pick.size / cfg.zone;
    const prev = this.last && this.last.id === pick.id ? this.last : null;
    this.last = { id: pick.id, yaw: pick.yaw, pitch: pick.pitch };
    if (!this.snap && prev && opts.steering && opts.device !== "keyboard" && zones < 1) {
      const f = cfg.track * (1 - zones);
      out.yaw += clamp(angleDiff(prev.yaw, pick.yaw) * f, -MAX_TRACK_STEP, MAX_TRACK_STEP);
      out.pitch += clamp((pick.pitch - prev.pitch) * f, -MAX_TRACK_STEP, MAX_TRACK_STEP);
    }
    return out;
  }
}
