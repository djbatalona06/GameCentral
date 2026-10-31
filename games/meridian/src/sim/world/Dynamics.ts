// Things in the level that move on their own: moving platforms and sweeping hazards.
// Pure state + step functions, so tests can run them without the rest of the game.

import { type V3, add, len, scale, sub, v3 } from "../math";
import type { Aabb } from "./World";
import type { HazardDef, MoverDef } from "./types";

// ------------------------------------------------------------------ moving platforms

export interface MoverState {
  def: MoverDef;
  active: boolean;
  /** Where the group is now, relative to where it was built. */
  offset: V3;
  /** Index of the path point it is heading for. */
  target: number;
  dir: 1 | -1;
  wait: number;
  finished: boolean;
}

export const newMover = (def: MoverDef): MoverState => ({
  def,
  active: def.startActive,
  offset: { ...(def.path[0] ?? v3()) },
  target: Math.min(1, def.path.length - 1),
  dir: 1,
  wait: def.pause,
  finished: def.path.length < 2,
});

/** Advances a mover and returns how far it moved this step (to apply to the world and riders). */
export function stepMover(m: MoverState, dt: number): V3 {
  if (!m.active || m.finished) return v3();
  if (m.wait > 0) {
    m.wait -= dt;
    return v3();
  }
  const goal = m.def.path[m.target];
  const to = sub(goal, m.offset);
  const d = len(to);
  const stepLen = m.def.speed * dt;
  let delta: V3;
  if (d <= stepLen) {
    delta = to;
    m.offset = { ...goal };
    m.wait = m.def.pause;
    advanceTarget(m);
  } else {
    delta = scale(to, stepLen / d);
    m.offset = add(m.offset, delta);
  }
  return delta;
}

function advanceTarget(m: MoverState): void {
  const n = m.def.path.length;
  if (m.def.mode === "loop") m.target = (m.target + 1) % n;
  else if (m.def.mode === "once") {
    if (m.target >= n - 1) m.finished = true;
    else m.target++;
  } else {
    if (m.target + m.dir < 0 || m.target + m.dir >= n) m.dir = m.dir === 1 ? -1 : 1;
    m.target += m.dir;
  }
}

// ------------------------------------------------------------------ hazards

export interface HazardState {
  def: HazardDef;
  active: boolean;
  /** True while a sweep is moving (always true for a static kill zone). */
  sweeping: boolean;
  offset: V3;
  wait: number;
  /** Seconds the player has been inside (for damage-over-time hazards like fire). */
  contact: number;
}

const isStatic = (d: HazardDef) => d.vel.x === 0 && d.vel.y === 0 && d.vel.z === 0;

export const newHazard = (def: HazardDef): HazardState => ({
  def,
  active: def.startActive,
  sweeping: def.startActive,
  offset: v3(),
  wait: 0,
  contact: 0,
});

/** Turns a hazard on (starting a fresh sweep) or off. */
export function setHazardActive(h: HazardState, on: boolean): void {
  h.active = on;
  h.sweeping = on;
  h.offset = v3();
  h.wait = 0;
}

/** Advances a hazard. Returns true on the step a new sweep starts (time to warn the player). */
export function stepHazard(h: HazardState, dt: number): boolean {
  if (!h.active || isStatic(h.def)) return false;
  if (h.sweeping) {
    h.offset = add(h.offset, scale(h.def.vel, dt));
    if (len(h.offset) >= h.def.travel) {
      h.sweeping = false;
      if (h.def.every > 0) h.wait = h.def.every;
      else h.active = false;
    }
    return false;
  }
  h.wait -= dt;
  if (h.wait <= 0) {
    h.sweeping = true;
    h.offset = v3();
    return true;
  }
  return false;
}

/** The hazard's current box, or null when it is not dangerous right now. */
export function hazardBox(h: HazardState): Aabb | null {
  if (!h.active || !h.sweeping) return null;
  return { min: add(h.def.min, h.offset), max: add(h.def.max, h.offset) };
}

