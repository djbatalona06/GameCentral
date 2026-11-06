// The player's purse and armoury, plus the pure rules for buying, crafting and upgrading.
// Everything here is plain data so it saves straight into the save file.

import { WEAPONS, type WeaponId } from "../combat/weapons";
import { AMMO_PRICE, type CraftId, type Cost, RECIPES, RESOURCES, type Resource, WEAPON_PRICES, priceScale, scaleCost } from "./items";
import { MAX_TIER, type Tiers, type UpgradeBook, type UpgradeTrack, noTiers, upgradeCost } from "./upgrades";

export interface EconomyState {
  salvage: number;
  parts: number;
  powder: number;
  /** Weapons bought or found: these can be picked as a starting weapon at any camp. */
  owned: WeaponId[];
  upgrades: UpgradeBook;
}

export const newEconomy = (): EconomyState => ({ salvage: 0, parts: 0, powder: 0, owned: ["pistol"], upgrades: {} });

export const cloneEconomy = (e: EconomyState): EconomyState => ({
  salvage: e.salvage,
  parts: e.parts,
  powder: e.powder,
  owned: [...e.owned],
  upgrades: Object.fromEntries(Object.entries(e.upgrades).map(([k, v]) => [k, { ...v! }])) as UpgradeBook,
});

/** Fills in anything missing (older saves, hand-edited files). */
export function normaliseEconomy(e: Partial<EconomyState> | undefined | null): EconomyState {
  const base = newEconomy();
  if (!e) return base;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const owned = Array.isArray(e.owned) ? e.owned.filter((w): w is WeaponId => w in WEAPONS) : [];
  const upgrades: UpgradeBook = {};
  for (const [id, t] of Object.entries(e.upgrades ?? {})) {
    if (!(id in WEAPONS) || !t) continue;
    const clean = noTiers();
    for (const k of Object.keys(clean) as UpgradeTrack[]) clean[k] = Math.max(0, Math.min(MAX_TIER, n((t as Tiers)[k])));
    upgrades[id as WeaponId] = clean;
  }
  return { salvage: n(e.salvage), parts: n(e.parts), powder: n(e.powder), owned: [...new Set<WeaponId>(["pistol", ...owned])], upgrades };
}

export const canAfford = (e: EconomyState, c: Cost): boolean => RESOURCES.every((r) => (e[r] ?? 0) >= (c[r] ?? 0));

const pay = (e: EconomyState, c: Cost) => {
  for (const r of RESOURCES) e[r] -= c[r] ?? 0;
};

export const add = (e: EconomyState, r: Resource, n: number) => {
  e[r] += Math.max(0, Math.floor(n));
};

export type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
const yes: Result = { ok: true };

export const weaponPrice = (id: WeaponId, difficulty: number): Cost => ({ salvage: Math.round(WEAPON_PRICES[id] * priceScale(difficulty)) });
export const ammoPrice = (difficulty: number): Cost => ({ salvage: Math.round(AMMO_PRICE * priceScale(difficulty)) });
export const craftCost = (id: CraftId, difficulty: number): Cost => scaleCost(RECIPES[id].cost, priceScale(difficulty));
export const nextUpgradeCost = (e: EconomyState, id: WeaponId, track: UpgradeTrack, difficulty: number): Cost | null => {
  const t = e.upgrades[id]?.[track] ?? 0;
  if (t >= MAX_TIER) return null;
  return scaleCost(upgradeCost(t + 1), priceScale(difficulty));
};

/** Buys a weapon so it can be equipped from now on. */
export function buyWeapon(e: EconomyState, id: WeaponId, difficulty: number): Result {
  if (e.owned.includes(id)) return no("You already own it.");
  const c = weaponPrice(id, difficulty);
  if (!canAfford(e, c)) return no("Not enough salvage.");
  pay(e, c);
  e.owned.push(id);
  return yes;
}

/** Marks a weapon picked up in the field as owned (free). */
export function claimWeapon(e: EconomyState, id: WeaponId): boolean {
  if (e.owned.includes(id)) return false;
  e.owned.push(id);
  return true;
}

export function payFor(e: EconomyState, c: Cost): Result {
  if (!canAfford(e, c)) return no("Not enough materials.");
  pay(e, c);
  return yes;
}

export function upgrade(e: EconomyState, id: WeaponId, track: UpgradeTrack, difficulty: number): Result {
  if (!e.owned.includes(id)) return no("Buy the weapon first.");
  const c = nextUpgradeCost(e, id, track, difficulty);
  if (!c) return no("Already at the top tier.");
  if (!canAfford(e, c)) return no("Not enough salvage or parts.");
  pay(e, c);
  const t = (e.upgrades[id] ??= noTiers());
  t[track]++;
  return yes;
}

export const tiersOf = (e: EconomyState | null | undefined, id: WeaponId): Tiers | undefined => e?.upgrades[id];
