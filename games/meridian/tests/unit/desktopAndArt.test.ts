// Desktop mode, controller button names, the settings upgrade, and the Blender background pack.

import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SettingsStore, defaultSettings } from "../../src/core/Settings";
import { buttonName, detectFamily, keyName, resolveFamily, spokenButtonName } from "../../src/input/glyphs";
import { deadzone } from "../../src/input/GamepadInput";
import { autoTier } from "../../src/render/Quality";
import { TERRAIN_CHAPTERS } from "../../src/render/Terrain";
import { CHAPTERS } from "../../src/sim/chapters/registry";
import { adaptTip } from "../../src/ui/controlText";
import type { KeyValueStore } from "../../src/save/storage";

const memoryStore = (data: Record<string, unknown>): KeyValueStore => ({
  get: async <T>(k: string) => data[k] as T | undefined,
  set: async (k, v) => void (data[k] = v),
  delete: async (k) => void delete data[k],
  keys: async () => Object.keys(data),
});

describe("controller button names", () => {
  it("recognises the controller from the browser's gamepad id", () => {
    expect(detectFamily("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)")).toBe("xbox");
    expect(detectFamily("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)")).toBe("playstation");
    expect(detectFamily("054c-09cc-Wireless Controller")).toBe("playstation");
    expect(detectFamily("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)")).toBe("switch");
    expect(detectFamily(null)).toBe("xbox");
  });

  it("names the bottom face button the way it is printed on each controller", () => {
    expect(buttonName(0, "xbox")).toBe("A");
    expect(buttonName(0, "playstation")).toBe("✕");
    expect(buttonName(0, "switch")).toBe("B");
    expect(buttonName(3, "playstation")).toBe("△");
  });

  it("speaks symbols as words for narration", () => {
    expect(spokenButtonName(0, "playstation")).toBe("Cross");
    expect(spokenButtonName(1, "playstation")).toBe("Circle");
  });

  it("lets the player override the detected family", () => {
    expect(resolveFamily("auto", "Vendor: 054c")).toBe("playstation");
    expect(resolveFamily("switch", "Vendor: 054c")).toBe("switch");
  });

  it("shows keys the way they are printed on the keyboard", () => {
    expect(keyName("KeyE")).toBe("E");
    expect(keyName("ShiftLeft")).toBe("Shift");
    expect(keyName("Mouse2")).toBe("Right click");
    expect(keyName("Digit1")).toBe("1");
  });
});

describe("stick deadzone", () => {
  it("ignores small drift and still reaches full tilt", () => {
    expect(deadzone(0.1, 0.05, 0.18)).toEqual([0, 0]);
    const [x] = deadzone(1, 0, 0.18);
    expect(x).toBeCloseTo(1);
    const [lowX] = deadzone(0.3, 0, 0.1);
    const [highX] = deadzone(0.3, 0, 0.25);
    expect(lowX).toBeGreaterThan(highX);
  });
});

describe("settings upgrade to v5", () => {
  it("keeps a v4 player's choices and adds the new options with safe defaults", async () => {
    const v4 = defaultSettings() as unknown as Record<string, any>;
    v4.version = 4;
    delete v4.controls.glyphs;
    delete v4.controls.stickDeadzone;
    delete v4.video.motionBlur;
    delete v4.a11y.motionEffects;
    v4.controls.touchPositions = { fire: { x: 4, y: 5 } };
    v4.a11y.textScale = 1.4;
    const store = new SettingsStore(memoryStore({ settings: v4 }));
    const s = await store.load();
    expect(s.version).toBe(6);
    expect(s.a11y.textScale).toBe(1.4);
    expect(s.controls.touchPositions).toEqual({ fire: { x: 4, y: 5 } });
    expect(s.controls.glyphs).toBe("auto");
    expect(s.controls.stickDeadzone).toBeCloseTo(0.18);
    expect(s.video.motionBlur).toBe("off");
    expect(s.a11y.motionEffects).toBe(true);
  });

  it("never turns motion blur on by default (photosensitivity and comfort)", () => {
    expect(defaultSettings().video.motionBlur).toBe("off");
  });
});

describe("desktop quality", () => {
  it("gives the desktop app the full look on strong computers", () => {
    expect(autoTier(8, false, { desktopApp: true })).toBe("ultra");
    expect(autoTier(4, false, { desktopApp: true })).toBe("high");
    expect(autoTier(16, false, { desktopApp: true, gpu: "SwiftShader" })).toBe("medium");
  });
});

describe("Blender background pack", () => {
  const palettes = JSON.parse(readFileSync(new URL("../../assets-src/blender/palettes.json", import.meta.url), "utf8")) as Record<string, { top: string; bottom: string; fog: string }>;
  const playable = CHAPTERS.filter((c) => c.playable && c.build);

  it("uses the same sky colours as each chapter, so the backdrop meets the fog with no seam", () => {
    for (const ch of playable) {
      const sky = ch.build!().sky;
      const p = palettes[ch.id];
      expect(p, ch.id).toBeDefined();
      expect([p.top, p.bottom, p.fog]).toEqual([sky.top, sky.bottom, sky.fog]);
    }
  });

  it("ships a panorama, a small panorama and a card for every playable chapter, within budget", () => {
    const file = (f: string) => new URL(`../../public/backgrounds/${f}`, import.meta.url);
    for (const ch of playable) {
      for (const [f, maxKb] of [[`${ch.id}-pano.webp`, 400], [`${ch.id}-pano-sm.webp`, 160], [`${ch.id}-card.webp`, 160]] as const) {
        expect(existsSync(file(f)), f).toBe(true);
        expect(statSync(file(f)).size / 1024, f).toBeLessThanOrEqual(maxKb);
      }
    }
    expect(existsSync(file("key-art.webp"))).toBe(true);
    expect(existsSync(file("key-art-sm.webp"))).toBe(true);
  });
  it("ships Blender terrain for every chapter that has land, within budget (the train scrolls its own)", () => {
    const file = (f: string) => new URL(`../../public/assets/terrain/${f}`, import.meta.url);
    for (const id of TERRAIN_CHAPTERS) {
      for (const [f, maxKb] of [[`${id}.glb`, 450], [`${id}-lo.glb`, 150]] as const) {
        expect(existsSync(file(f)), f).toBe(true);
        expect(statSync(file(f)).size / 1024, f).toBeLessThanOrEqual(maxKb);
      }
    }
    expect(TERRAIN_CHAPTERS).not.toContain("ch06");
  });

  it("the level export Blender builds terrain from is up to date with the chapters", () => {
    const levels = JSON.parse(readFileSync(new URL("../../assets-src/blender/levels.json", import.meta.url), "utf8")) as Record<string, { boxes: number[][]; checkpoints: number[][] }>;
    const r = (n: number) => Math.round(n * 100) / 100;
    for (const ch of playable) {
      const l = ch.build!();
      const ex = levels[ch.id];
      expect(ex, `${ch.id}: run npm run export-levels`).toBeDefined();
      expect(ex.boxes.length, `${ch.id}: run npm run export-levels`).toBe(l.boxes.length);
      expect(ex.checkpoints, `${ch.id}: run npm run export-levels`).toEqual(l.checkpoints.map((c) => [r(c.pos.x), r(c.pos.y), r(c.pos.z)]));
    }
  });
});

describe("tutorial hints follow the device", () => {
  const controls = defaultSettings().controls;
  const hint = "Move with the left stick. Swipe the right side of the screen to look around.";
  it("leaves touch hints as written", () => {
    expect(adaptTip(hint, "touch", controls)).toContain("Swipe");
  });
  it("rewrites touch-only phrases and names the bound key on a keyboard", () => {
    expect(adaptTip(hint, "keyboard", controls)).toContain("WASD");
    expect(adaptTip("Stand on the tower platform and press Interact to ride the zipline.", "keyboard", controls)).toContain("press E");
    expect(adaptTip("Hold Sprint for a boost.", "keyboard", controls)).toBe("Hold Shift for a boost.");
    expect(adaptTip("Run and jump to catch the rope. Push forward to swing.", "keyboard", controls)).toContain("Hold W to swing");
  });
  it("talks about the right stick and shows the controller's own button names", () => {
    expect(adaptTip(hint, "gamepad", controls)).toContain("right stick");
    const ps = { ...controls, glyphs: "playstation" as const };
    expect(adaptTip("Press Jump next to a handhold.", "gamepad", ps)).toBe("Press ✕ next to a handhold.");
  });
});
