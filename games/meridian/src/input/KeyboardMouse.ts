// Keyboard and mouse. WASD or the arrow keys move; the mouse turns the camera (and, in shooter
// style, the hero and her gun). Mouse look uses pointer lock while playing: the first click only
// captures the mouse, it never fires a shot.

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";

export const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/** Keys whose browser default (scrolling, focus moving, the Alt menu) must not fire during play. */
const BLOCKED_IN_PLAY = new Set(["Space", "Tab", "AltLeft", "AltRight", ...Object.keys(MOVE_KEYS)]);

/** Biggest mouse jump accepted in one event. Some browsers send a huge spike when the lock starts. */
export const MAX_MOUSE_STEP = 200;

/** Turns the keys held down into a movement stick value (x = right, y = forward). */
export function moveFromKeys(down: Iterable<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let slow = false;
  for (const code of down) {
    const m = MOVE_KEYS[code];
    if (m) {
      x += m[0];
      y += m[1];
    }
    if (code === "AltLeft" || code === "AltRight") slow = true;
  }
  // W and Up together count once, not twice.
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  const l = Math.hypot(x, y) || 1;
  // Holding Alt walks slowly (analog-style speed control for keyboard players).
  const k = slow ? 0.5 : 1;
  return { x: (x / l) * k, y: (y / l) * k };
}

export const clampMouseStep = (v: number): number => Math.max(-MAX_MOUSE_STEP, Math.min(MAX_MOUSE_STEP, v));

export class KeyboardMouse {
  private down = new Set<string>();
  private lastTouch = -Infinity;
  /** When true, mouse movement turns the camera (desktop play). */
  pointerLookEnabled = false;
  /** True while a chapter is being played (menus closed). */
  playing = false;
  /** Called when the keyboard or a real mouse is used, so the game can switch to desktop mode. */
  onDesktopUsed: (() => void) | null = null;

  constructor(private src: InputSource, private canvas: HTMLCanvasElement, private settings: () => Settings) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", () => this.releaseAll());
    canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      if (this.pointerLookEnabled) this.src.tapped.add("swapWeapon");
      e.preventDefault();
    }, { passive: false });
    // Only a real mouse or pen counts as "desktop": touchscreens also send pretend mouse clicks.
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") this.lastTouch = performance.now();
      else this.onDesktopUsed?.();
    }, { capture: true, passive: true });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private actionsFor(code: string): ButtonAction[] {
    const keys = this.settings().controls.keys;
    return (Object.keys(keys) as ButtonAction[]).filter((a) => keys[a].includes(code));
  }

  private updateMove(): void {
    this.src.move = moveFromKeys(this.down);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (this.playing && BLOCKED_IN_PLAY.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.onDesktopUsed?.();
    this.down.add(e.code);
    this.src.active = true;
    for (const a of this.actionsFor(e.code)) {
      this.src.held.add(a);
      this.src.tapped.add(a);
    }
    this.updateMove();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (this.playing && BLOCKED_IN_PLAY.has(e.code)) e.preventDefault();
    this.down.delete(e.code);
    for (const a of this.actionsFor(e.code)) this.src.held.delete(a);
    this.updateMove();
  };

  /** Asks the browser to capture the mouse. Raw (unaccelerated) movement where supported. */
  requestLock(): void {
    const c = this.canvas as HTMLCanvasElement & { requestPointerLock(opts?: { unadjustedMovement?: boolean }): Promise<void> | void };
    if (!c.requestPointerLock) return;
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true });
      if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch(() => c.requestPointerLock());
    } catch {
      c.requestPointerLock();
    }
  }

  private onMouseDown = (e: MouseEvent) => {
    if (performance.now() - this.lastTouch < 1000) return; // a touch pretending to be a click
    this.src.active = true;
    if (this.pointerLookEnabled && this.playing && !this.locked) {
      // This click only captures the mouse. Don't shoot or aim with it.
      this.requestLock();
      return;
    }
    for (const a of this.actionsFor(`Mouse${e.button}`)) {
      this.src.held.add(a);
      this.src.tapped.add(a);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    for (const a of this.actionsFor(`Mouse${e.button}`)) this.src.held.delete(a);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLookEnabled || !this.locked) return;
    const s = TUNING.camera.mouseSensitivity;
    // Mouse right turns right, mouse up looks up.
    this.src.look.yaw += clampMouseStep(e.movementX) * s;
    this.src.look.pitch -= clampMouseStep(e.movementY) * s;
    this.src.active = true;
  };

  releaseAll(): void {
    this.down.clear();
    this.src.held.clear();
    this.src.move = { x: 0, y: 0 };
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}
