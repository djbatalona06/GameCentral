import { describe, expect, it } from "vitest";
import { BUTTONS, defaultPositions, dims } from "../../src/input/TouchControls";
import type { TouchLayout } from "../../src/core/Settings";

const LAYOUTS: TouchLayout[] = ["standard", "oneHandedRight", "oneHandedLeft"];
/** A small phone held sideways. The game is played in landscape only. */
const SCREEN = { w: 844, h: 390 };

interface Rect {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  round: boolean;
}

function rects(layout: TouchLayout, scale: number): Rect[] {
  const pos = defaultPositions(layout);
  const { w: W, h: H } = SCREEN;
  return BUTTONS.map((d) => {
    const p = pos[d.id];
    expect(p, `${layout} has a position for ${d.id}`).toBeDefined();
    const { w, h } = dims(d, scale);
    const cx = (p.x / 100) * W;
    const cy = (p.y / 100) * H;
    return { id: d.id, x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, round: d.w === undefined };
  });
}

/** True when two widgets touch. Round buttons are compared as circles, cards as rectangles. */
function overlap(a: Rect, b: Rect): boolean {
  const circle = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: (r.x1 - r.x0) / 2 });
  if (a.round && b.round) {
    const ca = circle(a);
    const cb = circle(b);
    return Math.hypot(ca.x - cb.x, ca.y - cb.y) < ca.r + cb.r;
  }
  // A circle against a card (or two cards): the bounding boxes are close enough.
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

const MINE = ["goal", "gun", "walk"];
const clashes = (list: Rect[], only?: (r: Rect) => boolean) => {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if ((!only || only(list[i]) || only(list[j])) && overlap(list[i], list[j])) out.push(`${list[i].id}+${list[j].id}`);
  return out;
};

describe("default touch layouts", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: every widget is on screen at the default size`, () => {
      const { w: W, h: H } = SCREEN;
      for (const r of rects(layout, 1)) {
        expect(r.x0, `${r.id} left edge`).toBeGreaterThanOrEqual(0);
        expect(r.y0, `${r.id} top edge`).toBeGreaterThanOrEqual(0);
        expect(r.x1, `${r.id} right edge`).toBeLessThanOrEqual(W);
        expect(r.y1, `${r.id} bottom edge`).toBeLessThanOrEqual(H);
      }
    });
    it(`${layout}: the goal card, gun card and Walk switch overlap nothing (sizes 1 and 1.3)`, () => {
      for (const scale of [1, 1.3]) expect(clashes(rects(layout, scale), (r) => MINE.includes(r.id)), `size ${scale}`).toEqual([]);
    });
  }

  // The two-thumb layout is the default. (The one-handed layouts are cramped by design and, at large
  // button sizes, some of their older buttons touch; tidying those is separate work.)
  it("standard: no two widgets overlap at the default size", () => {
    expect(clashes(rects("standard", 1))).toEqual([]);
  });

  it("keeps the status widgets on the left and the actions on the right (standard)", () => {
    const pos = defaultPositions("standard");
    for (const id of MINE) expect(pos[id].x, id).toBeLessThan(25);
    for (const id of ["jump", "fire", "aim", "coverRoll", "melee", "interact", "reload", "throw"]) expect(pos[id].x, id).toBeGreaterThan(55);
  });

  it("does not have the old Swap and Goal buttons any more", () => {
    expect(BUTTONS.map((b) => b.id)).not.toContain("swapWeapon");
    expect(BUTTONS.map((b) => b.id)).not.toContain("navAssist");
  });
});
