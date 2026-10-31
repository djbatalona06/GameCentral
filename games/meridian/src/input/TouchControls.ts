// On-screen touch controls: a floating stick on the left, swipe-to-look on the right and a
// cluster of action buttons. Buttons can be resized, faded and moved (layout editor), and there
// are one-handed layouts for players who play with one thumb.

import { TUNING } from "../config/tuning";
import type { Orientation, Settings, TouchLayout } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";

interface ButtonDef {
  id: string;
  action: ButtonAction;
  label: string;
  size: number; // px at scale 1
  /** Dragging on this button also turns the camera (fire/aim/throw while looking). */
  looks?: boolean;
}

const BUTTONS: ButtonDef[] = [
  { id: "jump", action: "jump", label: "Jump", size: 84 },
  { id: "fire", action: "fire", label: "Fire", size: 84, looks: true },
  { id: "aim", action: "aim", label: "Aim", size: 66, looks: true },
  { id: "coverRoll", action: "coverRoll", label: "Cover", size: 64 },
  { id: "melee", action: "melee", label: "Melee", size: 64 },
  { id: "interact", action: "interact", label: "Use", size: 70 },
  { id: "reload", action: "reload", label: "Reload", size: 52 },
  { id: "throw", action: "throw", label: "Throw", size: 52, looks: true },
  { id: "crouch", action: "crouch", label: "Crouch", size: 52 },
  { id: "swapWeapon", action: "swapWeapon", label: "Swap", size: 48 },
  { id: "navAssist", action: "navAssist", label: "Goal", size: 46 },
  { id: "pause", action: "pause", label: "II", size: 46 },
];

/** Default positions as % of the viewport (x from left, y from top) for each layout. */
const LAYOUTS: Record<TouchLayout, Record<string, { x: number; y: number }>> = {
  standard: {
    jump: { x: 88, y: 80 },
    fire: { x: 76, y: 66 },
    aim: { x: 64, y: 78 },
    coverRoll: { x: 92, y: 60 },
    melee: { x: 78, y: 88 },
    interact: { x: 66, y: 56 },
    reload: { x: 88, y: 44 },
    throw: { x: 78, y: 46 },
    crouch: { x: 54, y: 88 },
    swapWeapon: { x: 94, y: 30 },
    navAssist: { x: 50, y: 8 },
    pause: { x: 95, y: 8 },
  },
  oneHandedRight: {
    jump: { x: 92, y: 62 },
    fire: { x: 80, y: 54 },
    aim: { x: 68, y: 50 },
    coverRoll: { x: 92, y: 46 },
    melee: { x: 70, y: 64 },
    interact: { x: 62, y: 38 },
    reload: { x: 82, y: 38 },
    throw: { x: 72, y: 30 },
    crouch: { x: 92, y: 32 },
    swapWeapon: { x: 84, y: 22 },
    navAssist: { x: 64, y: 22 },
    pause: { x: 95, y: 8 },
  },
  oneHandedLeft: {
    jump: { x: 8, y: 62 },
    fire: { x: 20, y: 54 },
    aim: { x: 32, y: 50 },
    coverRoll: { x: 8, y: 46 },
    melee: { x: 30, y: 64 },
    interact: { x: 38, y: 38 },
    reload: { x: 18, y: 38 },
    throw: { x: 28, y: 30 },
    crouch: { x: 8, y: 32 },
    swapWeapon: { x: 16, y: 22 },
    navAssist: { x: 36, y: 22 },
    pause: { x: 5, y: 8 },
  },
};

/** Portrait (upright) positions. Controls sit in the bottom of the screen so the view stays clear. */
const PORTRAIT_STANDARD: Record<string, { x: number; y: number }> = {
  jump: { x: 86, y: 88 },
  fire: { x: 84, y: 74 },
  aim: { x: 68, y: 82 },
  coverRoll: { x: 92, y: 62 },
  melee: { x: 66, y: 94 },
  interact: { x: 68, y: 66 },
  reload: { x: 92, y: 51 },
  throw: { x: 78, y: 58 },
  crouch: { x: 50, y: 93 },
  swapWeapon: { x: 92, y: 40 },
  navAssist: { x: 80, y: 5 },
  pause: { x: 93, y: 5 },
};
const PORTRAIT_ONE_HANDED: Record<string, { x: number; y: number }> = {
  jump: { x: 86, y: 74 },
  fire: { x: 68, y: 66 },
  aim: { x: 50, y: 74 },
  coverRoll: { x: 88, y: 58 },
  melee: { x: 48, y: 60 },
  interact: { x: 66, y: 50 },
  reload: { x: 86, y: 46 },
  throw: { x: 50, y: 46 },
  crouch: { x: 32, y: 66 },
  swapWeapon: { x: 70, y: 38 },
  navAssist: { x: 80, y: 5 },
  pause: { x: 93, y: 5 },
};
const mirror = (l: Record<string, { x: number; y: number }>) =>
  Object.fromEntries(Object.entries(l).map(([k, p]) => [k, { x: 100 - p.x, y: p.y }]));
const PORTRAIT_LAYOUTS: Record<TouchLayout, Record<string, { x: number; y: number }>> = {
  standard: PORTRAIT_STANDARD,
  oneHandedRight: PORTRAIT_ONE_HANDED,
  oneHandedLeft: mirror(PORTRAIT_ONE_HANDED),
};

/** Where the floating stick may start for each layout (as viewport fractions). */
const STICK_ZONE: Record<Orientation, Record<TouchLayout, { x0: number; x1: number; y0: number }>> = {
  landscape: {
    standard: { x0: 0, x1: 0.45, y0: 0.25 },
    oneHandedRight: { x0: 0.55, x1: 1, y0: 0.72 },
    oneHandedLeft: { x0: 0, x1: 0.45, y0: 0.72 },
  },
  portrait: {
    standard: { x0: 0, x1: 0.45, y0: 0.5 },
    oneHandedRight: { x0: 0.25, x1: 1, y0: 0.8 },
    oneHandedLeft: { x0: 0, x1: 0.75, y0: 0.8 },
  },
};

/** Default button positions for a layout in the given orientation. */
export const defaultPositions = (layout: TouchLayout, o: Orientation) => (o === "portrait" ? PORTRAIT_LAYOUTS : LAYOUTS)[layout];

type Owner = { kind: "stick"; ox: number; oy: number } | { kind: "look"; lx: number; ly: number } | { kind: "button"; def: ButtonDef; lx: number; ly: number };

export class TouchControls {
  readonly root: HTMLDivElement;
  private stickBase: HTMLDivElement;
  private stickKnob: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private owners = new Map<number, Owner>();
  editing = false;
  visible = false;
  onLayoutChanged: (() => void) | null = null;

  constructor(private src: InputSource, private settings: () => Settings, parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "touch-controls";
    this.root.setAttribute("aria-hidden", "true");
    this.stickBase = document.createElement("div");
    this.stickBase.className = "tc-stick";
    this.stickKnob = document.createElement("div");
    this.stickKnob.className = "tc-knob";
    this.stickBase.appendChild(this.stickKnob);
    this.root.appendChild(this.stickBase);
    for (const def of BUTTONS) {
      const b = document.createElement("button");
      b.className = `tc-btn tc-${def.id}`;
      b.textContent = def.label;
      b.dataset.id = def.id;
      b.tabIndex = -1;
      this.root.appendChild(b);
      this.buttons.set(def.id, b);
    }
    parent.appendChild(this.root);
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
    this.applyLayout();
    // Rotating the phone swaps to that orientation's layout.
    const relayout = () => {
      if (this.orientation() !== this.lastOrientation) this.releaseAll();
      this.applyLayout();
    };
    window.addEventListener("resize", relayout);
    window.addEventListener("orientationchange", relayout);
  }

  private lastOrientation: Orientation = "landscape";

  orientation(): Orientation {
    return window.innerHeight > window.innerWidth ? "portrait" : "landscape";
  }

  /** True on phones and tablets (or when the player has used touch). */
  static isTouchDevice(): boolean {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle("hidden", !on);
    document.body.classList.toggle("touch", on);
    if (!on) this.releaseAll();
  }

  applyLayout(): void {
    const c = this.settings().controls;
    const o = (this.lastOrientation = this.orientation());
    const layout = defaultPositions(c.touchLayout, o);
    this.root.style.setProperty("--tc-opacity", String(c.touchOpacity));
    for (const def of BUTTONS) {
      const b = this.buttons.get(def.id)!;
      const custom = c.touchLayout === "standard" ? c.touchPositions[o]?.[def.id] : undefined;
      const pos = custom ?? layout[def.id];
      const size = def.size * c.touchScale;
      b.style.left = `calc(${pos.x}% - ${size / 2}px)`;
      b.style.top = `calc(${pos.y}% - ${size / 2}px)`;
      b.style.width = b.style.height = `${size}px`;
    }
  }

  /** Shows or hides the context button and sets its label (e.g. "Grapple", "Takedown"). */
  setContext(label: string | null, action: "interact" | "melee" | "jump" | null): void {
    const use = this.buttons.get("interact")!;
    use.classList.toggle("tc-dim", !label || action !== "interact");
    use.textContent = label && action === "interact" ? shortLabel(label) : "Use";
    this.buttons.get("melee")!.classList.toggle("tc-glow", action === "melee");
  }

  setAiming(on: boolean): void {
    this.buttons.get("aim")!.classList.toggle("tc-on", on);
  }

  private zone(): { x0: number; x1: number; y0: number } {
    return STICK_ZONE[this.orientation()][this.settings().controls.touchLayout];
  }

  private onDown = (e: PointerEvent) => {
    if (!this.visible) return;
    e.preventDefault();
    this.src.active = true;
    const target = (e.target as HTMLElement).closest(".tc-btn") as HTMLButtonElement | null;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; tracking still works without it.
    }
    if (target) {
      const def = BUTTONS.find((d) => d.id === target.dataset.id)!;
      this.owners.set(e.pointerId, { kind: "button", def, lx: e.clientX, ly: e.clientY });
      target.classList.add("tc-pressed");
      if (!this.editing) {
        this.src.held.add(def.action);
        this.src.tapped.add(def.action);
        if (this.settings().controls.vibration) navigator.vibrate?.(8);
      }
      return;
    }
    const z = this.zone();
    const fx = e.clientX / window.innerWidth;
    const fy = e.clientY / window.innerHeight;
    const stickTaken = [...this.owners.values()].some((o) => o.kind === "stick");
    if (!stickTaken && fx >= z.x0 && fx <= z.x1 && fy >= z.y0 && !this.editing) {
      this.owners.set(e.pointerId, { kind: "stick", ox: e.clientX, oy: e.clientY });
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickBase.classList.add("active");
      this.stickKnob.style.transform = "translate(-50%, -50%)";
    } else {
      this.owners.set(e.pointerId, { kind: "look", lx: e.clientX, ly: e.clientY });
    }
  };

  private onMove = (e: PointerEvent) => {
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    e.preventDefault();
    const sens = TUNING.camera.touchSensitivity;
    if (o.kind === "stick") {
      const R = 56 * this.settings().controls.touchScale;
      let dx = e.clientX - o.ox;
      let dy = e.clientY - o.oy;
      const d = Math.hypot(dx, dy);
      // Pushing past the ring sprints.
      if (d > R * 1.25) this.src.held.add("sprint");
      else if (!this.settings().controls.toggleSprint) this.src.held.delete("sprint");
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.src.move = { x: dx / R, y: -dy / R };
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (o.kind === "look") {
      this.src.look.yaw += (e.clientX - o.lx) * sens;
      this.src.look.pitch -= (e.clientY - o.ly) * sens;
      o.lx = e.clientX;
      o.ly = e.clientY;
    } else if (o.kind === "button") {
      if (this.editing) {
        const btn = this.buttons.get(o.def.id)!;
        const size = o.def.size * this.settings().controls.touchScale;
        btn.style.left = `${e.clientX - size / 2}px`;
        btn.style.top = `${e.clientY - size / 2}px`;
      } else if (o.def.looks) {
        this.src.look.yaw += (e.clientX - o.lx) * sens;
        this.src.look.pitch -= (e.clientY - o.ly) * sens;
      }
      o.lx = e.clientX;
      o.ly = e.clientY;
    }
  };

  private onUp = (e: PointerEvent) => {
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    this.owners.delete(e.pointerId);
    if (o.kind === "stick") {
      this.src.move = { x: 0, y: 0 };
      this.stickBase.classList.remove("active");
      if (!this.settings().controls.toggleSprint) this.src.held.delete("sprint");
      else this.src.held.delete("sprint");
    } else if (o.kind === "button") {
      this.buttons.get(o.def.id)!.classList.remove("tc-pressed");
      if (this.editing) {
        const c = this.settings().controls;
        c.touchLayout = "standard";
        c.touchPositions[this.orientation()][o.def.id] = { x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 };
        this.onLayoutChanged?.();
      } else {
        const stillHeld = [...this.owners.values()].some((x) => x.kind === "button" && x.def.action === o.def.action);
        if (!stillHeld) this.src.held.delete(o.def.action);
      }
    }
  };

  releaseAll(): void {
    this.owners.clear();
    this.src.held.clear();
    this.src.move = { x: 0, y: 0 };
    this.stickBase.classList.remove("active");
    this.buttons.forEach((b) => b.classList.remove("tc-pressed"));
  }
}

const shortLabel = (label: string): string => {
  const w = label.split(" ");
  return w.length > 2 ? w.slice(0, 2).join(" ") : label;
};
