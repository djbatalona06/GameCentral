// Small, allocation-light vector helpers used by the simulation.
// The simulation never imports Babylon so it can run headless in tests.

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface V2 {
  x: number;
  y: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const clone = (a: V3): V3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a: V3): number => Math.hypot(a.x, a.z);
export const dist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
};
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: V3, b: V3, t: number): V3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Shortest signed difference between two angles (radians). */
export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Move `current` toward `target` by at most `maxDelta`. */
export const approach = (current: number, target: number, maxDelta: number): number =>
  current < target ? Math.min(current + maxDelta, target) : Math.max(current - maxDelta, target);

/** Exponential smoothing factor that is frame-rate independent. */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Forward direction on the XZ plane for a yaw angle (yaw 0 looks down +Z). */
export const yawDir = (yaw: number): V3 => ({ x: Math.sin(yaw), y: 0, z: Math.cos(yaw) });

/** 3D look direction from yaw and pitch (pitch positive looks up). */
export const lookDir = (yaw: number, pitch: number): V3 => {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: Math.cos(yaw) * c };
};

export const yawOf = (d: V3): number => Math.atan2(d.x, d.z);

/** Deterministic pseudo random generator (mulberry32) so gameplay is reproducible in tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Closest point on segment ab to p, plus the 0..1 parameter along the segment. */
export function closestOnSegment(p: V3, a: V3, b: V3): { point: V3; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-9 ? clamp01(dot(sub(p, a), ab) / l2) : 0;
  return { point: add(a, scale(ab, t)), t };
}
