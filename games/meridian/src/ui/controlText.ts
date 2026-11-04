// Friendly names for keys and pad buttons, and on-screen tips that speak the player's language:
// "press Jump" becomes "press Space" on a keyboard or "press A" on a controller, and phone wording
// ("swipe the screen", "the stick") becomes keys and mouse on a computer.

import type { ButtonAction, InputFrame } from "../input/actions";
import type { Settings } from "../core/Settings";

const PAD_NAMES = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "D-up", "D-down", "D-left", "D-right"];
export const padName = (i: number) => PAD_NAMES[i] ?? `B${i}`;

const MOUSE_NAMES: Record<string, string> = { Mouse0: "Left click", Mouse1: "Middle click", Mouse2: "Right click" };

/** "KeyF" -> "F", "ShiftLeft" -> "Shift", "Mouse2" -> "Right click", "ArrowUp" -> "Up arrow". */
export function keyLabel(code: string): string {
  if (MOUSE_NAMES[code]) return MOUSE_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (code.startsWith("Arrow")) return `${code.slice(5)} arrow`;
  const m = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code);
  if (m) return m[1] === "Control" ? "Ctrl" : m[1];
  if (code === "Escape") return "Esc";
  return code;
}

/** Words used for buttons in the tips, and the action each one means. */
const WORD_ACTION: Record<string, ButtonAction> = {
  Jump: "jump",
  Melee: "melee",
  Cover: "coverRoll",
  Interact: "interact",
  Throw: "throw",
  Sprint: "sprint",
  Crouch: "crouch",
  Aim: "aim",
};

/** Whole sentences that only make sense on a phone, with their keyboard and controller versions. */
const PHRASES: Array<{ touch: string; keyboard: string; gamepad: string }> = [
  {
    touch: "Move with the left stick. Swipe the right side of the screen to look around.",
    keyboard: "Move with WASD or the arrow keys. Move the mouse to look around and aim.",
    gamepad: "Move with the left stick. Use the right stick to look around.",
  },
  { touch: "Push the stick forward to drive, left and right to steer.", keyboard: "Press W to drive, A and D to steer.", gamepad: "Push the left stick forward to drive, left and right to steer." },
  { touch: "Hold the stick in a direction", keyboard: "Hold a direction key", gamepad: "Hold the left stick in a direction" },
  { touch: "hold up on the stick", keyboard: "hold W", gamepad: "hold up on the left stick" },
];

/** Rewrites a tip for the device being used. Touch tips are written for touch already. */
export function adaptTip(text: string, device: InputFrame["device"], controls: Pick<Settings["controls"], "keys" | "pad">): string {
  if (device === "touch") return text;
  let out = text;
  for (const p of PHRASES) out = out.split(p.touch).join(p[device]);
  const name = (a: ButtonAction): string | null => {
    if (device === "keyboard") {
      const code = controls.keys[a]?.[0];
      return code ? keyLabel(code) : null;
    }
    const b = controls.pad[a]?.[0];
    return b === undefined ? null : padName(b);
  };
  // "press Jump" / "Hold Throw" -> "press Space" / "Hold G"
  return out.replace(/\b(press|Press|hold|Hold) (Jump|Melee|Cover|Interact|Throw|Sprint|Crouch|Aim)\b/g, (whole, verb: string, word: string) => {
    const n = name(WORD_ACTION[word]);
    return n ? `${verb} ${n}` : whole;
  });
}
