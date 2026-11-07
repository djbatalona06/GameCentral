// Motion-sensor aiming on phones and tablets ("gyro aiming").
//
// The phone reports how fast it is turning (its rotation rate). We add that turn straight onto
// the camera, like a mouse movement, never like a joystick: a joystick adds speed curves and a
// top speed, a mouse just follows your hand. At sensitivity 1 (the "Natural Sensitivity Scale"),
// turning the phone 10 degrees turns the camera exactly 10 degrees.
//
// Three clean-ups make it feel steady:
//  - Calibration: a resting phone still reports a tiny turn (drift). While it is still, we learn
//    that drift and subtract it.
//  - Tightening: very slow turns (hand tremor) are scaled down smoothly.
//  - Player space: "turn left" means turning around the real-world up direction, however the
//    phone is tilted, so holding it flat or upright both feel right.
//
// Browsers cannot read the gyro inside a game controller, so this uses the phone's own sensor.
// See docs/input-feel.md.

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import { type V3 as Vec3, dot as dot3 } from "../sim/math";

const DEG = Math.PI / 180;

/**
 * The screen's right and up directions in the phone's own axes (x = right edge, y = top edge,
 * z = out of the screen when held upright). `angleDeg` is screen.orientation.angle: 0 upright,
 * 90 turned anticlockwise (landscape), 270 or -90 turned clockwise.
 */
export function screenAxes(angleDeg: number): { right: Vec3; up: Vec3 } {
  const a = angleDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { right: { x: c, y: -s, z: 0 }, up: { x: s, y: c, z: 0 } };
}

/**
 * Turns the phone's rotation rate (radians per second, phone axes) into camera turn rates:
 * `yaw` positive = turn right, `pitch` positive = look up.
 * With `up` (a world-up direction in phone axes, from gravity) the yaw follows the real world's
 * vertical; without it, it follows the screen's vertical.
 */
export function gyroToLook(rate: Vec3, angleDeg: number, up?: Vec3 | null): { yaw: number; pitch: number } {
  const { right, up: screenUp } = screenAxes(angleDeg);
  // Turning about the screen's horizontal axis tips the view up or down.
  const pitch = dot3(rate, right);
  const localYaw = -dot3(rate, screenUp);
  if (!up) return { yaw: localYaw, pitch };
  // Player space: yaw is the turn around world-up. It is boosted a little (x1.41) so it still feels
  // lively with the phone tilted, but never more than the turn left over after pitch is taken out.
  const worldYaw = -dot3(rate, up);
  const leftover = Math.hypot(dot3(rate, screenUp), rate.z);
  const yaw = Math.sign(worldYaw) * Math.min(Math.abs(worldYaw) * 1.41, leftover);
  return { yaw, pitch };
}

/**
 * Gravity as reported by browsers points "up" on some phones and "down" on others. A player holds
 * the screen facing them and tipped back a little, so world-up leans toward the screen's top and
 * out of the screen. Flip the reading if it points the other way. Returns null if too weak to use.
 */
export function worldUp(gravity: Vec3, angleDeg: number): Vec3 | null {
  const m = Math.hypot(gravity.x, gravity.y, gravity.z);
  if (m < 4) return null; // falling or shaking hard: no reliable up
  const u = { x: gravity.x / m, y: gravity.y / m, z: gravity.z / m };
  const { up } = screenAxes(angleDeg);
  return dot3(u, up) + u.z < 0 ? { x: -u.x, y: -u.y, z: -u.z } : u;
}

/** Scales very slow turns down smoothly (rate² / threshold below the threshold), which hides tremor. */
export function tighten(look: { yaw: number; pitch: number }, threshold: number): { yaw: number; pitch: number } {
  const m = Math.hypot(look.yaw, look.pitch);
  if (m >= threshold || m === 0) return look;
  const k = m / threshold;
  return { yaw: look.yaw * k, pitch: look.pitch * k };
}

/** Learns the sensor's resting drift while the phone is still, and removes it. */
export class GyroCalibrator {
  bias: Vec3 = { x: 0, y: 0, z: 0 };
  private stillFor = 0;

  /** Feeds one raw reading (rad/s) taken `dt` seconds after the last; returns it with drift removed. */
  feed(raw: Vec3, dt: number): Vec3 {
    const g = TUNING.gyro;
    const c = { x: raw.x - this.bias.x, y: raw.y - this.bias.y, z: raw.z - this.bias.z };
    if (Math.hypot(c.x, c.y, c.z) < g.stillRate) {
      this.stillFor += dt;
      if (this.stillFor > g.calibrateAfter) {
        // Average gently, so one odd reading cannot throw the estimate off.
        const k = Math.min(1, dt * 1.5);
        this.bias = { x: this.bias.x + c.x * k, y: this.bias.y + c.y * k, z: this.bias.z + c.z * k };
      }
    } else this.stillFor = 0;
    return { x: raw.x - this.bias.x, y: raw.y - this.bias.y, z: raw.z - this.bias.z };
  }
}

type MotionEvt = {
  rotationRate: { alpha: number | null; beta: number | null; gamma: number | null } | null;
  accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null } | null;
  timeStamp: number;
};

/** Listens to the phone's motion sensor and adds its turn to `out` (radians, like mouse look). */
export class GyroInput {
  private cal = new GyroCalibrator();
  private gravity: Vec3 | null = null;
  private lastT = -1;
  /** True once a real rotation reading has arrived (some desktops fire empty motion events). */
  available = false;

  constructor(private out: { yaw: number; pitch: number }, private settings: () => Settings) {
    if (typeof window !== "undefined") window.addEventListener("devicemotion", (e) => this.onMotion(e as unknown as MotionEvt));
  }

  /** iPhone and iPad ask the player before sharing motion data. Call from a tap. */
  static requestPermission(): void {
    const D = (globalThis as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    D?.requestPermission?.().catch(() => undefined);
  }

  private orientation(): number {
    const so = typeof screen !== "undefined" ? screen.orientation : undefined;
    if (so && typeof so.angle === "number") return so.angle;
    const w = (globalThis as { orientation?: number }).orientation;
    return typeof w === "number" ? w : 0;
  }

  onMotion(e: MotionEvt): void {
    const r = e.rotationRate;
    if (!r || r.alpha === null || r.beta === null || r.gamma === null) return;
    this.available = true;
    const t = e.timeStamp / 1000;
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
    this.lastT = t;
    const g = e.accelerationIncludingGravity;
    if (g && g.x !== null && g.y !== null && g.z !== null) {
      // Smooth gravity: it is only used for direction, and hand shake must not wobble it.
      const k = this.gravity ? Math.min(1, dt * 6) : 1;
      const p = this.gravity ?? { x: g.x, y: g.y, z: g.z };
      this.gravity = { x: p.x + (g.x - p.x) * k, y: p.y + (g.y - p.y) * k, z: p.z + (g.z - p.z) * k };
    }
    // Browser axes: beta turns about the phone's x axis, gamma about y, alpha about z (deg/s).
    const raw = { x: r.beta * DEG, y: r.gamma * DEG, z: r.alpha * DEG };
    if (Math.hypot(raw.x, raw.y, raw.z) > TUNING.gyro.maxRate) return;
    const rate = this.cal.feed(raw, dt);
    const c = this.settings().controls;
    if (c.gyroMode === "off" || dt === 0) return;
    const angle = this.orientation();
    const look = tighten(gyroToLook(rate, angle, this.gravity ? worldUp(this.gravity, angle) : null), TUNING.gyro.tightenRate);
    this.out.yaw += look.yaw * dt * c.gyroSensitivity;
    this.out.pitch += look.pitch * dt * c.gyroSensitivity;
  }
}
