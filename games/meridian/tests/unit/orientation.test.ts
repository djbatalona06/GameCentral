import { describe, expect, it } from "vitest";
import { MAX_VERTICAL_FOV, REFERENCE_ASPECT, fovForAspect } from "../../src/sim/player/CameraRig";
import { defaultSettings, migrateSettings } from "../../src/core/Settings";

const hfov = (vfov: number, aspect: number) => 2 * Math.atan(Math.tan(vfov / 2) * aspect);

describe("field of view per screen shape", () => {
  it("keeps the tuned view on wide (landscape) screens", () => {
    expect(fovForAspect(0.9, REFERENCE_ASPECT)).toBeCloseTo(0.9);
    expect(fovForAspect(0.9, 2.16)).toBeCloseTo(0.9);
  });

  it("widens the vertical view on narrow screens so the horizontal view stays useful", () => {
    const portrait = fovForAspect(0.3, 390 / 844);
    expect(portrait).toBeGreaterThan(0.3);
    expect(hfov(portrait, 390 / 844)).toBeCloseTo(hfov(0.3, REFERENCE_ASPECT), 3);
  });

  it("never goes past the fish-eye limit", () => {
    expect(fovForAspect(0.9, 0.3)).toBeCloseTo(MAX_VERTICAL_FOV);
  });
});

describe("settings migration", () => {
  it("keeps v1 touch positions (one flat set, as landscape is the only orientation)", () => {
    const v1 = { version: 1, controls: { touchPositions: { jump: { x: 10, y: 20 } } } };
    const out = migrateSettings(v1) as ReturnType<typeof defaultSettings>;
    expect(out.version).toBe(4);
    expect(out.controls.touchPositions).toEqual({ jump: { x: 10, y: 20 } });
  });

  it("drops the saved spots of the old Swap and Goal buttons (v2 to v3) and keeps the rest", () => {
    const v2 = {
      version: 2,
      controls: { touchPositions: { landscape: { swapWeapon: { x: 1, y: 1 }, navAssist: { x: 2, y: 2 }, jump: { x: 3, y: 3 } }, portrait: {} } },
    };
    const out = migrateSettings(v2) as ReturnType<typeof defaultSettings>;
    expect(out.version).toBe(4);
    expect(out.controls.touchPositions).toEqual({ jump: { x: 3, y: 3 } });
  });

  it("drops portrait positions and keeps landscape ones (v3 to v4)", () => {
    const v3 = {
      version: 3,
      controls: { touchPositions: { landscape: { fire: { x: 5, y: 6 } }, portrait: { fire: { x: 9, y: 9 }, jump: { x: 8, y: 8 } } } },
    };
    const out = migrateSettings(v3) as ReturnType<typeof defaultSettings>;
    expect(out.version).toBe(4);
    expect(out.controls.touchPositions).toEqual({ fire: { x: 5, y: 6 } });
  });

  it("copes with settings that have no saved positions", () => {
    const out = migrateSettings({ version: 3, controls: {} }) as { version: number; controls: { touchPositions: unknown } };
    expect(out.version).toBe(4);
    expect(out.controls.touchPositions).toEqual({});
  });

  it("leaves current settings alone", () => {
    const s = defaultSettings();
    s.controls.touchPositions.fire = { x: 1, y: 2 };
    expect(migrateSettings(s)).toEqual(s);
  });
});
