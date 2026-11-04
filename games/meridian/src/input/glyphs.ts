// Controller button names. Every gamepad uses the same "standard" button numbers, but the
// letters and symbols printed on the buttons differ, so prompts show the ones on the
// player's own controller (or the set they pick in Settings -> Controls).

export type GlyphFamily = "xbox" | "playstation" | "switch";
export type GlyphChoice = "auto" | GlyphFamily;

const NAMES: Record<GlyphFamily, string[]> = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS", "RS", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Guide"],
  playstation: ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "Create", "Options", "L3", "R3", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "PS"],
  // Nintendo puts B at the bottom and A on the right, so standard button 0 is "B".
  switch: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "−", "+", "LS", "RS", "D-pad ↑", "D-pad ↓", "D-pad ←", "D-pad →", "Home"],
};

/** Spoken names for the symbols, so menu narration says "Cross" rather than a symbol. */
const SPOKEN: Record<string, string> = { "✕": "Cross", "○": "Circle", "□": "Square", "△": "Triangle", "−": "Minus", "+": "Plus" };

/** Guesses the controller family from the browser's gamepad id (vendor ids 045e Microsoft, 054c Sony, 057e Nintendo). */
export function detectFamily(id: string | undefined | null): GlyphFamily {
  if (!id) return "xbox";
  if (/xbox|045e|microsoft/i.test(id)) return "xbox";
  if (/054c|playstation|dualsense|dualshock|sony/i.test(id)) return "playstation";
  if (/057e|nintendo|switch|joy-con|pro controller/i.test(id)) return "switch";
  return "xbox";
}

export function resolveFamily(choice: GlyphChoice, padId: string | undefined | null): GlyphFamily {
  return choice === "auto" ? detectFamily(padId) : choice;
}

export function buttonName(index: number, family: GlyphFamily): string {
  return NAMES[family][index] ?? `Button ${index + 1}`;
}

export function spokenButtonName(index: number, family: GlyphFamily): string {
  const n = buttonName(index, family);
  return SPOKEN[n] ?? n;
}

/** The id of the first connected gamepad, if any. */
export function connectedPadId(): string | null {
  const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p.id;
  return null;
}

/** A readable name for a keyboard code ("KeyE" -> "E", "ShiftLeft" -> "Shift", "Mouse0" -> "Left click"). */
export function keyName(code: string): string {
  const special: Record<string, string> = {
    Space: "Space",
    Escape: "Esc",
    Mouse0: "Left click",
    Mouse1: "Middle click",
    Mouse2: "Right click",
    ShiftLeft: "Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Alt",
    AltRight: "Right Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    Tab: "Tab",
  };
  if (special[code]) return special[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}
