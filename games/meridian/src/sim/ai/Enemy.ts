// One enemy and its brain. The brain is a finite state machine:
//
//   patrol ──(sees something)──▶ suspicious ──(meter full)──▶ combat
//     ▲  └──(hears a noise)──▶ investigate ──(finds player)──▶ combat
//     └────────── search ◀──(loses the player for a while)──┘
//
// In combat each archetype follows its squad role: suppressors hold cover and shoot when the
// squad director gives them a token, flankers circle around, rushers charge, snipers telegraph
// with a laser, grenadiers flush campers out of cover.

import { TUNING } from "../../config/tuning";
import { type V3, add, angleDiff, clamp01, dist, distXZ, dot, lerp, norm, scale, sub, yawOf } from "../math";
import { WEAPONS, type WeaponId } from "../combat/weapons";
import { ARCHETYPES, type Archetype, type ArchetypeId } from "./archetypes";
import { visibility, updateSuspicion, type Noise } from "./Perception";
import type { NavGrid } from "./NavGrid";
import type { SquadDirector } from "./SquadDirector";
import type { World, RuntimeBox } from "../world/World";
import type { EnemySpawnDef } from "../world/types";

const AI = TUNING.ai;

export type EnemyState = "patrol" | "suspicious" | "investigate" | "combat" | "search" | "stunned" | "dead";

export interface PlayerView {
  pos: V3;
  chest: V3;
  head: V3;
  crouched: boolean;
  inGrass: boolean;
  alive: boolean;
  iFrames: number;
  speed: number;
  coverTime: number;
  hanging: boolean;
}

export interface DifficultyMods {
  index: number; // 0 story, 1 normal, 2 hard, 3 brutal
  enemyAccuracy: number;
  enemyDamage: number;
  perception: number;
}

export interface EnemyContext {
  world: World;
  nav: (arena: string) => NavGrid | undefined;
  squad: SquadDirector;
  player: PlayerView;
  difficulty: DifficultyMods;
  rand: () => number;
  enemies: Enemy[];
  shoot: (e: Enemy, hit: boolean, damage: number, target: V3) => void;
  throwGrenade: (e: Enemy, target: V3) => void;
  melee: (e: Enemy, damage: number) => void;
  alert: (e: Enemy, at: V3) => void;
  emit: (type: "enemyAlert" | "enemySpotted" | "bossPhase", e: Enemy, data?: number) => void;
}

export class Enemy {
  readonly id: string;
  readonly def: Archetype;
  readonly spawn: EnemySpawnDef;
  pos: V3;
  yaw: number;
  hp: number;
  state: EnemyState = "patrol";
  weapon: WeaponId | null;

  suspicion = 0;
  lastKnown: V3 | null = null;
  sinceSeen = 999;
  exposure = 0; // how long the player has been continuously visible
  visibleNow = false;
  tagged = false;
  hitFlash = 0;

  path: V3[] = [];
  pathGoal: V3 | null = null;
  repathTimer = 0;
  patrolIdx = 0;
  waitTimer = 0;

  coverPoint: V3 | null = null;
  coverBox: RuntimeBox | null = null;
  coverTimer = 0;
  crouching = false;
  peekTimer = 0;
  peeking = false;
  flanking = false;

  fireCooldown = 0;
  burstLeft = 0;
  lastShotAgo = 99;
  wantsToShoot = false;
  laserTimer = 0;
  grenadeCooldown = 6;
  grenades: number;

  meleeWindup = 0;
  meleeCooldown = 0;
  stunTimer = 0;
  investigateTimer = 0;
  searchTimer = 0;
  reactTimer = 0;
  phase = 1;
  moving = false;
  deadTime = 0;

  constructor(spawn: EnemySpawnDef) {
    this.id = spawn.id;
    this.spawn = spawn;
    this.def = ARCHETYPES[spawn.archetype as ArchetypeId];
    this.pos = { ...spawn.pos };
    this.yaw = spawn.yaw;
    this.hp = this.def.hp;
    this.weapon = this.def.weapon;
    this.grenades = this.def.grenades;
  }

  get alive(): boolean {
    return this.state !== "dead";
  }

  get aware(): boolean {
    return this.state === "combat" || this.state === "search";
  }

  get eye(): V3 {
    return { x: this.pos.x, y: this.pos.y + (this.crouching ? 1.0 : this.def.height - 0.15), z: this.pos.z };
  }

  /** Hit volumes for shooting: a head sphere and a body box. */
  head(): { c: V3; r: number } {
    const h = this.crouching ? 1.05 : this.def.height - 0.18;
    return { c: { x: this.pos.x, y: this.pos.y + h, z: this.pos.z }, r: 0.17 };
  }

  body(): { min: V3; max: V3 } {
    const top = this.crouching ? 0.9 : this.def.height - 0.35;
    const r = this.def.height > 1.9 ? 0.4 : 0.3;
    return { min: { x: this.pos.x - r, y: this.pos.y, z: this.pos.z - r }, max: { x: this.pos.x + r, y: this.pos.y + top, z: this.pos.z + r } };
  }

  /** Is `from` behind this enemy (for armour and stealth takedowns)? */
  isBehind(from: V3, angle: number = TUNING.melee.takedownBehindAngle): boolean {
    const toAttacker = yawOf(sub(from, this.pos));
    return Math.abs(angleDiff(this.yaw, toAttacker)) > angle;
  }

  /** Applies damage. Returns true if this killed the enemy. */
  damage(amount: number, from: V3, headshot: boolean): boolean {
    if (!this.alive) return false;
    let dmg = amount;
    if (!headshot && !this.isBehind(from, 1.9)) dmg *= this.def.frontArmor;
    this.hp -= dmg;
    this.hitFlash = 0.15;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die(): void {
    this.hp = 0;
    this.state = "dead";
    this.path = [];
    this.meleeWindup = 0;
    this.crouching = false;
  }

  /** Sound reached this enemy. */
  hear(n: Noise): void {
    if (!this.alive || this.state === "combat") return;
    if (dist(this.pos, n.pos) > n.radius) return;
    if (n.kind === "gunshot" || n.kind === "explosion") {
      this.lastKnown = { ...n.pos };
      this.enterCombat();
      return;
    }
    this.lastKnown = { ...n.pos };
    this.state = "investigate";
    this.investigateTimer = AI.investigateTime;
    this.path = [];
  }

  enterCombat(): void {
    if (!this.alive) return;
    if (this.state !== "combat") {
      this.state = "combat";
      this.reactTimer = AI.reactionTime;
      this.coverPoint = null;
      this.path = [];
    }
    this.suspicion = TUNING.stealth.alertThreshold;
  }

  update(dt: number, ctx: EnemyContext): void {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (!this.alive) {
      this.deadTime += dt;
      return;
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    this.lastShotAgo += dt;
    this.moving = false;

    if (this.state === "stunned") {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) this.enterCombat();
      return;
    }

    this.perceive(dt, ctx);
    this.updateBossPhase(ctx);

    switch (this.state) {
      case "patrol":
        this.doPatrol(dt, ctx);
        break;
      case "suspicious":
        this.doSuspicious(dt, ctx);
        break;
      case "investigate":
        this.doInvestigate(dt, ctx);
        break;
      case "combat":
        this.doCombat(dt, ctx);
        break;
      case "search":
        this.doSearch(dt, ctx);
        break;
    }
  }

  // ------------------------------------------------------------- perception

  private perceive(dt: number, ctx: EnemyContext): void {
    const p = ctx.player;
    if (!p.alive) {
      this.visibleNow = false;
      return;
    }
    const vis = visibility({
      eye: this.eye,
      facingYaw: this.yaw,
      targetPoints: [p.head, p.chest],
      crouched: p.crouched,
      inGrass: p.inGrass,
      alerted: this.aware,
      los: (a, b) => ctx.world.lineOfSight(a, b),
      rangeScale: this.def.sight,
    });
    this.visibleNow = vis > 0.02;
    if (this.visibleNow) {
      this.lastKnown = { ...p.pos };
      this.sinceSeen = 0;
      this.exposure += dt;
    } else {
      this.sinceSeen += dt;
      this.exposure = Math.max(0, this.exposure - dt * 2);
    }

    if (this.state === "patrol" || this.state === "suspicious" || this.state === "investigate") {
      this.suspicion = updateSuspicion(this.suspicion, vis, dt, ctx.difficulty.perception);
      // Point-blank sightings alert immediately.
      if (this.visibleNow && dist(this.pos, p.pos) < 3.2 && !p.inGrass) this.suspicion = TUNING.stealth.alertThreshold;
      if (this.suspicion >= TUNING.stealth.alertThreshold) {
        this.enterCombat();
        ctx.emit("enemyAlert", this);
        ctx.alert(this, p.pos);
      } else if (this.suspicion > 0.15 && this.state === "patrol") {
        this.state = "suspicious";
        ctx.emit("enemySpotted", this);
      }
    }
  }

  private updateBossPhase(ctx: EnemyContext): void {
    if (this.def.role !== "boss") return;
    const frac = this.hp / this.def.hp;
    const want = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) this.weapon = "shotgun";
      ctx.emit("bossPhase", this, want);
    }
  }

  // ------------------------------------------------------------- movement

  private moveTo(goal: V3, dt: number, ctx: EnemyContext, speedScale = 1): boolean {
    const nav = ctx.nav(this.spawn.arena);
    this.repathTimer -= dt;
    if (!this.pathGoal || dist(this.pathGoal, goal) > 1 || this.repathTimer <= 0 || this.path.length === 0) {
      this.pathGoal = { ...goal };
      this.repathTimer = 1.0;
      this.path = nav?.findPath(this.pos, goal) ?? [goal];
    }
    if (this.path.length === 0) return true;
    const target = this.path[0];
    const d = sub(target, this.pos);
    const dXZ = Math.hypot(d.x, d.z);
    if (dXZ < 0.25) {
      this.path.shift();
      return this.path.length === 0;
    }
    const speed = this.def.moveSpeed * speedScale;
    const step = Math.min(dXZ, speed * dt);
    const dir = { x: d.x / dXZ, y: 0, z: d.z / dXZ };
    const next = add(this.pos, scale(dir, step));
    // Separation so enemies don't stack on top of each other.
    for (const o of ctx.enemies) {
      if (o === this || !o.alive) continue;
      const s = distXZ(o.pos, next);
      if (s < 0.7 && s > 1e-3) {
        next.x += ((next.x - o.pos.x) / s) * (0.7 - s) * 0.5;
        next.z += ((next.z - o.pos.z) / s) * (0.7 - s) * 0.5;
      }
    }
    const g = ctx.world.groundHeight(next.x, next.z, this.pos.y + 0.7, 0.3);
    if (Number.isFinite(g.y) && Math.abs(g.y - this.pos.y) < 1.2) {
      next.y = g.y;
      this.pos = next;
    } else {
      this.path = [];
    }
    this.yaw += angleDiff(this.yaw, yawOf(dir)) * Math.min(1, 10 * dt);
    this.moving = true;
    return false;
  }

  private face(target: V3, dt: number, rate = 8): void {
    this.yaw += angleDiff(this.yaw, yawOf(sub(target, this.pos))) * Math.min(1, rate * dt);
  }

  // ------------------------------------------------------------- states

  private doPatrol(dt: number, ctx: EnemyContext): void {
    const pts = this.spawn.patrol;
    if (!pts || pts.length === 0) {
      // Idle guards slowly scan left and right.
      this.waitTimer += dt;
      this.yaw = this.spawn.yaw + Math.sin(this.waitTimer * 0.5) * 0.6;
      return;
    }
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      return;
    }
    const goal = pts[this.patrolIdx % pts.length];
    if (this.moveTo(goal, dt, ctx, 0.45) || distXZ(this.pos, goal) < 0.4) {
      this.patrolIdx++;
      this.waitTimer = 1.5 + ctx.rand() * 2;
      this.path = [];
    }
  }

  private doSuspicious(dt: number, _ctx: EnemyContext): void {
    if (this.lastKnown) this.face(this.lastKnown, dt, 3);
    if (this.suspicion <= 0.01) {
      this.state = "patrol";
      return;
    }
    // If suspicion is high but the player vanished, go take a look.
    if (!this.visibleNow && this.suspicion > 0.4 && this.lastKnown) {
      this.state = "investigate";
      this.investigateTimer = AI.investigateTime;
      this.path = [];
    }
  }

  private doInvestigate(dt: number, ctx: EnemyContext): void {
    this.investigateTimer -= dt;
    if (this.lastKnown && distXZ(this.pos, this.lastKnown) > 1.2) this.moveTo(this.lastKnown, dt, ctx, 0.6);
    else this.yaw += dt * 1.2;
    if (this.investigateTimer <= 0) {
      this.state = "patrol";
      this.suspicion = 0;
      this.path = [];
    }
  }

  private doSearch(dt: number, ctx: EnemyContext): void {
    this.searchTimer -= dt;
    if (this.visibleNow) {
      this.enterCombat();
      return;
    }
    if (this.lastKnown && distXZ(this.pos, this.lastKnown) > 1.5) this.moveTo(this.lastKnown, dt, ctx, 0.7);
    else {
      // Wander near the last known position.
      this.yaw += dt * 1.5;
      if (ctx.rand() < dt * 0.3 && this.lastKnown) {
        this.lastKnown = add(this.lastKnown, { x: (ctx.rand() - 0.5) * 6, y: 0, z: (ctx.rand() - 0.5) * 6 });
      }
    }
    if (this.searchTimer <= 0) {
      this.state = "patrol";
      this.suspicion = 0.3;
      this.path = [];
    }
  }

  private doCombat(dt: number, ctx: EnemyContext): void {
    const p = ctx.player;
    const target = this.lastKnown ?? p.pos;
    const dToPlayer = dist(this.pos, p.pos);

    // Short reaction delay after being alerted, so the player can act first.
    if (this.reactTimer > 0) {
      this.reactTimer -= dt;
      this.face(target, dt);
      return;
    }

    if (this.sinceSeen > AI.searchDuration * 0.6 && !this.def.laserTime) {
      this.state = "search";
      this.searchTimer = AI.searchDuration;
      ctx.squad.release(this.id);
      ctx.squad.releaseFlank(this.spawn.arena, this.id);
      this.crouching = false;
      return;
    }

    // Melee: wind up (counterable), then strike.
    if (this.meleeWindup > 0) {
      this.meleeWindup -= dt;
      this.face(p.pos, dt, 12);
      if (this.meleeWindup <= 0) {
        this.meleeCooldown = 1.4;
        if (dist(this.pos, p.pos) < TUNING.melee.range + 0.4 && p.iFrames <= 0 && this.def.melee) {
          ctx.melee(this, this.def.melee.damage * ctx.difficulty.enemyDamage);
        }
      }
      return;
    }
    if (this.def.melee && dToPlayer < 1.6 && this.meleeCooldown <= 0 && p.alive && !p.hanging) {
      this.meleeWindup = this.def.melee.windup;
      this.crouching = false;
      return;
    }

    // Snipers hold their perch and only shoot.
    if (this.def.role === "overwatch") {
      this.crouching = false;
      this.face(target, dt, 4);
      this.tryShoot(dt, ctx, dToPlayer);
      return;
    }

    const aggressive = this.def.role === "rush" || (this.def.role === "boss" && this.phase === 3) || this.def.role === "flush";
    if (aggressive || this.def.aggression > 0.8) {
      this.crouching = false;
      const want = this.def.role === "rush" ? 1.2 : this.def.range[0] + 0.5;
      if (dToPlayer > want) this.moveTo(target, dt, ctx, this.def.role === "rush" ? 1 : 0.85);
      else this.face(p.pos, dt);
      if (this.weapon) this.tryShoot(dt, ctx, dToPlayer);
      return;
    }

    // Grenadiers (and the boss in phase 2+) punish players who camp in cover.
    if (this.grenades > 0 && this.grenadeCooldown <= 0 && p.coverTime > 3.5 && (this.def.role === "flank" || (this.def.role === "boss" && this.phase >= 2))) {
      if (dToPlayer > 6 && dToPlayer < 24) {
        this.grenades--;
        this.grenadeCooldown = this.def.role === "boss" ? 6 : 9;
        ctx.throwGrenade(this, p.pos);
      }
    }

    // Find, move to and use cover.
    this.coverTimer -= dt;
    if (!this.coverPoint || this.coverTimer <= 0 || (this.coverBox && this.coverBox.removed) || !this.coverStillGood(ctx)) {
      this.pickCover(ctx);
      this.coverTimer = AI.coverRecheck + ctx.rand() * 2;
    }
    if (this.coverPoint && distXZ(this.pos, this.coverPoint) > 0.4) {
      this.crouching = false;
      this.peeking = false;
      this.moveTo(this.coverPoint, dt, ctx, 1);
      // Rifle-wielding enemies may fire on the move, less accurately.
      if (this.weapon && ctx.rand() < 0.4) this.tryShoot(dt, ctx, dToPlayer, 0.5);
      return;
    }

    // In cover: duck, then peek out to shoot when holding a token.
    const lowCover = this.coverBox ? this.coverBox.max.y - this.pos.y < 1.5 : false;
    this.face(target, dt);
    this.peekTimer -= dt;
    if (this.peekTimer <= 0) {
      this.peeking = !this.peeking;
      const [lo, hi] = AI.peekInterval;
      this.peekTimer = this.peeking ? 1.2 + ctx.rand() * 1.4 : lo + ctx.rand() * (hi - lo);
      if (!this.peeking) ctx.squad.release(this.id);
    }
    this.crouching = lowCover && !this.peeking;
    if (this.peeking || !this.coverBox) this.tryShoot(dt, ctx, dToPlayer);
    else this.wantsToShoot = false;
  }

  private coverStillGood(ctx: EnemyContext): boolean {
    if (!this.coverPoint || !this.coverBox) return !!this.coverPoint;
    // Cover is good if the box sits between us and the player.
    const toPlayer = norm(sub(ctx.player.pos, this.coverPoint));
    const toBox = norm(sub(boxCenter(this.coverBox), this.coverPoint));
    return dot(toPlayer, toBox) > 0.3;
  }

  private pickCover(ctx: EnemyContext): void {
    const nav = ctx.nav(this.spawn.arena);
    const p = ctx.player.pos;
    const [lo, hi] = this.def.range;
    const prefer = (lo + hi) / 2;
    let best: { pt: V3; box: RuntimeBox | null; score: number } | null = null;
    const wantFlank = this.def.role === "flank" && ctx.rand() < AI.flankChance * 2 ? ctx.squad.requestFlank(this.spawn.arena, this.id) : false;
    this.flanking = wantFlank;
    for (const b of ctx.world.boxes) {
      if (b.removed || !b.cover) continue;
      const c = boxCenter(b);
      if (nav && !inArena(c, nav)) continue;
      const toPlayer = norm(sub(p, c));
      // Stand on the opposite side of the box from the player.
      const hx = (b.max.x - b.min.x) / 2 + 0.55;
      const hz = (b.max.z - b.min.z) / 2 + 0.55;
      const candidates: V3[] = Math.abs(toPlayer.x) > Math.abs(toPlayer.z)
        ? [{ x: c.x - Math.sign(toPlayer.x) * hx, y: b.min.y, z: c.z }]
        : [{ x: c.x, y: b.min.y, z: c.z - Math.sign(toPlayer.z) * hz }];
      for (const pt of candidates) {
        if (nav) {
          const cell = nav.cellOf(pt);
          if (!cell || !nav.walkable(cell.ix, cell.iz)) continue;
          pt.y = nav.cellCenter(cell.ix, cell.iz).y;
        }
        const taken = ctx.enemies.some((o) => o !== this && o.alive && o.coverPoint && distXZ(o.coverPoint, pt) < 1.2);
        if (taken) continue;
        const dp = distXZ(pt, p);
        let score = Math.abs(dp - prefer) + distXZ(pt, this.pos) * 0.6;
        if (dp < lo) score += 10;
        if (wantFlank) {
          // Flankers prefer spots off to the side of the player's facing toward us.
          const side = Math.abs(dot(norm(sub(pt, p)), norm(sub(this.pos, p))));
          score += side * 6;
        }
        if (!best || score < best.score) best = { pt, box: b, score };
      }
    }
    if (best) {
      this.coverPoint = best.pt;
      this.coverBox = best.box;
    } else {
      // No cover: hold a position at preferred range.
      const away = norm(sub(this.pos, p));
      this.coverPoint = add(p, scale(away, prefer));
      this.coverBox = null;
    }
  }

  private tryShoot(dt: number, ctx: EnemyContext, dToPlayer: number, accuracyScale = 1): void {
    if (!this.weapon) return;
    const p = ctx.player;
    const aimPoint = ctx.world.lineOfSight(this.eye, p.chest) ? p.chest : ctx.world.lineOfSight(this.eye, p.head) ? p.head : null;
    this.wantsToShoot = !!aimPoint && p.alive;
    if (!aimPoint) {
      this.laserTimer = Math.max(0, this.laserTimer - dt * 2);
      return;
    }
    this.face(aimPoint, dt, 12);

    // Snipers telegraph with a laser before every shot.
    if (this.def.laserTime) {
      this.laserTimer += dt;
      if (this.laserTimer < this.def.laserTime) return;
    }
    if (!ctx.squad.holds(this.id) || this.fireCooldown > 0) return;

    const w = WEAPONS[this.weapon];
    const exposure = clamp01(this.exposure / 2);
    let chance = lerp(this.def.accuracy[0], this.def.accuracy[1], exposure) * ctx.difficulty.enemyAccuracy * accuracyScale;
    if (p.speed > 5) chance *= 0.65;
    if (dToPlayer > this.def.range[1] * 1.4) chance *= 0.5;
    if (p.iFrames > 0) chance = 0;
    const hit = ctx.rand() < chance;
    const dmg = this.def.damage * ctx.difficulty.enemyDamage;
    ctx.shoot(this, hit, dmg, aimPoint);
    this.lastShotAgo = 0;
    this.laserTimer = 0;
    // Bursts: short pauses between shots, longer between bursts.
    if (this.burstLeft <= 0) {
      const [lo, hi] = AI.burstLength;
      this.burstLeft = Math.round(lo + ctx.rand() * (hi - lo));
    }
    this.burstLeft--;
    this.fireCooldown = this.burstLeft > 0 ? Math.max(w.fireInterval * 1.4, 0.12) : 0.9 + ctx.rand() * 0.8;
    if (this.burstLeft <= 0) ctx.squad.release(this.id);
  }

  /** Called when the player counters a melee wind-up. */
  stun(seconds: number): void {
    this.meleeWindup = 0;
    this.state = "stunned";
    this.stunTimer = seconds;
    this.crouching = false;
  }

  /** True during the wind-up window where the player can counter. */
  get counterable(): boolean {
    return this.meleeWindup > 0 && this.meleeWindup < TUNING.melee.counterWindow;
  }
}

const boxCenter = (b: { min: V3; max: V3 }): V3 => ({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 });

const inArena = (p: V3, nav: NavGrid): boolean =>
  p.x >= nav.arena.min.x && p.x <= nav.arena.max.x && p.z >= nav.arena.min.z && p.z <= nav.arena.max.z;
