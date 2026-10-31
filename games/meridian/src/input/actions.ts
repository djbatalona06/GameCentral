// The game only ever reads abstract actions. Touch, gamepad and keyboard all map onto these,
// which is what makes remapping and accessibility options possible.

export const BUTTON_ACTIONS = [
  "jump",
  "sprint",
  "crouch",
  "coverRoll",
  "melee",
  "interact",
  "throw",
  "reload",
  "swapWeapon",
  "aim",
  "fire",
  "shoulderSwap",
  "navAssist",
  "pause",
  "journal",
] as const;

export type ButtonAction = (typeof BUTTON_ACTIONS)[number];

export interface ButtonState {
  held: boolean;
  pressed: boolean;
  released: boolean;
}

export interface InputFrame {
  /** Movement stick, x = right, y = forward, magnitude 0..1. */
  move: { x: number; y: number };
  /** Camera rotation for this tick, in radians (already scaled by sensitivity). */
  look: { yaw: number; pitch: number };
  buttons: Record<ButtonAction, ButtonState>;
  /** Which device produced the most recent input (drives on-screen prompts). */
  device: "touch" | "gamepad" | "keyboard";
}

export const emptyButtons = (): Record<ButtonAction, ButtonState> => {
  const out = {} as Record<ButtonAction, ButtonState>;
  for (const a of BUTTON_ACTIONS) out[a] = { held: false, pressed: false, released: false };
  return out;
};

export const emptyFrame = (): InputFrame => ({
  move: { x: 0, y: 0 },
  look: { yaw: 0, pitch: 0 },
  buttons: emptyButtons(),
  device: "touch",
});

/** Human readable action names for the controls screen and screen-reader narration. */
export const ACTION_LABELS: Record<ButtonAction, string> = {
  jump: "Jump / Climb",
  sprint: "Sprint",
  crouch: "Crouch",
  coverRoll: "Cover / Roll",
  melee: "Melee / Takedown",
  interact: "Interact / Grapple",
  throw: "Throw",
  reload: "Reload",
  swapWeapon: "Swap weapon",
  aim: "Aim",
  fire: "Fire",
  shoulderSwap: "Swap shoulder",
  navAssist: "Look at objective",
  pause: "Pause",
  journal: "Journal",
};

/** Default keyboard bindings, using KeyboardEvent.code values. Mouse buttons use "Mouse0" etc. */
export const DEFAULT_KEYS: Record<ButtonAction, string[]> = {
  jump: ["Space"],
  sprint: ["ShiftLeft"],
  crouch: ["KeyC"],
  coverRoll: ["KeyQ"],
  melee: ["KeyF"],
  interact: ["KeyE"],
  throw: ["KeyG"],
  reload: ["KeyR"],
  swapWeapon: ["Digit1", "Digit2"],
  aim: ["Mouse2"],
  fire: ["Mouse0"],
  shoulderSwap: ["KeyT"],
  navAssist: ["KeyH"],
  pause: ["Escape", "KeyP"],
  journal: ["KeyJ"],
};

/** Default gamepad bindings using the W3C "standard" button indices. */
export const DEFAULT_PAD: Record<ButtonAction, number[]> = {
  jump: [0], // A / Cross
  coverRoll: [1], // B / Circle
  melee: [2], // X / Square
  interact: [3], // Y / Triangle
  throw: [4], // LB
  reload: [5], // RB
  aim: [6], // LT
  fire: [7], // RT
  journal: [8], // View / Share
  pause: [9], // Menu / Options
  sprint: [10], // L3
  shoulderSwap: [11], // R3
  navAssist: [12], // D-pad up
  crouch: [13], // D-pad down
  swapWeapon: [14, 15], // D-pad left/right
};

/** Holding inputs that accessibility settings can turn into toggles. */
export const TOGGLEABLE: ButtonAction[] = ["aim", "sprint", "crouch", "fire"];
