// End-to-end smoke test on a phone-sized touch screen.
// Usage: npm run build && npm run preview (in another terminal), then npm run e2e.
// Screenshots are written to tests/e2e/screenshots/ for a human to review.

import { createRequire } from "module";
import { mkdirSync } from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:4173/";
const OUT = new URL("./screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const errors = [];
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` });
const game = (fn, arg) => page.evaluate(fn, arg);
const click = async (sel) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(250);
};

/** Drags the virtual stick using pointer events (touchscreen.tap can't drag). */
async function holdStick(dx, dy, ms) {
  await page.evaluate(({ dx, dy }) => {
    const root = document.querySelector(".touch-controls");
    const opts = (x, y) => ({ pointerId: 7, pointerType: "touch", clientX: x, clientY: y, bubbles: true, isPrimary: true });
    root.dispatchEvent(new PointerEvent("pointerdown", opts(150, 280)));
    root.dispatchEvent(new PointerEvent("pointermove", opts(150 + dx, 280 + dy)));
  }, { dx, dy });
  await page.waitForTimeout(ms);
  await page.evaluate(() => {
    const root = document.querySelector(".touch-controls");
    root.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: 150, clientY: 280, bubbles: true }));
  });
}

try {
  // 1. First run accessibility setup.
  await page.goto(`${BASE}?debug=1`);
  await page.waitForSelector('[data-screen="firstrun"]', { timeout: 30000 });
  await shot("01-first-run");
  check("first-run accessibility screen shows", true);
  await click('[data-preset="hearing"]');
  check("hearing preset applied", await game(() => window.__meridian.settings.a11y.soundIndicators === true));
  await click('[data-action="continue"]');

  // 2. Title and main menu.
  await page.waitForSelector('[data-screen="title"]');
  await page.waitForTimeout(800);
  await shot("02-title");
  await click('[data-action="start"]');
  await page.waitForSelector('[data-screen="main-menu"]');
  await shot("03-main-menu");

  // 3. New game -> slot 1 -> Explorer.
  await click('[data-action="new-game"]');
  await page.waitForSelector('.slot-list li button');
  await click(".slot-list li button");
  await page.waitForSelector('[data-screen="difficulty"]');
  await click('[data-difficulty="1"]');
  await page.waitForFunction(() => window.__meridian?.sim?.chapter.id === "ch01", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot("04-ch01-start");
  check("chapter 1 starts", true);
  check("touch controls visible", await page.locator(".touch-controls:not(.hidden)").count() === 1);

  // 4. Move with the virtual stick.
  const z0 = await game(() => window.__meridian.sim.player.pos.z);
  await holdStick(0, -60, 1500);
  const z1 = await game(() => window.__meridian.sim.player.pos.z);
  check("virtual stick moves Ines forward", z1 > z0 + 2, `z ${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
  await shot("05-ch01-moved");

  // 5. Tap Jump.
  await page.locator(".tc-jump").dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch", bubbles: true });
  // Wait for the game to actually take a step (the software renderer can be slow), then look for the jump.
  let jumped = true;
  await page.waitForFunction(() => window.__meridian.sim.player.vel.y > 1 || window.__meridian.sim.player.mode === "air", null, { timeout: 5000 }).catch(() => (jumped = false));
  const vy = await game(() => window.__meridian.sim.player.vel.y);
  await page.locator(".tc-jump").dispatchEvent("pointerup", { pointerId: 9, pointerType: "touch", bubbles: true });
  check("jump button jumps", jumped, `vy=${vy.toFixed(2)}`);

  // 6. Checkpoint autosave and Continue after reload.
  await game(() => {
    const s = window.__meridian.sim;
    s.player.teleport({ x: 0, y: 3, z: 55 }, 0);
    s.forceCheckpoint("c2");
  });
  await page.waitForTimeout(1200);
  await shot("06-ch01-wreck");
  await page.reload();
  await page.waitForSelector('[data-screen="title"]', { timeout: 30000 });
  await click('[data-action="start"]');
  await page.waitForSelector('[data-screen="main-menu"]');
  const contEnabled = await page.locator('[data-action="continue"]').isEnabled();
  check("Continue is available after reload", contEnabled);
  await click('[data-action="continue"]');
  await page.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
  const restored = await game(() => ({ cp: window.__meridian.sim.checkpointId, z: window.__meridian.sim.player.pos.z }));
  check("Continue restores the checkpoint", restored.cp === "c2" && Math.abs(restored.z - 55) < 1, JSON.stringify(restored));

  // 7. Pause menu, settings, accessibility toggles.
  await page.locator(".tc-pause").dispatchEvent("pointerdown", { pointerId: 11, pointerType: "touch", bubbles: true });
  await page.locator(".tc-pause").dispatchEvent("pointerup", { pointerId: 11, pointerType: "touch", bubbles: true });
  await page.waitForSelector('[data-screen="pause"]', { timeout: 5000 });
  await shot("07-pause");
  check("pause menu opens from touch", true);
  await click('[data-screen="pause"] [data-action="settings"]');
  await page.waitForSelector('[data-screen="settings"]');
  await shot("08-settings-a11y");
  await page.selectOption('select[aria-label="Colour-blind mode"]', "deuteranopia");
  await page.selectOption('select[aria-label="Subtitle size"]', "xl");
  await click('[data-tab="controls"]');
  await page.selectOption('select[aria-label="Touch layout"]', "oneHandedRight");
  await shot("09-settings-controls");
  check("settings saved in memory", await game(() => window.__meridian.settings.a11y.colorblind === "deuteranopia" && window.__meridian.settings.controls.touchLayout === "oneHandedRight"));
  await click('[data-screen="settings"] [data-action="back"]');
  await click('[data-screen="pause"] [data-action="resume"]');
  await page.waitForTimeout(800);
  await shot("10-one-handed-colorblind");

  // 8. Chapters 2 and 3 load directly, with a few camera positions.
  for (const [ch, spots] of [
    ["2", [[0, 0, -6, 0], [-1, 5.5, 64, 0], [0, 0, 84, 0], [0, 0, 128, 0]]],
    ["3", [[0, 0, -6, 0], [0, 8, 54, 0], [0, 8, 104, 0], [0, 8, 146, 0]]],
  ]) {
    await page.goto(`${BASE}?debug=1&chapter=${ch}`);
    await page.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    let i = 0;
    for (const [x, y, z, yaw] of spots) {
      await game(([x, y, z, yaw]) => {
        const s = window.__meridian.sim;
        s.player.teleport({ x, y, z }, yaw);
        s.cam.yaw = yaw;
        s.cam.pitch = -0.15;
      }, [x, y, z, yaw]);
      await page.waitForTimeout(900);
      await shot(`ch0${ch}-${++i}`);
    }
    check(`chapter ${ch} loads and renders`, true);
  }

  // 9. Combat sanity in chapter 3's arena: spawn the boss wave and survive a few seconds invulnerable.
  await game(() => {
    const s = window.__meridian.sim;
    s.opts.invulnerable = true;
    s.player.teleport({ x: 0, y: 8, z: 147.5 }, 0);
  });
  await page.waitForTimeout(6000);
  await game(() => window.__meridian.sim.skipCutscene());
  await page.waitForTimeout(3000);
  await shot("ch03-boss");
  const bossAlive = await game(() => window.__meridian.sim.enemies.filter((e) => e.alive).length);
  check("boss wave spawns", bossAlive >= 3, `${bossAlive} enemies`);

  // 10. Performance under 4x CPU throttling.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.waitForTimeout(4000);
  const perf = await game(() => {
    const r = window.__meridian.renderer;
    return { ...r.stats(), engineFps: r.engine.getFps(), deltaMs: r.engine.getDeltaTime() };
  });
  console.log(`INFO  fps under 4x CPU throttle with software WebGL: ${perf.fps.toFixed(1)} (p95 frame ${perf.p95FrameMs.toFixed(0)} ms, render scale ${perf.scaling.toFixed(2)})`);
  // Regression test: the game drives its own frame loop, so Babylon's clock only runs if beginFrame is called.
  // When it stopped, the fps readout was 0, the water froze and dynamic resolution collapsed.
  check("frame clock is running", perf.fps > 0 && perf.engineFps > 0 && perf.deltaMs > 0, `fps ${perf.fps.toFixed(1)}, engine fps ${perf.engineFps.toFixed(1)}, delta ${perf.deltaMs.toFixed(1)} ms`);
  check("render scale stays above the sharpness floor", perf.scaling <= 1 / 0.6 + 1e-6, `scale ${perf.scaling.toFixed(2)}`);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  // 11. Act I chapters 4-7 load, stay inside the phone draw-call budget, and show their set pieces.
  for (const [ch, x, y, z] of [["4", 0, 0, 690], ["5", 0, 30, 143], ["6", 0, 4, 20], ["7", -8, 0, 22]]) {
    await page.goto(`${BASE}?debug=1&chapter=${ch}`);
    await page.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
    await game(([x, y, z]) => {
      const s = window.__meridian.sim;
      s.skipCutscene();
      s.opts.invulnerable = true;
      s.player.teleport({ x, y, z }, 0);
      s.cam.yaw = 0;
    }, [x, y, z]);
    await page.waitForTimeout(1800);
    const st = await game(() => window.__meridian.renderer.stats());
    await shot(`ch0${ch}-act1`);
    check(`chapter ${ch} renders within the phone budget`, st.drawCalls > 0 && st.drawCalls <= 150 && st.triangles <= 300000, `${st.drawCalls} draw calls, ${st.triangles} triangles`);
  }

  // 12. Landscape only: held upright, a touch phone shows a "turn your phone" prompt and the game pauses behind it.
  await page.goto(`${BASE}?debug=1&chapter=2`);
  await page.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
  await game(() => {
    const g = window.__meridian;
    g.sim.skipCutscene();
    g.settings.controls.touchLayout = "standard"; // step 7 switched to one-handed
    g.touch.applyLayout();
  });
  await page.waitForTimeout(1200);
  const rotateShown = () => page.evaluate(() => getComputedStyle(document.getElementById("rotate")).display !== "none");
  const gameState = () => game(() => window.__meridian.state);
  check("landscape: no rotate prompt, game playing", !(await rotateShown()) && (await gameState()) === "playing");
  const inside = async () =>
    page.evaluate(() => [...document.querySelectorAll(".tc-btn:not(.tc-hidden)")].every((b) => {
      const r = b.getBoundingClientRect();
      return r.left >= -2 && r.top >= -2 && r.right <= innerWidth + 2 && r.bottom <= innerHeight + 2;
    }));
  check("landscape: every touch button is on screen", await inside());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await shot("rotate-prompt");
  check("upright phone: the rotate prompt covers the game", await rotateShown());
  check("upright phone: the game is paused", (await gameState()) === "paused");
  check("upright phone: no touch controls are shown", (await page.locator(".touch-controls:not(.hidden)").count()) === 0);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(800);
  check("turning back to landscape hides the prompt", !(await rotateShown()));
  check("turning back to landscape resumes the game by itself", (await gameState()) === "playing");
  check("landscape again: touch controls are back and nothing is stuck", (await page.locator(".touch-controls:not(.hidden)").count()) === 1 && (await game(() => window.__meridian.input.touch.held.size === 0)));
  // A paused game that the player paused themselves must stay paused after turning the phone.
  await page.locator(".tc-pause").dispatchEvent("pointerdown", { pointerId: 12, pointerType: "touch", bubbles: true });
  await page.locator(".tc-pause").dispatchEvent("pointerup", { pointerId: 12, pointerType: "touch", bubbles: true });
  await page.waitForFunction(() => window.__meridian.state === "paused", null, { timeout: 10000 });
  const beforeTurn = await gameState();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const upright = await gameState();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(600);
  const afterTurn = await gameState();
  check("a game the player paused stays paused after turning the phone", beforeTurn === "paused" && afterTurn === "paused", `${beforeTurn} -> ${upright} -> ${afterTurn}`);
  await game(() => window.__meridian.resume());
  await page.waitForTimeout(300);

  // 12b. Left-side widgets: gun card (tap = swap), goal card (tap = point at the goal) and the Walk/Run switch.
  await page.goto(`${BASE}?debug=1&chapter=3&quality=low`);
  await page.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
  await game(() => {
    const g = window.__meridian;
    g.sim.skipCutscene();
    g.sim.opts.invulnerable = true;
    g.settings.controls.touchLayout = "standard";
    g.touch.applyLayout();
    if (!g.sim.weapons.sidearm) g.sim.giveWeapon("pistol", 60);
    if (!g.sim.weapons.long) g.sim.giveWeapon("rifle", 90);
  });
  await page.waitForTimeout(1500);
  const cards = await game(() => {
    const g = window.__meridian;
    const q = (sel) => document.querySelector(sel);
    const rect = (sel) => q(sel).getBoundingClientRect().toJSON();
    const w = g.sim.activeWeapon();
    return {
      gunName: q(".tc-gun [data-role=gun-name]").textContent,
      gunAmmo: q(".tc-gun [data-role=gun-ammo]").textContent,
      expectAmmo: `${w.mag} / ${w.reserve}`,
      goalText: q(".tc-goal [data-role=goal-text]").textContent,
      objective: g.sim.objective?.text ?? "",
      gun: rect(".tc-gun"), goal: rect(".tc-goal"), walk: rect(".tc-walk"), jump: rect(".tc-jump"), fire: rect(".tc-fire"),
      width: innerWidth,
      ammoShown: getComputedStyle(q(".hud .ammo")).display !== "none",
      objectiveShown: getComputedStyle(q(".hud .objective")).display !== "none",
    };
  });
  await shot("touch-layout-landscape-low");
  check("gun card shows the weapon name", cards.gunName.length > 2, cards.gunName);
  check("gun card shows magazine / reserve ammo", cards.gunAmmo === cards.expectAmmo, `${cards.gunAmmo} vs ${cards.expectAmmo}`);
  check("goal card shows the current objective", cards.objective.length > 0 && cards.goalText === cards.objective, cards.goalText);
  check("status widgets sit on the left", cards.gun.right < cards.width * 0.4 && cards.goal.right < cards.width * 0.4 && cards.walk.right < cards.width * 0.4);
  check("action buttons sit on the right", cards.jump.left > cards.width * 0.5 && cards.fire.left > cards.width * 0.5);
  check("old ammo and objective panels are hidden on touch", !cards.ammoShown && !cards.objectiveShown);

  const tap = (sel, id) =>
    page.evaluate(([sel, id]) => {
      const el = document.querySelector(sel);
      const t = window.__meridian.input.touch;
      el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: id, pointerType: "touch", bubbles: true }));
      const tapped = [...t.tapped];
      el.dispatchEvent(new PointerEvent("pointerup", { pointerId: id, pointerType: "touch", bubbles: true }));
      return tapped;
    }, [sel, id]);
  check("tapping the goal card presses Goal", (await tap(".tc-goal", 41)).includes("navAssist"));
  const before = await game(() => window.__meridian.sim.weapons.active);
  check("tapping the gun card presses Swap", (await tap(".tc-gun", 42)).includes("swapWeapon"));
  await page.waitForTimeout(500);
  const after = await game(() => window.__meridian.sim.weapons.active);
  check("tapping the gun card swaps the weapon", before !== after, `${before} -> ${after}`);
  await page.waitForTimeout(300);
  const nameAfter = await game(() => document.querySelector(".tc-gun [data-role=gun-name]").textContent);
  check("gun card updates after a swap", nameAfter !== cards.gunName, `${cards.gunName} -> ${nameAfter}`);

  // Walk/Run: the same stick push covers much less ground in Walk mode.
  const spot = await game(() => {
    const p = window.__meridian.sim.player;
    return { pos: { ...p.pos }, yaw: p.yaw };
  });
  const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const reset = () => game((s) => window.__meridian.sim.player.teleport(s.pos, s.yaw), spot);
  await reset();
  await page.waitForTimeout(300);
  await holdStick(0, -60, 1000);
  const run = flat(spot.pos, await game(() => ({ ...window.__meridian.sim.player.pos })));
  await reset();
  await tap(".tc-walk", 43);
  check("Walk switch turns on", (await game(() => window.__meridian.touch.walk)) === true && (await page.locator(".tc-walk").textContent()) === "Walk");
  await page.waitForTimeout(300);
  await holdStick(0, -60, 1000);
  const walk = flat(spot.pos, await game(() => ({ ...window.__meridian.sim.player.pos })));
  await shot("touch-layout-walk-on");
  check("Walk mode moves slower than Run", run > 1 && walk > 0.2 && walk < run * 0.7, `run ${run.toFixed(2)} m, walk ${walk.toFixed(2)} m`);
  await tap(".tc-walk", 44);
  check("Walk switch turns off again", (await game(() => window.__meridian.touch.walk)) === false && (await page.locator(".tc-walk").textContent()) === "Run");

  // 13. Desktop: keyboard movement without touch controls.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const dp = await desk.newPage();
  dp.on("pageerror", (e) => errors.push(`desktop pageerror: ${e.message}`));
  await dp.goto(`${BASE}?debug=1&chapter=1`);
  await dp.waitForFunction(() => window.__meridian?.sim, null, { timeout: 30000 });
  await dp.waitForTimeout(800);
  const dz0 = await dp.evaluate(() => window.__meridian.sim.player.pos.z);
  await dp.keyboard.down("KeyW");
  // Wait for Ines to actually move (the software renderer can be slow) instead of a fixed time.
  await dp.waitForFunction((z) => window.__meridian.sim.player.pos.z > z + 2, dz0, { timeout: 10000 }).catch(() => undefined);
  await dp.keyboard.up("KeyW");
  const dz1 = await dp.evaluate(() => window.__meridian.sim.player.pos.z);
  check("keyboard W moves Ines on desktop", dz1 > dz0 + 2, `z ${dz0.toFixed(2)} -> ${dz1.toFixed(2)}`);
  check("no touch controls on desktop", (await dp.locator(".touch-controls.hidden").count()) === 1);
  // Computers can be any shape: a tall window shows no rotate prompt and the game keeps playing.
  await dp.setViewportSize({ width: 600, height: 900 });
  await dp.waitForTimeout(600);
  check("desktop: a tall window shows no rotate prompt", (await dp.evaluate(() => getComputedStyle(document.getElementById("rotate")).display)) === "none" && (await dp.evaluate(() => window.__meridian.state)) === "playing");
  await dp.screenshot({ path: `${OUT}desktop.png` });
  await desk.close();
} catch (err) {
  check("smoke run completed", false, err.message);
  await shot("zz-failure");
}

await browser.close();
const ignorable = (e) => /favicon|ServiceWorker|AudioContext|speechSynthesis/.test(e);
const realErrors = errors.filter((e) => !ignorable(e));
check("no page errors", realErrors.length === 0, realErrors.slice(0, 5).join(" | "));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
