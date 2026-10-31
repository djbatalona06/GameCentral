// Sweeping searchlights (Ch7). The beam turns back and forth; standing in it fills a meter and,
// when that fills, every enemy in the light's arena is told where you are.

import { TUNING } from "../../config/tuning";
import { type V3, angleDiff, distXZ, sub, yawOf } from "../math";
import type { SearchlightDef } from "../world/types";

export interface SearchlightState {
  def: SearchlightDef;
  active: boolean;
  /** Current beam direction. */
  yaw: number;
  /** 0..1: how close the player is to setting off the alarm. */
  exposure: number;
}

export const newSearchlight = (def: SearchlightDef): SearchlightState => ({ def, active: true, yaw: def.yaw, exposure: 0 });

/** Beam direction at time t (a smooth back-and-forth). */
export const beamYaw = (def: SearchlightDef, t: number): number => def.yaw + Math.sin((t * Math.PI * 2) / def.period) * def.sweep;

/** True when a point is inside the beam's wedge (ignoring walls; the caller checks line of sight). */
export function inBeam(def: SearchlightDef, yaw: number, p: V3): boolean {
  const d = distXZ(def.pos, p);
  if (d > def.range || d < 0.5) return false;
  return Math.abs(angleDiff(yaw, yawOf(sub(p, def.pos)))) <= def.cone;
}

/**
 * Updates one light. `lit` says whether the player is in the beam with a clear line of sight
 * (crouching in tall grass hides you). Returns true on the step the alarm goes off.
 */
export function stepSearchlight(s: SearchlightState, t: number, dt: number, lit: boolean): boolean {
  if (!s.active) {
    s.exposure = 0;
    return false;
  }
  s.yaw = beamYaw(s.def, t);
  const before = s.exposure;
  s.exposure = lit ? Math.min(1, s.exposure + dt / TUNING.searchlight.alarmTime) : Math.max(0, s.exposure - dt * TUNING.searchlight.decay);
  return before < 1 && s.exposure >= 1;
}
