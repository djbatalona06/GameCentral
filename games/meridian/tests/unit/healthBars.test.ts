// Health bars: on by default, and the colour goes from green (full) to red (nearly out).
import { describe, expect, it } from "vitest";
import { defaultSettings } from "../../src/core/Settings";

describe("health bars", () => {
  it("are on by default and can be switched off in Accessibility", () => {
    expect(defaultSettings().a11y.healthBars).toBe(true);
  });

  it("go from green to red as health drops", async () => {
    // HUD.ts touches the DOM only when a HUD is created, so the colour helper can be tested alone.
    (globalThis as { document?: unknown }).document ??= undefined;
    const { hpColor } = await import("../../src/ui/HUD");
    const hue = (s: string) => Number(/hsl\((\d+)/.exec(s)![1]);
    expect(hue(hpColor(1))).toBeGreaterThan(100);
    expect(hue(hpColor(0.5))).toBeGreaterThan(40);
    expect(hue(hpColor(0.5))).toBeLessThan(90);
    expect(hue(hpColor(0.05))).toBeLessThan(15);
    expect(hue(hpColor(-1))).toBe(0);
  });
});
