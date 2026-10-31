import { describe, expect, it } from "vitest";
import { TUNING } from "../../src/config/tuning";
import { frame, player, run, DT } from "./helpers";

describe("player movement", () => {
  it("stands on the ground without sinking or drifting", () => {
    const { world, p } = player([0, 0, 0]);
    run(p, world, 120, frame());
    expect(p.pos.y).toBeCloseTo(0, 3);
    expect(p.grounded).toBe(true);
  });

  it("runs at run speed and walks with a light stick push", () => {
    const { world, p } = player([0, 0, -20]);
    run(p, world, 60, frame({ move: [0, 1] }));
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(TUNING.player.runSpeed, 1);
    run(p, world, 60, frame({ move: [0, 0.3] }));
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeLessThan(TUNING.player.walkSpeed + 0.01);
  });

  it("jumps and lands", () => {
    const { world, p } = player([0, 0, -20]);
    run(p, world, 1, frame({ pressed: ["jump"] }));
    expect(p.mode).toBe("air");
    let peak = 0;
    for (let i = 0; i < 90; i++) {
      run(p, world, 1, frame());
      peak = Math.max(peak, p.pos.y);
    }
    expect(peak).toBeGreaterThan(1);
    expect(p.grounded).toBe(true);
  });

  it("buffers a jump pressed just before landing", () => {
    const { world, p } = player([0, 2, -20]);
    // Falls ~2 m; press jump a few frames before touching down.
    let landedJump = false;
    for (let i = 0; i < 60; i++) {
      const nearGround = p.pos.y < 0.4 && p.vel.y < 0;
      run(p, world, 1, nearGround && !landedJump ? frame({ pressed: ["jump"] }) : frame());
      if (nearGround) landedJump = true;
      if (landedJump && p.vel.y > 1) break;
    }
    expect(p.vel.y).toBeGreaterThan(1);
  });

  it("allows a coyote-time jump just after running off an edge", () => {
    const { world, p } = player([0, 2.6, 11]);
    // Walk off the south edge of the wall top.
    let left = -1;
    for (let i = 0; i < 120 && left < 0; i++) {
      run(p, world, 1, frame({ move: [0, -1] }), 0);
      if (!p.grounded) left = i;
    }
    expect(left).toBeGreaterThan(-1);
    const coyoteFrames = Math.floor(TUNING.player.coyoteTime / DT) - 2;
    run(p, world, coyoteFrames, frame({ move: [0, -1] }));
    run(p, world, 1, frame({ pressed: ["jump"] }));
    expect(p.vel.y).toBeGreaterThan(5);
  });

  it("is blocked by walls", () => {
    const { world, p } = player([0, 0, 8]);
    run(p, world, 120, frame({ move: [0, 1] }));
    expect(p.pos.z).toBeLessThan(10 - TUNING.player.radius + 0.01);
  });
});

describe("climbing", () => {
  it("grabs a ledge when jumping at a wall, shimmies and climbs up", () => {
    const { world, p } = player([0, 0, 9.2]);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    for (let i = 0; i < 60 && p.mode !== "hang"; i++) run(p, world, 1, frame({ move: [0, 1] }));
    expect(p.mode).toBe("hang");
    const x0 = p.pos.x;
    run(p, world, 60, frame({ move: [1, 0] }));
    expect(p.pos.x).toBeGreaterThan(x0 + 1);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    expect(p.mode).toBe("climbUp");
    run(p, world, 60, frame());
    expect(p.mode).toBe("ground");
    expect(p.pos.y).toBeCloseTo(2.6, 2);
  });

  it("drops from a ledge with crouch", () => {
    const { world, p } = player([0, 0, 9.2]);
    run(p, world, 1, frame({ pressed: ["jump"], move: [0, 1] }));
    for (let i = 0; i < 60 && p.mode !== "hang"; i++) run(p, world, 1, frame({ move: [0, 1] }));
    run(p, world, 1, frame({ pressed: ["crouch"] }));
    expect(p.mode).toBe("air");
    run(p, world, 90, frame());
    expect(p.grounded).toBe(true);
  });
});

describe("traversal tools", () => {
  it("swings on a rope and can let go with momentum", () => {
    const { world, p } = player([15, 4.2, 0.8]);
    p.mode = "air";
    p.grounded = false;
    run(p, world, 10, frame());
    expect(p.mode).toBe("rope");
    run(p, world, 90, frame({ move: [0, 1] }));
    run(p, world, 1, frame({ pressed: ["jump"] }));
    expect(p.mode).toBe("air");
  });

  it("rides a zipline to the end", () => {
    const { world, p } = player([-20, 4, -20.5]);
    run(p, world, 5, frame());
    expect(p.tryZipFromGround(world)).toBe(true);
    expect(p.mode).toBe("zip");
    run(p, world, 200, frame());
    expect(p.pos.z).toBeGreaterThan(-3);
  });

  it("rolls with invulnerability frames", () => {
    const { world, p } = player([0, 0, -20]);
    run(p, world, 1, frame({ pressed: ["coverRoll"], move: [0, 1] }));
    expect(p.mode).toBe("roll");
    expect(p.iFrames).toBeGreaterThan(0);
    run(p, world, 60, frame());
    expect(p.mode).toBe("ground");
  });

  it("snaps into low cover and crouches", () => {
    const { world, p } = player([-10, 0, -1.2]);
    run(p, world, 1, frame({ pressed: ["coverRoll"], move: [0, 1] }));
    expect(p.mode).toBe("cover");
    expect(p.crouched).toBe(true);
    run(p, world, 1, frame({ pressed: ["coverRoll"] }));
    expect(p.mode).not.toBe("cover");
  });
});
