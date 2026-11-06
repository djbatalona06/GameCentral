// Shared "move a body and slide along walls" helper for characters that are not the player
// (the player has its own, richer controller). Bodies are upright boxes, like the player's.

import type { V3 } from "../math";
import type { World } from "./World";

/** Space left under the body so small steps and ramps don't count as walls. */
const STEP = 0.4;

const bodyAt = (p: V3, radius: number, height: number) => ({
  min: { x: p.x - radius, y: p.y + STEP, z: p.z - radius },
  max: { x: p.x + radius, y: p.y + height, z: p.z + radius },
});

/**
 * Moves from `from` toward `to` on the ground plane. If the full move hits a wall, tries each axis
 * on its own (sliding along the wall), and stays put if both are blocked.
 */
export function slideMove(world: World, from: V3, to: V3, radius: number, height: number): V3 {
  const free = (p: V3) => !world.overlapsSolid(bodyAt(p, radius, height));
  if (free(to)) return to;
  const xOnly = { x: to.x, y: to.y, z: from.z };
  if (free(xOnly)) return xOnly;
  const zOnly = { x: from.x, y: to.y, z: to.z };
  if (free(zOnly)) return zOnly;
  return { ...from };
}

/** True when an upright body standing at `p` overlaps something solid. */
export function bodyBlocked(world: World, p: V3, radius: number, height: number): boolean {
  return !!world.overlapsSolid(bodyAt(p, radius, height));
}
