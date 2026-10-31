// Enemy types are pure data. The brain reads these numbers to decide how each type fights.

import type { WeaponId } from "../combat/weapons";

export type ArchetypeId = "rifleman" | "shotgunner" | "sniper" | "grenadier" | "heavy" | "brute" | "lieutenant";

export type SquadRole = "suppress" | "flank" | "overwatch" | "flush" | "anchor" | "rush" | "boss";

export interface Archetype {
  id: ArchetypeId;
  name: string;
  hp: number;
  weapon: WeaponId | null;
  /** Hit chance at 0s and after 2s of continuous exposure (accuracy ramps up the longer you stay visible). */
  accuracy: [number, number];
  damage: number;
  /** Preferred fighting distance range in metres. */
  range: [number, number];
  moveSpeed: number;
  /** 0 = stays in cover, 1 = constantly pushes forward. */
  aggression: number;
  role: SquadRole;
  /** Multiplier on body damage from the front (armour). Head and back always take full damage. */
  frontArmor: number;
  melee: { damage: number; windup: number } | null;
  grenades: number;
  /** Sniper telegraph: seconds the laser is shown before the shot. */
  laserTime?: number;
  /** Multiplier on how far this enemy can see (snipers see much farther). */
  sight?: number;
  color: string;
  height: number;
}

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  rifleman: {
    id: "rifleman", name: "Gilt Rifleman", hp: 90, weapon: "rifle", accuracy: [0.12, 0.42], damage: 9,
    range: [8, 22], moveSpeed: 3.6, aggression: 0.35, role: "suppress", frontArmor: 1,
    melee: { damage: 18, windup: 0.6 }, grenades: 0, color: "#c8553d", height: 1.8,
  },
  shotgunner: {
    id: "shotgunner", name: "Gilt Breacher", hp: 110, weapon: "shotgun", accuracy: [0.35, 0.7], damage: 22,
    range: [2, 8], moveSpeed: 4.2, aggression: 0.85, role: "flush", frontArmor: 1,
    melee: { damage: 22, windup: 0.55 }, grenades: 0, color: "#e07a2f", height: 1.8,
  },
  sniper: {
    id: "sniper", name: "Gilt Marksman", hp: 70, weapon: "marksman", accuracy: [0.9, 0.95], damage: 55,
    range: [20, 60], moveSpeed: 3.0, aggression: 0.05, role: "overwatch", frontArmor: 1,
    melee: null, grenades: 0, laserTime: 1.6, sight: 2.4, color: "#8e44ad", height: 1.8,
  },
  grenadier: {
    id: "grenadier", name: "Gilt Grenadier", hp: 90, weapon: "pistol", accuracy: [0.1, 0.3], damage: 8,
    range: [10, 20], moveSpeed: 3.4, aggression: 0.3, role: "flank", frontArmor: 1,
    melee: { damage: 16, windup: 0.6 }, grenades: 4, color: "#b8860b", height: 1.8,
  },
  heavy: {
    id: "heavy", name: "Gilt Heavy", hp: 360, weapon: "rifle", accuracy: [0.2, 0.45], damage: 11,
    range: [6, 18], moveSpeed: 2.2, aggression: 0.6, role: "anchor", frontArmor: 0.15,
    melee: { damage: 35, windup: 0.8 }, grenades: 0, color: "#34495e", height: 2.0,
  },
  brute: {
    id: "brute", name: "Gilt Brute", hp: 200, weapon: null, accuracy: [0, 0], damage: 0,
    range: [0, 2], moveSpeed: 5.0, aggression: 1, role: "rush", frontArmor: 0.6,
    melee: { damage: 30, windup: 0.75 }, grenades: 0, color: "#7f1d1d", height: 2.0,
  },
  lieutenant: {
    id: "lieutenant", name: "Kessa Varn, Gilt Lieutenant", hp: 600, weapon: "rifle", accuracy: [0.2, 0.5], damage: 10,
    range: [6, 20], moveSpeed: 4.0, aggression: 0.5, role: "boss", frontArmor: 0.5,
    melee: { damage: 30, windup: 0.6 }, grenades: 6, color: "#d4af37", height: 1.85,
  },
};
