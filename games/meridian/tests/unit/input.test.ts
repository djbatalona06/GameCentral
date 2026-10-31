import { describe, expect, it } from "vitest";
import { InputManager } from "../../src/input/InputManager";
import { defaultSettings } from "../../src/core/Settings";

describe("input manager", () => {
  it("turns a quick tap between ticks into a single press", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    im.touch.tapped.add("jump");
    const f1 = im.poll();
    expect(f1.buttons.jump.pressed).toBe(true);
    const f2 = im.poll();
    expect(f2.buttons.jump.pressed).toBe(false);
    expect(f2.buttons.jump.held).toBe(false);
  });

  it("holding reports held every tick but pressed only once", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    im.keyboard.held.add("fire");
    im.keyboard.tapped.add("fire");
    expect(im.poll().buttons.fire.pressed).toBe(true);
    const f = im.poll();
    expect(f.buttons.fire.held).toBe(true);
    expect(f.buttons.fire.pressed).toBe(false);
    im.keyboard.held.delete("fire");
    expect(im.poll().buttons.fire.released).toBe(true);
  });

  it("toggle aim keeps aiming after the button is let go", () => {
    const s = defaultSettings();
    s.controls.toggleAim = true;
    const im = new InputManager(() => s);
    im.touch.tapped.add("aim");
    expect(im.poll().buttons.aim.held).toBe(true);
    expect(im.poll().buttons.aim.held).toBe(true);
    im.touch.tapped.add("aim");
    expect(im.poll().buttons.aim.held).toBe(false);
  });

  it("combines devices and clamps movement", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    im.keyboard.move = { x: 1, y: 0 };
    im.touch.move = { x: 0, y: 1 };
    const f = im.poll();
    expect(Math.hypot(f.move.x, f.move.y)).toBeCloseTo(1);
  });

  it("scales look by sensitivity and ignores input while disabled", () => {
    const s = defaultSettings();
    s.controls.lookSensitivity = 2;
    const im = new InputManager(() => s);
    im.touch.look.yaw = 0.1;
    expect(im.poll().look.yaw).toBeCloseTo(0.2);
    im.enabled = false;
    im.touch.look.yaw = 0.1;
    im.touch.tapped.add("jump");
    const f = im.poll();
    expect(f.look.yaw).toBe(0);
    expect(f.buttons.jump.pressed).toBe(false);
  });
});
