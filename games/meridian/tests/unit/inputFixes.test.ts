// Regression tests for the input and movement fixes (pause/resume, sprint toggle, wheel,
// gamepad unplug, hold-to-crouch, coyote time, sprint out of crouch, camera vs walls).
import { describe, expect, it, vi } from "vitest";
import { InputManager } from "../../src/input/InputManager";
import { WheelNotches, moveFromKeys } from "../../src/input/KeyboardMouse";
import { TOGGLEABLE } from "../../src/input/actions";
import { defaultSettings } from "../../src/core/Settings";
import { TUNING } from "../../src/config/tuning";
import { type CameraInput, newCamera, updateCamera } from "../../src/sim/player/CameraRig";
import { World } from "../../src/sim/world/World";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { DT, frame, newSim, player, testLevel } from "./helpers";

describe("input fixes", () => {
  it("a button still held after resume does not count as a new press", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    // The pause menu is open and the player is holding the Menu button / A.
    im.enabled = false;
    im.gamepad.held.add("pause");
    im.gamepad.held.add("jump");
    im.poll();
    // Resume: input on, reset, and the buttons are still down on the next ticks.
    im.enabled = true;
    im.reset();
    const f = im.poll();
    expect(f.buttons.pause.pressed).toBe(false);
    expect(f.buttons.jump.pressed).toBe(false);
    expect(f.buttons.jump.held).toBe(true);
    // Letting go and pressing again works as normal.
    im.gamepad.held.clear();
    im.poll();
    im.gamepad.held.add("jump");
    expect(im.poll().buttons.jump.pressed).toBe(true);
  });

  it("reset keeps held keys held (W keeps walking, right mouse keeps aiming)", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    im.keyboard.move = { x: 0, y: 1 };
    im.keyboard.held.add("aim");
    im.poll();
    im.reset();
    const f = im.poll();
    expect(f.move.y).toBeCloseTo(1);
    expect(f.buttons.aim.held).toBe(true);
    expect(f.buttons.aim.pressed).toBe(false);
  });

  it("toggle sprint works when Shift is pressed before W", () => {
    const s = defaultSettings();
    s.controls.toggleSprint = true;
    const im = new InputManager(() => s);
    im.keyboard.tapped.add("sprint");
    expect(im.poll().buttons.sprint.held).toBe(true); // armed while standing still
    expect(im.poll().buttons.sprint.held).toBe(true);
    im.keyboard.move = { x: 0, y: 1 };
    expect(im.poll().buttons.sprint.held).toBe(true); // now running
    im.keyboard.move = { x: 0, y: 0 };
    expect(im.poll().buttons.sprint.held).toBe(false); // stopped: sprint ends
  });

  it("one wheel flick swaps the weapon once, not back and forth", () => {
    const w = new WheelNotches();
    let swaps = 0;
    // A trackpad flick: 12 small events over 120 ms.
    for (let i = 0; i < 12; i++) swaps += w.feed(12, 0, 1000 + i * 10);
    expect(swaps).toBe(1);
    // A second flick a moment later swaps again.
    for (let i = 0; i < 6; i++) swaps += w.feed(-20, 0, 1400 + i * 10);
    expect(swaps).toBe(2);
    // One classic wheel notch (line mode).
    expect(new WheelNotches().feed(3, 1, 0)).toBe(1);
  });

  it("walk mode is reported so vehicles can undo it", () => {
    const s = defaultSettings();
    const im = new InputManager(() => s);
    im.keyboard.move = moveFromKeys(["KeyW", "AltLeft"]);
    im.keyboard.walk = true;
    const f = im.poll();
    expect(f.move.y).toBeCloseTo(0.5);
    expect(f.walk).toBe(true);
  });

  it("only implemented hold actions are offered as toggles", () => {
    expect(TOGGLEABLE).not.toContain("fire");
  });
});

describe("gamepad unplug", () => {
  it("lets go of held buttons and the stick when the controller disappears", async () => {
    let pads: Array<unknown> = [
      {
        connected: true,
        mapping: "standard",
        id: "pad",
        buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })),
        axes: [0, -1, 0, 0],
      },
    ];
    vi.stubGlobal("window", { addEventListener: () => undefined });
    vi.stubGlobal("navigator", { getGamepads: () => pads });
    const { GamepadInput } = await import("../../src/input/GamepadInput");
    const s = defaultSettings();
    const im = new InputManager(() => s);
    const g = new GamepadInput(im.gamepad, () => s);
    g.update(DT);
    expect(im.gamepad.held.has("jump")).toBe(true);
    expect(im.gamepad.move.y).toBeGreaterThan(0.5);
    pads = [];
    g.update(DT);
    expect(im.gamepad.held.size).toBe(0);
    expect(im.gamepad.move).toEqual({ x: 0, y: 0 });
    expect(g.menuAxis).toEqual({ x: 0, y: 0 });
    vi.unstubAllGlobals();
  });
});

describe("movement fixes", () => {
  it("hold-to-crouch crouches only while the button is held", () => {
    const { world, p } = player([0, 0, 0]);
    const opts = { autoTraversal: false, holdToToggle: false, holdCrouch: true };
    for (let i = 0; i < 5; i++) p.update(DT, frame({ held: ["crouch"] }), 0, world, false, opts);
    expect(p.crouched).toBe(true);
    p.update(DT, frame(), 0, world, false, opts);
    expect(p.crouched).toBe(false);
  });

  it("sprinting stands up out of a crouch", () => {
    const { world, p } = player([0, 0, 0]);
    const opts = { autoTraversal: false, holdToToggle: false };
    p.update(DT, frame({ pressed: ["crouch"] }), 0, world, false, opts);
    expect(p.crouched).toBe(true);
    for (let i = 0; i < 3; i++) p.update(DT, frame({ move: [0, 1], held: ["sprint"] }), 0, world, false, opts);
    expect(p.crouched).toBe(false);
    expect(p.sprinting).toBe(true);
  });

  it("letting go of a ledge gives no free coyote jump", () => {
    const { p } = player([0, 0, 0]);
    p.coyote = 0.1;
    p.release();
    expect(p.coyote).toBe(0);
  });

  it("the camera pivot never ends up inside a wall beside the shoulder", () => {
    const b = new LevelBuilder("cam", { top: "#000", bottom: "#000", fog: "#000", fogDensity: 0 });
    b.box([-10, -1, -10], [10, 0, 10], "ground");
    // A wall right against the hero's right side (camera on the right shoulder).
    b.box([0.4, 0, -10], [2, 4, 10], "rock");
    const world = new World(b.build());
    const cam = newCamera(0);
    const inp: CameraInput = { lookYaw: 0, lookPitch: 0, aiming: false, scoped: false, playerPos: { x: 0, y: 0, z: 0 }, playerHeight: TUNING.player.height, travelYaw: null, autoRecenter: false, invertY: false, fovScale: 1, hints: [] };
    for (let i = 0; i < 30; i++) updateCamera(cam, inp, world, DT);
    expect(cam.pivot.x).toBeLessThan(0.4);
    expect(world.overlapsSolid({ min: { x: cam.position.x - 0.05, y: cam.position.y - 0.05, z: cam.position.z - 0.05 }, max: { x: cam.position.x + 0.05, y: cam.position.y + 0.05, z: cam.position.z + 0.05 } })).toBeFalsy();
    expect(cam.distance).toBeGreaterThan(1);
  });

  it("moves relative to this tick's camera turn, not last tick's", () => {
    const s = newSim();
    s.step(DT, frame());
    const f = frame({ move: [0, 1] });
    f.look.yaw = Math.PI / 2; // turn right a quarter and walk forward in the same tick
    for (let i = 0; i < 20; i++) s.step(DT, i === 0 ? f : frame({ move: [0, 1] }));
    // Forward after a quarter turn right is +X.
    expect(s.player.pos.x).toBeGreaterThan(Math.abs(s.player.pos.z));
  });

  it("keeps the previous tick for smooth rendering", () => {
    const s = newSim();
    for (let i = 0; i < 5; i++) s.step(DT, frame({ move: [0, 1] }));
    expect(s.prev.valid).toBe(true);
    expect(s.prev.player.z).toBeLessThan(s.player.pos.z);
  });
});

void testLevel;
