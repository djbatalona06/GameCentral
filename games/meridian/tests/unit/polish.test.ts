// Tests for the clean-up pass: caption splitting, barks, chatter, shooter-style movement and
// desktop input helpers.

import { describe, expect, it } from "vitest";
import { CAPTION_MAX, splitCaption } from "../../src/sim/story/captions";
import { CHATTER_COOLDOWN, Chatter, chatterPool } from "../../src/sim/story/chatter";
import { CHAPTERS } from "../../src/sim/chapters/registry";
import { GameSim, defaultGameplay, type SimEvent } from "../../src/sim/GameSim";
import { isTouchFirst } from "../../src/input/TouchControls";
import { MAX_MOUSE_STEP, clampMouseStep, moveFromKeys } from "../../src/input/KeyboardMouse";
import { angleDiff, yawOf } from "../../src/sim/math";
import { TUNING } from "../../src/config/tuning";
import { DT, frame, player, testChapter } from "./helpers";
import type { Action } from "../../src/sim/story/types";
import { adaptTip, keyLabel } from "../../src/ui/controlText";
import { defaultSettings } from "../../src/core/Settings";

const LONG =
  "Catalina didn't sail east by accident. She followed the swallows, and the swallows followed the warm current, which means the meridian line on the astrolabe is a heading, not a border. We go where the birds go.";

/** Every scripted line in Act I, so the splitter is checked against the real dialogue. */
function allLines(): string[] {
  const out: string[] = [];
  const visit = (a: Action) => {
    if ((a.type === "dialogue" || a.type === "cutscene") && a.lines) out.push(...a.lines.map((l) => l.text));
  };
  for (const ch of CHAPTERS) {
    if (!ch.script) continue;
    ch.script.onStart.forEach(visit);
    Object.values(ch.script.events).forEach((list) => list.forEach(visit));
  }
  return out;
}

describe("captions", () => {
  it("leaves short lines alone", () => {
    expect(splitCaption("Here they come.")).toEqual(["Here they come."]);
  });

  it("splits long lines into short chunks without losing words", () => {
    const parts = splitCaption(LONG);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(CAPTION_MAX);
    expect(parts.join(" ")).toBe(LONG);
  });

  it("prefers to cut at the end of a sentence", () => {
    const parts = splitCaption("Ines. Boat on your east. Gold paint on the hull. That's the Gilt Company, and they are not here to say hello.", 60);
    expect(parts[0].endsWith(".")).toBe(true);
  });

  it("keeps every Act I line within two lines of subtitle text", () => {
    const lines = allLines();
    expect(lines.length).toBeGreaterThan(50);
    for (const l of lines) {
      const parts = splitCaption(l);
      for (const p of parts) expect(p.length, p).toBeLessThanOrEqual(CAPTION_MAX);
      expect(parts.join(" ")).toBe(l.replace(/\s+/g, " ").trim());
    }
  });

  it("shows a long story line as several captions, speaking it aloud only once", () => {
    const ch = testChapter();
    ch.script!.onStart = [{ type: "dialogue", lines: [{ speaker: "Bram", text: LONG }] }];
    const sim = new GameSim(ch, defaultGameplay());
    const seen: Array<Extract<SimEvent, { type: "dialogue" }>> = [];
    for (let i = 0; i < 60 * 30; i++) {
      sim.step(DT, frame());
      for (const e of sim.events) if (e.type === "dialogue" && !e.line.bark) seen.push(e);
      sim.events.length = 0;
    }
    expect(seen.length).toBe(splitCaption(LONG).length);
    expect(seen[0].say).toBe(LONG);
    expect(seen.slice(1).every((e) => e.say === null)).toBe(true);
    expect(seen.map((e) => e.line.text).join(" ")).toBe(LONG);
  });
});

describe("chatter", () => {
  it("waits between lines and never repeats one in a chapter", () => {
    const c = new Chatter("ch01");
    let t = 100;
    const rand = () => 0.3;
    const said = new Set<string>();
    const first = c.pick("treasure", t, rand);
    expect(first?.bark).toBe(true);
    said.add(first!.text);
    expect(c.pick("treasure", t + 1, rand)).toBeNull(); // cooling down
    for (let i = 0; i < 20; i++) {
      t += CHATTER_COOLDOWN;
      const l = c.pick("treasure", t, rand);
      if (!l) break;
      expect(said.has(l.text)).toBe(false);
      said.add(l.text);
    }
    expect(said.size).toBe(chatterPool("treasure", "ch01").length);
  });

  it("idle chatter comes as a bark, and can be turned off", () => {
    const count = (chatter: boolean) => {
      const sim = new GameSim(testChapter(), { ...defaultGameplay(), chatter });
      let barks = 0;
      for (let i = 0; i < 60 * 70; i++) {
        sim.step(DT, frame());
        barks += sim.events.filter((e) => e.type === "dialogue" && e.line.bark).length;
        sim.events.length = 0;
      }
      expect(sim.currentLine).toBeNull(); // chatter never takes the story line's place
      return barks;
    };
    expect(count(true)).toBeGreaterThan(0);
    expect(count(false)).toBe(0);
  });
});

describe("shooter-style movement (keyboard and mouse)", () => {
  const step = (faceCamera: boolean, move: [number, number], camYaw: number) => {
    const { world, p } = player([0, 0, -20], 0);
    for (let i = 0; i < 90; i++) p.update(DT, frame({ move }), camYaw, world, false, { autoTraversal: false, holdToToggle: false, faceCamera });
    return p;
  };

  it("A sidesteps while the hero keeps facing where the mouse points", () => {
    const camYaw = 0.8;
    const p = step(true, [-1, 0], camYaw);
    expect(Math.abs(angleDiff(p.yaw, camYaw))).toBeLessThan(0.05);
    // Moving to the camera's left: 90 degrees away from the facing direction.
    expect(Math.abs(angleDiff(yawOf(p.vel), camYaw - Math.PI / 2))).toBeLessThan(0.05);
  });

  it("adventure style still turns the hero to face the way she walks", () => {
    const camYaw = 0.8;
    const p = step(false, [-1, 0], camYaw);
    expect(Math.abs(angleDiff(p.yaw, camYaw - Math.PI / 2))).toBeLessThan(0.1);
  });

  it("walking backwards is slower, and you can't sprint backwards", () => {
    const { world, p } = player([0, 0, -20], 0);
    const f = frame({ move: [0, -1], held: ["sprint"] });
    for (let i = 0; i < 90; i++) p.update(DT, f, 0, world, false, { autoTraversal: false, holdToToggle: false, faceCamera: true });
    expect(p.sprinting).toBe(false);
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(TUNING.player.runSpeed * TUNING.player.backpedalScale, 1);
  });

  it("only applies to keyboard play", () => {
    const sim = new GameSim(testChapter(), defaultGameplay());
    const kb = frame({ move: [-1, 0] });
    kb.device = "keyboard";
    for (let i = 0; i < 90; i++) sim.step(DT, kb);
    expect(Math.abs(angleDiff(sim.player.yaw, sim.cam.yaw))).toBeLessThan(0.05);
  });
});

describe("desktop input helpers", () => {
  it("treats a touchscreen laptop as a computer", () => {
    const media = (matches: string[]) => (q: string) => matches.includes(q);
    expect(isTouchFirst(media(["(pointer: coarse)"]), 5)).toBe(true); // phone
    expect(isTouchFirst(media(["(pointer: fine)", "(any-pointer: fine)"]), 10)).toBe(false); // touchscreen laptop
    expect(isTouchFirst(media(["(pointer: coarse)", "(any-pointer: fine)"]), 10)).toBe(false); // tablet with a trackpad
    expect(isTouchFirst(null, 0)).toBe(false);
  });

  it("WASD and the arrow keys move the same way, and never faster together", () => {
    expect(moveFromKeys(["KeyW"])).toEqual({ x: 0, y: 1 });
    expect(moveFromKeys(["ArrowLeft"])).toEqual({ x: -1, y: 0 });
    expect(moveFromKeys(["KeyW", "ArrowUp"])).toEqual({ x: 0, y: 1 });
    const diag = moveFromKeys(["KeyW", "KeyD"]);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 5);
    const walk = moveFromKeys(["KeyW", "AltLeft"]);
    expect(walk.y).toBeCloseTo(0.5, 5);
  });

  it("ignores huge mouse jumps", () => {
    expect(clampMouseStep(3000)).toBe(MAX_MOUSE_STEP);
    expect(clampMouseStep(-3000)).toBe(-MAX_MOUSE_STEP);
    expect(clampMouseStep(12)).toBe(12);
  });
});

describe("tips speak the player's language", () => {
  const controls = defaultSettings().controls;

  it("uses key names on a keyboard and button names on a controller", () => {
    const tip = "Crouch in tall grass to hide. Sneak up behind a guard and press Melee for a silent takedown.";
    expect(adaptTip(tip, "keyboard", controls)).toContain("press F");
    expect(adaptTip(tip, "gamepad", controls)).toContain("press X");
    expect(adaptTip(tip, "touch", controls)).toBe(tip);
  });

  it("never tells a computer player to swipe the screen or use a stick", () => {
    for (const ch of CHAPTERS) {
      if (!ch.script) continue;
      const tips: string[] = [];
      const visit = (a: Action) => {
        if (a.type === "tutorial") tips.push(a.text);
      };
      ch.script.onStart.forEach(visit);
      Object.values(ch.script.events).forEach((list) => list.forEach(visit));
      for (const t of tips) expect(adaptTip(t, "keyboard", controls), t).not.toMatch(/swipe|stick|screen/i);
    }
  });

  it("follows remapped keys", () => {
    const remapped = { ...controls, keys: { ...controls.keys, jump: ["KeyK"] } };
    expect(adaptTip("Press Jump next to a handhold.", "keyboard", remapped)).toBe("Press K next to a handhold.");
    expect(keyLabel("Mouse2")).toBe("Right click");
    expect(keyLabel("ShiftLeft")).toBe("Shift");
  });
});
