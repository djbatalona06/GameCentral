import { describe, expect, it } from "vitest";
import { spaceAt } from "../../src/audio/Spaces";
import { PALETTES, intensity } from "../../src/audio/Music";
import { chapterBeds } from "../../src/audio/Sfx";
import { CHAPTERS } from "../../src/sim/chapters/registry";

describe("room sound", () => {
  it("rings like a cave inside the vault, the ice cave and under a tunnel", () => {
    expect(spaceAt("ch03", { x: 0, y: 8, z: 195 }, false)).toBe("cave");
    expect(spaceAt("ch05", { x: 0, y: 6, z: 280 }, false)).toBe("cave");
    expect(spaceAt("ch06", { x: 0, y: 4, z: 20 }, true)).toBe("cave");
  });

  it("uses open air on the beach and a courtyard in the monastery", () => {
    expect(spaceAt("ch01", { x: 0, y: 0, z: 0 }, false)).toBe("open");
    expect(spaceAt("ch05", { x: 0, y: 18, z: 110 }, false)).toBe("courtyard");
  });
});

describe("adaptive music", () => {
  it("rises from calm to full combat", () => {
    expect(intensity("none", true, 1)).toBe(0);
    expect(intensity("explore", false, 0)).toBeLessThan(intensity("explore", false, 0.5));
    expect(intensity("explore", false, 0.5)).toBeLessThan(intensity("explore", true, 0));
    expect(intensity("explore", true, 0)).toBe(1);
  });

  it("every playable chapter has its own key and tempo", () => {
    for (const c of CHAPTERS.filter((x) => x.playable)) expect(PALETTES[c.id], c.id).toBeDefined();
    const keys = new Set(Object.values(PALETTES).map((p) => `${p.root}:${p.bpm}`));
    expect(keys.size).toBe(Object.keys(PALETTES).length);
  });

  it("sea, insects and train beds match their chapters", () => {
    expect(chapterBeds("ch01").sea).toBe(1);
    expect(chapterBeds("ch03").insects).toBe(1);
    expect(chapterBeds("ch06").train).toBe(1);
    expect(chapterBeds("ch05")).toEqual({ sea: 0, insects: 0, train: 0 });
  });
});
