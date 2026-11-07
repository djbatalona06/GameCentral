// Standard-mapping gamepads (Xbox, PlayStation, Switch Pro, most Bluetooth controllers).

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";
import { FlickStick, LookBoost, deadzone, shapeStick } from "./LookShaping";

export { deadzone };

export class GamepadInput {
  private prevPressed = new Set<number>();
  connected = false;
  /** Called once when a controller without the standard button layout is first seen. */
  onNonStandard: ((id: string) => void) | null = null;
  private warned = new Set<string>();
  /** Raw button edges for menu navigation (index -> pressed this frame). */
  menuPressed = new Set<number>();
  menuAxis = { x: 0, y: 0 };
  private boost = new LookBoost();
  private flick = new FlickStick();

  constructor(private src: InputSource, private settings: () => Settings) {
    window.addEventListener("gamepadconnected", () => (this.connected = true));
    window.addEventListener("gamepaddisconnected", () => (this.connected = navigator.getGamepads?.().some(Boolean) ?? false));
  }

  pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Called every animation frame. */
  update(dt: number): void {
    const p = this.pad();
    this.menuPressed.clear();
    if (!p) {
      // Unplugged (or the battery died): let go of everything, or the last stick angle and any
      // held buttons would stay stuck down forever.
      if (this.prevPressed.size || this.src.held.size || this.src.move.x || this.src.move.y) {
        this.src.held.clear();
        this.src.move = { x: 0, y: 0 };
      }
      this.prevPressed.clear();
      this.menuAxis = { x: 0, y: 0 };
      this.boost.reset();
      this.flick.reset();
      return;
    }
    this.connected = true;
    if (p.mapping !== "standard" && !this.warned.has(p.id)) {
      this.warned.add(p.id);
      this.onNonStandard?.(p.id);
    }
    const bindings = this.settings().controls.pad;
    const pressedNow = new Set<number>();
    p.buttons.forEach((b, i) => {
      if (b.pressed || b.value > 0.5) pressedNow.add(i);
    });
    for (const i of pressedNow) if (!this.prevPressed.has(i)) this.menuPressed.add(i);

    this.src.held.clear();
    for (const a of Object.keys(bindings) as ButtonAction[]) {
      for (const idx of bindings[a]) {
        if (pressedNow.has(idx)) {
          this.src.held.add(a);
          if (!this.prevPressed.has(idx)) this.src.tapped.add(a);
        }
      }
    }
    const c = this.settings().controls;
    const dz = Math.max(0.02, Math.min(0.4, c.stickDeadzone));
    const outer = TUNING.stick.outerDeadzone;
    const [mx, my] = deadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, dz, outer);
    const [lx, ly] = deadzone(p.axes[2] ?? 0, p.axes[3] ?? 0, dz, outer);
    this.src.move = { x: mx, y: -my };
    this.menuAxis = { x: mx, y: my };
    if (c.flickStick) {
      // Flick stick: the stick points the camera; up and down come from the motion sensor.
      // Flicks are physical turns, so look sensitivity does not scale them (undo it here).
      this.src.look.yaw += this.flick.update(lx, -ly, dt) / Math.max(0.05, c.lookSensitivity);
      this.boost.reset();
    } else {
      this.flick.reset();
      // Response curve: fine control near the centre, fast turns at full tilt, plus the turn boost
      // after holding the stick all the way over for a moment.
      const [cx, cy] = shapeStick(lx, ly, c.stickCurve ?? "dynamic");
      const boost = c.lookBoost === false ? 1 : this.boost.update(Math.hypot(cx, cy), dt);
      this.src.look.yaw += cx * boost * TUNING.camera.lookSensitivity * dt;
      this.src.look.pitch -= cy * TUNING.camera.lookSensitivity * 0.7 * dt;
    }
    if (pressedNow.size || mx || my || lx || ly) this.src.active = true;
    this.prevPressed = pressedNow;
  }

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.settings().controls.vibration) return;
    const p = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
  }
}
