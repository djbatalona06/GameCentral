// Tutorial hints are written once, in device-neutral words ("press Jump"). This adapts them to
// the device the player is using right now: touch keeps the on-screen button names, a keyboard
// shows the bound keys, a controller shows the buttons printed on it.

import type { ButtonAction } from "../input/actions";
import type { InputFrame } from "../input/actions";

/** Words used in hints for each action (as they appear after "press" or "hold"). */
const WORDS: Array<[string, ButtonAction]> = [
  ["Jump", "jump"],
  ["Melee", "melee"],
  ["Cover", "coverRoll"],
  ["Interact", "interact"],
  ["Sprint", "sprint"],
  ["Throw", "throw"],
  ["Crouch", "crouch"],
  ["Aim", "aim"],
];

/** Whole phrases that only make sense on a touch screen. */
const PHRASES: Record<"keyboard" | "gamepad", Array<[RegExp, string]>> = {
  keyboard: [
    [/Move with the left stick\. Swipe the right side of the screen to look around\./, "Move with W A S D. Move the mouse to look around (click the game first to capture the mouse)."],
    [/Push the stick forward to drive, left and right to steer\./, "Press W to drive, A and D to steer."],
    [/hold up on the stick/, "hold W"],
    [/Hold the stick in a direction/, "Hold a direction"],
    [/Push forward/, "Hold W"],
    [/double-tap forward/, "double-tap W"],
  ],
  gamepad: [
    [/Swipe the right side of the screen to look around\./, "Use the right stick to look around."],
    [/the stick/g, "the left stick"],
  ],
};

export function adaptHint(text: string, device: InputFrame["device"], keyFor: (a: ButtonAction) => string): string {
  if (device === "touch") return text;
  let out = text;
  for (const [re, rep] of PHRASES[device]) out = out.replace(re, rep);
  for (const [word, action] of WORDS) {
    // "press Jump" -> "press Jump (Space)"; only after press/hold so ordinary words stay as they are.
    out = out.replace(new RegExp(`\\b(press|Press|hold|Hold) ${word}\\b(?! \\()`, "g"), `$1 ${word} (${keyFor(action)})`);
  }
  return out;
}
