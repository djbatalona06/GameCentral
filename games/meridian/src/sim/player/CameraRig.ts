// Third-person camera logic: orbit, over-the-shoulder aim, collision, auto-recenter and level hints.
// It lives in the simulation because aiming depends on exactly where the camera points.

import { TUNING } from "../../config/tuning";
import { type V3, add, angleDiff, clamp, damp, lookDir, scale } from "../math";
import { type World, inside } from "../world/World";
import type { CamHintDef } from "../world/types";

export interface CameraState {
  yaw: number;
  pitch: number;
  shoulder: 1 | -1;
  aimBlend: number;
  scoped: boolean;
  idleTime: number;
  distance: number;
  pivot: V3;
  position: V3;
  fov: number;
  shake: number;
  /** Cutscene override: when set, the renderer uses these instead. */
  rail: { position: V3; target: V3 } | null;
}

export const newCamera = (yaw: number): CameraState => ({
  yaw,
  pitch: -0.15,
  shoulder: 1,
  aimBlend: 0,
  scoped: false,
  idleTime: 0,
  distance: TUNING.camera.distance,
  pivot: { x: 0, y: 0, z: 0 },
  position: { x: 0, y: 0, z: 0 },
  fov: TUNING.camera.fov,
  shake: 0,
  rail: null,
});

export interface CameraInput {
  lookYaw: number;
  lookPitch: number;
  aiming: boolean;
  scoped: boolean;
  playerPos: V3;
  playerHeight: number;
  /** Direction the player is travelling (for auto-recenter), or null when still. */
  travelYaw: number | null;
  autoRecenter: boolean;
  invertY: boolean;
  fovScale: number;
  hints: CamHintDef[];
}

export function updateCamera(cam: CameraState, inp: CameraInput, world: World, dt: number): void {
  const c = TUNING.camera;
  const looking = Math.abs(inp.lookYaw) + Math.abs(inp.lookPitch) > 1e-5;
  cam.yaw += inp.lookYaw;
  cam.pitch = clamp(cam.pitch + (inp.invertY ? -inp.lookPitch : inp.lookPitch), c.minPitch, c.maxPitch);
  cam.idleTime = looking ? 0 : cam.idleTime + dt;

  // Drift back behind the player when they move without touching the camera.
  if (inp.autoRecenter && !inp.aiming && inp.travelYaw !== null && cam.idleTime > c.recenterDelay) {
    const d = angleDiff(cam.yaw, inp.travelYaw);
    if (Math.abs(d) < 2.4) cam.yaw += d * damp(c.recenterSpeed, dt);
    cam.pitch += (-0.15 - cam.pitch) * damp(c.recenterSpeed, dt);
  }

  cam.aimBlend += ((inp.aiming ? 1 : 0) - cam.aimBlend) * damp(14, dt);
  cam.scoped = inp.scoped && inp.aiming;

  const pivotBase = add(inp.playerPos, { x: 0, y: inp.playerHeight * (c.pivotHeight / TUNING.player.height), z: 0 });
  const hint = inp.hints.find((h) => inside(inp.playerPos, h));
  let baseDist: number = c.distance;
  if (hint?.distance) baseDist = hint.distance;
  if (hint?.pitch !== undefined && !looking && !inp.aiming) cam.pitch += (hint.pitch - cam.pitch) * damp(2, dt);
  const wantDist = baseDist + (c.aimDistance - baseDist) * cam.aimBlend;

  const right = { x: Math.cos(cam.yaw), y: 0, z: -Math.sin(cam.yaw) };
  const shoulder = (c.shoulderOffset + (c.aimShoulderOffset - c.shoulderOffset) * cam.aimBlend) * cam.shoulder;
  cam.pivot = add(pivotBase, scale(right, shoulder));

  // Pull the camera in when a wall is between it and the player.
  const back = scale(lookDir(cam.yaw, cam.pitch), -1);
  const hit = world.raycast(cam.pivot, back, wantDist + c.collisionRadius, { ignoreCrates: false });
  const allowed = hit ? Math.max(0.35, hit.t - c.collisionRadius) : wantDist;
  cam.distance = allowed < cam.distance ? allowed : cam.distance + (allowed - cam.distance) * damp(6, dt);
  cam.position = add(cam.pivot, scale(back, cam.distance));

  const zoom = cam.scoped ? c.scopeFovScale : 1 + (c.aimFovScale - 1) * cam.aimBlend;
  cam.fov = c.fov * inp.fovScale * zoom;
  cam.shake = Math.max(0, cam.shake - dt * 3);
}
