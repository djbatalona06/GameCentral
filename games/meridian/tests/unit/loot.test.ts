// The looting engine: drops, caches, camps, buying, crafting and weapon upgrades.
import { describe, expect, it } from "vitest";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { WEAPONS, defOf, newWeaponState } from "../../src/sim/combat/weapons";
import { buyWeapon, canAfford, newEconomy, normaliseEconomy, upgrade } from "../../src/sim/loot/Economy";
import { cacheLoot, enemyLoot } from "../../src/sim/loot/LootTable";
import { effectiveWeapon, noTiers } from "../../src/sim/loot/upgrades";
import { rng } from "../../src/sim/math";
import { migrate } from "../../src/save/migrations";
import { isSaveFile, newSave } from "../../src/save/schema";
import { DT, frame, newSim } from "./helpers";

const sky = { top: "", bottom: "", fog: "", fogDensity: 0 };

function campLevel() {
  const b = new LevelBuilder("camp", sky);
  b.box([-30, -1, -30], [30, 0, 30], "ground");
  b.cache("crate1", [0, 0, 2], "common");
  b.boundaryCache("edge1", [6, 0, 0]);
  b.camp("camp1", [-4, 0, 0], "the Beach Camp");
  b.checkpoint("start", [0, 0, 0], 0, "Start");
  return b.build();
}

const walkTo = (s: ReturnType<typeof newSim>, x: number, z: number) => {
  s.player.pos = { x, y: 0, z };
  s.player.vel = { x: 0, y: 0, z: 0 };
};

describe("economy rules", () => {
  it("buying needs enough salvage and only happens once", () => {
    const e = newEconomy();
    expect(buyWeapon(e, "rifle", 1).ok).toBe(false);
    e.salvage = 500;
    expect(buyWeapon(e, "rifle", 1).ok).toBe(true);
    expect(e.owned).toContain("rifle");
    expect(e.salvage).toBe(500 - 220);
    expect(buyWeapon(e, "rifle", 1).ok).toBe(false);
  });

  it("upgrades go up one tier at a time to three, and cost salvage and parts", () => {
    const e = newEconomy();
    e.salvage = 10000;
    e.parts = 100;
    for (let i = 0; i < 3; i++) expect(upgrade(e, "pistol", "damage", 1).ok).toBe(true);
    expect(upgrade(e, "pistol", "damage", 1).ok).toBe(false);
    expect(e.upgrades.pistol!.damage).toBe(3);
    expect(e.parts).toBe(100 - 2 - 4 - 7);
    expect(upgrade(e, "marksman", "mag", 1).ok).toBe(false); // not owned
  });

  it("upgraded stats are better and the base table never changes", () => {
    const t = { ...noTiers(), damage: 3, mag: 2, reload: 1, stability: 3 };
    const up = effectiveWeapon(WEAPONS.rifle, t);
    expect(up.damage).toBeGreaterThan(WEAPONS.rifle.damage);
    expect(up.magSize).toBeGreaterThan(WEAPONS.rifle.magSize);
    expect(up.reloadTime).toBeLessThan(WEAPONS.rifle.reloadTime);
    expect(up.recoilPitch).toBeLessThan(WEAPONS.rifle.recoilPitch);
    expect(WEAPONS.rifle.damage).toBe(17);
    const w = newWeaponState("rifle", 30, t);
    expect(w.mag).toBe(up.magSize);
    expect(defOf(w).damage).toBeCloseTo(up.damage);
  });

  it("cleans up broken purses from old or edited saves", () => {
    const e = normaliseEconomy({ salvage: -5, parts: 2.7, owned: ["rifle", "laser" as never], upgrades: { rifle: { damage: 9 } as never } });
    expect(e.salvage).toBe(0);
    expect(e.parts).toBe(2);
    expect(e.owned).toEqual(["pistol", "rifle"]);
    expect(e.upgrades.rifle!.damage).toBe(3);
    expect(canAfford(e, { parts: 3 })).toBe(false);
  });
});

describe("loot tables", () => {
  it("rolls are repeatable for the same seed", () => {
    expect(enemyLoot("rifleman", rng(7))).toEqual(enemyLoot("rifleman", rng(7)));
    expect(cacheLoot("boundary", rng(9))).toEqual(cacheLoot("boundary", rng(9)));
  });

  it("boundary caches are worth more than common crates", () => {
    const sum = (tier: "common" | "boundary") => {
      const r = rng(1);
      let n = 0;
      for (let i = 0; i < 200; i++) n += cacheLoot(tier, r).find((d) => d.resource === "salvage")!.amount;
      return n;
    };
    expect(sum("boundary")).toBeGreaterThan(sum("common") * 2);
  });
});

describe("loot in the game", () => {
  it("a cache opens once, drops loot, and the loot is collected by walking over it", () => {
    const s = newSim({}, campLevel);
    walkTo(s, 0, 1.2);
    s.step(DT, frame({ pressed: ["interact"] }));
    expect(s.interactsUsed.has("crate1")).toBe(true);
    const drops = s.dynamicPickups.filter((d) => d.resource);
    expect(drops.length).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) s.step(DT, frame());
    expect(s.economy.salvage).toBeGreaterThan(0);
    // Using it again does nothing.
    const before = s.economy.salvage;
    s.step(DT, frame({ pressed: ["interact"] }));
    for (let i = 0; i < 5; i++) s.step(DT, frame());
    expect(s.economy.salvage).toBe(before);
  });

  it("opened caches and the purse survive a checkpoint reload", () => {
    const s = newSim({}, campLevel);
    walkTo(s, 0, 1.2);
    s.step(DT, frame({ pressed: ["interact"] }));
    for (let i = 0; i < 5; i++) s.step(DT, frame());
    const snap = s.snapshot();
    const s2 = new (s.constructor as typeof import("../../src/sim/GameSim").GameSim)(s.chapter, s.opts, snap);
    expect(s2.interactsUsed.has("crate1")).toBe(true);
    expect(s2.economy.salvage).toBe(s.economy.salvage);
  });

  it("the camp opens, sells a gun, crafts and upgrades", () => {
    const s = newSim({}, campLevel);
    s.economy.salvage = 1000;
    s.economy.parts = 20;
    s.economy.powder = 20;
    walkTo(s, -4, 0.6);
    s.step(DT, frame({ pressed: ["interact"] }));
    expect(s.camp?.id).toBe("camp1");
    expect(s.events.some((e) => e.type === "campOpen")).toBe(true);
    expect(s.campBuyWeapon("shotgun").ok).toBe(true);
    expect(s.weapons.long?.id).toBe("shotgun");
    const g = s.grenades;
    expect(s.campCraft("grenade").ok).toBe(true);
    expect(s.grenades).toBe(g + 1);
    expect(s.campCraft("plate").ok).toBe(true);
    expect(s.armor).toBe(50);
    const mag = s.weapons.long!.mag;
    expect(s.campUpgrade("shotgun", "mag").ok).toBe(true);
    expect(defOf(s.weapons.long!).magSize).toBeGreaterThan(mag);
    s.closeCamp();
    expect(s.camp).toBeNull();
  });

  it("a field plate soaks up damage before health", () => {
    const s = newSim({}, campLevel);
    s.armor = 50;
    const hp = s.health.hp;
    s.hurtPlayer(30, { x: 0, y: 1, z: 10 });
    expect(s.health.hp).toBe(hp);
    expect(s.armor).toBe(20);
    s.hurtPlayer(30, { x: 0, y: 1, z: 10 });
    expect(s.armor).toBe(0);
    expect(s.health.hp).toBe(hp - 10);
  });

  it("guns you carry count as owned", () => {
    const s = newSim({}, campLevel);
    expect(s.economy.owned).toEqual(expect.arrayContaining(["pistol", "rifle"]));
  });
});

describe("save v4", () => {
  it("new saves carry an economy and pass validation", () => {
    const s = newSave(0, 1);
    expect(s.economy.owned).toEqual(["pistol"]);
    expect(isSaveFile(s)).toBe(true);
  });

  it("a v3 save gets a purse, and the guns in its checkpoint count as owned", () => {
    const v3 = { ...newSave(1, 1), version: 3 } as Record<string, unknown>;
    delete v3.economy;
    v3.snapshot = { loadout: { sidearm: { id: "revolver", mag: 6, reserve: 10 }, long: null, active: "sidearm", grenades: 0, bottles: 0 } };
    const out = migrate(JSON.parse(JSON.stringify(v3)));
    expect(out.version).toBe(4);
    expect(out.economy.owned).toEqual(["pistol", "revolver"]);
    expect(isSaveFile(out)).toBe(true);
  });
});
