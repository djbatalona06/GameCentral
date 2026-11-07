// On-screen touch controls. Left thumb: a movement stick (floating, or fixed in one place), a
// Walk/Run switch, and two cards that show the selected gun (tap to swap) and the current goal (tap
// to point at it). Right thumb: the action buttons, an optional Aim + Fire button, and swipe-to-look
// (quick swipes turn further than slow ones). Everything can be resized, faded and moved (layout
// editor), and there are one-handed layouts for players who play with one thumb.

import { TUNING } from "../config/tuning";
import type { Settings, TouchLayout } from "../core/Settings";
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

/**
 * Decides whether a device is touch-first: a coarse pointer (finger) and no fine pointer (mouse or
 * trackpad) anywhere. `media` answers CSS media queries; without it, fall back to touch points.
 */
export function isTouchFirst(media: ((query: string) => boolean) | null, maxTouchPoints: number): boolean {
  if (!media) return maxTouchPoints > 0;
  return media("(pointer: coarse)") && !media("(any-pointer: fine)");
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
  // Optional (Settings, Touch screen): aims on touch and fires a moment later; dragging it looks.
  // It sits inward from the screen edge so the thumb still has room to swipe outward.
  { id: "aimFire", action: "aim", label: "Aim+Fire", size: 70, looks: true },
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
  /** Loot purse (salvage), shown on the card so touch players see what they can spend at camps. */
  salvage?: number;
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
    aimFire: { x: 56, y: 64 },
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
    aimFire: { x: 50, y: 80 },
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
    aimFire: { x: 50, y: 80 },
    goal: { x: 86, y: 12 },
    gun: { x: 86, y: 33 },
    walk: { x: 45, y: 56 },
  },
};

/** Where the floating stick may start for each layout (as viewport fractions). */
const STICK_ZONE: Record<TouchLayout, { x0: number; x1: number; y0: number }> = {
  standard: { x0: 0, x1: 0.45, y0: 0.4 },
  oneHandedRight: { x0: 0.55, x1: 1, y0: 0.72 },
  oneHandedLeft: { x0: 0, x1: 0.45, y0: 0.72 },
};

/** Where the fixed movement stick sits for each layout (as viewport fractions). */
const STICK_ANCHOR: Record<TouchLayout, { x: number; y: number }> = {
  standard: { x: 0.15, y: 0.77 },
  oneHandedRight: { x: 0.64, y: 0.86 },
  oneHandedLeft: { x: 0.36, y: 0.86 },
};

/**
 * Swipe acceleration: slow drags stay precise, quick swipes turn further. `speed` is finger speed
 * in px per ms, `accel` the player's setting (0 = off). Returns the multiplier for this movement.
 */
export function swipeGain(speed: number, accel: number): number {
  const t = Math.min(1, Math.max(0, speed / TUNING.touchLook.accelSpeed));
  return 1 + Math.max(0, accel) * t;
}

/** How long Aim+Fire waits after aiming before it fires, so the aim (and any snap) settles first. */
export const AIM_FIRE_DELAY_MS = 100;

/** Default button positions for a layout (the game is played in landscape only). */
export const defaultPositions = (layout: TouchLayout) => LAYOUTS[layout];

type Owner = { kind: "stick"; ox: number; oy: number } | { kind: "look"; lx: number; ly: number; lt: number } | { kind: "button"; def: ButtonDef; lx: number; ly: number; lt: number };

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
  /** Called when a finger touches the screen. */
  onTouchUsed: (() => void) | null = null;

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
    // A finger on the screen (even on a touchscreen laptop) switches to touch controls.
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") this.onTouchUsed?.();
    }, { capture: true, passive: true });
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
    this.applyLayout();
    // The game is played in landscape only; when the phone is upright the game pauses and a
    // "turn your phone" prompt covers it (see Game.bindGlobalEvents).
    window.addEventListener("resize", () => this.applyLayout());
  }

  /**
   * True on phones and tablets. A laptop with a touchscreen also reports touch support, but it has
   * a mouse or trackpad too, so it starts in desktop mode (the game switches live if you touch it).
   */
  static isTouchDevice(): boolean {
    return isTouchFirst(typeof window.matchMedia === "function" ? (q) => window.matchMedia(q).matches : null, navigator.maxTouchPoints ?? 0);
  }

  show(on: boolean): void {
    this.visible = on;
    this.root.classList.toggle("hidden", !on);
    document.body.classList.toggle("touch", on);
    if (!on) this.releaseAll();
  }

  applyLayout(): void {
    const c = this.settings().controls;
    const layout = defaultPositions(c.touchLayout);
    this.root.style.setProperty("--tc-opacity", String(c.touchOpacity));
    for (const def of BUTTONS) {
      const b = this.buttons.get(def.id)!;
      const custom = c.touchLayout === "standard" ? c.touchPositions[def.id] : undefined;
      const pos = custom ?? layout[def.id];
      const { w, h } = dims(def, c.touchScale);
      b.style.left = `calc(${pos.x}% - ${w / 2}px)`;
      b.style.top = `calc(${pos.y}% - ${h / 2}px)`;
      b.style.width = `${w}px`;
      b.style.height = `${h}px`;
    }
    this.buttons.get("aimFire")!.classList.toggle("tc-hidden", !c.touchAimFire);
    // A fixed stick is always shown at its spot; a floating one appears under the thumb.
    const fixed = c.touchStick === "fixed";
    this.stickBase.classList.toggle("fixed", fixed);
    if (fixed && !this.stickBase.classList.contains("active")) this.placeFixedStick();
  }

  private placeFixedStick(): void {
    const a = STICK_ANCHOR[this.settings().controls.touchLayout];
    this.stickBase.style.left = `${a.x * window.innerWidth}px`;
    this.stickBase.style.top = `${a.y * window.innerHeight}px`;
    this.stickKnob.style.transform = "translate(-50%, -50%)";
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
    set("gun-extra", `Grenades ${w.grenades} · Bottles ${w.bottles}` + (w.salvage !== undefined ? ` · Salvage ${w.salvage}` : ""));
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
    return STICK_ZONE[this.settings().controls.touchLayout];
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
      const owner: Owner = { kind: "button", def, lx: e.clientX, ly: e.clientY, lt: e.timeStamp };
      this.owners.set(e.pointerId, owner);
      target.classList.add("tc-pressed");
      if (!this.editing) {
        if (def.action) {
          this.src.held.add(def.action);
          this.src.tapped.add(def.action);
        } else this.setWalk(!this.walk);
        if (def.id === "aimFire") {
          // Fire once the aim has settled, if the thumb is still down.
          setTimeout(() => {
            if (this.owners.get(e.pointerId) !== owner || this.editing) return;
            this.src.held.add("fire");
            this.src.tapped.add("fire");
          }, AIM_FIRE_DELAY_MS);
        }
        if (this.settings().controls.vibration) vibrate(8);
      }
      return;
    }
    const z = this.zone();
    const fx = e.clientX / window.innerWidth;
    const fy = e.clientY / window.innerHeight;
    const stickTaken = [...this.owners.values()].some((o) => o.kind === "stick");
    if (!stickTaken && fx >= z.x0 && fx <= z.x1 && fy >= z.y0 && !this.editing) {
      if (this.settings().controls.touchStick === "fixed") {
        // Fixed stick: its centre never moves, so the thumb can find it without looking, and a
        // touch away from the centre moves at once in that direction.
        const a = STICK_ANCHOR[this.settings().controls.touchLayout];
        this.owners.set(e.pointerId, { kind: "stick", ox: a.x * window.innerWidth, oy: a.y * window.innerHeight });
        this.stickBase.classList.add("active");
        this.onMove(e);
      } else {
        this.owners.set(e.pointerId, { kind: "stick", ox: e.clientX, oy: e.clientY });
        this.stickBase.style.left = `${e.clientX}px`;
        this.stickBase.style.top = `${e.clientY}px`;
        this.stickBase.classList.add("active");
        this.stickKnob.style.transform = "translate(-50%, -50%)";
      }
    } else {
      this.owners.set(e.pointerId, { kind: "look", lx: e.clientX, ly: e.clientY, lt: e.timeStamp });
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
      this.src.walk = this.walk;
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (o.kind === "look") {
      this.swipe(o, e, sens);
    } else if (o.kind === "button") {
      if (this.editing) {
        const btn = this.buttons.get(o.def.id)!;
        const { w, h } = dims(o.def, this.settings().controls.touchScale);
        btn.style.left = `${e.clientX - w / 2}px`;
        btn.style.top = `${e.clientY - h / 2}px`;
        o.lx = e.clientX;
        o.ly = e.clientY;
      } else if (o.def.looks) this.swipe(o, e, sens);
      else {
        o.lx = e.clientX;
        o.ly = e.clientY;
      }
    }
  };

  /** Turns the camera by a finger's movement, with swipe acceleration. */
  private swipe(o: { lx: number; ly: number; lt: number }, e: PointerEvent, sens: number): void {
    const dx = e.clientX - o.lx;
    const dy = e.clientY - o.ly;
    const ms = Math.max(1, e.timeStamp - o.lt);
    const gain = swipeGain(Math.hypot(dx, dy) / ms, this.settings().controls.touchLookAccel ?? 0);
    this.src.look.yaw += dx * sens * gain;
    this.src.look.pitch -= dy * sens * gain;
    o.lx = e.clientX;
    o.ly = e.clientY;
    o.lt = e.timeStamp;
  }

  private onUp = (e: PointerEvent) => {
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    this.owners.delete(e.pointerId);
    if (o.kind === "stick") {
      this.src.move = { x: 0, y: 0 };
      this.stickBase.classList.remove("active");
      if (this.settings().controls.touchStick === "fixed") this.placeFixedStick();
      this.src.held.delete("sprint");
    } else if (o.kind === "button") {
      this.buttons.get(o.def.id)!.classList.remove("tc-pressed");
      if (this.editing) {
        const c = this.settings().controls;
        c.touchLayout = "standard";
        c.touchPositions[o.def.id] = { x: (e.clientX / window.innerWidth) * 100, y: (e.clientY / window.innerHeight) * 100 };
        this.onLayoutChanged?.();
      } else if (o.def.action) {
        const action = o.def.action;
        const stillHeld = [...this.owners.values()].some((x) => x.kind === "button" && x.def.action === action);
        if (!stillHeld) this.src.held.delete(action);
        if (o.def.id === "aimFire") {
          const fireHeld = [...this.owners.values()].some((x) => x.kind === "button" && (x.def.action === "fire" || x.def.id === "aimFire"));
          if (!fireHeld) this.src.held.delete("fire");
        }
      }
    }
  };

  releaseAll(): void {
    this.owners.clear();
    this.src.held.clear();
    this.src.move = { x: 0, y: 0 };
    this.stickBase.classList.remove("active");
    if (this.settings().controls.touchStick === "fixed") this.placeFixedStick();
    this.buttons.forEach((b) => b.classList.remove("tc-pressed"));
  }
}

const shortLabel = (label: string): string => {
  const w = label.split(" ");
  return w.length > 2 ? w.slice(0, 2).join(" ") : label;
};
