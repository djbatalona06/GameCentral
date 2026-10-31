import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/config/tuning";
import { WEAPONS, canFire, currentSpread, falloff, fire, newWeaponState, shotDamage, startReload, tickWeapon, cancelReload } from "../../src/sim/combat/weapons";
import { aimAssist, applyDamage, simulateArc, throwVelocity, tickHealth } from "../../src/sim/combat/ballistics";
import { World } from "../../src/sim/world/World";
import { testLevel } from "./helpers";

describe("weapons", () => {
  it("applies headshot multipliers and distance falloff", () => {
    const rifle = WEAPONS.rifle;
    expect(shotDamage(rifle, 5, false)).toBe(rifle.damage);
    expect(shotDamage(rifle, 5, true)).toBe(rifle.damage * rifle.headshotMult);
    expect(falloff(rifle, rifle.falloffEnd + 10)).toBe(rifle.falloffMinMult);
    const mid = falloff(rifle, (rifle.falloffStart + rifle.falloffEnd) / 2);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(rifle.falloffMinMult);
  });

  it("tightens spread when aiming and crouching, widens for blind fire", () => {
    const def = WEAPONS.pistol;
    const base = { aiming: false, crouched: false, moving: 0, airborne: false, blindFire: false, bloom: 0 };
    const hip = currentSpread(def, base, 3.5);
    const aim = currentSpread(def, { ...base, aiming: true }, 3.5);
    const aimCrouch = currentSpread(def, { ...base, aiming: true, crouched: true }, 3.5);
    const blind = currentSpread(def, { ...base, blindFire: true }, 3.5);
    expect(aim).toBeLessThan(hip);
    expect(aimCrouch).toBeLessThan(aim);
    expect(blind).toBeGreaterThan(hip * 3);
  });

  it("fires, blooms, empties and reloads from reserve", () => {
    const w = newWeaponState("pistol", 20);
    const def = WEAPONS.pistol;
    let shots = 0;
    for (let i = 0; i < 400 && w.mag > 0; i++) {
      if (canFire(w)) {
        fire(w);
        shots++;
      }
      tickWeapon(w, 1 / 60);
    }
    expect(shots).toBe(def.magSize);
    expect(startReload(w)).toBe(true);
    for (let i = 0; i < 200; i++) tickWeapon(w, 1 / 60);
    expect(w.mag).toBe(def.magSize);
    expect(w.reserve).toBe(20 - def.magSize);
  });

  it("recoil climbs over a burst", () => {
    const w = newWeaponState("rifle");
    const first = fire(w).pitch;
    w.cooldown = 0;
    let last = first;
    for (let i = 0; i < 5; i++) {
      w.cooldown = 0;
      last = fire(w).pitch;
    }
    expect(last).toBeGreaterThan(first);
  });

  it("an interrupted reload does not refill the magazine", () => {
    const w = newWeaponState("rifle", 60);
    w.mag = 3;
    startReload(w);
    tickWeapon(w, 0.5);
    cancelReload(w);
    for (let i = 0; i < 200; i++) tickWeapon(w, 1 / 60);
    expect(w.mag).toBe(3);
  });
});

describe("ballistics", () => {
  it("grenade arc falls under gravity and bounces off the ground", () => {
    const world = new World(testLevel());
    const pts = simulateArc(world, { x: 0, y: 1.7, z: -20 }, throwVelocity(0, 0), 2.4);
    const minY = Math.min(...pts.map((p) => p.pos.y));
    expect(minY).toBeGreaterThan(-0.2);
    expect(pts[pts.length - 1].pos.z).toBeGreaterThan(-20);
  });

  it("health regenerates only after the delay", () => {
    const h = { hp: 100, max: 100, sinceDamage: 99 };
    applyDamage(h, 50);
    tickHealth(h, TUNING.health.regenDelay - 0.5);
    expect(h.hp).toBe(50);
    tickHealth(h, 1);
    expect(h.hp).toBeGreaterThan(50);
  });

  it("aim assist slows the reticle near targets and snaps on high", () => {
    const eye = { x: 0, y: 1.6, z: 0 };
    const target = [{ pos: { x: 0.3, y: 1.6, z: 10 } }];
    expect(aimAssist("off", eye, 0, 0, target).sensitivity).toBe(1);
    const low = aimAssist("low", eye, 0, 0, target);
    expect(low.sensitivity).toBeLessThan(1);
    expect(low.snapYaw).toBe(0);
    const high = aimAssist("high", eye, 0, 0, target);
    expect(high.snapYaw).toBeGreaterThan(0);
  });
});
