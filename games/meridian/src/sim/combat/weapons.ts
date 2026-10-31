// Weapon definitions plus the pure math that drives shooting feel:
// spread bloom, recoil, damage falloff and headshots.

import { clamp, lerp } from "../math";

export type WeaponId = "pistol" | "revolver" | "rifle" | "shotgun" | "marksman";
export type WeaponSlot = "sidearm" | "long";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: WeaponSlot;
  magSize: number;
  reserveMax: number;
  damage: number;
  pellets: number;
  /** Seconds between shots. */
  fireInterval: number;
  automatic: boolean;
  reloadTime: number;
  /** Spread half-angles in radians. */
  hipSpread: number;
  aimSpread: number;
  bloomPerShot: number;
  bloomMax: number;
  bloomDecay: number;
  /** Recoil kick per shot (radians of pitch) and sideways wobble. */
  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;
  headshotMult: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMinMult: number;
  range: number;
  scoped?: boolean;
  /** Loudness for stealth (multiplies the gunshot noise radius). */
  noise: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol", name: "Harbor 9", slot: "sidearm", magSize: 15, reserveMax: 90, damage: 22, pellets: 1,
    fireInterval: 0.2, automatic: false, reloadTime: 1.25, hipSpread: 0.045, aimSpread: 0.012,
    bloomPerShot: 0.012, bloomMax: 0.06, bloomDecay: 0.18, recoilPitch: 0.022, recoilYaw: 0.008,
    recoilRecovery: 6, headshotMult: 2.2, falloffStart: 15, falloffEnd: 40, falloffMinMult: 0.55, range: 60, noise: 1,
  },
  revolver: {
    id: "revolver", name: "Mariner .44", slot: "sidearm", magSize: 6, reserveMax: 36, damage: 58, pellets: 1,
    fireInterval: 0.55, automatic: false, reloadTime: 2.1, hipSpread: 0.05, aimSpread: 0.008,
    bloomPerShot: 0.03, bloomMax: 0.08, bloomDecay: 0.25, recoilPitch: 0.075, recoilYaw: 0.02,
    recoilRecovery: 4.5, headshotMult: 2.2, falloffStart: 20, falloffEnd: 50, falloffMinMult: 0.6, range: 70, noise: 1.2,
  },
  rifle: {
    id: "rifle", name: "Gilt AR-7", slot: "long", magSize: 30, reserveMax: 180, damage: 17, pellets: 1,
    fireInterval: 0.1, automatic: true, reloadTime: 1.9, hipSpread: 0.06, aimSpread: 0.016,
    bloomPerShot: 0.007, bloomMax: 0.07, bloomDecay: 0.22, recoilPitch: 0.016, recoilYaw: 0.012,
    recoilRecovery: 7, headshotMult: 2, falloffStart: 25, falloffEnd: 60, falloffMinMult: 0.6, range: 80, noise: 1.1,
  },
  shotgun: {
    id: "shotgun", name: "Breaker 12", slot: "long", magSize: 6, reserveMax: 30, damage: 13, pellets: 9,
    fireInterval: 0.85, automatic: false, reloadTime: 2.6, hipSpread: 0.11, aimSpread: 0.085,
    bloomPerShot: 0.0, bloomMax: 0.0, bloomDecay: 1, recoilPitch: 0.09, recoilYaw: 0.02,
    recoilRecovery: 4, headshotMult: 1.4, falloffStart: 5, falloffEnd: 16, falloffMinMult: 0.15, range: 30, noise: 1.3,
  },
  marksman: {
    id: "marksman", name: "Longreach M2", slot: "long", magSize: 5, reserveMax: 25, damage: 88, pellets: 1,
    fireInterval: 1.1, automatic: false, reloadTime: 2.8, hipSpread: 0.12, aimSpread: 0.002,
    bloomPerShot: 0.0, bloomMax: 0.0, bloomDecay: 1, recoilPitch: 0.11, recoilYaw: 0.015,
    recoilRecovery: 3.5, headshotMult: 3, falloffStart: 60, falloffEnd: 120, falloffMinMult: 0.8, range: 140, scoped: true, noise: 1.5,
  },
};

/** Damage multiplier for distance: full until falloffStart, linear down to the minimum at falloffEnd. */
export function falloff(def: WeaponDef, distance: number): number {
  if (distance <= def.falloffStart) return 1;
  if (distance >= def.falloffEnd) return def.falloffMinMult;
  const t = (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return lerp(1, def.falloffMinMult, t);
}

export function shotDamage(def: WeaponDef, distance: number, headshot: boolean): number {
  return def.damage * falloff(def, distance) * (headshot ? def.headshotMult : 1);
}

export interface SpreadContext {
  aiming: boolean;
  crouched: boolean;
  moving: number; // 0..1 movement speed fraction
  airborne: boolean;
  blindFire: boolean;
  bloom: number;
}

/** Current spread half-angle. Aiming and crouching tighten; moving, jumping and blind fire widen. */
export function currentSpread(def: WeaponDef, ctx: SpreadContext, blindFireScale: number): number {
  let s = ctx.aiming ? def.aimSpread : def.hipSpread;
  if (ctx.crouched) s *= 0.8;
  s *= 1 + ctx.moving * 0.6;
  if (ctx.airborne) s *= 2;
  if (ctx.blindFire) s *= blindFireScale;
  return s + clamp(ctx.bloom, 0, def.bloomMax);
}

/** Runtime state for one carried weapon. */
export interface WeaponState {
  id: WeaponId;
  mag: number;
  reserve: number;
  cooldown: number;
  reloadLeft: number;
  bloom: number;
  shotIndex: number;
}

export const newWeaponState = (id: WeaponId, reserve?: number): WeaponState => ({
  id,
  mag: WEAPONS[id].magSize,
  reserve: reserve ?? Math.floor(WEAPONS[id].reserveMax / 2),
  cooldown: 0,
  reloadLeft: 0,
  bloom: 0,
  shotIndex: 0,
});

export function tickWeapon(w: WeaponState, dt: number): void {
  const def = WEAPONS[w.id];
  w.cooldown = Math.max(0, w.cooldown - dt);
  w.bloom = Math.max(0, w.bloom - def.bloomDecay * dt);
  if (w.reloadLeft > 0) {
    w.reloadLeft -= dt;
    if (w.reloadLeft <= 0) {
      const need = def.magSize - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
      w.reloadLeft = 0;
    }
  }
  if (w.cooldown <= 0 && w.bloom <= 0) w.shotIndex = 0;
}

export function canFire(w: WeaponState): boolean {
  return w.cooldown <= 0 && w.reloadLeft <= 0 && w.mag > 0;
}

export function startReload(w: WeaponState): boolean {
  const def = WEAPONS[w.id];
  if (w.reloadLeft > 0 || w.mag >= def.magSize || w.reserve <= 0) return false;
  w.reloadLeft = def.reloadTime;
  return true;
}

/** Reloading can be interrupted (by rolling, climbing or melee); the magazine is not refilled. */
export function cancelReload(w: WeaponState): void {
  w.reloadLeft = 0;
}

/** Consumes a round and returns the recoil to apply to the camera. */
export function fire(w: WeaponState): { pitch: number; yaw: number } {
  const def = WEAPONS[w.id];
  w.mag -= 1;
  w.cooldown = def.fireInterval;
  w.bloom = Math.min(def.bloomMax, w.bloom + def.bloomPerShot);
  const i = w.shotIndex++;
  // A learnable recoil pattern: climbs up, drifts right then left in a slow S.
  const yaw = def.recoilYaw * Math.sin(i * 0.9) * (1 + Math.min(i, 8) * 0.08);
  return { pitch: def.recoilPitch * (1 + Math.min(i, 6) * 0.05), yaw };
}

/** Deterministic spread offset for pellet `k` of shot `i` (keeps tests repeatable). */
export function spreadOffset(spread: number, rand: () => number): { yaw: number; pitch: number } {
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * spread;
  return { yaw: Math.cos(a) * r, pitch: Math.sin(a) * r };
}
