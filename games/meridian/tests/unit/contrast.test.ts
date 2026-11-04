// Colour contrast check (WCAG 2.2): every text colour in the menus and HUD must stay readable
// on the backgrounds it is drawn on. Reads the real tokens from src/styles/base.css, so a
// colour change that hurts readability fails here before it reaches players.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/styles/base.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const h = m[2].length === 3 ? [...m[2]].map((c) => c + c).join("") : m[2];
    out[m[1]] = `#${h.toLowerCase()}`;
  }
  return out;
}

const channel = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const normal = tokens(":root");
const high = { ...normal, ...tokens("body.high-contrast") };

describe("colour contrast (WCAG)", () => {
  it("reads the colour tokens from base.css", () => {
    expect(normal.ink).toMatch(/^#/);
    expect(normal["panel-solid"]).toMatch(/^#/);
    expect(high.ink).toBe("#ffffff");
  });

  for (const [name, t] of [["normal", normal], ["high contrast", high]] as const) {
    it(`${name}: main text reaches AAA (7:1) on panels and the page`, () => {
      expect(contrast(t.ink, t["panel-solid"])).toBeGreaterThanOrEqual(7);
      expect(contrast(t.ink, t.bg)).toBeGreaterThanOrEqual(7);
    });
    it(`${name}: secondary text, warnings and buttons reach AA (4.5:1)`, () => {
      expect(contrast(t["ink-dim"], t["panel-solid"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["ink-dim"], t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.danger, t["panel-solid"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["accent-ink"], t.accent)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: the focus outline and the accent stand out (3:1 for non-text)`, () => {
      expect(contrast(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.focus, t["panel-solid"])).toBeGreaterThanOrEqual(3);
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(3);
    });
  }

  it("menu text over the key art keeps 4.5:1 even if the art behind it were pure white", () => {
    const menus = readFileSync(new URL("../../src/styles/menus.css", import.meta.url), "utf8");
    // The lightest point of the scrim under the menu column, as written in menus.css.
    const alpha = Number(/rgba\(7, 9, 13, (0\.\d+)\) calc\(max\(6vw, 24px\) \+ 440px\)/.exec(menus)?.[1]);
    expect(alpha).toBeGreaterThan(0);
    const over = (c: number, a: number) => Math.round(c * a + 255 * (1 - a));
    const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    const behind = hex(over(7, alpha), over(9, alpha), over(13, alpha));
    expect(contrast(normal.ink, behind)).toBeGreaterThanOrEqual(7);
    expect(contrast(normal["ink-dim"], behind)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(normal.accent, behind)).toBeGreaterThanOrEqual(4.5);
  });
});
