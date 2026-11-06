// Who drops what. Rolls use their own random stream (see GameSim.lootRand), so adding loot never
// changes how enemies behave and every run with the same seed drops the same things.

import type { ArchetypeId } from "../ai/archetypes";
import type { Resource } from "./items";

export type CacheTier = "common" | "rare" | "boundary";

export interface Drop {
  resource: Resource;
  amount: number;
}

type Range = [number, number];
interface TableEntry {
  salvage: Range;
  parts: Range;
  powder: Range;
  /** Chance of each of parts and powder dropping at all. */
  extraChance: number;
}

const ENEMY: Record<ArchetypeId, TableEntry> = {
  rifleman: { salvage: [6, 12], parts: [0, 1], powder: [1, 2], extraChance: 0.45 },
  shotgunner: { salvage: [8, 14], parts: [0, 1], powder: [1, 2], extraChance: 0.5 },
  sniper: { salvage: [10, 16], parts: [1, 2], powder: [0, 1], extraChance: 0.6 },
  grenadier: { salvage: [8, 12], parts: [0, 1], powder: [2, 3], extraChance: 0.7 },
  heavy: { salvage: [18, 30], parts: [1, 3], powder: [1, 3], extraChance: 0.9 },
  brute: { salvage: [12, 20], parts: [1, 2], powder: [0, 0], extraChance: 0.6 },
  lieutenant: { salvage: [60, 80], parts: [3, 5], powder: [3, 5], extraChance: 1 },
  kessa: { salvage: [60, 80], parts: [3, 5], powder: [3, 5], extraChance: 1 },
};

const CACHE: Record<CacheTier, TableEntry> = {
  common: { salvage: [15, 30], parts: [1, 2], powder: [1, 3], extraChance: 0.8 },
  rare: { salvage: [35, 60], parts: [2, 4], powder: [2, 4], extraChance: 1 },
  // Out at the edge of the map: worth the walk.
  boundary: { salvage: [60, 100], parts: [3, 6], powder: [3, 5], extraChance: 1 },
};

const roll = (r: Range, rand: () => number) => r[0] + Math.floor(rand() * (r[1] - r[0] + 1));

function rollEntry(e: TableEntry, rand: () => number, scale: number): Drop[] {
  const out: Drop[] = [{ resource: "salvage", amount: Math.max(1, Math.round(roll(e.salvage, rand) * scale)) }];
  for (const res of ["parts", "powder"] as const) {
    if (rand() < e.extraChance) {
      const n = Math.round(roll(e[res], rand) * scale);
      if (n > 0) out.push({ resource: res, amount: n });
    }
  }
  return out;
}

/** What an enemy drops when beaten. `scale` follows the Ammo / loot difficulty slider. */
export const enemyLoot = (a: ArchetypeId, rand: () => number, scale = 1): Drop[] => rollEntry(ENEMY[a] ?? ENEMY.rifleman, rand, scale);

/** What a cache holds. */
export const cacheLoot = (tier: CacheTier, rand: () => number, scale = 1): Drop[] => rollEntry(CACHE[tier], rand, scale);

/** Salvage for picking up a treasure (on top of its journal entry). */
export const TREASURE_SALVAGE = 25;
