// How the controller's look stick turns into camera movement. Pure maths plus two tiny state
// machines, so every part can be tested without a controller. See docs/input-feel.md.

import { TUNING } from "../config/tuning";
import type { StickCurve } from "../core/Settings";

/**
 * Radial deadzone with an outer edge. Inside `inner` the stick reads zero (no drift); past `outer`
 * it reads fully pushed (many sticks never quite reach 1.0, which made the top turn speed
 * unreachable). In between, the range is stretched back to 0..1.
 */
export const deadzone = (x: number, y: number, inner: number, outer = 1): [number, number] => {
  const m = Math.hypot(x, y);
  if (m < inner || m === 0) return [0, 0];
  const scaled = Math.min(1, (m - inner) / Math.max(1e-3, outer - inner));
  return [(x / m) * scaled, (y / m) * scaled];
};

const CURVE_POWER: Record<StickCurve, number> = { linear: 1, dynamic: 2, precise: 3 };

/**
 * Response curve, applied to the stick's distance from centre (not each axis on its own, so a
 * diagonal push turns as fast as a straight one). Higher powers give finer control near the centre.
 */
export function shapeStick(x: number, y: number, curve: StickCurve): [number, number] {
  const m = Math.hypot(x, y);
  if (m === 0) return [0, 0];
  const out = Math.pow(Math.min(1, m), CURVE_POWER[curve] ?? 2);
  return [(x / m) * out, (y / m) * out];
}

/**
 * Turn boost: hold the look stick all the way over and, after a short wait, the turn speeds up
 * smoothly. Small and medium pushes are never affected, so fine aim stays fine.
 */
export class LookBoost {
  private held = 0;

  /** `mag` is the shaped stick distance (0..1). Returns the speed multiplier for this frame. */
  update(mag: number, dt: number): number {
    const s = TUNING.stick;
    if (mag < 0.95) {
      this.held = 0;
      return 1;
    }
    this.held += dt;
    const t = Math.min(1, Math.max(0, (this.held - s.boostDelay) / s.boostRamp));
    // Smoothstep, so the speed-up starts and ends gently.
    return 1 + (s.boostMul - 1) * t * t * (3 - 2 * t);
  }

  reset(): void {
    this.held = 0;
  }
}

/** Shortest signed difference between two angles. */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Flick stick: the right stick points the camera. Push it any way and the view turns to face that
 * way (relative to where you were looking) in a tenth of a second; push it straight down to turn
 * around. Rolling the stick around its rim keeps turning the view by the same angle. Let go and the
 * view stays put. Up and down aiming then comes from the phone's motion sensor.
 * Angles: 0 = stick pushed up (forward), positive = clockwise (right).
 */
export class FlickStick {
  private active = false;
  private lastAngle = 0;
  /** Turn still to be made by the current flick, and the time left to make it. */
  private flickLeft = 0;
  private flickTime = 0;

  /** Returns the yaw (radians, positive = right) to add this frame. `y` is up-positive. */
  update(x: number, y: number, dt: number): number {
    const s = TUNING.stick;
    const m = Math.hypot(x, y);
    let out = 0;
    if (m >= s.flickThreshold) {
      const angle = Math.atan2(x, y);
      if (!this.active) {
        // New flick: turn to face the stick's direction.
        this.active = true;
        this.flickLeft = angle;
        this.flickTime = s.flickTime;
      } else {
        // Rolling around the rim: follow the change of angle directly.
        out += wrap(angle - this.lastAngle);
      }
      this.lastAngle = angle;
    } else if (m < s.flickThreshold * 0.8) {
      // A little hysteresis, so a stick resting on the threshold doesn't re-flick.
      this.active = false;
    }
    if (this.flickTime > 0) {
      const share = Math.min(1, dt / this.flickTime);
      const step = this.flickLeft * share;
      out += step;
      this.flickLeft -= step;
      this.flickTime -= dt;
      if (this.flickTime <= 0) {
        out += this.flickLeft;
        this.flickLeft = 0;
        this.flickTime = 0;
      }
    }
    return out;
  }

  reset(): void {
    this.active = false;
    this.flickLeft = 0;
    this.flickTime = 0;
  }
}
