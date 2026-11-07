// Input feel: zoom-matched aiming, smooth aim assist, motion-sensor aiming, controller stick
// shaping and touch extras. See docs/input-feel.md.

import { describe, expect, it } from "vitest";
import { zoomLookScale } from "../../src/sim/player/CameraRig";
import { AimAssistState, aimAssist, frictionScale, targetSize } from "../../src/sim/combat/aimAssist";
import { GyroCalibrator, GyroInput, gyroToLook, tighten, worldUp } from "../../src/input/Gyro";
import { FlickStick, LookBoost, deadzone, shapeStick } from "../../src/input/LookShaping";
import { swipeGain, BUTTONS, defaultPositions } from "../../src/input/TouchControls";
import { InputManager } from "../../src/input/InputManager";
import { defaultSettings, migrateSettings } from "../../src/core/Settings";
import { TUNING } from "../../src/config/tuning";
import { LevelBuilder } from "../../src/sim/world/LevelBuilder";
import { newSim, frame, DT } from "./helpers";
import { yawOf } from "../../src/sim/math";

const HIP = TUNING.camera.fov;

describe("zoom-matched aiming", () => {
  it("does nothing when the view is not zoomed", () => {
    expect(zoomLookScale(HIP, HIP)).toBe(1);
    expect(zoomLookScale(HIP, HIP, 1.78)).toBe(1);
  });

  it("matches the crosshair: shoulder aim about 0.68x, the scope about 0.29x", () => {
    const shoulder = zoomLookScale(HIP, HIP * TUNING.camera.aimFovScale);
    const scope = zoomLookScale(HIP, HIP * TUNING.camera.scopeFovScale);
    expect(shoulder).toBeCloseTo(Math.tan((HIP * 0.72) / 2) / Math.tan(HIP / 2), 6);
    expect(shoulder).toBeCloseTo(0.684, 2);
    expect(scope).toBeCloseTo(0.292, 2);
    // The old flat 0.7 was fine at the shoulder but more than twice too fast in the scope.
    expect(0.7 / scope).toBeGreaterThan(2);
  });

  it("turns slower the more you zoom, and matching nearer the edge moves toward 1", () => {
    let last = 1;
    for (const k of [0.9, 0.7, 0.5, 0.3]) {
      const v = zoomLookScale(HIP, HIP * k);
      expect(v).toBeLessThan(last);
      last = v;
    }
    const scopeCentre = zoomLookScale(HIP, HIP * 0.32, 0);
    const scope43 = zoomLookScale(HIP, HIP * 0.32, 1.33);
    const scope169 = zoomLookScale(HIP, HIP * 0.32, 1.78);
    expect(scope43).toBeGreaterThan(scopeCentre);
    expect(scope169).toBeGreaterThan(scope43);
    expect(scope169).toBeLessThan(1);
  });

  it("the simulation slows the turn while aiming by the zoom", () => {
    const level = () => {
      const b = new LevelBuilder("range", { top: "", bottom: "", fog: "", fogDensity: 0 });
      b.box([-20, -1, -20], [20, 0, 40], "ground");
      b.arena("a", [-20, -1, -20], [20, 4, 40]);
      b.enemy("rifleman", [0, 0, 35], 0, "a");
      b.checkpoint("start", [0, 0, 0], 0, "Start");
      return b.build();
    };
    const s = newSim({ aimAssist: "off" }, level);
    for (let i = 0; i < 40; i++) s.step(DT, frame({ held: ["aim"] }));
    expect(s.aiming).toBe(true);
    const before = s.cam.yaw;
    const f = frame({ held: ["aim"] });
    f.look.yaw = 0.1;
    f.aimSens = 1;
    s.step(DT, f);
    const turned = s.cam.yaw - before;
    expect(turned).toBeCloseTo(0.1 * zoomLookScale(HIP, s.cam.fov), 2);
    expect(turned).toBeLessThan(0.08);
  });
});

describe("aim assist", () => {
  const eye = { x: 0, y: 1.6, z: 0 };

  it("friction fades in smoothly with no edge jolt", () => {
    expect(frictionScale(0, 0.4, 1.6)).toBeCloseTo(0.6);
    expect(frictionScale(1, 0.4, 1.6)).toBe(1);
    expect(frictionScale(0.999, 0.4, 1.6)).toBeGreaterThan(0.995);
    let last = 0;
    for (let x = 0; x <= 1; x += 0.05) {
      const v = frictionScale(x, 0.4, 1.6);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it("help zones shrink with distance, down to a floor", () => {
    expect(targetSize(5, 0.45)).toBeGreaterThan(targetSize(40, 0.45));
    expect(targetSize(500, 0.45, 0.03)).toBe(0.03);
  });

  it("picks the target nearest the reticle", () => {
    const targets = [
      { id: "far-off", pos: { x: 1.5, y: 1.6, z: 10 } },
      { id: "centre", pos: { x: 0.2, y: 1.6, z: 10 } },
      { id: "behind", pos: { x: 0, y: 1.6, z: -10 } },
    ];
    expect(aimAssist("low", eye, 0, 0, targets).pick?.id).toBe("centre");
    expect(aimAssist("low", eye, Math.PI, 0, targets).pick?.id).toBe("behind");
  });

  it("gives mouse players no friction, and only High gives them snap", () => {
    const t = [{ id: "e", pos: { x: 0.3, y: 1.6, z: 10 } }];
    expect(aimAssist("low", eye, 0, 0, t, { device: "gamepad" }).sensitivity).toBeLessThan(1);
    expect(aimAssist("low", eye, 0, 0, t, { device: "keyboard" }).sensitivity).toBe(1);
    expect(aimAssist("high", eye, 0, 0, t, { device: "keyboard" }).snapYaw).toBeGreaterThan(0);
    expect(aimAssist("low", eye, 0, 0, t, { device: "keyboard" }).snapYaw).toBe(0);
  });

  it("magnetism rescues near misses but leaves shots on the body (and headshots) alone", () => {
    const onBody = aimAssist("low", eye, 0, 0, [{ id: "e", pos: { x: 0.2, y: 1.6, z: 10 } }]);
    expect(onBody.magnetYaw).toBe(0);
    const nearMiss = aimAssist("low", eye, 0, 0, [{ id: "e", pos: { x: 0.55, y: 1.6, z: 10 } }]);
    expect(nearMiss.magnetYaw).toBeGreaterThan(0);
  });

  it("eases the snap in over the snap time instead of jumping", () => {
    const target = [{ id: "e", pos: { x: 1.2, y: 1.6, z: 10 } }];
    const want = yawOf({ x: 1.2, y: 0, z: 10 });
    const st = new AimAssistState();
    let yaw = 0;
    const first = st.update("high", true, aimAssist("high", eye, yaw, 0, target), { device: "gamepad", steering: false, dt: DT });
    yaw += first.yaw;
    expect(yaw).toBeGreaterThan(0);
    expect(yaw).toBeLessThan(want * 0.5);
    for (let t = DT; t < TUNING.aimAssist.high.snapTime + DT; t += DT) yaw += st.update("high", true, aimAssist("high", eye, yaw, 0, target), { device: "gamepad", steering: false, dt: DT }).yaw;
    expect(yaw).toBeCloseTo(want, 3);
  });

  it("tracks a moving target only while the player steers, and never for a mouse", () => {
    const at = (x: number) => [{ id: "e", pos: { x, y: 1.6, z: 10 } }];
    const run = (steering: boolean, device: "gamepad" | "keyboard") => {
      const st = new AimAssistState();
      st.update("low", true, aimAssist("low", eye, 0, 0, at(0.1)), { device, steering, dt: DT });
      return st.update("low", true, aimAssist("low", eye, 0, 0, at(0.15)), { device, steering, dt: DT }).yaw;
    };
    expect(run(true, "gamepad")).toBeGreaterThan(0);
    expect(run(false, "gamepad")).toBe(0);
    expect(run(true, "keyboard")).toBe(0);
  });
});

describe("motion-sensor aiming", () => {
  it("maps the turn correctly in both landscape directions", () => {
    // Phone turned anticlockwise (90): the screen's up is the phone's x axis.
    expect(gyroToLook({ x: 1, y: 0, z: 0 }, 90).yaw).toBeCloseTo(-1);
    // Turned the other way, the same physical turn reads the opposite sign; we correct for it.
    expect(gyroToLook({ x: -1, y: 0, z: 0 }, -90).yaw).toBeCloseTo(-1);
    expect(gyroToLook({ x: -1, y: 0, z: 0 }, 270).yaw).toBeCloseTo(-1);
    // Upright: tipping the top back looks up.
    expect(gyroToLook({ x: 1, y: 0, z: 0 }, 0).pitch).toBeCloseTo(1);
  });

  it("player space: a body turn with the phone tilted back still turns fully", () => {
    const up = { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 };
    const rate = { x: 0, y: up.y, z: up.z }; // turning about world-up at 1 rad/s
    expect(gyroToLook(rate, 0).yaw).toBeCloseTo(-Math.SQRT1_2);
    expect(gyroToLook(rate, 0, up).yaw).toBeCloseTo(-1);
  });

  it("reads gravity either way round", () => {
    expect(worldUp({ x: 0, y: 0, z: -9.8 }, 0)).toEqual({ x: -0, y: -0, z: 1 });
    expect(worldUp({ x: 0, y: 0, z: 9.8 }, 0)).toEqual({ x: 0, y: 0, z: 1 });
    expect(worldUp({ x: 0, y: 0, z: 1 }, 0)).toBeNull();
  });

  it("at sensitivity 1, turning the phone 90 degrees turns the camera 90 degrees", () => {
    const s = defaultSettings();
    s.controls.gyroMode = "always";
    const out = { yaw: 0, pitch: 0 };
    const g = new GyroInput(out, () => s);
    for (let i = 0; i <= 10; i++) g.onMotion({ rotationRate: { alpha: 0, beta: 0, gamma: -90 }, accelerationIncludingGravity: null, timeStamp: i * 100 });
    expect(out.yaw).toBeCloseTo(Math.PI / 2, 2);
    s.controls.gyroSensitivity = 2;
    out.yaw = 0;
    for (let i = 11; i <= 20; i++) g.onMotion({ rotationRate: { alpha: 0, beta: 0, gamma: -90 }, accelerationIncludingGravity: null, timeStamp: i * 100 });
    expect(out.yaw).toBeCloseTo(Math.PI, 2);
  });

  it("learns and removes resting drift", () => {
    const c = new GyroCalibrator();
    let last = { x: 1, y: 1, z: 1 };
    for (let i = 0; i < 600; i++) last = c.feed({ x: 0.012, y: -0.008, z: 0.004 }, 0.01);
    expect(c.bias.x).toBeCloseTo(0.012, 3);
    expect(Math.hypot(last.x, last.y, last.z)).toBeLessThan(0.002);
    // A real turn is not mistaken for drift.
    c.feed({ x: 2, y: 0, z: 0 }, 0.01);
    expect(c.bias.x).toBeCloseTo(0.012, 3);
  });

  it("tightening hides tremor but leaves real turns alone", () => {
    expect(tighten({ yaw: 0.02, pitch: 0 }, 0.04).yaw).toBeCloseTo(0.01);
    expect(tighten({ yaw: 0.5, pitch: 0 }, 0.04).yaw).toBe(0.5);
  });

  it("'while aiming' only turns while Aim is held, and gyro skips look sensitivity", () => {
    const s = defaultSettings();
    s.controls.gyroMode = "aiming";
    s.controls.lookSensitivity = 2;
    const im = new InputManager(() => s);
    im.gyro.yaw = 0.05;
    expect(im.poll().gyro).toEqual({ yaw: 0, pitch: 0 });
    im.gyro.yaw = 0.05;
    im.touch.held.add("aim");
    const f = im.poll();
    expect(f.gyro?.yaw).toBeCloseTo(0.05);
    expect(f.look.yaw).toBe(0);
    s.controls.gyroMode = "off";
    im.gyro.yaw = 0.05;
    expect(im.poll().gyro?.yaw).toBe(0);
  });
});

describe("controller look stick", () => {
  it("reaches full tilt before the stick's physical edge", () => {
    expect(deadzone(0.93, 0, 0.18, 0.92)[0]).toBe(1);
    expect(deadzone(0.5, 0, 0.18, 0.92)[0]).toBeGreaterThan(deadzone(0.5, 0, 0.18)[0]);
  });

  it("curves by distance, so diagonals turn as fast as straight pushes", () => {
    const [sx] = shapeStick(0.5, 0, "dynamic");
    const [dx, dy] = shapeStick(0.5 * Math.SQRT1_2, 0.5 * Math.SQRT1_2, "dynamic");
    expect(sx).toBeCloseTo(0.25);
    expect(Math.hypot(dx, dy)).toBeCloseTo(0.25);
    expect(shapeStick(0.5, 0, "linear")[0]).toBeCloseTo(0.5);
    expect(shapeStick(0.5, 0, "precise")[0]).toBeCloseTo(0.125);
  });

  it("turn boost waits, ramps up smoothly and resets when let go", () => {
    const b = new LookBoost();
    expect(b.update(1, 0.1)).toBe(1);
    let m = 1;
    for (let i = 0; i < 60; i++) m = b.update(1, DT);
    expect(m).toBeCloseTo(TUNING.stick.boostMul);
    expect(b.update(0.5, DT)).toBe(1);
    expect(b.update(1, DT)).toBe(1);
  });

  it("flick stick turns to face the stick, follows the rim, and turns around", () => {
    const f = new FlickStick();
    let yaw = 0;
    for (let i = 0; i < 12; i++) yaw += f.update(1, 0, DT); // push right
    expect(yaw).toBeCloseTo(Math.PI / 2, 5);
    for (let i = 1; i <= 9; i++) yaw += f.update(Math.cos((i * Math.PI) / 18), -Math.sin((i * Math.PI) / 18), DT); // roll to down
    expect(yaw).toBeCloseTo(Math.PI, 5);
    yaw += f.update(0, 0, DT); // let go: the view stays
    expect(yaw).toBeCloseTo(Math.PI, 5);
    let back = 0;
    for (let i = 0; i < 12; i++) back += f.update(0, -1, DT); // push down: turn around
    expect(Math.abs(back)).toBeCloseTo(Math.PI, 5);
  });
});

describe("touch extras", () => {
  it("swipe acceleration: slow drags stay exact, fast swipes turn further", () => {
    expect(swipeGain(0, 0.3)).toBe(1);
    expect(swipeGain(10, 0.3)).toBeCloseTo(1.3);
    expect(swipeGain(10, 0)).toBe(1);
    expect(swipeGain(0.75, 0.4)).toBeCloseTo(1.2);
  });

  it("the Aim+Fire button aims, looks, and sits inward from the edge", () => {
    const def = BUTTONS.find((b) => b.id === "aimFire")!;
    expect(def.action).toBe("aim");
    expect(def.looks).toBe(true);
    expect(defaultPositions("standard").aimFire.x).toBeLessThan(defaultPositions("standard").fire.x);
  });
});

describe("settings upgrade to v6", () => {
  it("keeps the old aim feel and turns the gyro switch into a mode", () => {
    const out = migrateSettings({ version: 5, controls: { aimSensitivity: 0.7, gyroAim: true } }) as { version: number; controls: Record<string, unknown> };
    expect(out.version).toBe(6);
    expect(out.controls.aimSensitivity).toBe(1);
    expect(out.controls.gyroMode).toBe("aiming");
    expect("gyroAim" in out.controls).toBe(false);
    const off = migrateSettings({ version: 5, controls: { aimSensitivity: 1.05, gyroAim: false } }) as { controls: Record<string, unknown> };
    expect(off.controls.aimSensitivity).toBe(1.5);
    expect(off.controls.gyroMode).toBe("off");
  });
});
