// Keyboard and mouse. Mouse look uses pointer lock while playing.

import { TUNING } from "../config/tuning";
import type { Settings } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export class KeyboardMouse {
  private down = new Set<string>();
  /** When true, mouse movement turns the camera. */
  pointerLookEnabled = false;
  onPause: (() => void) | null = null;

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
  }

  private actionsFor(code: string): ButtonAction[] {
    const keys = this.settings().controls.keys;
    return (Object.keys(keys) as ButtonAction[]).filter((a) => keys[a].includes(code));
  }

  private updateMove(): void {
    let x = 0;
    let y = 0;
    for (const code of this.down) {
      const m = MOVE_KEYS[code];
      if (m) {
        x += m[0];
        y += m[1];
      }
    }
    // Holding Alt walks slowly (analog-style speed control for keyboard players).
    const slow = this.down.has("AltLeft") ? 0.5 : 1;
    const l = Math.hypot(x, y) || 1;
    this.src.move = { x: (x / l) * slow, y: (y / l) * slow };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    if (e.repeat) return;
    this.down.add(e.code);
    this.src.active = true;
    for (const a of this.actionsFor(e.code)) {
      this.src.held.add(a);
      this.src.tapped.add(a);
    }
    this.updateMove();
    if (this.pointerLookEnabled && (MOVE_KEYS[e.code] || e.code === "Space" || e.code === "Tab")) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
    for (const a of this.actionsFor(e.code)) this.src.held.delete(a);
    this.updateMove();
  };

  private onMouseDown = (e: MouseEvent) => {
    this.src.active = true;
    if (this.pointerLookEnabled && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock?.();
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
    if (!this.pointerLookEnabled || document.pointerLockElement !== this.canvas) return;
    const s = TUNING.camera.mouseSensitivity;
    this.src.look.yaw += e.movementX * s;
    this.src.look.pitch -= e.movementY * s;
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
