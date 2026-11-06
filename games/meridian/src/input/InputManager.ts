// Gathers keyboard/mouse, gamepad and touch input into one InputFrame per simulation tick.
// Accessibility "toggle instead of hold" options are applied here, so the game never needs
// to know how a button is physically held.

import type { Settings } from "../core/Settings";
import { BUTTON_ACTIONS, type ButtonAction, type InputFrame, emptyButtons } from "./actions";
import { isComputer } from "../platform/desktop";

export interface InputSource {
  /** Which actions are physically held right now. */
  held: Set<ButtonAction>;
  /** Actions pressed since the last poll (so quick taps between ticks are never lost). */
  tapped: Set<ButtonAction>;
  move: { x: number; y: number };
  /** Accumulated camera rotation in radians since the last poll. */
  look: { yaw: number; pitch: number };
  active: boolean;
  /** Walk mode (Alt on keyboard, the Walk switch on touch) has halved `move`. */
  walk?: boolean;
}

export const newSource = (): InputSource => ({ held: new Set(), tapped: new Set(), move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, active: false, walk: false });

export class InputManager {
  readonly keyboard = newSource();
  readonly gamepad = newSource();
  readonly touch = newSource();
  /** Until the player touches anything, guess from the device: computers start with keyboard prompts. */
  device: InputFrame["device"] = isComputer() ? "keyboard" : "touch";
  /** When false (menus open), gameplay input is ignored. */
  enabled = true;

  private prevHeld = new Set<ButtonAction>();
  private toggled = new Set<ButtonAction>();
  /** Toggle sprint: true once the player has moved since sprint was switched on. */
  private sprintMoved = false;

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
    let walk = false;
    for (const [dev, src] of this.sources()) {
      if (src.walk && (src.move.x || src.move.y)) walk = true;
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
      // Remember what is held while menus are open, so a button still held when play resumes
      // (the Menu button that closed the pause screen, A on "Resume") never counts as a new press.
      this.prevHeld = rawHeld;
      return { move: { x: 0, y: 0 }, look: { yaw: 0, pitch: 0 }, buttons, device: this.device };
    }

    const toggles: Partial<Record<ButtonAction, boolean>> = {
      aim: s.controls.toggleAim,
      sprint: s.controls.toggleSprint,
      crouch: false, // crouch is already a press-to-toggle action in the controller
    };
    // Sprint toggles off automatically when the player stops moving. Pressing Shift before W
    // still works: sprint stays armed until the player has started moving and then stopped.
    if (toggles.sprint && this.toggled.has("sprint")) {
      if (mag >= 0.2) this.sprintMoved = true;
      else if (this.sprintMoved) {
        this.toggled.delete("sprint");
        this.sprintMoved = false;
      }
    }
    for (const a of BUTTON_ACTIONS) {
      const down = rawHeld.has(a) || tapped.has(a);
      const wasDown = this.prevHeld.has(a);
      const pressed = (down && !wasDown) || (tapped.has(a) && wasDown && !rawHeld.has(a));
      const released = !rawHeld.has(a) && wasDown;
      if (toggles[a]) {
        if (pressed) {
          if (this.toggled.has(a)) this.toggled.delete(a);
          else {
            this.toggled.add(a);
            if (a === "sprint") this.sprintMoved = mag >= 0.2;
          }
        }
        const on = this.toggled.has(a);
        buttons[a] = { held: on, pressed: pressed && on, released: pressed && !on };
      } else {
        buttons[a] = { held: down, pressed, released };
      }
    }
    this.prevHeld = new Set([...rawHeld]);

    const aimScale = buttons.aim.held ? s.controls.aimSensitivity : 1;
    return {
      move: { x: mx, y: my },
      look: { yaw: yaw * s.controls.lookSensitivity * aimScale, pitch: pitch * s.controls.lookSensitivity * (s.controls.lookYScale ?? 1) * aimScale },
      buttons,
      device: this.device,
      walk,
    };
  }

  /**
   * Clears toggles and pending taps, e.g. when entering or leaving a menu or dying.
   * Buttons and keys that are still physically held stay held, but are marked as "already down",
   * so they never fire a fresh press (no jump from the A that pressed Resume, no instant re-pause
   * from the Menu button). A held W keeps walking and a held right mouse button keeps aiming.
   */
  reset(): void {
    this.toggled.clear();
    this.sprintMoved = false;
    // Touch is rebuilt by its own pointer events, so it starts from nothing.
    this.touch.held.clear();
    this.touch.move = { x: 0, y: 0 };
    const still = new Set<ButtonAction>();
    for (const [, src] of this.sources()) {
      src.held.forEach((a) => still.add(a));
      src.tapped.clear();
      src.look = { yaw: 0, pitch: 0 };
    }
    this.prevHeld = still;
  }
}
