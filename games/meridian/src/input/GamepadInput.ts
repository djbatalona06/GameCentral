// Standard-mapping gamepads (Xbox, PlayStation, Switch Pro, most Bluetooth controllers).

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";

/** Radial deadzone: inside it the stick reads zero, outside it the range is stretched back to 0..1. */
export const deadzone = (x: number, y: number, dz: number): [number, number] => {
  const m = Math.hypot(x, y);
  if (m < dz || m === 0) return [0, 0];
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  return [(x / m) * scaled, (y / m) * scaled];
};

export class GamepadInput {
  private prevPressed = new Set<number>();
  connected = false;
  /** Raw button edges for menu navigation (index -> pressed this frame). */
  menuPressed = new Set<number>();
  menuAxis = { x: 0, y: 0 };

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
    if (!p) return;
    this.connected = true;
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
    const dz = Math.max(0.02, Math.min(0.4, this.settings().controls.stickDeadzone));
    const [mx, my] = deadzone(p.axes[0] ?? 0, p.axes[1] ?? 0, dz);
    const [lx, ly] = deadzone(p.axes[2] ?? 0, p.axes[3] ?? 0, dz);
    this.src.move = { x: mx, y: -my };
    this.menuAxis = { x: mx, y: my };
    // Response curve: fine control near the centre, fast turns at full tilt.
    const curve = (v: number) => Math.sign(v) * v * v;
    this.src.look.yaw += curve(lx) * TUNING.camera.lookSensitivity * dt;
    this.src.look.pitch -= curve(ly) * TUNING.camera.lookSensitivity * 0.7 * dt;
    if (pressedNow.size || mx || my || lx || ly) this.src.active = true;
    this.prevPressed = pressedNow;
  }

  rumble(strong: number, weak: number, ms: number): void {
    if (!this.settings().controls.vibration) return;
    const p = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => undefined);
  }
}
