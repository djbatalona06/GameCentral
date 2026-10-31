// The player's body: walking, jumping, climbing, ropes, ziplines, beams, swimming, sliding,
// rolling, cover and crate pushing. Combat actions live in GameSim, which reads this state.
//
// The controller is a state machine: `mode` says what the body is doing and each mode has
// its own update function. Transitions happen in one place per mode so they are easy to follow.

import { TUNING } from "../../config/tuning";
import type { InputFrame } from "../../input/actions";
import {
  type V3,
  add,
  angleDiff,
  approach,
  clamp,
  closestOnSegment,
  cross,
  dist,
  dot,
  len,
  lenXZ,
  norm,
  scale,
  sub,
  v3,
  yawDir,
  yawOf,
} from "../math";
import type { Aabb, RuntimeBox, RuntimeCrate, RuntimeLedge, World } from "../world/World";
import type { BeamDef, ClimbWallDef, RopeDef, ZiplineDef } from "../world/types";

const P = TUNING.player;
const C = TUNING.climb;
const T = TUNING.traversal;

export type PlayerMode =
  | "ground"
  | "air"
  | "hang"
  | "ledgeHop"
  | "climbUp"
  | "wall"
  | "rope"
  | "zip"
  | "swim"
  | "slide"
  | "roll"
  | "cover"
  | "crate"
  | "locked"
  /** Riding the jeep; GameSim places the player in the seat every step. */
  | "vehicle"
  | "dead";

export type PlayerEventType =
  | "jump"
  | "land"
  | "hardLand"
  | "grab"
  | "climbUp"
  | "ledgeHop"
  | "roll"
  | "rope"
  | "ropeRelease"
  | "zip"
  | "splash"
  | "crumble"
  | "fatalFall"
  | "wallJump"
  | "coverIn"
  | "coverOut"
  | "step"
  | "beamFall"
  | "sprintStep";

export interface PlayerEvent {
  type: PlayerEventType;
  pos: V3;
}

export interface CoverState {
  box: Aabb;
  normal: V3; // outward from the cover face
  low: boolean;
  atLeftEdge: boolean;
  atRightEdge: boolean;
  peekOffset: number; // sideways step-out when peeking around high cover
}

export interface PlayerAssists {
  autoTraversal: boolean;
  holdToToggle: boolean;
}

export class PlayerController {
  pos: V3;
  vel: V3 = v3();
  yaw: number;
  mode: PlayerMode = "ground";
  crouched = false;
  sprinting = false;
  grounded = true;
  height: number = P.height;

  coyote = 0;
  jumpBuffer = 0;
  regrabCooldown = 0;
  landRecover = 0;
  rollTimer = 0;
  rollCooldown = 0;
  iFrames = 0;
  lockTimer = 0;
  stepTimer = 0;
  airTime = 0;

  ledge: RuntimeLedge | null = null;
  ledgeT = 0;
  hop: { from: V3; to: V3; t: number; dur: number; ledge: RuntimeLedge; ledgeT: number } | null = null;
  climbUp: { from: V3; to: V3; t: number } | null = null;
  wall: ClimbWallDef | null = null;
  rope: { def: RopeDef; length: number; hand: V3; vel: V3 } | null = null;
  zip: { def: ZiplineDef; t: number } | null = null;
  beam: BeamDef | null = null;
  beamSway = 0;
  cover: CoverState | null = null;
  crate: { crate: RuntimeCrate; axis: "x" | "z"; sign: number } | null = null;
  lastWall: { box: RuntimeBox | null; normal: V3; time: number } | null = null;
  inWater = false;
  inGrass = false;

  readonly events: PlayerEvent[] = [];
  private beamPhase = 0;

  constructor(pos: V3, yaw: number) {
    this.pos = { ...pos };
    this.yaw = yaw;
  }

  teleport(pos: V3, yaw: number): void {
    this.pos = { ...pos };
    this.yaw = yaw;
    this.vel = v3();
    this.mode = "ground";
    this.ledge = null;
    this.hop = null;
    this.climbUp = null;
    this.wall = null;
    this.rope = null;
    this.zip = null;
    this.cover = null;
    this.crate = null;
    this.crouched = false;
    this.lockTimer = 0;
    this.landRecover = 0;
  }

  get hanging(): boolean {
    return this.mode === "hang" || this.mode === "rope" || this.mode === "zip" || this.mode === "wall";
  }

  /** Point at the centre of the chest: used for enemy aim and line-of-sight. */
  chest(): V3 {
    return { x: this.pos.x, y: this.pos.y + this.height * 0.6, z: this.pos.z };
  }

  head(): V3 {
    return { x: this.pos.x, y: this.pos.y + this.height - 0.15, z: this.pos.z };
  }

  aabb(at: V3 = this.pos, h = this.height): Aabb {
    const r = P.radius;
    return { min: { x: at.x - r, y: at.y, z: at.z - r }, max: { x: at.x + r, y: at.y + h, z: at.z + r } };
  }

  private emit(type: PlayerEventType): void {
    this.events.push({ type, pos: { ...this.pos } });
  }

  /** Converts the movement stick into a world-space direction relative to the camera. */
  static wishDir(input: InputFrame, camYaw: number): { dir: V3; mag: number } {
    const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
    if (mag < 0.08) return { dir: v3(), mag: 0 };
    const f = yawDir(camYaw);
    const r = { x: f.z, y: 0, z: -f.x };
    const d = add(scale(f, input.move.y), scale(r, input.move.x));
    return { dir: norm(d), mag };
  }

  update(dt: number, input: InputFrame, camYaw: number, world: World, aiming: boolean, assists: PlayerAssists): void {
    this.regrabCooldown = Math.max(0, this.regrabCooldown - dt);
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.landRecover = Math.max(0, this.landRecover - dt);
    this.jumpBuffer = input.buttons.jump.pressed ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt);

    const wish = PlayerController.wishDir(input, camYaw);
    this.inGrass = !!world.inVolume(world.data.grass, add(this.pos, { x: 0, y: 0.3, z: 0 }));

    switch (this.mode) {
      case "ground":
      case "air":
        this.updateMove(dt, input, wish, camYaw, world, aiming, assists);
        break;
      case "hang":
        this.updateHang(dt, input, wish, camYaw, world, assists);
        break;
      case "ledgeHop":
        this.updateHop(dt);
        break;
      case "climbUp":
        this.updateClimbUp(dt);
        break;
      case "wall":
        this.updateWall(dt, input, camYaw, world);
        break;
      case "rope":
        this.updateRope(dt, input, wish, world, assists);
        break;
      case "zip":
        this.updateZip(dt, input, world);
        break;
      case "swim":
        this.updateSwim(dt, input, wish, world);
        break;
      case "slide":
        this.updateSlide(dt, input, wish, world);
        break;
      case "roll":
        this.updateRoll(dt, world);
        break;
      case "cover":
        this.updateCover(dt, input, wish, camYaw, world, aiming);
        break;
      case "crate":
        this.updateCrate(dt, input, wish, world);
        break;
      case "locked":
        this.lockTimer -= dt;
        if (this.lockTimer <= 0) this.mode = "ground";
        break;
      case "vehicle":
      case "dead":
        break;
    }

    if (this.pos.y < world.data.killY && this.mode !== "dead") {
      this.mode = "dead";
      this.emit("fatalFall");
    }
  }

  // ---------------------------------------------------------------- ground + air

  private updateMove(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, camYaw: number, world: World, aiming: boolean, assists: PlayerAssists): void {
    const b = input.buttons;
    const water = world.inVolume(world.data.water, add(this.pos, { x: 0, y: 0.05, z: 0 }));
    this.inWater = !!water;

    if (this.grounded) {
      if (b.crouch.pressed) this.tryCrouch(!this.crouched, world);
      const sprintHeld = b.sprint.held;
      this.sprinting = sprintHeld && wish.mag > 0.5 && !aiming && !this.crouched && !this.inWater;
      if (this.sprinting && this.crouched) this.tryCrouch(false, world);
    } else {
      this.sprinting = false;
    }

    let speed: number = wish.mag < P.walkThreshold ? P.walkSpeed * (wish.mag / P.walkThreshold) : P.runSpeed;
    if (this.sprinting) speed = P.sprintSpeed;
    if (this.crouched) speed = Math.min(speed, P.crouchSpeed);
    if (aiming) speed = Math.min(speed, P.aimMoveSpeed);
    if (this.beam) speed = Math.min(speed, P.walkSpeed);
    if (this.inWater) speed *= 0.6;
    if (this.landRecover > 0) speed *= 0.3;

    const target = scale(wish.dir, speed);
    const accel = this.grounded ? P.groundAccel : P.airAccel;
    this.vel.x = approach(this.vel.x, target.x, accel * dt);
    this.vel.z = approach(this.vel.z, target.z, accel * dt);

    // Face movement direction, or the camera when aiming.
    const faceYaw = aiming ? camYaw : wish.mag > 0 ? yawOf(wish.dir) : this.yaw;
    this.yaw += angleDiff(this.yaw, faceYaw) * Math.min(1, P.turnRate * dt);

    // Jumping, with coyote time and input buffering.
    if (this.grounded) this.coyote = P.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0) {
      if (this.grounded || this.coyote > 0) {
        if (this.tryAttachWall(world, true)) {
          this.jumpBuffer = 0;
          return;
        } else {
          this.vel.y = P.jumpVelocity;
          this.grounded = false;
          this.coyote = 0;
          this.jumpBuffer = 0;
          if (this.crouched) this.tryCrouch(false, world);
          this.mode = "air";
          this.emit("jump");
        }
      } else if (this.lastWall && this.lastWall.box?.wallJump && this.lastWall.time < 0.15) {
        const n = this.lastWall.normal;
        this.vel = { x: n.x * C.wallJumpVelocity.h, y: C.wallJumpVelocity.v, z: n.z * C.wallJumpVelocity.h };
        this.yaw = yawOf(n);
        this.jumpBuffer = 0;
        this.lastWall = null;
        this.emit("wallJump");
      }
    }

    // Roll or take cover.
    if (b.coverRoll.pressed && this.grounded) {
      if (!this.tryEnterCover(world, wish.dir, camYaw)) this.startRoll(wish.mag > 0 ? wish.dir : yawDir(this.yaw));
      if (this.mode !== "ground" && this.mode !== "air") return;
    }

    // Grab a crate to push or pull it.
    if (b.interact.held && this.grounded && !aiming && this.tryGrabCrate(world)) return;

    // Gravity.
    if (!this.grounded) {
      this.vel.y = Math.max(-TUNING.sim.maxFallSpeed, this.vel.y - TUNING.sim.gravity * dt);
      this.airTime += dt;
    }

    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    this.moveAndCollide(scale(this.vel, dt), world);

    if (this.grounded && !wasGrounded) {
      this.airTime = 0;
      if (fallSpeed > P.fatalFallSpeed) {
        this.mode = "dead";
        this.emit("fatalFall");
        return;
      }
      if (fallSpeed > P.hardLandingSpeed) {
        this.landRecover = P.hardLandingRecovery;
        this.emit("hardLand");
      } else this.emit("land");
    }
    this.mode = this.grounded ? "ground" : "air";

    // Footsteps (for audio and enemy hearing).
    if (this.grounded && lenXZ(this.vel) > 0.5) {
      this.stepTimer -= dt * lenXZ(this.vel);
      if (this.stepTimer <= 0) {
        this.stepTimer = 1.6;
        this.emit(this.sprinting ? "sprintStep" : "step");
      }
    }

    // Beam balancing.
    this.updateBeam(dt, input, camYaw, world, assists);
    if ((this.mode as PlayerMode) !== "ground" && (this.mode as PlayerMode) !== "air") return;

    // Swimming in deep water.
    if (water && this.pos.y < water.max.y - 1.15) {
      this.mode = "swim";
      this.vel.y = 0;
      this.crouched = false;
      this.height = P.height;
      this.emit("splash");
      return;
    }

    // Steep slide ramps.
    if (this.grounded) {
      const g = world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.05, P.radius);
      if (g.ramp?.slide && Math.abs(g.y - this.pos.y) < 0.1) {
        this.mode = "slide";
        return;
      }
    }

    if (!this.grounded && this.regrabCooldown <= 0) {
      if (this.tryGrabLedge(world, wish.dir)) return;
      if (this.tryAttachWall(world, false)) return;
      if (this.tryGrabRope(world)) return;
    }
    if (!this.grounded && (input.buttons.interact.pressed || input.buttons.jump.pressed)) this.tryZip(world);
  }

  private tryCrouch(want: boolean, world: World): void {
    if (want) {
      this.crouched = true;
      this.height = P.crouchHeight;
    } else {
      if (world.overlapsSolid(this.aabb(this.pos, P.height))) return;
      this.crouched = false;
      this.height = P.height;
    }
  }

  /**
   * Moves the player's box through the world one axis at a time and resolves collisions.
   * Handles stepping up small ledges and snapping down onto slopes and stairs.
   */
  moveAndCollide(delta: V3, world: World): void {
    const r = P.radius;
    // If something left us inside geometry (a crate, a revealed wall), pop up onto it.
    const stuck = world.overlapsSolid(this.aabb());
    if (stuck && stuck.max.y - this.pos.y < 1.0 && !world.overlapsSolid(this.aabb({ ...this.pos, y: stuck.max.y + 1e-3 }))) {
      this.pos.y = stuck.max.y + 1e-3;
    }
    if (this.lastWall) this.lastWall.time += 1 / TUNING.sim.hz;
    for (const ax of ["x", "z"] as const) {
      if (Math.abs(delta[ax]) < 1e-7) continue;
      this.pos[ax] += delta[ax];
      for (let i = 0; i < 3; i++) {
        const hit = world.overlapsSolid(this.aabb());
        if (!hit) break;
        const rise = hit.max.y - this.pos.y;
        if (this.grounded && rise > 0 && rise <= P.stepHeight) {
          const up = { ...this.pos, y: hit.max.y + 1e-3 };
          if (!world.overlapsSolid(this.aabb(up))) {
            this.pos.y = up.y;
            continue;
          }
        }
        const sign = Math.sign(delta[ax]);
        this.pos[ax] = sign > 0 ? hit.min[ax] - r - 1e-3 : hit.max[ax] + r + 1e-3;
        this.vel[ax] = 0;
        const normal = v3();
        normal[ax] = -sign;
        const box = world.boxes.find((b) => b === hit) ?? null;
        this.lastWall = { box, normal, time: 0 };
      }
    }

    const prevY = this.pos.y;
    this.pos.y += delta.y;
    if (delta.y > 0) {
      const hit = world.overlapsSolid(this.aabb());
      if (hit) {
        this.pos.y = hit.min.y - this.height - 1e-3;
        this.vel.y = 0;
      }
    }
    const probeFrom = Math.max(prevY, this.pos.y) + 0.02;
    const ground = world.groundHeight(this.pos.x, this.pos.z, probeFrom, r);
    const snap = this.grounded && delta.y <= 0 ? P.stepHeight : 0;
    if (this.pos.y <= ground.y + snap && this.vel.y <= 0.01) {
      this.pos.y = ground.y;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  // ---------------------------------------------------------------- ledges

  private findLedge(world: World, from: V3, filter: (l: RuntimeLedge, point: V3, t: number) => boolean): { ledge: RuntimeLedge; t: number; point: V3 } | null {
    let best: { ledge: RuntimeLedge; t: number; point: V3; score: number } | null = null;
    for (const l of world.activeLedges()) {
      const { point, t } = closestOnSegment({ x: from.x, y: l.a.y, z: from.z }, l.a, l.b);
      if (!filter(l, point, t)) continue;
      const score = dist(point, from);
      if (!best || score < best.score) best = { ledge: l, t, point, score };
    }
    return best;
  }

  private tryGrabLedge(world: World, wishDir: V3): boolean {
    if (this.vel.y > 2.5) return false;
    const hand = this.pos.y + C.handHeight;
    const found = this.findLedge(world, this.pos, (l, point) => {
      const dy = l.a.y - hand;
      if (dy > C.grabReachUp || dy < -C.grabReachDown) return false;
      const off = sub({ x: this.pos.x, y: l.a.y, z: this.pos.z }, point);
      const along = dot(off, l.normal);
      const lateral = len(sub(off, scale(l.normal, along)));
      if (lateral > 0.05) return false;
      if (along < 0.05 || along > C.hangOffset + C.grabDistance) return false;
      // Don't grab a ledge we're moving away from unless we're falling onto it.
      const moving = dot(norm({ x: this.vel.x, y: 0, z: this.vel.z }), l.normal);
      const pushing = dot(wishDir, l.normal);
      return !(moving > 0.5 && pushing > 0.3);
    });
    if (!found) return false;
    this.attachLedge(found.ledge, found.t);
    this.emit("grab");
    return true;
  }

  private attachLedge(l: RuntimeLedge, t: number): void {
    this.ledge = l;
    this.ledgeT = t;
    this.mode = "hang";
    this.vel = v3();
    this.grounded = false;
    this.crouched = false;
    this.height = P.height;
    this.cover = null;
    this.placeOnLedge();
  }

  private ledgePoint(l: RuntimeLedge, t: number): V3 {
    return add(l.a, scale(sub(l.b, l.a), t));
  }

  private hangPos(l: RuntimeLedge, t: number): V3 {
    const p = this.ledgePoint(l, t);
    return { x: p.x + l.normal.x * C.hangOffset, y: p.y - C.handHeight, z: p.z + l.normal.z * C.hangOffset };
  }

  private placeOnLedge(): void {
    if (!this.ledge) return;
    this.pos = this.hangPos(this.ledge, this.ledgeT);
    this.yaw = yawOf(scale(this.ledge.normal, -1));
  }

  private updateHang(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, camYaw: number, world: World, assists: PlayerAssists): void {
    const l = this.ledge;
    if (!l || l.removed) {
      this.release();
      return;
    }
    if (l.crumble) {
      l.crumbleTimer += dt;
      if (l.crumbleTimer > C.crumbleTime) {
        l.removed = true;
        world.revision++;
        this.emit("crumble");
        this.release();
        return;
      }
    }

    const tangent = norm(sub(l.b, l.a));
    const segLen = dist(l.a, l.b);
    const along = dot(wish.dir, tangent) * wish.mag;
    // "Up" on the stick means toward the wall in screen space; use the camera forward against the ledge normal.
    const fwd = yawDir(camYaw);
    const stickUp = input.move.y * -dot(fwd, l.normal) + input.move.x * -dot({ x: fwd.z, y: 0, z: -fwd.x }, l.normal);

    // Shimmy along the ledge and transfer to connected ledges at the ends.
    if (Math.abs(along) > 0.2) {
      const step = (along * C.shimmySpeed * dt) / Math.max(segLen, 0.01);
      let nt = this.ledgeT + step;
      if (nt < 0 || nt > 1) {
        const endPoint = nt < 0 ? l.a : l.b;
        const next = world.activeLedges().find((o) => o !== l && Math.abs(o.a.y - l.a.y) < 0.3 && (dist(o.a, endPoint) < 0.7 || dist(o.b, endPoint) < 0.7));
        if (next) {
          const t0 = dist(next.a, endPoint) < dist(next.b, endPoint) ? 0.02 : 0.98;
          this.ledge = next;
          this.ledgeT = t0;
          this.placeOnLedge();
          return;
        }
        nt = clamp(nt, 0, 1);
      }
      const candidate = this.hangPos(l, nt);
      if (!world.overlapsSolid(this.aabb(candidate))) this.ledgeT = nt;
      this.placeOnLedge();
    }

    const b = input.buttons;
    if (b.crouch.pressed || b.coverRoll.pressed) {
      this.release();
      return;
    }
    if (this.jumpBuffer <= 0) return;
    this.jumpBuffer = 0;

    const lp = this.ledgePoint(l, this.ledgeT);
    // Back-eject: jump away from the wall.
    if (stickUp < -0.5) {
      const away = l.normal;
      this.release();
      this.vel = { x: away.x * C.backEjectVelocity.h, y: C.backEjectVelocity.v, z: away.z * C.backEjectVelocity.h };
      this.yaw = yawOf(away);
      this.emit("jump");
      return;
    }

    // Directional ledge-to-ledge hop.
    let dir: V3;
    if (Math.abs(along) > 0.35) dir = add(scale(tangent, Math.sign(along)), { x: 0, y: stickUp > 0.35 ? 0.8 : 0, z: 0 });
    else if (stickUp < -0.2) dir = { x: 0, y: -1, z: 0 };
    else dir = { x: 0, y: 1, z: 0 };
    dir = norm(dir);
    const target = this.findHopTarget(world, l, lp, dir, assists.autoTraversal && wish.mag < 0.2);
    if (target) {
      this.hop = { from: { ...this.pos }, to: this.hangPos(target.ledge, target.t), t: 0, dur: 0.32, ledge: target.ledge, ledgeT: target.t };
      this.mode = "ledgeHop";
      this.emit("ledgeHop");
      return;
    }

    // Climb up onto the top if there is room.
    if (dir.y > 0) {
      const top = { x: lp.x - l.normal.x * (P.radius + 0.12), y: lp.y + 0.01, z: lp.z - l.normal.z * (P.radius + 0.12) };
      const groundTop = world.groundHeight(top.x, top.z, top.y + 0.05, P.radius);
      if (!world.overlapsSolid(this.aabb(top, P.height)) && Math.abs(groundTop.y - lp.y) < 0.3) {
        this.climbUp = { from: { ...this.pos }, to: top, t: 0 };
        this.mode = "climbUp";
        this.emit("climbUp");
      } else if (!world.overlapsSolid(this.aabb(top, P.crouchHeight)) && Math.abs(groundTop.y - lp.y) < 0.3) {
        this.climbUp = { from: { ...this.pos }, to: top, t: 0 };
        this.mode = "climbUp";
        this.crouched = true;
        this.emit("climbUp");
      }
    }
  }

  private findHopTarget(world: World, current: RuntimeLedge, from: V3, dir: V3, anyDirection: boolean): { ledge: RuntimeLedge; t: number } | null {
    let best: { ledge: RuntimeLedge; t: number; score: number } | null = null;
    for (const l of world.activeLedges()) {
      if (l === current) continue;
      const { point, t } = closestOnSegment(from, l.a, l.b);
      const d = sub(point, from);
      const dl = len(d);
      if (dl < 0.3) continue;
      const horiz = Math.hypot(d.x, d.z);
      if (d.y > C.ledgeJumpUp || d.y < -C.ledgeJumpUp - 0.5 || horiz > C.ledgeJumpSide) continue;
      if (dot(l.normal, current.normal) < 0.2) continue;
      const along = dot(norm(d), dir);
      if (!anyDirection && along < 0.55) continue;
      const score = anyDirection ? dl - d.y : dl * (2 - along);
      if (!best || score < best.score) best = { ledge: l, t, score };
    }
    return best ? { ledge: best.ledge, t: best.t } : null;
  }

  private updateHop(dt: number): void {
    const h = this.hop;
    if (!h) {
      this.mode = "air";
      return;
    }
    h.t += dt / h.dur;
    const t = Math.min(1, h.t);
    const arc = Math.sin(t * Math.PI) * 0.35;
    this.pos = { x: h.from.x + (h.to.x - h.from.x) * t, y: h.from.y + (h.to.y - h.from.y) * t + arc, z: h.from.z + (h.to.z - h.from.z) * t };
    if (t >= 1) {
      this.hop = null;
      this.attachLedge(h.ledge, h.ledgeT);
      this.emit("grab");
    }
  }

  private updateClimbUp(dt: number): void {
    const c = this.climbUp;
    if (!c) {
      this.mode = "ground";
      return;
    }
    c.t += dt / C.climbUpTime;
    const t = Math.min(1, c.t);
    // Up first, then over the lip.
    const up = Math.min(1, t * 1.6);
    const over = Math.max(0, (t - 0.45) / 0.55);
    this.pos = { x: c.from.x + (c.to.x - c.from.x) * over, y: c.from.y + (c.to.y - c.from.y) * up, z: c.from.z + (c.to.z - c.from.z) * over };
    if (t >= 1) {
      this.pos = { ...c.to };
      this.climbUp = null;
      this.ledge = null;
      this.mode = "ground";
      this.grounded = true;
      this.height = this.crouched ? P.crouchHeight : P.height;
    }
  }

  release(): void {
    if (this.ledge) {
      this.pos = add(this.pos, scale(this.ledge.normal, 0.08));
    }
    this.ledge = null;
    this.wall = null;
    this.mode = "air";
    this.grounded = false;
    this.regrabCooldown = C.regrabCooldown;
  }

  // ---------------------------------------------------------------- free-climb walls

  private tryAttachWall(world: World, fromGround: boolean): boolean {
    for (const w of world.data.climbWalls) {
      const n = w.normal;
      const face = n.x !== 0 ? (n.x > 0 ? w.max.x : w.min.x) : n.z > 0 ? w.max.z : w.min.z;
      const d = n.x !== 0 ? (this.pos.x - face) * Math.sign(n.x) : (this.pos.z - face) * Math.sign(n.z);
      if (d < 0 || d > 0.75) continue;
      const lateral = n.x !== 0 ? this.pos.z : this.pos.x;
      const lo = n.x !== 0 ? w.min.z : w.min.x;
      const hi = n.x !== 0 ? w.max.z : w.max.x;
      if (lateral < lo || lateral > hi) continue;
      const hand = this.pos.y + C.handHeight * 0.8;
      if (hand < w.min.y || this.pos.y > w.max.y - 1) continue;
      const facing = dot(yawDir(this.yaw), n) < -0.5;
      if (fromGround && !facing) continue;
      this.wall = w;
      this.mode = "wall";
      this.vel = v3();
      this.grounded = false;
      this.yaw = yawOf(scale(n, -1));
      this.pos = n.x !== 0 ? { ...this.pos, x: face + n.x * C.hangOffset } : { ...this.pos, z: face + n.z * C.hangOffset };
      this.emit("grab");
      return true;
    }
    return false;
  }

  private updateWall(dt: number, input: InputFrame, camYaw: number, world: World): void {
    const w = this.wall;
    if (!w) {
      this.release();
      return;
    }
    const n = w.normal;
    const right = cross({ x: 0, y: 1, z: 0 }, scale(n, -1)); // player's right while facing the wall
    const fwd = yawDir(camYaw);
    const camRight = { x: fwd.z, y: 0, z: -fwd.x };
    const lateralInput = input.move.x * dot(camRight, right) + input.move.y * dot(fwd, right);
    const up = input.move.y;
    const move = add(scale(right, lateralInput * C.wallClimbSpeed * dt), { x: 0, y: up * C.wallClimbSpeed * dt, z: 0 });
    const next = add(this.pos, move);
    const lateral = n.x !== 0 ? next.z : next.x;
    const lo = (n.x !== 0 ? w.min.z : w.min.x) + 0.3;
    const hi = (n.x !== 0 ? w.max.z : w.max.x) - 0.3;
    if (lateral >= lo && lateral <= hi && !world.overlapsSolid(this.aabb(next))) this.pos = next;

    const b = input.buttons;
    if (b.crouch.pressed || b.coverRoll.pressed) {
      this.release();
      return;
    }
    // Reached the bottom: stand on the ground.
    const g = world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.05, P.radius);
    if (up < 0 && this.pos.y - g.y < 0.05) {
      this.pos.y = g.y;
      this.wall = null;
      this.mode = "ground";
      this.grounded = true;
      return;
    }
    // Reached the top: climb over if there is a ledge-like top.
    if (this.pos.y + C.handHeight >= w.max.y - 0.05) {
      this.pos.y = Math.min(this.pos.y, w.max.y - C.handHeight);
      const top = add({ ...this.pos, y: w.max.y + 0.01 }, scale(n, -(C.hangOffset + P.radius + 0.15)));
      if (up > 0.3 && !world.overlapsSolid(this.aabb(top))) {
        this.climbUp = { from: { ...this.pos }, to: top, t: 0 };
        this.wall = null;
        this.mode = "climbUp";
        this.emit("climbUp");
        return;
      }
    }
    if (this.jumpBuffer > 0) {
      this.jumpBuffer = 0;
      if (up < -0.3 || (Math.abs(lateralInput) < 0.2 && input.move.y < -0.3)) {
        this.release();
        this.vel = { x: n.x * C.backEjectVelocity.h, y: C.backEjectVelocity.v, z: n.z * C.backEjectVelocity.h };
        this.yaw = yawOf(n);
        this.emit("jump");
      } else {
        // Lunge upward along the wall.
        const lunge = add(this.pos, { x: 0, y: 0.9, z: 0 });
        if (lunge.y + C.handHeight <= w.max.y && !world.overlapsSolid(this.aabb(lunge))) this.pos = lunge;
      }
    }
  }

  // ---------------------------------------------------------------- ropes and grapples

  private tryGrabRope(world: World): boolean {
    const hand = add(this.pos, { x: 0, y: C.handHeight, z: 0 });
    for (const r of world.data.ropes) {
      if (r.grapple) continue;
      const bottom = { x: r.anchor.x, y: r.anchor.y - r.length, z: r.anchor.z };
      const { point } = closestOnSegment(hand, r.anchor, bottom);
      if (dist(point, hand) < T.ropeGrabDistance) {
        this.attachRope(r, Math.max(1.5, dist(r.anchor, hand)));
        return true;
      }
    }
    return false;
  }

  /** Grapple anchors within range and line of sight, closest first. */
  grappleTarget(world: World): RopeDef | null {
    if (this.mode !== "air" && this.mode !== "ground") return null;
    const hand = add(this.pos, { x: 0, y: C.handHeight, z: 0 });
    let best: RopeDef | null = null;
    let bestD = Infinity;
    for (const r of world.data.ropes) {
      if (!r.grapple) continue;
      const d = dist(r.anchor, hand);
      if (d > T.grappleRange || r.anchor.y < hand.y + 1) continue;
      if (!world.lineOfSight(hand, sub(r.anchor, scale(norm(sub(r.anchor, hand)), 0.3)))) continue;
      if (d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return best;
  }

  attachRope(r: RopeDef, length: number): void {
    const hand = add(this.pos, { x: 0, y: C.handHeight, z: 0 });
    this.rope = { def: r, length: Math.min(length, r.grapple ? T.grappleRange : r.length), hand, vel: { ...this.vel } };
    this.mode = "rope";
    this.grounded = false;
    this.cover = null;
    this.emit("rope");
  }

  private updateRope(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, world: World, assists: PlayerAssists): void {
    const rp = this.rope;
    if (!rp) {
      this.release();
      return;
    }
    const a = rp.def.anchor;
    // Pump: push in the stick direction; auto-traversal pumps along the current swing.
    let pump = scale(wish.dir, wish.mag * T.ropePumpAccel);
    if (assists.autoTraversal && wish.mag < 0.1) {
      const hv = { x: rp.vel.x, y: 0, z: rp.vel.z };
      if (lenXZ(hv) > 0.3) pump = scale(norm(hv), T.ropePumpAccel * 0.8);
    }
    rp.vel.x += pump.x * dt;
    rp.vel.z += pump.z * dt;
    rp.vel.y -= TUNING.sim.gravity * dt;
    rp.vel = scale(rp.vel, 1 - T.ropeDamping * dt);
    let next = add(rp.hand, scale(rp.vel, dt));
    const radial = norm(sub(next, a));
    next = add(a, scale(radial, rp.length));
    // Remove radial velocity so the rope acts like a rigid pendulum.
    const vr = dot(rp.vel, radial);
    if (vr > 0) rp.vel = sub(rp.vel, scale(radial, vr));
    rp.hand = next;
    const body = { x: next.x, y: next.y - C.handHeight, z: next.z };
    if (world.overlapsSolid(this.aabb(body))) {
      rp.vel = scale(rp.vel, -0.3);
    } else {
      this.pos = body;
    }
    if (lenXZ(rp.vel) > 0.4) this.yaw = yawOf(rp.vel);

    // Climb up/down the rope with the crouch/jump-less stick when barely swinging.
    if (input.buttons.jump.pressed) {
      const v = scale(rp.vel, T.ropeReleaseBoost);
      this.rope = null;
      this.release();
      this.vel = { x: v.x, y: Math.max(v.y, 0) + 4.5, z: v.z };
      this.regrabCooldown = 0.45;
      this.emit("ropeRelease");
    } else if (input.buttons.crouch.pressed || input.buttons.coverRoll.pressed) {
      this.rope = null;
      this.release();
      this.vel = { ...rp.vel };
      this.regrabCooldown = 0.45;
    }
  }

  // ---------------------------------------------------------------- ziplines

  private tryZip(world: World): boolean {
    const hand = add(this.pos, { x: 0, y: C.handHeight, z: 0 });
    for (const z of world.data.ziplines) {
      const { point, t } = closestOnSegment(hand, z.a, z.b);
      if (t < 0.95 && dist(point, hand) < T.ziplineGrab) {
        this.zip = { def: z, t };
        this.mode = "zip";
        this.grounded = false;
        this.emit("zip");
        return true;
      }
    }
    return false;
  }

  /** Called from GameSim when the player presses interact near the start of a zipline. */
  tryZipFromGround(world: World): boolean {
    return this.tryZip(world);
  }

  private updateZip(dt: number, input: InputFrame, world: World): void {
    const z = this.zip;
    if (!z) {
      this.release();
      return;
    }
    const L = dist(z.def.a, z.def.b);
    z.t += (T.ziplineSpeed * dt) / L;
    const dir = norm(sub(z.def.b, z.def.a));
    const hand = add(z.def.a, scale(sub(z.def.b, z.def.a), Math.min(1, z.t)));
    const next = { x: hand.x, y: hand.y - C.handHeight, z: hand.z };
    this.yaw = yawOf(dir);
    // Stop before the body would clip into the ground or a wall near the end of the line.
    const body = world.overlapsSolid(this.aabb(next));
    if (!body) this.pos = next;
    if (z.t >= 1 || input.buttons.jump.pressed || input.buttons.crouch.pressed || body) {
      this.zip = null;
      this.release();
      this.vel = { x: dir.x * T.ziplineSpeed * 0.6, y: 1.5, z: dir.z * T.ziplineSpeed * 0.6 };
      this.regrabCooldown = 0.3;
    }
  }

  // ---------------------------------------------------------------- beams

  private updateBeam(dt: number, input: InputFrame, camYaw: number, world: World, assists: PlayerAssists): void {
    if (!this.grounded) {
      this.beam = null;
      return;
    }
    const onBeam = world.data.beams.find((bm) => {
      const { point } = closestOnSegment(this.pos, bm.a, bm.b);
      return Math.hypot(point.x - this.pos.x, point.z - this.pos.z) < 0.25 && Math.abs(point.y - this.pos.y) < 0.08;
    });
    if (!onBeam) {
      this.beam = null;
      this.beamSway = 0;
      return;
    }
    if (this.beam !== onBeam) {
      this.beam = onBeam;
      this.beamSway = 0;
    }
    if (assists.autoTraversal) {
      this.beamSway = 0;
      return;
    }
    // Sway grows over time in a wobbling pattern; pushing the stick sideways counters it.
    this.beamPhase += dt * 1.7;
    const tangent = norm(sub(onBeam.b, onBeam.a));
    const side = { x: tangent.z, y: 0, z: -tangent.x };
    const fwd = yawDir(camYaw);
    const camRight = { x: fwd.z, y: 0, z: -fwd.x };
    const counter = input.move.x * dot(camRight, side) + input.move.y * dot(fwd, side);
    const drift = Math.sin(this.beamPhase) * 0.6 + Math.sign(this.beamSway || 1) * 0.4;
    this.beamSway += (drift * T.beamSwayRate - counter * T.beamCounterRate) * dt;
    if (Math.abs(this.beamSway) > T.beamFallThreshold) {
      const s = Math.sign(this.beamSway);
      this.pos = add(this.pos, scale(side, s * 0.45));
      this.grounded = false;
      this.mode = "air";
      this.beam = null;
      this.beamSway = 0;
      this.emit("beamFall");
    }
  }

  // ---------------------------------------------------------------- swim, slide, roll

  private updateSwim(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, world: World): void {
    const water = world.inVolume(world.data.water, add(this.pos, { x: 0, y: 0.5, z: 0 }));
    if (!water) {
      this.mode = "air";
      return;
    }
    const target = scale(wish.dir, P.swimSpeed * wish.mag);
    this.vel.x = approach(this.vel.x, target.x, 6 * dt);
    this.vel.z = approach(this.vel.z, target.z, 6 * dt);
    if (wish.mag > 0) this.yaw += angleDiff(this.yaw, yawOf(wish.dir)) * Math.min(1, 6 * dt);
    const floatY = water.max.y - 1.35;
    this.vel.y = (floatY - this.pos.y) * 4;
    this.grounded = false;
    this.moveAndCollide(scale(this.vel, dt), world);
    const g = world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1.0, P.radius);
    if (g.y > water.max.y - 1.1) {
      this.pos.y = g.y;
      this.mode = "ground";
      this.grounded = true;
    }
    if (input.buttons.jump.pressed && this.regrabCooldown <= 0) {
      // Pull up onto a ledge next to the water.
      if (this.tryGrabLedge(world, wish.dir)) return;
    }
  }

  private updateSlide(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, world: World): void {
    const g = world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.3, P.radius);
    const rp = g.ramp;
    if (!rp?.slide) {
      this.mode = this.grounded ? "ground" : "air";
      return;
    }
    // Downhill is opposite to the rising direction.
    const down = rp.axis === "x" ? { x: -rp.dir, y: 0, z: 0 } : { x: 0, y: 0, z: -rp.dir };
    const side = { x: down.z, y: 0, z: -down.x };
    const steer = dot(wish.dir, side) * wish.mag;
    this.vel = add(scale(down, P.slideSpeed), scale(side, steer * P.slideSteer));
    this.vel.y = 0;
    this.yaw = yawOf(down);
    const next = add(this.pos, scale(this.vel, dt));
    this.moveAndCollide({ x: next.x - this.pos.x, y: 0, z: next.z - this.pos.z }, world);
    const h = world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.6, P.radius);
    if (h.y > -Infinity && h.ramp?.slide) {
      this.pos.y = h.y;
      this.grounded = true;
    }
    if (input.buttons.jump.pressed) {
      this.vel.y = P.jumpVelocity * 0.9;
      this.grounded = false;
      this.mode = "air";
      this.emit("jump");
    }
  }

  private startRoll(dir: V3): void {
    if (this.rollCooldown > 0) return;
    this.mode = "roll";
    this.rollTimer = P.rollDuration;
    this.iFrames = P.rollIFrames;
    this.vel = scale(norm(dir), P.rollSpeed);
    this.yaw = yawOf(dir);
    this.crouched = false;
    this.height = P.crouchHeight;
    this.emit("roll");
  }

  private updateRoll(dt: number, world: World): void {
    this.rollTimer -= dt;
    const k = Math.max(0, this.rollTimer / P.rollDuration);
    const v = scale({ x: this.vel.x, y: 0, z: this.vel.z }, 0.5 + 0.5 * k);
    this.moveAndCollide({ x: v.x * dt, y: -0.5 * dt, z: v.z * dt }, world);
    if (!this.grounded) {
      this.mode = "air";
      this.height = P.height;
      return;
    }
    if (this.rollTimer <= 0) {
      this.rollCooldown = P.rollCooldown;
      this.mode = "ground";
      if (!world.overlapsSolid(this.aabb(this.pos, P.height))) this.height = P.height;
      else {
        this.crouched = true;
      }
    }
  }

  // ---------------------------------------------------------------- cover

  /** Finds cover near the player and snaps to its closest face. */
  private tryEnterCover(world: World, wishDir: V3, camYaw: number): boolean {
    const look = lenXZ(wishDir) > 0.1 ? wishDir : yawDir(camYaw);
    let best: { box: RuntimeBox; normal: V3; d: number } | null = null;
    for (const b of world.boxes) {
      if (b.removed || !b.cover) continue;
      if (b.min.y > this.pos.y + 0.3 || b.max.y < this.pos.y + 0.8) continue;
      const faces: Array<{ normal: V3; d: number; lat: boolean }> = [
        { normal: { x: 1, y: 0, z: 0 }, d: this.pos.x - b.max.x, lat: this.pos.z >= b.min.z && this.pos.z <= b.max.z },
        { normal: { x: -1, y: 0, z: 0 }, d: b.min.x - this.pos.x, lat: this.pos.z >= b.min.z && this.pos.z <= b.max.z },
        { normal: { x: 0, y: 0, z: 1 }, d: this.pos.z - b.max.z, lat: this.pos.x >= b.min.x && this.pos.x <= b.max.x },
        { normal: { x: 0, y: 0, z: -1 }, d: b.min.z - this.pos.z, lat: this.pos.x >= b.min.x && this.pos.x <= b.max.x },
      ];
      for (const f of faces) {
        if (!f.lat || f.d < 0 || f.d > TUNING.cover.snapDistance) continue;
        if (dot(look, f.normal) > 0.3) continue; // must be looking or moving toward the face
        if (!best || f.d < best.d) best = { box: b, normal: f.normal, d: f.d };
      }
    }
    if (!best) return false;
    const n = best.normal;
    const r = P.radius + 0.06;
    const pos = { ...this.pos };
    if (n.x !== 0) pos.x = n.x > 0 ? best.box.max.x + r : best.box.min.x - r;
    else pos.z = n.z > 0 ? best.box.max.z + r : best.box.min.z - r;
    const low = best.box.max.y - this.pos.y < TUNING.cover.lowHeight + 0.2;
    this.cover = { box: best.box, normal: n, low, atLeftEdge: false, atRightEdge: false, peekOffset: 0 };
    this.pos = pos;
    this.mode = "cover";
    this.vel = v3();
    this.yaw = yawOf(n);
    this.crouched = low;
    this.height = low ? P.crouchHeight : P.height;
    this.emit("coverIn");
    return true;
  }

  exitCover(world: World): void {
    if (!this.cover) return;
    if (this.cover.peekOffset !== 0) {
      const right = { x: -this.cover.normal.z, y: 0, z: this.cover.normal.x };
      this.pos = add(this.pos, scale(right, -this.cover.peekOffset));
    }
    this.cover = null;
    this.mode = "ground";
    this.tryCrouch(false, world);
    this.emit("coverOut");
  }

  private updateCover(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, camYaw: number, world: World, aiming: boolean): void {
    const c = this.cover;
    if (!c || (c.box as RuntimeBox).removed) {
      this.cover = null;
      this.mode = "ground";
      this.tryCrouch(false, world);
      return;
    }
    const n = c.normal;
    // "Right" along the cover face from the player's point of view (back to the wall, facing away).
    const right = { x: -n.z, y: 0, z: n.x };
    const lateral = dot(wish.dir, right) * wish.mag;
    const away = dot(wish.dir, n) * wish.mag;

    if (input.buttons.coverRoll.pressed || (away > 0.85 && !aiming)) {
      this.exitCover(world);
      if (away > 0.85) this.startRoll(n);
      return;
    }
    if (this.jumpBuffer > 0 && c.low && !aiming) {
      // Vault over low cover.
      this.jumpBuffer = 0;
      const depth = n.x !== 0 ? c.box.max.x - c.box.min.x : c.box.max.z - c.box.min.z;
      const over = add(this.pos, scale(n, -(depth + P.radius * 2 + 0.2)));
      over.y = this.pos.y;
      this.cover = null;
      if (!world.overlapsSolid(this.aabb(over, P.height))) {
        this.climbUp = { from: { ...this.pos }, to: over, t: 0 };
        this.mode = "climbUp";
        this.crouched = false;
        this.emit("climbUp");
      } else {
        this.mode = "ground";
      }
      return;
    }

    // Peek: stand up behind low cover, or step out at an edge of high cover.
    const want = aiming ? 1 : 0;
    if (c.low) {
      this.crouched = !aiming;
      this.height = aiming ? P.height : P.crouchHeight;
    } else {
      let target = 0;
      if (want && c.atRightEdge) target = 0.6;
      else if (want && c.atLeftEdge) target = -0.6;
      const delta = approach(c.peekOffset, target, dt / TUNING.cover.peekTime * 0.6) - c.peekOffset;
      c.peekOffset += delta;
      this.pos = add(this.pos, scale(right, delta));
    }

    if (!aiming && Math.abs(lateral) > 0.2) {
      const step = lateral * TUNING.cover.moveSpeed * dt;
      const next = add(this.pos, scale(right, step));
      const lo = n.x !== 0 ? c.box.min.z : c.box.min.x;
      const hi = n.x !== 0 ? c.box.max.z : c.box.max.x;
      const latCoord = n.x !== 0 ? next.z : next.x;
      const margin = 0.15;
      if (latCoord > lo + margin && latCoord < hi - margin && !world.overlapsSolid(this.aabb(next))) this.pos = next;
    }
    const lo = n.x !== 0 ? c.box.min.z : c.box.min.x;
    const hi = n.x !== 0 ? c.box.max.z : c.box.max.x;
    const lat = (n.x !== 0 ? this.pos.z : this.pos.x) - c.peekOffset * (n.x !== 0 ? right.z : right.x);
    const rightSign = n.x !== 0 ? right.z : right.x;
    const nearHi = lat > hi - 0.45;
    const nearLo = lat < lo + 0.45;
    c.atRightEdge = rightSign > 0 ? nearHi : nearLo;
    c.atLeftEdge = rightSign > 0 ? nearLo : nearHi;
    this.yaw = aiming ? camYaw : yawOf(n);
  }

  // ---------------------------------------------------------------- crates

  private tryGrabCrate(world: World): boolean {
    for (const cr of world.crates) {
      const cx = (cr.min.x + cr.max.x) / 2;
      const cz = (cr.min.z + cr.max.z) / 2;
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const hx = (cr.max.x - cr.min.x) / 2 + P.radius + 0.25;
      const hz = (cr.max.z - cr.min.z) / 2 + P.radius + 0.25;
      if (Math.abs(dx) > hx || Math.abs(dz) > hz) continue;
      if (Math.abs(cr.min.y - this.pos.y) > 0.3) continue;
      const axis: "x" | "z" = Math.abs(dx) / hx > Math.abs(dz) / hz ? "x" : "z";
      const sign = Math.sign(axis === "x" ? dx : dz);
      this.crate = { crate: cr, axis, sign };
      this.mode = "crate";
      this.yaw = yawOf(axis === "x" ? { x: -sign, y: 0, z: 0 } : { x: 0, y: 0, z: -sign });
      return true;
    }
    return false;
  }

  private updateCrate(dt: number, input: InputFrame, wish: { dir: V3; mag: number }, world: World): void {
    const g = this.crate;
    if (!g || !input.buttons.interact.held) {
      this.crate = null;
      this.mode = "ground";
      return;
    }
    const axisDir = g.axis === "x" ? { x: -g.sign, y: 0, z: 0 } : { x: 0, y: 0, z: -g.sign };
    const amount = dot(wish.dir, axisDir) * wish.mag;
    if (Math.abs(amount) < 0.25) return;
    const step = Math.sign(amount) * T.cratePushSpeed * dt;
    const d = scale(axisDir, step);
    const cr = g.crate;
    const moved = { min: add(cr.min, d), max: add(cr.max, d) };
    const playerNext = add(this.pos, d);
    if (world.overlapsSolid(moved, cr)) return;
    const pBox = this.aabb(playerNext);
    if (world.overlapsSolid(pBox, cr) || (step < 0 && overlapsBox(pBox, moved))) return;
    cr.min = moved.min;
    cr.max = moved.max;
    // Let the crate drop if pushed off an edge.
    const cx = (cr.min.x + cr.max.x) / 2;
    const cz = (cr.min.z + cr.max.z) / 2;
    const save = world.crates;
    world.crates = save.filter((c) => c !== cr);
    const gy = world.groundHeight(cx, cz, cr.min.y + 0.01, 0).y;
    world.crates = save;
    if (gy < cr.min.y - 0.05 && isFinite(gy)) {
      const h = cr.max.y - cr.min.y;
      cr.min.y = gy;
      cr.max.y = gy + h;
      this.crate = null;
      this.mode = "ground";
    }
    this.pos = playerNext;
    world.revision++;
  }
}

const overlapsBox = (a: Aabb, b: Aabb): boolean =>
  a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y && a.min.z < b.max.z && a.max.z > b.min.z;
