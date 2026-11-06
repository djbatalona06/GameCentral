// What you can loot, craft and buy. Three resources:
//   Salvage — coins, scrap and trinkets: the money you spend at camps.
//   Parts   — springs, screws and gun parts: for crafting and upgrades.
//   Powder  — black powder and primers: for ammo and grenades.

import type { WeaponId } from "../combat/weapons";

export type Resource = "salvage" | "parts" | "powder";
export const RESOURCES: Resource[] = ["salvage", "parts", "powder"];

export const RESOURCE_NAMES: Record<Resource, string> = { salvage: "Salvage", parts: "Parts", powder: "Powder" };

export type Cost = Partial<Record<Resource, number>>;

export type CraftId = "ammo" | "grenade" | "bottle" | "plate";

export interface Recipe {
  id: CraftId;
  name: string;
  description: string;
  cost: Cost;
}

/** Field crafting at a camp. */
export const RECIPES: Record<CraftId, Recipe> = {
  ammo: { id: "ammo", name: "Ammo pack", description: "Refills a full magazine's worth of spare rounds for both guns.", cost: { powder: 2, parts: 1 } },
  grenade: { id: "grenade", name: "Grenade", description: "Pipe and powder. Carry up to three.", cost: { powder: 3, parts: 2 } },
  bottle: { id: "bottle", name: "Bottle", description: "Throw it to make a noise and pull guards away. Carry up to three.", cost: { parts: 1 } },
  plate: { id: "plate", name: "Field plate", description: "A steel plate in your vest. Soaks up the next 50 damage.", cost: { parts: 4 } },
};

/** Damage a field plate soaks up before it is used up. */
export const PLATE_ARMOR = 50;

/** Buying a weapon at a camp (the first time). Afterwards it is yours to pick in every chapter. */
export const WEAPON_PRICES: Record<WeaponId, number> = {
  pistol: 40,
  revolver: 160,
  rifle: 220,
  shotgun: 200,
  marksman: 280,
};

/** Buying a full magazine of spare ammo for a weapon you carry. */
export const AMMO_PRICE = 15;

/** Prices go up a little on harder difficulties (0 Story .. 3 Legend). */
export const priceScale = (difficulty: number): number => [0.7, 1, 1.2, 1.4][Math.max(0, Math.min(3, difficulty))];

export const scaleCost = (c: Cost, k: number): Cost => {
  const out: Cost = {};
  for (const r of RESOURCES) if (c[r]) out[r] = Math.max(1, Math.round(c[r]! * k));
  return out;
};

export const costText = (c: Cost): string =>
  RESOURCES.filter((r) => c[r])
    .map((r) => `${c[r]} ${RESOURCE_NAMES[r]}`)
    .join(" + ") || "Free";
