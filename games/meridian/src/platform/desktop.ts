// Desktop support: the installable desktop app (desktop/ folder, built with Electron) and plain
// browsers on computers.
//
// The desktop app adds a tiny bridge, window.meridianDesktop (desktop/preload.cjs), for things a
// web page cannot do on its own: real window full screen and quitting the app.

export interface DesktopBridge {
  /** "win32", "darwin" or "linux". */
  platform: string;
  isFullscreen(): boolean;
  setFullscreen(on: boolean): void;
  quit(): void;
}

export function desktopBridge(): DesktopBridge | null {
  return (globalThis as { meridianDesktop?: DesktopBridge }).meridianDesktop ?? null;
}

export const isDesktopApp = (): boolean => desktopBridge() !== null;

/** True on a computer: the desktop app, or a browser with a mouse or trackpad as its main pointer. */
export function isComputer(): boolean {
  if (isDesktopApp()) return true;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function isFullscreen(): boolean {
  const d = desktopBridge();
  if (d) return d.isFullscreen();
  return typeof document !== "undefined" && !!document.fullscreenElement;
}

/** Switches full screen on or off (or flips it). Browsers only allow this right after a click or key press. */
export function setFullscreen(on: boolean = !isFullscreen()): void {
  const d = desktopBridge();
  if (d) {
    d.setFullscreen(on);
    return;
  }
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
  else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
