// How enemies notice the player: a vision cone with line-of-sight checks, hearing radii for
// noises, and a suspicion meter that fills before a full alert (giving the player time to react).

import { TUNING } from "../../config/tuning";
import { type V3, angleDiff, clamp01, dist, sub, yawOf } from "../math";

const S = TUNING.stealth;

export interface VisibilityInput {
  eye: V3;
  facingYaw: number;
  targetPoints: V3[]; // e.g. head and chest
  crouched: boolean;
  inGrass: boolean;
  /** Enemies already in combat see wider and farther. */
  alerted: boolean;
  los: (a: V3, b: V3) => boolean;
  rangeScale?: number;
}

/** 0 = cannot see the player at all, 1 = clear, close view. */
export function visibility(inp: VisibilityInput): number {
  let best = 0;
  for (const p of inp.targetPoints) {
    const d = dist(inp.eye, p);
    const range = (inp.alerted ? S.visionRange * 1.6 : S.visionRange) * (inp.rangeScale ?? 1);
    if (d > range) continue;
    const toYaw = yawOf(sub(p, inp.eye));
    const off = Math.abs(angleDiff(inp.facingYaw, toYaw));
    let cone = 0;
    if (inp.alerted || off <= S.visionHalfAngle) cone = 1;
    else if (off <= S.peripheralHalfAngle) cone = 0.35;
    if (cone === 0) continue;
    if (!inp.los(inp.eye, p)) continue;
    const distFactor = 1 - 0.7 * clamp01(d / range);
    best = Math.max(best, cone * distFactor);
  }
  if (best === 0) return 0;
  if (inp.inGrass && inp.crouched && !inp.alerted) return S.grassVisibility;
  if (inp.inGrass && !inp.alerted) best *= 0.5;
  if (inp.crouched && !inp.alerted) best *= S.crouchVisibility;
  return best;
}

/**
 * Advances the suspicion meter. Close, clear sightings fill it fast; out of view it drains.
 * Returns the new value (>= alertThreshold means "alerted").
 */
export function updateSuspicion(current: number, vis: number, dt: number, difficultyScale: number): number {
  if (vis > 0.02) return current + vis * S.suspicionRise * difficultyScale * dt * (1 + vis * 2);
  return Math.max(0, current - S.suspicionDecay * dt);
}

export interface Noise {
  pos: V3;
  radius: number;
  kind: keyof typeof S.noise;
}

export const canHear = (listener: V3, n: Noise): boolean => dist(listener, n.pos) <= n.radius;
