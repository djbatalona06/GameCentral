import { describe, expect, it } from "vitest";
import { FrameGovernor, MIN_RESOLUTION_FRACTION } from "../../src/render/FrameGovernor";

/** Simulates a display that calls us every `hz` and counts the frames the governor lets through. */
function renderedFrames(hz: number, targetFps: number, seconds: number): number {
  const g = new FrameGovernor();
  g.configure({ targetFps, dynamic: false });
  g.reset(1);
  const step = 1000 / hz;
  let drawn = 0;
  for (let t = 1000; t < 1000 + seconds * 1000; t += step) if (g.shouldRender(t)) drawn++;
  return drawn;
}

describe("FrameGovernor frame cap", () => {
  it.each([60, 90, 120, 144])("holds 30 fps on a %i Hz screen", (hz) => {
    const fps = renderedFrames(hz, 30, 10) / 10;
    expect(fps).toBeGreaterThan(29);
    expect(fps).toBeLessThan(31);
  });

  it.each([60, 120])("holds 60 fps on a %i Hz screen", (hz) => {
    const fps = renderedFrames(hz, 60, 10) / 10;
    expect(fps).toBeGreaterThan(59);
    expect(fps).toBeLessThan(61);
  });

  it("does not render a burst after a long pause", () => {
    const g = new FrameGovernor();
    g.configure({ targetFps: 30, dynamic: false });
    g.reset(1);
    expect(g.shouldRender(1000)).toBe(true);
    // 5 seconds later (tab was hidden): one frame now, then back to the normal rhythm.
    expect(g.shouldRender(6000)).toBe(true);
    expect(g.shouldRender(6016)).toBe(false);
    expect(g.shouldRender(6034)).toBe(true);
  });
});

/** Feeds `frames` frames of `interval` ms with `cost` ms of CPU work; returns every scale change. */
function run(g: FrameGovernor, start: number, frames: number, interval: number, cost: number): { end: number; changes: number[] } {
  const changes: number[] = [];
  let t = start;
  for (let i = 0; i < frames; i++) {
    t += interval;
    const next = g.record(t, cost);
    if (next !== null) changes.push(next);
  }
  return { end: t, changes };
}

describe("FrameGovernor dynamic resolution", () => {
  const make = (dynamic = true) => {
    const g = new FrameGovernor();
    g.configure({ targetFps: 30, dynamic });
    g.reset(1);
    return g;
  };

  it("lowers the resolution quickly when frames run late", () => {
    const g = make();
    const { changes } = run(g, 1000, 60, 55, 30); // 18 fps: every frame is late
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toBeGreaterThan(1);
  });

  it("never drops below the resolution floor", () => {
    const g = make();
    run(g, 1000, 3000, 80, 60);
    expect(g.currentScaling).toBeLessThanOrEqual(1 / MIN_RESOLUTION_FRACTION + 1e-9);
  });

  it("recovers resolution when there is headroom, and never beats the base", () => {
    const g = make();
    const down = run(g, 1000, 120, 55, 30);
    expect(g.currentScaling).toBeGreaterThan(1);
    run(g, down.end, 3000, 33.3, 8); // steady 30 fps, cheap frames
    expect(g.currentScaling).toBe(1);
  });

  it("stays put when frames are on time", () => {
    const g = make();
    const { changes } = run(g, 1000, 600, 33.3, 20);
    expect(changes).toEqual([]);
  });

  it("does nothing when dynamic resolution is off", () => {
    const g = make(false);
    const { changes } = run(g, 1000, 300, 70, 40);
    expect(changes).toEqual([]);
  });

  it("ignores long pauses", () => {
    const g = make();
    expect(g.record(1000, 5)).toBeNull();
    expect(g.record(9000, 5)).toBeNull();
    expect(g.stats().avgFrameMs).toBeLessThan(100);
  });

  it("reports frame statistics", () => {
    const g = make();
    run(g, 1000, 60, 33.3, 12);
    const s = g.stats();
    expect(s.fps).toBeGreaterThan(29);
    expect(s.fps).toBeLessThan(31);
    expect(s.avgCostMs).toBeCloseTo(12, 1);
    expect(s.p95FrameMs).toBeGreaterThan(33);
  });
});
