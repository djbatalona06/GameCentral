// On-screen touch controls. Left thumb: a floating stick, a Walk/Run switch, and two cards that show
// the selected gun (tap to swap) and the current goal (tap to point at it). Right thumb: the action
// buttons, and swipe-to-look. Everything can be resized, faded and moved (layout editor), and there
// are one-handed layouts for players who play with one thumb.

import { TUNING } from "../config/tuning";
import type { Orientation, Settings, TouchLayout } from "../core/Settings";
import type { ButtonAction } from "./actions";
import type { InputSource } from "./InputManager";
import { vibrate } from "../platform/native";

export interface ButtonDef {
  id: string;
  /** What a press does. `null` is a switch handled here (Walk/Run), not sent to the game. */
  action: ButtonAction | null;
  label: string;
  size: number; // px at scale 1 (the diameter of a round button)
  /** Width and height in px at scale 1 for the rectangular cards. */
  w?: number;
  h?: number;
  /** Dragging on this button also turns the camera (fire/aim/throw while looking). */
  looks?: boolean;
}

/** Width and height of a widget in px for the given button-size setting. */
export const dims = (d: ButtonDef, scale: number) => ({ w: (d.w ?? d.size) * scale, h: (d.h ?? d.size) * scale });

export const BUTTONS: ButtonDef[] = [
  { id: "jump", action: "jump", label: "Jump", size: 84 },
  { id: "fire", action: "fire", label: "Fire", size: 84, looks: true },
  { id: "aim", action: "aim", label: "Aim", size: 66, looks: true },
  { id: "coverRoll", action: "coverRoll", label: "Cover", size: 64 },
  { id: "melee", action: "melee", label: "Melee", size: 64 },
  { id: "interact", action: "interact", label: "Use", size: 70 },
  { id: "reload", action: "reload", label: "Reload", size: 52 },
  { id: "throw", action: "throw", label: "Throw", size: 52, looks: true },
  { id: "crouch", action: "crouch", label: "Crouch", size: 52 },
  { id: "pause", action: "pause", label: "II", size: 46 },
  // Left side: status widgets. The cards replace the old Swap and Goal buttons.
  { id: "walk", action: null, label: "Run", size: 52 },
  { id: "gun", action: "swapWeapon", label: "", size: 52, w: 150, h: 52 },
  { id: "goal", action: "navAssist", label: "", size: 50, w: 176, h: 50 },
];

/** Gun silhouettes for the see-through gun card (a short sidearm and a long gun). */
const GUN_SVG =
  '<svg class="gun-short" viewBox="0 0 64 32" aria-hidden="true"><path d="M2 6h46v9H30l-3 5h-4l-2 9h-9l2-14H2z"/></svg>' +
  '<svg class="gun-long" viewBox="0 0 64 32" aria-hidden="true"><path d="M1 13h22l4-4h14v4h8l3-3h9v7h-9l-3 3H34l-3 9h-8l2-9H1z"/></svg>';

export interface WeaponCard {
  name: string;
  slot: "sidearm" | "long";
  mag: number;
  low: boolean;
  reserve: number;
  reloading: boolean;
  grenades: number;
  bottles: number;
}

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
    pause: { x: 95, y: 8 },
    goal: { x: 14, y: 12 },
    gun: { x: 14, y: 33 },
    walk: { x: 8, y: 53 },
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
    pause: { x: 95, y: 8 },
    goal: { x: 14, y: 12 },
    gun: { x: 14, y: 33 },
    walk: { x: 55, y: 56 },
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
    pause: { x: 5, y: 8 },
    goal: { x: 86, y: 12 },
    gun: { x: 86, y: 33 },
    walk: { x: 45, y: 56 },
  },
};

/** Portrait (upright) positions. Controls sit in the bottom of the screen so the view stays clear. */
const PORTRAIT_STANDARD: Record<string, { x: number; y: number }> = {
  jump: { x: 86, y: 88 },
  fire: { x: 84, y: 74 },
  aim: { x: 68, y: 82 },
  coverRoll: { x: 91, y: 62 },
  melee: { x: 66, y: 94 },
  interact: { x: 68, y: 66 },
  reload: { x: 92, y: 51 },
  throw: { x: 78, y: 58 },
  crouch: { x: 50, y: 93 },
  pause: { x: 93, y: 5 },
  goal: { x: 32, y: 5.5 },
  gun: { x: 24, y: 14.5 },
  walk: { x: 10, y: 41 },
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
  pause: { x: 93, y: 5 },
  goal: { x: 32, y: 5.5 },
  gun: { x: 24, y: 14.5 },
  walk: { x: 30, y: 52 },
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
    standard: { x0: 0, x1: 0.45, y0: 0.4 },
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
  /** Walk mode: the stick moves slowly and never sprints (for sneaking). Lasts for the session. */
  walk = false;
  private gunKey = "";
  private goalKey = "";
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
      b.dataset.id = def.id;
      if (def.id === "gun") {
        b.classList.add("tc-card", "tc-hidden");
        b.innerHTML = `${GUN_SVG}<span class="tc-gun-name" data-role="gun-name"></span><span class="tc-gun-ammo" data-role="gun-ammo"></span><span class="tc-gun-extra" data-role="gun-extra"></span>`;
      } else if (def.id === "goal") {
        b.classList.add("tc-card", "tc-hidden");
        b.innerHTML = '<strong>Goal</strong><span data-role="goal-text"></span>';
      } else b.textContent = def.label;
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
      const { w, h } = dims(def, c.touchScale);
      b.style.left = `calc(${pos.x}% - ${w / 2}px)`;
      b.style.top = `calc(${pos.y}% - ${h / 2}px)`;
      b.style.width = `${w}px`;
      b.style.height = `${h}px`;
    }
  }

  /** Shows the selected gun on the left card (tap = swap). Pass null to hide it. */
  setWeapon(w: WeaponCard | null): void {
    const key = w ? Object.values(w).join("|") : "";
    if (key === this.gunKey) return;
    this.gunKey = key;
    const card = this.buttons.get("gun")!;
    card.classList.toggle("tc-hidden", !w);
    if (!w) return;
    card.dataset.slot = w.slot;
    const set = (role: string, text: string) => (card.querySelector(`[data-role="${role}"]`)!.textContent = text);
    set("gun-name", w.reloading ? `${w.name} · reloading` : w.name);
    set("gun-ammo", `${w.mag} / ${w.reserve}`);
    set("gun-extra", `Grenades ${w.grenades} · Bottles ${w.bottles}`);
    card.classList.toggle("tc-low", w.low);
  }

  /** Shows the current quest goal on the left card (tap = point the camera at it). */
  setObjective(text: string): void {
    if (text === this.goalKey) return;
    this.goalKey = text;
    const card = this.buttons.get("goal")!;
    card.classList.toggle("tc-hidden", !text);
    card.querySelector('[data-role="goal-text"]')!.textContent = text;
    if (text) this.pingGoal();
  }

  /** A short pulse so the player notices the goal card (new goal, or Goal pressed). */
  pingGoal(): void {
    const card = this.buttons.get("goal")!;
    card.classList.remove("tc-pulse");
    void card.offsetWidth;
    card.classList.add("tc-pulse");
  }

  private setWalk(on: boolean): void {
    this.walk = on;
    const b = this.buttons.get("walk")!;
    b.textContent = on ? "Walk" : "Run";
    b.classList.toggle("tc-on", on);
    // A latched sprint would fight the switch.
    if (on) this.src.held.delete("sprint");
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
        if (def.action) {
          this.src.held.add(def.action);
          this.src.tapped.add(def.action);
        } else this.setWalk(!this.walk);
        if (this.settings().controls.vibration) vibrate(8);
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
      if (d > R * 1.25 && !this.walk) this.src.held.add("sprint");
      else if (this.walk || !this.settings().controls.toggleSprint) this.src.held.delete("sprint");
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      // Walk mode halves the stick, which the player controller turns into a slow, quiet walk.
      const gain = this.walk ? 0.5 : 1;
      this.src.move = { x: (dx / R) * gain, y: (-dy / R) * gain };
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (o.kind === "look") {
      this.src.look.yaw += (e.clientX - o.lx) * sens;
      this.src.look.pitch -= (e.clientY - o.ly) * sens;
      o.lx = e.clientX;
      o.ly = e.clientY;
    } else if (o.kind === "button") {
      if (this.editing) {
        const btn = this.buttons.get(o.def.id)!;
        const { w, h } = dims(o.def, this.settings().controls.touchScale);
        btn.style.left = `${e.clientX - w / 2}px`;
        btn.style.top = `${e.clientY - h / 2}px`;
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
      this.src.held.delete("sprint");
    } else if (o.kind === "button") {
      this.buttons.get(o.def.id)!.classList.remove("tc-pressed");
      if (this.editing) {
        const c = this.settings().controls;
        c.touchLayout = "standard";
        c.touchPositions[this.orientation()][o.def.id] = { x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 };
        this.onLayoutChanged?.();
      } else if (o.def.action) {
        const action = o.def.action;
        const stillHeld = [...this.owners.values()].some((x) => x.kind === "button" && x.def.action === action);
        if (!stillHeld) this.src.held.delete(action);
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
