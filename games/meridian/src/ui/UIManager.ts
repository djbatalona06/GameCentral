// Shows menu screens from the HTML templates and handles navigation for every input device:
// touch (tap), mouse, keyboard (arrows/Enter/Escape) and gamepad (d-pad or stick, A, B).
// When menu narration is on, the focused item is read aloud.

import firstrun from "./screens/firstrun.html?raw";
import title from "./screens/title.html?raw";
import mainMenu from "./screens/main-menu.html?raw";
import slots from "./screens/slots.html?raw";
import difficulty from "./screens/difficulty.html?raw";
import chapters from "./screens/chapters.html?raw";
import pause from "./screens/pause.html?raw";
import settings from "./screens/settings.html?raw";
import journal from "./screens/journal.html?raw";
import death from "./screens/death.html?raw";
import results from "./screens/results.html?raw";
import credits from "./screens/credits.html?raw";
import layoutEditor from "./screens/layout-editor.html?raw";

export const TEMPLATES = {
  firstrun,
  title,
  "main-menu": mainMenu,
  slots,
  difficulty,
  chapters,
  pause,
  settings,
  journal,
  death,
  results,
  credits,
  "layout-editor": layoutEditor,
} as const;

export type ScreenId = keyof typeof TEMPLATES;

export interface ScreenHandlers {
  /** Called after the screen's HTML is inserted, to fill in dynamic content and bind buttons. */
  init?: (el: HTMLElement) => void;
  /** Called for clicks on [data-action] buttons. */
  action?: (action: string, target: HTMLElement) => void;
  /** Called on Back (Escape / gamepad B). Return false to stay. */
  back?: () => boolean | void;
}

const FOCUSABLE = "button:not([disabled]):not([hidden]), input:not([type=hidden]), select, [tabindex='0']";

export class UIManager {
  private stack: Array<{ id: ScreenId; el: HTMLElement; handlers: ScreenHandlers }> = [];
  narrate: ((text: string) => void) | null = null;
  onSound: ((kind: "move" | "select" | "back") => void) | null = null;

  constructor(private root: HTMLElement, private live: HTMLElement) {
    window.addEventListener("keydown", this.onKey);
    root.addEventListener("focusin", (e) => {
      const t = e.target as HTMLElement;
      this.narrate?.(describe(t));
    });
  }

  get top(): ScreenId | null {
    return this.stack.length ? this.stack[this.stack.length - 1].id : null;
  }

  get open(): boolean {
    return this.stack.length > 0;
  }

  /** Replaces all screens with this one. */
  show(id: ScreenId, handlers: ScreenHandlers = {}): HTMLElement {
    this.clear();
    return this.push(id, handlers);
  }

  /** Opens a screen on top (Back returns to the one below). */
  push(id: ScreenId, handlers: ScreenHandlers = {}): HTMLElement {
    const prev = this.stack[this.stack.length - 1];
    if (prev) prev.el.hidden = true;
    const wrap = document.createElement("div");
    wrap.innerHTML = TEMPLATES[id];
    const el = wrap.firstElementChild as HTMLElement;
    this.root.appendChild(el);
    this.stack.push({ id, el, handlers });
    el.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
      if (t && el.contains(t) && !(t as HTMLButtonElement).disabled) {
        this.onSound?.("select");
        handlers.action?.(t.dataset.action!, t);
      }
    });
    handlers.init?.(el);
    this.focusFirst(el);
    const heading = el.querySelector("h1")?.textContent;
    if (heading) this.announce(heading);
    return el;
  }

  pop(): void {
    const top = this.stack.pop();
    top?.el.remove();
    const next = this.stack[this.stack.length - 1];
    if (next) {
      next.el.hidden = false;
      this.focusFirst(next.el);
    }
  }

  clear(): void {
    while (this.stack.length) this.stack.pop()!.el.remove();
  }

  /** Re-runs init on the top screen (after settings change text size, etc.). */
  refresh(): void {
    const top = this.stack[this.stack.length - 1];
    top?.handlers.init?.(top.el);
  }

  back(): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    this.onSound?.("back");
    if (top.handlers.back) {
      if (top.handlers.back() === false) return;
    } else if (this.stack.length > 1) this.pop();
  }

  announce(text: string): void {
    this.live.textContent = "";
    requestAnimationFrame(() => (this.live.textContent = text));
  }

  private focusFirst(el: HTMLElement): void {
    const first = (el.querySelector("[autofocus]") as HTMLElement) ?? (el.querySelector("button.primary:not([hidden]):not([disabled])") as HTMLElement) ?? (el.querySelector(FOCUSABLE) as HTMLElement);
    first?.focus({ preventScroll: false });
  }

  private focusables(): HTMLElement[] {
    const top = this.stack[this.stack.length - 1];
    if (!top) return [];
    return [...top.el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.offsetParent !== null);
  }

  /** Spatial navigation: moves focus to the nearest element in a direction. */
  move(dx: number, dy: number): void {
    const items = this.focusables();
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement;
    if (!items.includes(cur)) {
      items[0].focus();
      return;
    }
    // Sliders take left/right as value changes.
    if (dx !== 0 && cur instanceof HTMLInputElement && cur.type === "range") {
      if (dx > 0) cur.stepUp();
      else cur.stepDown();
      cur.dispatchEvent(new Event("input", { bubbles: true }));
      cur.dispatchEvent(new Event("change", { bubbles: true }));
      this.narrate?.(describe(cur));
      return;
    }
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === cur) continue;
      const b = it.getBoundingClientRect();
      const ix = b.left + b.width / 2;
      const iy = b.top + b.height / 2;
      const ddx = ix - cx;
      const ddy = iy - cy;
      const along = ddx * dx + ddy * dy;
      if (along <= 4) continue;
      const across = Math.abs(ddx * dy) + Math.abs(ddy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      best.focus();
      best.scrollIntoView({ block: "nearest" });
      this.onSound?.("move");
    }
  }

  activate(): void {
    const cur = document.activeElement as HTMLElement;
    if (!cur || !this.root.contains(cur)) return;
    if (cur instanceof HTMLInputElement && cur.type === "checkbox") {
      cur.checked = !cur.checked;
      cur.dispatchEvent(new Event("change", { bubbles: true }));
      this.narrate?.(describe(cur));
    } else cur.click();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.open) return;
    const k = e.key;
    if (k === "Escape" || k === "Backspace") {
      if ((e.target as HTMLElement).tagName === "INPUT" && k === "Backspace") return;
      e.preventDefault();
      this.back();
    } else if (k === "ArrowUp") {
      e.preventDefault();
      this.move(0, -1);
    } else if (k === "ArrowDown") {
      e.preventDefault();
      this.move(0, 1);
    } else if (k === "ArrowLeft") {
      e.preventDefault();
      this.move(-1, 0);
    } else if (k === "ArrowRight") {
      e.preventDefault();
      this.move(1, 0);
    }
  };
}

/** What a screen reader (or our narration) should say for an element. */
export function describe(el: HTMLElement): string {
  const label = el.getAttribute("aria-label") || el.closest("label")?.querySelector("span")?.textContent || el.textContent || "";
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return `${label}, ${el.checked ? "on" : "off"}`;
    if (el.type === "range") return `${label}, ${Math.round(Number(el.value) * 100) / 100}`;
  }
  if (el instanceof HTMLSelectElement) return `${label}, ${el.options[el.selectedIndex]?.text ?? ""}`;
  return label.replace(/\s+/g, " ").trim();
}
