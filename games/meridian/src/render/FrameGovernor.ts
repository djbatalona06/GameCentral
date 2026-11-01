// Frame pacing and dynamic resolution, kept free of Babylon so it can be unit-tested.
//
// Why this exists:
//  - The game runs its own requestAnimationFrame loop, so Babylon's own fps counter never ticks.
//    The governor measures frames itself.
//  - A "30 fps" cap made by skipping every other frame gives 45 or 60 fps on 90/120 Hz phones.
//    The governor renders on a fixed time grid instead, which is right on any refresh rate.
//  - Dynamic resolution reacts to frames that really missed their deadline, within about a second,
//    and never goes below a floor so the picture stays sharp.

export interface GovernorConfig {
  /** Target frames per second (30 or 60). */
  targetFps: number;
  /** Whether the render scale may change. */
  dynamic: boolean;
}

export interface FrameStats {
  /** Average frames per second over the recent window. */
  fps: number;
  /** Average milliseconds between rendered frames. */
  avgFrameMs: number;
  /** 95th-percentile milliseconds between rendered frames (the "bad" frames). */
  p95FrameMs: number;
  /** Average milliseconds the CPU spent inside the render call. */
  avgCostMs: number;
  /** Current hardware scaling level (1 = full resolution, 2 = half). */
  scaling: number;
}

/** How many recent frames the statistics cover. */
const HISTORY = 120;
/** Frames judged together before the scale is allowed to change (about 0.7 s at 30 fps). */
const WINDOW = 20;
/** A frame is "late" when it took this much longer than its budget. */
const LATE_FACTOR = 1.25;
/** Shortest wait between two scale changes, in milliseconds. */
const COOLDOWN_DOWN_MS = 800;
const COOLDOWN_UP_MS = 4000;
/** Step sizes for the hardware scaling level. */
const STEP_DOWN = 0.12;
const STEP_UP = 0.05;
/** The picture never drops below this fraction of the base resolution. */
export const MIN_RESOLUTION_FRACTION = 0.6;
/** Slack (ms) so a display that is a hair early still renders on its grid slot. */
const GRID_TOLERANCE_MS = 2;

export class FrameGovernor {
  private cfg: GovernorConfig = { targetFps: 30, dynamic: true };
  private baseScaling = 1;
  private scaling = 1;

  private gridAt = -Infinity;

  private intervals: number[] = [];
  private costs: number[] = [];
  private late = 0;
  private windowCost = 0;
  private windowCount = 0;
  private calmWindows = 0;
  private lastChangeAt = -Infinity;
  private lastRecordAt = 0;

  configure(cfg: GovernorConfig): void {
    this.cfg = cfg;
  }

  /** Sets the base (best) scaling level, for example 1 / devicePixelRatio, and resets the scale. */
  reset(baseScaling: number): void {
    this.baseScaling = baseScaling;
    this.scaling = baseScaling;
    this.intervals = [];
    this.costs = [];
    this.late = 0;
    this.windowCost = 0;
    this.windowCount = 0;
    this.calmWindows = 0;
    this.lastChangeAt = -Infinity;
    this.lastRecordAt = 0;
  }

  get frameBudgetMs(): number {
    return 1000 / this.cfg.targetFps;
  }

  /** The largest scaling level allowed (lowest resolution). */
  get maxScaling(): number {
    return this.baseScaling / MIN_RESOLUTION_FRACTION;
  }

  get currentScaling(): number {
    return this.scaling;
  }

  /**
   * Called on every animation-frame callback. Returns true when a frame should be drawn.
   * Frames are placed on a fixed time grid, so the result is correct on 60, 90 and 120 Hz screens.
   */
  shouldRender(nowMs: number): boolean {
    const interval = this.frameBudgetMs;
    // After a long gap (tab switch, loading) start a fresh grid instead of rendering a burst.
    if (nowMs - this.gridAt > interval * 3) {
      this.gridAt = nowMs;
      return true;
    }
    if (nowMs < this.gridAt + interval - GRID_TOLERANCE_MS) return false;
    this.gridAt += interval;
    // If we are still behind the grid (slow frame), do not try to catch up with extra frames.
    if (nowMs - this.gridAt > interval) this.gridAt = nowMs;
    return true;
  }

  /**
   * Records one rendered frame. `costMs` is the CPU time spent in the render call.
   * Returns the new hardware scaling level when it should change, otherwise null.
   */
  record(nowMs: number, costMs: number): number | null {
    const interval = this.lastRecordAt > 0 ? nowMs - this.lastRecordAt : this.frameBudgetMs;
    this.lastRecordAt = nowMs;
    // A pause longer than a second (menu, tab hidden) says nothing about performance.
    if (interval > 1000) return null;

    this.intervals.push(interval);
    this.costs.push(costMs);
    if (this.intervals.length > HISTORY) {
      this.intervals.shift();
      this.costs.shift();
    }

    if (interval > this.frameBudgetMs * LATE_FACTOR) this.late++;
    this.windowCost += costMs;
    this.windowCount++;
    if (this.windowCount < WINDOW) return null;

    const lateShare = this.late / this.windowCount;
    const avgCost = this.windowCost / this.windowCount;
    this.late = 0;
    this.windowCost = 0;
    this.windowCount = 0;

    if (!this.cfg.dynamic) return null;

    // Too many late frames: lower the resolution a little.
    if (lateShare > 0.2) {
      this.calmWindows = 0;
      if (nowMs - this.lastChangeAt < COOLDOWN_DOWN_MS || this.scaling >= this.maxScaling) return null;
      return this.change(Math.min(this.maxScaling, this.scaling + STEP_DOWN), nowMs);
    }
    // No late frames and plenty of CPU headroom for a few windows in a row: raise it again.
    if (lateShare === 0 && avgCost < this.frameBudgetMs * 0.6) {
      this.calmWindows++;
      if (this.calmWindows >= 3 && this.scaling > this.baseScaling && nowMs - this.lastChangeAt >= COOLDOWN_UP_MS) {
        this.calmWindows = 0;
        return this.change(Math.max(this.baseScaling, this.scaling - STEP_UP), nowMs);
      }
    } else this.calmWindows = 0;
    return null;
  }

  private change(next: number, nowMs: number): number | null {
    if (Math.abs(next - this.scaling) < 1e-6) return null;
    this.scaling = next;
    this.lastChangeAt = nowMs;
    return next;
  }

  stats(): FrameStats {
    const n = this.intervals.length;
    if (!n) return { fps: 0, avgFrameMs: 0, p95FrameMs: 0, avgCostMs: 0, scaling: this.scaling };
    const avg = this.intervals.reduce((a, b) => a + b, 0) / n;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
    const cost = this.costs.reduce((a, b) => a + b, 0) / n;
    return { fps: 1000 / avg, avgFrameMs: avg, p95FrameMs: p95, avgCostMs: cost, scaling: this.scaling };
  }
}
