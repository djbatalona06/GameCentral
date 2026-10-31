// Gathers keyboard/mouse, gamepad and touch input into one InputFrame per simulation tick.
// Accessibility "toggle instead of hold" options are applied here, so the game never needs
// to know how a button is physically held.

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import { BUTTON_ACTIONS, type ButtonAction, type InputFrame, emptyButtons } from "./actions";

export interface InputSource {
  /** Which actions are physically held right now. */
  held: Set<ButtonAction>;
  /** Actions pressed since the last poll (so quick taps between ticks are never lost). */
  tapped: Set<ButtonAction>;
  move: { x: number; y: number };
  /** Accumulated camera rotation in radians since the last poll. */
  look: { yaw: number; pitch: number };
  active: boolean;
}

export const newSource = (): InputSource => ({ held: new Set(), tapped: new Set(), move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, active: false });

export class InputManager {
  readonly keyboard = newSource();
  readonly gamepad = newSource();
  readonly touch = newSource();
  device: InputFrame["device"] = "touch";
  /** When false (menus open), gameplay input is ignored. */
  enabled = true;

  private prevHeld = new Set<ButtonAction>();
  private toggled = new Set<ButtonAction>();

  constructor(private settings: () => Settings) {}

  private sources(): Array<[InputFrame["device"], InputSource]> {
    return [
      ["keyboard", this.keyboard],
      ["gamepad", this.gamepad],
      ["touch", this.touch],
    ];
  }

  /** Builds the frame for one simulation tick and clears per-tick accumulators. */
  poll(): InputFrame {
    const s = this.settings();
    const rawHeld = new Set<ButtonAction>();
    const tapped = new Set<ButtonAction>();
    let mx = 0;
    let my = 0;
    let yaw = 0;
    let pitch = 0;
    for (const [dev, src] of this.sources()) {
      if (src.active) this.device = dev;
      src.active = false;
      src.held.forEach((a) => rawHeld.add(a));
      src.tapped.forEach((a) => tapped.add(a));
      src.tapped.clear();
      mx += src.move.x;
      my += src.move.y;
      yaw += src.look.yaw;
      pitch += src.look.pitch;
      src.look.yaw = 0;
      src.look.pitch = 0;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    const buttons = emptyButtons();
    if (!this.enabled) {
      this.prevHeld.clear();
      return { move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, buttons, device: this.device };
    }

    const toggles: Partial<Record<ButtonAction, boolean>> = {
      aim: s.controls.toggleAim,
      sprint: s.controls.toggleSprint,
      crouch: false, // crouch is already a press-to-toggle action in the controller
    };
    for (const a of BUTTON_ACTIONS) {
      const down = rawHeld.has(a) || tapped.has(a);
      const wasDown = this.prevHeld.has(a);
      const pressed = (down && !wasDown) || (tapped.has(a) && wasDown && !rawHeld.has(a));
      const released = !rawHeld.has(a) && wasDown;
      if (toggles[a]) {
        if (pressed) {
          if (this.toggled.has(a)) this.toggled.delete(a);
          else this.toggled.add(a);
        }
        const on = this.toggled.has(a);
        buttons[a] = { held: on, pressed: pressed && on, released: pressed && !on };
      } else {
        buttons[a] = { held: down, pressed, released };
      }
    }
    // Sprint toggles off automatically when the player stops moving.
    if (toggles.sprint && mag < 0.2) this.toggled.delete("sprint");
    this.prevHeld = new Set([...rawHeld]);

    const aimScale = buttons.aim.held ? s.controls.aimSensitivity : 1;
    return {
      move: { x: mx, y: my },
      look: { yaw: yaw * s.controls.lookSensitivity * aimScale, pitch: pitch * s.controls.lookSensitivity * aimScale },
      buttons,
      device: this.device,
    };
  }

  /** Clears toggles, e.g. when entering a menu or dying. */
  reset(): void {
    this.toggled.clear();
    this.prevHeld.clear();
    for (const [, src] of this.sources()) {
      src.held.clear();
      src.tapped.clear();
      src.move = { x: 0, y: 0 };
      src.look = { yaw: 0, pitch: 0 };
    }
  }

  isToggled(a: ButtonAction): boolean {
    return this.toggled.has(a);
  }

  static readonly stickLook = TUNING.camera.lookSensitivity;
}
