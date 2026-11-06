// Weapon upgrades: four tracks, three tiers each. Upgrades belong to the weapon type, so the
// Harbor 9 you upgrade in chapter 1 is still upgraded in chapter 7.

import type { WeaponDef, WeaponId } from "../combat/weapons";
import type { Cost } from "./items";

export type UpgradeTrack = "damage" | "mag" | "reload" | "stability";
export const TRACKS: UpgradeTrack[] = ["damage", "mag", "reload", "stability"];
export const MAX_TIER = 3;

export const TRACK_NAMES: Record<UpgradeTrack, string> = {
  damage: "Damage",
  mag: "Magazine",
  reload: "Reload speed",
  stability: "Stability",
};

export const TRACK_HELP: Record<UpgradeTrack, string> = {
  damage: "Each bullet hits harder.",
  mag: "More rounds before you reload.",
  reload: "Reload faster.",
  stability: "Less kick and tighter spread.",
};

export type Tiers = Record<UpgradeTrack, number>;
export const noTiers = (): Tiers => ({ damage: 0, mag: 0, reload: 0, stability: 0 });

/** Cost of buying the next tier (1, 2 or 3) of a track. */
export const upgradeCost = (tier: number): Cost => [{}, { salvage: 60, parts: 2 }, { salvage: 120, parts: 4 }, { salvage: 200, parts: 7 }][tier] ?? {};

/** A weapon's stats with its upgrades applied. Never changes the base table. */
export function effectiveWeapon(def: WeaponDef, t: Tiers | undefined): WeaponDef {
  if (!t || (!t.damage && !t.mag && !t.reload && !t.stability)) return def;
  const steady = 1 - 0.15 * t.stability;
  return {
    ...def,
    damage: def.damage * (1 + 0.12 * t.damage),
    magSize: def.magSize + Math.max(t.mag, Math.round(def.magSize * 0.15 * t.mag)),
    reloadTime: def.reloadTime * (1 - 0.12 * t.reload),
    recoilPitch: def.recoilPitch * steady,
    recoilYaw: def.recoilYaw * steady,
    bloomPerShot: def.bloomPerShot * steady,
    hipSpread: def.hipSpread * (1 - 0.08 * t.stability),
  };
}

export type UpgradeBook = Partial<Record<WeaponId, Tiers>>;
