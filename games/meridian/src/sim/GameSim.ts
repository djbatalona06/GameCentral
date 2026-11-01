// GameSim is the whole game world for one chapter, stepped at a fixed 60 Hz.
// It has no idea how things are drawn or heard; it only emits events that the renderer,
// audio and HUD listen to. That makes it possible to run full gameplay in unit tests.

import { TUNING } from "../config/tuning";
import type { InputFrame } from "../input/actions";
import {
  type V3,
  add,
  angleDiff,
  clamp,
  dist,
  distXZ,
  dot,
  len,
  lookDir,
  norm,
  rng,
  scale,
  sub,
  yawDir,
  yawOf,
} from "./math";
import { World, inside, overlaps, rayAabb } from "./world/World";
import { PlayerController, type PlayerEvent } from "./player/PlayerController";
import { type CameraState, newCamera, updateCamera } from "./player/CameraRig";
import {
  WEAPONS,
  type WeaponId,
  type WeaponState,
  canFire,
  cancelReload,
  currentSpread,
  fire,
  newWeaponState,
  shotDamage,
  spreadOffset,
  startReload,
  tickWeapon,
} from "./combat/weapons";
import { type AimAssistLevel, type HealthState, aimAssist, applyDamage, simulateArc, throwVelocity, tickHealth, type ArcPoint } from "./combat/ballistics";
import { Enemy, type DifficultyMods, type EnemyContext } from "./ai/Enemy";
import { NavGrid } from "./ai/NavGrid";
import { SquadDirector } from "./ai/SquadDirector";
import type { Noise } from "./ai/Perception";
import { type PuzzleState, bellCaption, canSkip, newPuzzle, pullLever, ringBell, rotatePillar, showHint, updatePlates } from "./story/Puzzles";
import { type HazardState, type MoverState, hazardBox, newHazard, newMover, setHazardActive, stepHazard, stepMover } from "./world/Dynamics";
import { type Pursuer, type VehicleState, newPursuer, newVehicle, pursuerBox, pursuerHead, seatPos, stepPursuer, stepVehicle, trackAt } from "./vehicle/Vehicle";
import { type SearchlightState, beamYaw, inBeam, newSearchlight, stepSearchlight } from "./ai/Searchlight";
import { type Action, type ChapterDef, type ChoiceDef, type Line, type CameraShot, type MusicMood, WORLD_ACTIONS } from "./story/types";
import { type Condition, evaluate } from "./story/Conditions";
import { type StoryState, STYLE_MIN_SECONDS, applyEffects, cloneStory, newStoryState, normaliseStory, recordChoice, styleOf } from "./story/State";
import { choiceEvent, collectChoices } from "./story/Graph";
import type { InteractDef, WeatherDef } from "./world/types";

// ------------------------------------------------------------------ public types

export type Difficulty = 0 | 1 | 2 | 3;

export const DIFFICULTY_NAMES = ["Story", "Explorer", "Hunter", "Legend"] as const;

export interface GameplayOptions {
  difficulty: Difficulty;
  /** Fine-grained difficulty sliders (1 = default for the preset). */
  enemyDamageScale: number;
  enemyAccuracyScale: number;
  playerHealthScale: number;
  ammoScale: number;
  aimAssist: AimAssistLevel;
  autoTraversal: boolean;
  autoPickup: boolean;
  autoFireOnTarget: boolean;
  slowMoAim: boolean;
  autoRecenter: boolean;
  invertY: boolean;
  fovScale: number;
  puzzleSkipAfter: number;
  invulnerable: boolean;
  /** Story choices run out of time and pick their quiet default. Off unless the player turns it on. */
  timedChoices: boolean;
}

export const defaultGameplay = (): GameplayOptions => ({
  difficulty: 1,
  enemyDamageScale: 1,
  enemyAccuracyScale: 1,
  playerHealthScale: 1,
  ammoScale: 1,
  aimAssist: "low",
  autoTraversal: false,
  autoPickup: true,
  autoFireOnTarget: false,
  slowMoAim: false,
  autoRecenter: true,
  invertY: false,
  fovScale: 1,
  puzzleSkipAfter: 3,
  invulnerable: false,
  timedChoices: false,
});

export interface Snapshot {
  chapterId: string;
  checkpointId: string;
  firedEvents: string[];
  killed: string[];
  pickupsTaken: string[];
  treasures: string[];
  interactsUsed: string[];
  triggersFired: string[];
  puzzlesSolved: string[];
  journal: string[];
  loadout: {
    sidearm: { id: WeaponId; mag: number; reserve: number } | null;
    long: { id: WeaponId; mag: number; reserve: number } | null;
    active: "sidearm" | "long";
    grenades: number;
    bottles: number;
  };
  objective: { text: string; target?: V3 } | null;
  stats: ChapterStats;
  /** Story events that were scheduled but had not fired yet when the checkpoint was reached. */
  pending: Array<{ event: string; in: number }>;
  /** What the story remembers (relationships, flags, answers). Missing in saves from before story choices. */
  story?: StoryState;
  /** Choices that were asked but not answered yet. */
  openChoices?: string[];
}

export interface ChapterStats {
  time: number;
  shots: number;
  hits: number;
  headshots: number;
  kills: number;
  takedowns: number;
  deaths: number;
  alerts: number;
  stealthBroken: boolean;
}

export const newStats = (): ChapterStats => ({ time: 0, shots: 0, hits: 0, headshots: 0, kills: 0, takedowns: 0, deaths: 0, alerts: 0, stealthBroken: false });

export type SimEvent =
  | { type: "shot"; from: V3; to: V3; byPlayer: boolean; weapon: WeaponId; hit: boolean }
  | { type: "hitmarker"; kill: boolean; headshot: boolean }
  | { type: "playerHurt"; fromYaw: number; amount: number }
  | { type: "playerDied" }
  | { type: "explosion"; pos: V3 }
  | { type: "pickup"; label: string }
  | { type: "treasure"; id: string; name: string; description: string }
  | { type: "checkpoint"; id: string; label: string }
  | { type: "dialogue"; line: Line }
  | { type: "objective"; text: string }
  | { type: "journal"; id: string }
  | { type: "tutorial"; text: string }
  | { type: "complete" }
  | { type: "player"; ev: PlayerEvent }
  | { type: "alert"; pos: V3 }
  | { type: "sound"; kind: "gunshot" | "explosion" | "footstep" | "voice" | "impact"; pos: V3 }
  | { type: "melee"; pos: V3; kind: "hit" | "takedown" | "counter" | "finisher" | "whiff" }
  | { type: "reload"; weapon: WeaponId }
  | { type: "dryFire" }
  | { type: "swap"; weapon: WeaponId }
  | { type: "puzzle"; text: string; solved?: boolean }
  | { type: "shake"; amount: number }
  | { type: "music"; mood: MusicMood }
  | { type: "cutscene"; active: boolean }
  | { type: "boxBroken"; pos: V3 }
  | { type: "grenade"; pos: V3; byPlayer: boolean }
  | { type: "interact"; kind: InteractDef["kind"]; pos: V3 }
  | { type: "bossPhase"; phase: number }
  | { type: "bell"; index: number; count: number; pos: V3; caption: string }
  | { type: "warning"; text: string }
  | { type: "vehicle"; kind: "enter" | "crash" | "exit" | "wreck"; pos: V3 }
  | { type: "pursuerDown"; pos: V3 }
  | { type: "searchlightAlarm"; pos: V3 }
  | { type: "choice"; choice: PendingChoice }
  | { type: "choiceResolved"; choiceId: string; optionId: string };

/** A question on screen. Only what the UI needs: the sim keeps the rules. */
export interface PendingChoice {
  id: string;
  prompt: string;
  speaker?: string;
  options: Array<{ id: string; label: string; hint?: string }>;
  defaultOption: string;
  /** Seconds left, only when timed choices are on. */
  timeLeft?: number;
}

export interface Projectile {
  id: number;
  kind: "grenade" | "bottle";
  pos: V3;
  vel: V3;
  fuse: number;
  byPlayer: boolean;
  resting: boolean;
}

export interface Prompt {
  label: string;
  action: "interact" | "melee" | "jump";
}

export interface CutsceneState {
  shots: CameraShot[];
  index: number;
  t: number;
}

// ------------------------------------------------------------------ the simulation

export class GameSim {
  readonly chapter: ChapterDef;
  readonly world: World;
  readonly player: PlayerController;
  readonly cam: CameraState;
  readonly opts: GameplayOptions;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  readonly squad: SquadDirector;
  readonly navs = new Map<string, NavGrid>();
  readonly health: HealthState;

  weapons: { sidearm: WeaponState | null; long: WeaponState | null; active: "sidearm" | "long" } = { sidearm: null, long: null, active: "sidearm" };
  grenades = 0;
  bottles = 0;

  aiming = false;
  throwAiming = false;
  arcPreview: ArcPoint[] = [];
  prompt: Prompt | null = null;
  objective: { text: string; target?: V3 } | null = null;
  checkpointId = "";
  dead = false;
  completed = false;
  cutscene: CutsceneState | null = null;
  stealthActive = false;
  timeScale = 1;
  time = 0;

  pickupsTaken = new Set<string>();
  treasures = new Set<string>();
  interactsUsed = new Set<string>();
  revealedInteracts = new Set<string>();
  triggersFired = new Set<string>();
  firedEvents: string[] = [];
  killed = new Set<string>();
  spawnedWaves = new Set<string>();
  journal = new Set<string>();
  puzzles: PuzzleState[] = [];
  stats: ChapterStats = newStats();
  events: SimEvent[] = [];

  private scheduled: Array<{ at: number; event: string } | { at: number; action: Action }> = [];
  private dialogueQueue: Line[] = [];
  private dialogueTimer = 0;
  private rand: () => number;
  private comboStep = 0;
  private comboTimer = 0;
  private meleeCooldown = 0;
  private tagTimer = new Map<string, number>();
  private coverTime = 0;
  private replaying = false;
  private projectileId = 0;
  private lastCheckpointIndex = -1;
  private arenaAlive = new Map<string, number>();
  private waveAlive = new Map<string, number>();
  private wasAiming = false;
  currentLine: Line | null = null;

  /** What the story remembers; carried from chapter to chapter by the save file. */
  story: StoryState = newStoryState();
  /** The question the player is answering right now (the world waits while this is set). */
  pendingChoice: PendingChoice | null = null;
  private choiceQueue: ChoiceDef[] = [];
  /** The chapter wants to end but a question is open, a cutscene is playing or someone is still speaking. */
  private completeWhenQuiet = false;
  private choiceDefs = new Map<string, ChoiceDef>();
  /** Replaying a finished chapter: earlier answers stand, so nothing is added to the story twice. */
  readonly lockStory: boolean;

  movers: MoverState[] = [];
  hazards: HazardState[] = [];
  searchlights: SearchlightState[] = [];
  /** Weather volumes that are switched on. */
  weatherOn = new Set<string>();
  /** The jeep (stays set after the chase so the renderer can leave it parked). */
  vehicle: VehicleState | null = null;
  pursuers: Pursuer[] = [];
  private melody: Array<{ at: number; index: number; count: number; pos: V3 }> = [];

  constructor(chapter: ChapterDef, opts: GameplayOptions, snapshot?: Snapshot, seed = 1234, story?: StoryState, lockStory = false) {
    if (!chapter.build || !chapter.script) throw new Error(`Chapter ${chapter.id} is not playable yet`);
    this.chapter = chapter;
    this.opts = opts;
    this.lockStory = lockStory;
    this.story = normaliseStory(snapshot?.story ?? story);
    for (const c of collectChoices(chapter.script)) this.choiceDefs.set(c.id, c);
    this.rand = rng(seed);
    this.world = new World(chapter.build());
    const d = this.world.data;
    this.movers = d.movers.map(newMover);
    // A mover whose path doesn't start at its built position jumps there first.
    for (const m of this.movers) if (m.offset.x || m.offset.y || m.offset.z) this.world.translateGroup(m.def.group, m.offset);
    this.hazards = d.hazards.map(newHazard);
    this.searchlights = d.searchlights.map(newSearchlight);
    for (const w of d.weather) if (w.startActive) this.weatherOn.add(w.id);
    const script = chapter.script;
    this.puzzles = script.puzzles.map(newPuzzle);
    this.squad = new SquadDirector(opts.difficulty);
    for (const a of this.world.data.arenas) this.navs.set(a.id, new NavGrid(a));
    this.health = { hp: TUNING.health.max * opts.playerHealthScale, max: TUNING.health.max * opts.playerHealthScale, sinceDamage: 99 };

    const cp = snapshot ? this.world.data.checkpoints.find((c) => c.id === snapshot.checkpointId) : undefined;
    const start = cp ?? this.world.data.checkpoints[0];
    if (!start) throw new Error(`Chapter ${chapter.id} has no checkpoints`);
    this.player = new PlayerController(start.pos, start.yaw);
    this.cam = newCamera(start.yaw);
    this.checkpointId = start.id;
    this.lastCheckpointIndex = this.world.data.checkpoints.indexOf(start);

    // Enemies placed in the level without a wave are present from the start.
    for (const e of this.world.data.enemies) if (!e.wave) this.spawnEnemy(e.id);

    if (snapshot) this.restore(snapshot);
    else {
      this.applyLoadout();
      this.runActions(script.onStart);
    }
    updateCamera(this.cam, this.cameraInput({ yaw: 0, pitch: 0 }), this.world, 1 / 60);
  }

  // ---------------------------------------------------------------- setup & checkpoints

  private applyLoadout(): void {
    const lo = this.chapter.script!.startLoadout;
    const ammo = (n: number | undefined, id: WeaponId) => Math.round((n ?? WEAPONS[id].reserveMax / 2) * this.opts.ammoScale);
    this.weapons.sidearm = lo.sidearm ? newWeaponState(lo.sidearm, ammo(lo.sidearmAmmo, lo.sidearm)) : null;
    this.weapons.long = lo.long ? newWeaponState(lo.long, ammo(lo.longAmmo, lo.long)) : null;
    this.weapons.active = this.weapons.long ? "long" : "sidearm";
    this.grenades = lo.grenades;
    this.bottles = lo.bottles;
  }

  snapshot(): Snapshot {
    const w = (s: WeaponState | null) => (s ? { id: s.id, mag: s.mag, reserve: s.reserve } : null);
    return {
      chapterId: this.chapter.id,
      checkpointId: this.checkpointId,
      firedEvents: [...this.firedEvents],
      killed: [...this.killed],
      pickupsTaken: [...this.pickupsTaken],
      treasures: [...this.treasures],
      interactsUsed: [...this.interactsUsed],
      triggersFired: [...this.triggersFired],
      puzzlesSolved: this.puzzles.filter((p) => p.solved).map((p) => p.def.id),
      journal: [...this.journal],
      loadout: { sidearm: w(this.weapons.sidearm), long: w(this.weapons.long), active: this.weapons.active, grenades: this.grenades, bottles: this.bottles },
      objective: this.objective ? { ...this.objective } : null,
      stats: { ...this.stats },
      pending: this.scheduled.filter((x): x is { at: number; event: string } => "event" in x).map((x) => ({ event: x.event, in: Math.max(0, x.at - this.time) })),
      story: cloneStory(this.story),
      openChoices: [...(this.pendingChoice ? [this.pendingChoice.id] : []), ...this.choiceQueue.map((c) => c.id)],
    };
  }

  /** Rebuilds progress from a checkpoint snapshot by replaying the world-changing story actions. */
  private restore(s: Snapshot): void {
    this.replaying = true;
    for (const id of s.killed) this.killed.add(id);
    this.enemies = this.enemies.filter((e) => !this.killed.has(e.id));
    s.pickupsTaken.forEach((id) => this.pickupsTaken.add(id));
    s.treasures.forEach((id) => this.treasures.add(id));
    s.interactsUsed.forEach((id) => this.interactsUsed.add(id));
    s.triggersFired.forEach((id) => this.triggersFired.add(id));
    s.journal.forEach((id) => this.journal.add(id));
    for (const p of this.puzzles) if (s.puzzlesSolved.includes(p.def.id)) p.solved = true;
    this.runActions(this.chapter.script!.onStart.filter((a) => WORLD_ACTIONS.includes(a.type)));
    for (const ev of s.firedEvents) {
      this.firedEvents.push(ev);
      const acts = this.chapter.script!.events[ev] ?? [];
      this.runActions(acts.filter((a) => WORLD_ACTIONS.includes(a.type) || a.type === "remove"));
    }
    const mk = (x: { id: WeaponId; mag: number; reserve: number } | null): WeaponState | null => (x ? { ...newWeaponState(x.id, x.reserve), mag: x.mag } : null);
    this.weapons = { sidearm: mk(s.loadout.sidearm), long: mk(s.loadout.long), active: s.loadout.active };
    this.grenades = s.loadout.grenades;
    this.bottles = s.loadout.bottles;
    this.objective = s.objective;
    this.stats = { ...s.stats };
    this.scheduled = (s.pending ?? []).map((x) => ({ at: this.time + x.in, event: x.event }));
    // A question that was asked but not answered when the checkpoint was saved is asked again.
    for (const id of s.openChoices ?? []) {
      const def = this.choiceDefs.get(id);
      if (def) this.choiceQueue.push(def);
    }
    this.replaying = false;
    // Make sure waves that were spawned before the checkpoint come back (minus the dead).
    this.enemies = this.enemies.filter((e) => !this.killed.has(e.id));
    this.recountAlive();
  }

  private spawnEnemy(spawnId: string): void {
    if (this.killed.has(spawnId) || this.enemies.some((e) => e.id === spawnId)) return;
    const def = this.world.data.enemies.find((e) => e.id === spawnId);
    if (!def) return;
    const e = new Enemy(def);
    if (def.alerted) {
      e.lastKnown = { ...this.player?.pos ?? def.pos };
      e.enterCombat();
    }
    this.enemies.push(e);
    this.recountAlive();
  }

  private recountAlive(): void {
    this.arenaAlive.clear();
    this.waveAlive.clear();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      this.arenaAlive.set(e.spawn.arena, (this.arenaAlive.get(e.spawn.arena) ?? 0) + 1);
      const w = e.spawn.wave ?? e.spawn.arena;
      this.waveAlive.set(w, (this.waveAlive.get(w) ?? 0) + 1);
    }
  }

  get difficultyMods(): DifficultyMods {
    const base = [
      { acc: 0.45, dmg: 0.4, per: 0.6 },
      { acc: 0.8, dmg: 0.75, per: 0.85 },
      { acc: 1, dmg: 1, per: 1 },
      { acc: 1.25, dmg: 1.5, per: 1.3 },
    ][this.opts.difficulty];
    return {
      index: this.opts.difficulty,
      enemyAccuracy: base.acc * this.opts.enemyAccuracyScale,
      enemyDamage: base.dmg * this.opts.enemyDamageScale,
      perception: base.per,
    };
  }

  // ---------------------------------------------------------------- story actions

  private emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  /** Raise a story event (from a trigger, interact, puzzle, wave clear, timer...). */
  fireEvent(name: string): void {
    const acts = this.chapter.script!.events[name];
    if (!acts) return;
    this.firedEvents.push(name);
    this.runActions(acts);
  }

  private runActions(actions: Action[]): void {
    for (const a of actions) this.runAction(a);
  }

  private runAction(a: Action): void {
    switch (a.type) {
      case "dialogue":
        if (!this.replaying) this.dialogueQueue.push(...this.sayable(a.lines));
        break;
      case "objective":
        this.objective = { text: a.text, target: a.target };
        if (!this.replaying) this.emit({ type: "objective", text: a.text });
        break;
      case "spawn":
        this.spawnedWaves.add(a.wave);
        for (const e of this.world.data.enemies) if (e.wave === a.wave) this.spawnEnemy(e.id);
        break;
      case "remove":
        if (a.delay && !this.replaying) this.scheduled.push({ at: this.time + a.delay, action: { type: "remove", group: a.group } });
        else {
          this.world.removeGroup(a.group);
          if (!this.replaying) this.emit({ type: "shake", amount: 0.6 });
        }
        break;
      case "reveal":
        this.world.revealGroup(a.group);
        break;
      case "revealInteract":
        this.revealedInteracts.add(a.id);
        break;
      case "journal":
        if (!this.journal.has(a.id)) {
          this.journal.add(a.id);
          if (!this.replaying) this.emit({ type: "journal", id: a.id });
        }
        break;
      case "cutscene":
        if (this.replaying) break;
        this.cutscene = { shots: a.shots, index: 0, t: 0 };
        if (a.lines) this.dialogueQueue.push(...this.sayable(a.lines));
        this.emit({ type: "cutscene", active: true });
        break;
      case "emit":
        if (!this.replaying) this.scheduled.push({ at: this.time + a.delay, event: a.event });
        break;
      case "tutorial":
        if (!this.replaying) this.emit({ type: "tutorial", text: a.text });
        break;
      case "music":
        this.emit({ type: "music", mood: a.mood });
        break;
      case "shake":
        if (!this.replaying) this.emit({ type: "shake", amount: a.amount });
        break;
      case "give":
        if (this.replaying) break;
        if (a.weapon) this.giveWeapon(a.weapon, a.ammo);
        if (a.grenades) this.grenades = Math.min(3, this.grenades + a.grenades);
        if (a.bottles) this.bottles = Math.min(3, this.bottles + a.bottles);
        break;
      case "stealth":
        this.stealthActive = a.active;
        break;
      case "checkpoint":
        if (!this.replaying) this.forceCheckpoint(a.id);
        break;
      case "mover": {
        const m = this.movers.find((x) => x.def.id === a.id);
        if (m) m.active = a.active;
        break;
      }
      case "hazard": {
        const h = this.hazards.find((x) => x.def.id === a.id);
        if (h) setHazardActive(h, a.active);
        break;
      }
      case "weather":
        if (a.active) this.weatherOn.add(a.id);
        else this.weatherOn.delete(a.id);
        break;
      case "searchlight": {
        const l = this.searchlights.find((x) => x.def.id === a.id);
        if (l) l.active = a.active;
        break;
      }
      case "vehicle":
        if (!this.replaying) this.enterVehicle(a.track);
        break;
      case "pursuit":
        if (!this.replaying) this.spawnPursuers(a.group);
        break;
      case "choice":
        if (!this.replaying) this.askChoice(a);
        break;
      case "branch": {
        const list = this.check(a.if) ? a.then : a.otherwise ?? [];
        this.runActions(this.replaying ? list.filter((x) => WORLD_ACTIONS.includes(x.type)) : list);
        break;
      }
      case "set":
        if (!this.replaying && !this.lockStory) this.story = applyEffects(this.story, { set: [a.flag] });
        break;
      case "rel":
        if (!this.replaying && !this.lockStory) this.story = applyEffects(this.story, { rel: { [a.who]: a.delta } });
        break;
      case "stance":
        if (!this.replaying && !this.lockStory) this.story = applyEffects(this.story, { stance: a.delta });
        break;
      case "complete":
        if (this.replaying) break;
        // A chapter never ends in the middle of a question, a cutscene or a line someone is still saying.
        if (this.pendingChoice || this.choiceQueue.length || this.cutscene || this.currentLine || this.dialogueQueue.length) this.completeWhenQuiet = true;
        else {
          this.completed = true;
          this.emit({ type: "complete" });
        }
        break;
    }
  }

  // ---------------------------------------------------------------- story state & choices

  /** Is this story rule true right now? */
  check(c: Condition | undefined): boolean {
    return !c || evaluate(c, { story: this.story, stats: this.stats, treasures: this.treasures });
  }

  /** The lines whose "only if" rule holds. */
  private sayable(lines: Line[]): Line[] {
    return lines.filter((l) => this.check(l.if));
  }

  private askChoice(def: ChoiceDef): void {
    if (this.lockStory) {
      // A replayed chapter keeps the answers the player gave the first time.
      const before = this.story.choices[def.id];
      const ok = def.options.some((o) => o.id === before && this.check(o.requires));
      this.fireEvent(choiceEvent(def.id, ok ? before : def.defaultOption));
      return;
    }
    this.choiceQueue.push(def);
  }

  /** Opens the next waiting question once nothing else is competing for the player's attention. */
  private openNextChoice(): void {
    if (this.pendingChoice || !this.choiceQueue.length) return;
    if (this.currentLine || this.dialogueQueue.length || this.cutscene || this.dead || this.inCombat) return;
    const def = this.choiceQueue.shift()!;
    const options = def.options.filter((o) => this.check(o.requires)).map((o) => ({ id: o.id, label: o.label, hint: o.hint }));
    const timed = this.opts.timedChoices && def.timeoutSec ? def.timeoutSec : undefined;
    this.pendingChoice = { id: def.id, prompt: def.prompt, speaker: def.speaker, options, defaultOption: def.defaultOption, timeLeft: timed };
    this.aiming = false;
    this.emit({ type: "choice", choice: this.pendingChoice });
  }

  /** The player picked an option (or time ran out). Returns false if that option is not on offer. */
  choose(optionId: string): boolean {
    const pc = this.pendingChoice;
    if (!pc || !pc.options.some((o) => o.id === optionId)) return false;
    const def = this.choiceDefs.get(pc.id)!;
    const opt = def.options.find((o) => o.id === optionId)!;
    this.pendingChoice = null;
    this.story = recordChoice(applyEffects(this.story, opt.effects), def.id, opt.id);
    this.emit({ type: "choiceResolved", choiceId: def.id, optionId: opt.id });
    this.fireEvent(choiceEvent(def.id, opt.id));
    return true;
  }

  /** Counts down a timed question (only when the player turned timed choices on). */
  tickChoice(dt: number): void {
    const pc = this.pendingChoice;
    if (!pc || pc.timeLeft === undefined) return;
    pc.timeLeft -= dt;
    if (pc.timeLeft <= 0) this.choose(pc.defaultOption);
  }

  /** The story as it should be saved when the chapter ends: the last chapter's playstyle is remembered. */
  finishedStory(): StoryState {
    const s = cloneStory(this.story);
    if (!this.lockStory && this.stats.time >= STYLE_MIN_SECONDS) s.style = styleOf(this.stats);
    return s;
  }

  private giveWeapon(id: WeaponId, ammo?: number): void {
    const slot = WEAPONS[id].slot;
    const cur = this.weapons[slot];
    if (cur && cur.id === id) cur.reserve = Math.min(WEAPONS[id].reserveMax, cur.reserve + (ammo ?? WEAPONS[id].magSize));
    else this.weapons[slot] = newWeaponState(id, Math.round((ammo ?? WEAPONS[id].reserveMax / 2) * this.opts.ammoScale));
    this.weapons.active = slot;
    this.emit({ type: "swap", weapon: id });
  }

  activeWeapon(): WeaponState | null {
    const w = this.weapons[this.weapons.active];
    return w ?? this.weapons.sidearm ?? this.weapons.long;
  }

  /** Called by the UI when the player chooses "Skip puzzle" (an accessibility option). */
  skipPuzzle(): boolean {
    const p = this.puzzles.find((q) => canSkip(q, this.opts.puzzleSkipAfter));
    if (!p) return false;
    p.solved = true;
    this.fireEvent(p.def.onSolve);
    this.emit({ type: "puzzle", text: "Puzzle skipped", solved: true });
    return true;
  }

  skippablePuzzle(): PuzzleState | undefined {
    return this.puzzles.find((q) => canSkip(q, this.opts.puzzleSkipAfter));
  }

  activeHint(): string | null {
    const p = this.puzzles.find((q) => showHint(q));
    return p ? p.def.hint : null;
  }

  skipCutscene(): void {
    if (!this.cutscene) return;
    this.cutscene = null;
    this.cam.rail = null;
    this.dialogueQueue = [];
    this.currentLine = null;
    this.emit({ type: "cutscene", active: false });
  }

  // ---------------------------------------------------------------- main step

  step(dt: number, input: InputFrame): void {
    if (this.completed) return;
    if (this.pendingChoice) {
      // The world waits while the player answers.
      this.tickChoice(dt);
      return;
    }
    dt *= this.timeScale;
    this.time += dt;
    if (!this.dead) this.stats.time += dt;

    // Scheduled story events.
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      this.scheduled = this.scheduled.filter((s) => s.at > this.time);
      for (const s of due) {
        if ("event" in s) this.fireEvent(s.event);
        else this.runAction(s.action);
      }
    }
    this.updateDialogue(dt);
    this.openNextChoice();
    if (this.completeWhenQuiet && !this.pendingChoice && !this.choiceQueue.length && !this.currentLine && !this.dialogueQueue.length && !this.cutscene) {
      this.completeWhenQuiet = false;
      this.runAction({ type: "complete" });
    }
    this.updateMelody();

    if (this.cutscene) {
      this.updateCutscene(dt, input);
      return;
    }

    if (this.dead) return;

    const p = this.player;
    this.updateMovers(dt);
    const riding = this.riding;
    const gunner = riding && this.vehicle!.track.def.mode === "gunner";
    // Hanging and rope swinging allow only the sidearm.
    const oneHanded = p.mode === "hang" || p.mode === "rope";
    const canAim = (riding ? gunner : ["ground", "air", "cover", "hang", "rope", "slide"].includes(p.mode)) && !this.throwAiming && !p.inWater;
    this.aiming = input.buttons.aim.held && canAim && !!this.activeWeapon();
    if (this.aiming && oneHanded && this.weapons.sidearm) this.weapons.active = "sidearm";
    if (this.aiming && p.sprinting) p.sprinting = false;

    // Aim assist: slow-down while aiming near a target, snap when aiming starts.
    const targets = this.enemies.filter((e) => e.alive && this.world.lineOfSight(this.cam.position, e.head().c)).map((e) => ({ pos: { ...e.head().c, y: e.head().c.y - 0.35 } }));
    for (const pu of this.pursuers) if (pu.alive) targets.push({ pos: { ...pursuerHead(pu).c, y: pursuerHead(pu).c.y - 0.5 } });
    const assist = aimAssist(this.aiming ? this.opts.aimAssist : "off", this.cam.pivot, this.cam.yaw, this.cam.pitch, targets);
    let lookYaw = input.look.yaw * assist.sensitivity;
    let lookPitch = input.look.pitch * assist.sensitivity;
    if (this.aiming && !this.wasAiming) {
      lookYaw += assist.snapYaw;
      lookPitch += assist.snapPitch;
    }
    this.wasAiming = this.aiming;
    this.timeScale = this.aiming && this.opts.slowMoAim ? 0.55 : 1;

    // Navigation assist turns the camera toward the objective.
    if (input.buttons.navAssist.pressed && this.objective?.target) {
      const d = sub(this.objective.target, this.cam.pivot);
      lookYaw += angleDiff(this.cam.yaw, yawOf(d));
      lookPitch += clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.6) - this.cam.pitch;
    }

    if (input.buttons.shoulderSwap.pressed) this.cam.shoulder = this.cam.shoulder === 1 ? -1 : 1;

    if (riding) this.updateVehicle(dt, input);
    else {
      p.update(dt, input, this.cam.yaw, this.world, this.aiming, { autoTraversal: this.opts.autoTraversal, holdToToggle: false });
      this.applyWind(dt);
    }
    for (const ev of p.events) this.onPlayerEvent(ev);
    p.events.length = 0;

    const travel = Math.hypot(p.vel.x, p.vel.z) > 0.5 ? yawOf(p.vel) : null;
    const w = this.activeWeapon();
    updateCamera(this.cam, this.cameraInput({ yaw: lookYaw, pitch: lookPitch }, travel, !!w && !!WEAPONS[w.id].scoped), this.world, dt);

    this.coverTime = p.mode === "cover" ? this.coverTime + dt : 0;

    if (!riding || gunner) this.updateWeapons(dt, input, assist.magnetYaw, assist.magnetPitch);
    if (riding) this.prompt = null;
    else {
      this.updateMelee(dt, input);
      this.updateThrow(input);
      this.updateInteract(input);
    }
    this.updateTagging(dt);
    this.updateProjectiles(dt);
    this.updateEnemies(dt);
    this.updatePursuers(dt);
    this.updateHazards(dt);
    this.updateSearchlights(dt);
    this.updateWorldTriggers();
    this.updatePuzzles(dt);
    tickHealth(this.health, dt);

    if (p.mode === "dead" && !this.dead) this.killPlayer();
  }

  private cameraInput(look: { yaw: number; pitch: number }, travelYaw: number | null = null, scoped = false) {
    return {
      lookYaw: look.yaw,
      lookPitch: look.pitch,
      aiming: this.aiming || this.throwAiming,
      scoped,
      playerPos: this.player.pos,
      playerHeight: this.player.height,
      travelYaw,
      autoRecenter: this.opts.autoRecenter,
      invertY: this.opts.invertY,
      fovScale: this.opts.fovScale,
      // In the jeep the camera sits further back and a little higher to show the road ahead.
      hints: this.riding ? [VEHICLE_CAM] : this.world.data.camHints,
    };
  }

  private updateDialogue(dt: number): void {
    if (this.currentLine) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.currentLine = null;
    }
    if (!this.currentLine && this.dialogueQueue.length) {
      const line = this.dialogueQueue.shift()!;
      this.currentLine = line;
      this.dialogueTimer = line.duration ?? Math.max(2.2, line.text.split(" ").length * 0.32 + 0.8);
      this.emit({ type: "dialogue", line });
    }
  }

  private updateCutscene(dt: number, input: InputFrame): void {
    const cs = this.cutscene!;
    const shot = cs.shots[cs.index];
    cs.t += dt;
    const t = Math.min(1, cs.t / shot.duration);
    const e = t * t * (3 - 2 * t);
    this.cam.rail = { position: add(shot.from, scale(sub(shot.to, shot.from), e)), target: shot.target };
    if (input.buttons.pause.pressed || input.buttons.jump.pressed) {
      // Skipping is handled by the UI's "hold to skip"; jump advances to the next shot.
      cs.t = shot.duration;
    }
    if (cs.t >= shot.duration) {
      cs.index++;
      cs.t = 0;
      if (cs.index >= cs.shots.length) {
        this.cutscene = null;
        this.cam.rail = null;
        this.emit({ type: "cutscene", active: false });
      }
    }
  }

  // ---------------------------------------------------------------- player events & noise

  private onPlayerEvent(ev: PlayerEvent): void {
    this.emit({ type: "player", ev });
    const n = TUNING.stealth.noise;
    const muffle = this.weather?.noiseScale ?? 1;
    if (ev.type === "sprintStep") this.makeNoise({ pos: ev.pos, radius: n.sprint * muffle, kind: "sprint" });
    if (ev.type === "hardLand" || ev.type === "land") this.makeNoise({ pos: ev.pos, radius: (ev.type === "hardLand" ? n.land : n.land * 0.4) * muffle, kind: "land" });
    if (ev.type === "crumble") this.emit({ type: "shake", amount: 0.5 });
  }

  makeNoise(noise: Noise): void {
    for (const e of this.enemies) e.hear(noise);
  }

  // ---------------------------------------------------------------- shooting

  private updateWeapons(dt: number, input: InputFrame, magnetYaw: number, magnetPitch: number): void {
    const p = this.player;
    for (const w of [this.weapons.sidearm, this.weapons.long]) if (w) tickWeapon(w, dt);
    const w = this.activeWeapon();
    if (!w) return;

    if (input.buttons.swapWeapon.pressed && this.weapons.sidearm && this.weapons.long && !p.hanging) {
      cancelReload(w);
      this.weapons.active = this.weapons.active === "long" ? "sidearm" : "long";
      this.emit({ type: "swap", weapon: this.activeWeapon()!.id });
      return;
    }
    if (["roll", "climbUp", "ledgeHop", "wall", "zip", "swim", "crate", "locked"].includes(p.mode)) {
      if (w.reloadLeft > 0 && p.mode !== "crate") cancelReload(w);
      return;
    }
    if (input.buttons.reload.pressed && startReload(w)) this.emit({ type: "reload", weapon: w.id });

    const def = WEAPONS[w.id];
    const blindFire = p.mode === "cover" && !this.aiming;
    const autoFire = this.opts.autoFireOnTarget && this.aiming && this.reticleOnEnemy();
    const wantsFire = autoFire || (def.automatic ? input.buttons.fire.held : input.buttons.fire.pressed);
    if (!wantsFire) return;
    if (p.mode === "hang" && !this.aiming) return; // must aim to shoot one-handed
    if (w.mag <= 0) {
      if (input.buttons.fire.pressed) {
        if (!startReload(w)) this.emit({ type: "dryFire" });
        else this.emit({ type: "reload", weapon: w.id });
      }
      return;
    }
    if (!canFire(w)) return;

    const recoil = fire(w);
    this.stats.shots++;
    const spread = currentSpread(
      def,
      {
        aiming: this.aiming,
        crouched: p.crouched,
        moving: clamp(Math.hypot(p.vel.x, p.vel.z) / TUNING.player.runSpeed, 0, 1),
        airborne: p.mode === "air" || p.mode === "rope",
        blindFire,
        bloom: w.bloom,
      },
      TUNING.cover.blindFireSpreadScale,
    );
    const muzzle = add(p.pos, add({ x: 0, y: p.height * 0.75, z: 0 }, scale(yawDir(this.cam.yaw + 0.3 * this.cam.shoulder), 0.45)));
    let anyHit = false;
    let kill = false;
    let head = false;
    for (let k = 0; k < def.pellets; k++) {
      const off = spreadOffset(spread, this.rand);
      const yaw = this.cam.yaw + off.yaw + magnetYaw;
      const pitch = this.cam.pitch + off.pitch + magnetPitch;
      const dir = lookDir(yaw, pitch);
      const res = this.hitscan(this.cam.position, dir, def.range, muzzle);
      this.emit({ type: "shot", from: muzzle, to: res.point, byPlayer: true, weapon: w.id, hit: !!res.enemy || !!res.pursuer });
      if (res.pursuer) {
        anyHit = true;
        if (res.headshot) head = true;
        const dmg = shotDamage(def, dist(muzzle, res.point), res.headshot) * (res.headshot ? 1.5 : 1);
        res.pursuer.hp -= dmg;
        res.pursuer.hitFlash = 0.12;
        if (res.pursuer.hp <= 0) {
          kill = true;
          this.destroyPursuer(res.pursuer);
        }
      } else if (res.enemy) {
        anyHit = true;
        const d = dist(muzzle, res.point);
        const dmg = shotDamage(def, d, res.headshot);
        const killed = res.enemy.damage(dmg, p.pos, res.headshot);
        if (!res.enemy.aware) {
          res.enemy.lastKnown = { ...p.pos };
          res.enemy.enterCombat();
        }
        if (res.headshot) head = true;
        if (killed) {
          kill = true;
          this.onEnemyKilled(res.enemy, res.headshot);
        }
      } else if (res.box) {
        if (this.world.damageBox(res.box, def.damage)) this.onBoxDestroyed(res.box);
      }
    }
    if (anyHit) {
      this.stats.hits++;
      if (head) this.stats.headshots++;
      this.emit({ type: "hitmarker", kill, headshot: head });
    }
    // Recoil kicks the camera.
    this.cam.pitch = clamp(this.cam.pitch + recoil.pitch * (this.aiming ? 0.6 : 1), TUNING.camera.minPitch, TUNING.camera.maxPitch);
    this.cam.yaw += recoil.yaw;
    this.cam.shake = Math.max(this.cam.shake, def.recoilPitch * 2);
    this.makeNoise({ pos: p.pos, radius: TUNING.stealth.noise.gunshot * def.noise, kind: "gunshot" });
    this.emit({ type: "sound", kind: "gunshot", pos: p.pos });
    if (this.stealthActive) this.stats.stealthBroken = true;
  }

  private reticleOnEnemy(): boolean {
    const res = this.hitscan(this.cam.position, lookDir(this.cam.yaw, this.cam.pitch), 60, this.player.chest());
    return !!res.enemy || !!res.pursuer;
  }

  /**
   * Traces a ray from the camera through the reticle. The first enemy or wall hit wins.
   * A second check from the muzzle stops the player shooting "through" cover the camera sees past.
   */
  hitscan(origin: V3, dir: V3, range: number, muzzle: V3): { point: V3; enemy?: Enemy; pursuer?: Pursuer; headshot: boolean; box?: import("./world/World").RuntimeBox } {
    const wall = this.world.raycast(origin, dir, range);
    let best = wall ? wall.t : range;
    let enemy: Enemy | undefined;
    let pursuer: Pursuer | undefined;
    let headshot = false;
    for (const pu of this.pursuers) {
      if (!pu.alive) continue;
      const h = pursuerHead(pu);
      const th = raySphere(origin, dir, h.c, h.r);
      if (th !== null && th < best) {
        best = th;
        pursuer = pu;
        headshot = true;
      }
      const tb = rayAabb(origin, dir, pursuerBox(pu), best);
      if (tb && tb.t < best) {
        best = tb.t;
        pursuer = pu;
        headshot = false;
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const h = e.head();
      const th = raySphere(origin, dir, h.c, h.r);
      if (th !== null && th < best) {
        best = th;
        enemy = e;
        headshot = true;
      }
      const tb = rayAabb(origin, dir, e.body(), best);
      if (tb && tb.t < best) {
        best = tb.t;
        enemy = e;
        headshot = false;
      }
    }
    if (enemy) pursuer = undefined;
    const point = add(origin, scale(dir, best));
    if (pursuer) return { point, pursuer, headshot };
    if (enemy && !this.world.lineOfSight(muzzle, point)) {
      const toPoint = norm(sub(point, muzzle));
      const block = this.world.raycast(muzzle, toPoint, dist(muzzle, point));
      return { point: block ? block.point : point, headshot: false, box: block?.box };
    }
    return { point, enemy, headshot, box: enemy ? undefined : wall?.box };
  }

  private onEnemyKilled(e: Enemy, headshot: boolean): void {
    this.killed.add(e.id);
    this.stats.kills++;
    this.squad.release(e.id);
    this.squad.releaseFlank(e.spawn.arena, e.id);
    // Drop ammo for the enemy's weapon.
    if (e.weapon && this.rand() < 0.85) {
      this.dynamicPickups.push({ id: `drop-${e.id}`, pos: { ...e.pos, y: e.pos.y + 0.3 }, weapon: e.weapon, amount: Math.ceil(WEAPONS[e.weapon].magSize * 0.7 * this.opts.ammoScale) });
    }
    void headshot;
    const before = new Map(this.waveAlive);
    this.recountAlive();
    const wave = e.spawn.wave ?? e.spawn.arena;
    if ((before.get(wave) ?? 0) > 0 && !this.waveAlive.get(wave)) this.fireEvent(`waveClear:${wave}`);
    if (!this.arenaAlive.get(e.spawn.arena)) this.fireEvent(`arenaClear:${e.spawn.arena}`);
  }

  dynamicPickups: Array<{ id: string; pos: V3; weapon: WeaponId; amount: number }> = [];

  private onBoxDestroyed(box: import("./world/World").RuntimeBox): void {
    const c = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 };
    this.emit({ type: "boxBroken", pos: c });
    if (box.explosive) this.explode(c, 4.5, 160, true);
  }

  explode(pos: V3, radius: number, damage: number, byPlayer: boolean): void {
    this.emit({ type: "explosion", pos });
    this.emit({ type: "shake", amount: 1 });
    this.makeNoise({ pos, radius: TUNING.stealth.noise.explosion, kind: "explosion" });
    this.emit({ type: "sound", kind: "explosion", pos });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(pos, add(e.pos, { x: 0, y: 1, z: 0 }));
      if (d < radius && this.world.lineOfSight(pos, add(e.pos, { x: 0, y: 1, z: 0 }))) {
        if (e.damage(damage * (1 - d / radius) + 20, pos, true) && byPlayer) this.onEnemyKilled(e, false);
        else if (e.alive) e.enterCombat();
      }
    }
    const pd = dist(pos, this.player.chest());
    if (pd < radius && this.world.lineOfSight(pos, this.player.chest())) this.hurtPlayer(damage * 0.6 * (1 - pd / radius) * (byPlayer ? 1 : this.difficultyMods.enemyDamage), pos);
    // Chain reactions with other explosive barrels.
    for (const b of this.world.boxes) {
      if (b.removed || !b.explosive) continue;
      const c = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
      if (dist(c, pos) < radius && dist(c, pos) > 0.1) {
        if (this.world.damageBox(b, 999)) this.scheduled.push({ at: this.time + 0.15, action: { type: "shake", amount: 0.5 } }), this.onBoxDestroyed(b);
      }
    }
  }

  hurtPlayer(amount: number, from: V3): void {
    if (this.dead || this.opts.invulnerable || this.player.iFrames > 0 || this.cutscene) return;
    const killed = applyDamage(this.health, amount);
    const fromYaw = yawOf(sub(from, this.player.pos));
    this.emit({ type: "playerHurt", fromYaw, amount });
    if (killed) this.killPlayer();
  }

  private killPlayer(): void {
    if (this.dead) return;
    this.dead = true;
    this.player.mode = "dead";
    this.stats.deaths++;
    this.emit({ type: "playerDied" });
  }

  // ---------------------------------------------------------------- melee & takedowns

  private updateMelee(dt: number, input: InputFrame): void {
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    if (this.comboTimer <= 0) this.comboStep = 0;
    const p = this.player;
    if (!input.buttons.melee.pressed || this.meleeCooldown > 0) return;
    const M = TUNING.melee;

    // Counter an enemy mid wind-up.
    const counter = this.enemies.find((e) => e.alive && e.counterable && dist(e.pos, p.pos) < M.range + 0.6);
    if (counter) {
      counter.stun(1.6);
      counter.damage(40, p.pos, false);
      this.emit({ type: "melee", pos: counter.pos, kind: "counter" });
      this.meleeCooldown = 0.3;
      if (!counter.alive) this.onEnemyKilled(counter, false);
      return;
    }

    const takedown = this.takedownTarget();
    if (takedown) {
      takedown.e.die();
      this.stats.takedowns++;
      this.emit({ type: "melee", pos: takedown.e.pos, kind: "takedown" });
      this.makeNoise({ pos: p.pos, radius: TUNING.stealth.noise.melee, kind: "melee" });
      if (takedown.kind === "ledge") {
        // Pull the enemy over the ledge.
        takedown.e.pos = add(takedown.e.pos, { x: 0, y: -4, z: 0 });
      } else if (takedown.kind === "behind") {
        p.mode = "locked";
        p.lockTimer = 0.7;
      }
      this.onEnemyKilled(takedown.e, false);
      this.meleeCooldown = 0.4;
      return;
    }

    if (!["ground", "cover"].includes(p.mode)) return;
    // Combo punches against the closest enemy in front.
    const target = this.enemies
      .filter((e) => e.alive && dist(e.pos, p.pos) < M.range && Math.abs(angleDiff(p.yaw, yawOf(sub(e.pos, p.pos)))) < M.arc)
      .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
    if (!target) {
      this.emit({ type: "melee", pos: p.pos, kind: "whiff" });
      this.meleeCooldown = 0.35;
      return;
    }
    p.yaw = yawOf(sub(target.pos, p.pos));
    const step = this.comboStep;
    this.comboStep = (this.comboStep + 1) % 3;
    this.comboTimer = M.comboWindow;
    this.meleeCooldown = 0.28;
    let dmg: number = M.hitDamage[step];
    let kind: "hit" | "finisher" = "hit";
    if (step === 2) {
      // Environmental finisher: slam into a wall, or knock off a ledge.
      const push = norm(sub(target.pos, p.pos));
      const behind = add(target.pos, { x: 0, y: 1, z: 0 });
      const wall = this.world.raycast(behind, push, M.finisherWallDistance);
      const beyond = add(target.pos, scale(push, 1.2));
      const drop = target.pos.y - this.world.groundHeight(beyond.x, beyond.z, target.pos.y + 0.2, 0.2).y;
      if (wall || drop > 3) {
        dmg = 999;
        kind = "finisher";
        if (drop > 3) target.pos = add(target.pos, scale(push, 1.2));
      }
    }
    target.stunTimer = 0;
    const killed = target.damage(dmg, p.pos, false);
    if (!killed) {
      target.lastKnown = { ...p.pos };
      target.enterCombat();
      if (step === 2) target.stun(0.9);
    }
    this.emit({ type: "melee", pos: target.pos, kind });
    if (killed) this.onEnemyKilled(target, false);
  }

  /** Silent takedown opportunities: from behind, from tall grass, from a ledge, or from above. */
  takedownTarget(): { e: Enemy; kind: "behind" | "ledge" | "above" } | null {
    const p = this.player;
    const M = TUNING.melee;
    for (const e of this.enemies) {
      if (!e.alive || e.state === "combat") continue;
      const d = distXZ(e.pos, p.pos);
      if (p.mode === "hang" && p.ledge) {
        const lp = p.ledge.a.y;
        if (Math.abs(e.pos.y - lp) < 0.4 && d < M.takedownRange + 0.6) return { e, kind: "ledge" };
        continue;
      }
      if (p.mode === "air" && p.vel.y < 0 && d < 1.6 && p.pos.y - e.pos.y > 0.8 && p.pos.y - e.pos.y < 4) return { e, kind: "above" };
      if ((p.mode === "ground" || p.mode === "cover") && d < M.takedownRange && Math.abs(e.pos.y - p.pos.y) < 0.6) {
        if (e.isBehind(p.pos) || (p.inGrass && p.crouched)) return { e, kind: "behind" };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- throwing

  private updateThrow(input: InputFrame): void {
    const p = this.player;
    const canThrow = (p.mode === "ground" || p.mode === "cover") && (this.grenades > 0 || this.bottles > 0);
    if (input.buttons.throw.pressed && canThrow) this.throwAiming = true;
    if (!canThrow) this.throwAiming = false;
    if (!this.throwAiming) {
      this.arcPreview = [];
      return;
    }
    const start = add(p.pos, { x: 0, y: 1.7, z: 0 });
    const vel = throwVelocity(this.cam.yaw, this.cam.pitch);
    this.arcPreview = simulateArc(this.world, start, vel, 2.2);
    if (input.buttons.throw.released || !input.buttons.throw.held) {
      const anyAlert = this.enemies.some((e) => e.alive && e.aware);
      const kind: "grenade" | "bottle" = this.bottles > 0 && (!anyAlert || this.grenades === 0) ? "bottle" : "grenade";
      if (kind === "bottle") this.bottles--;
      else this.grenades--;
      this.projectiles.push({ id: ++this.projectileId, kind, pos: start, vel, fuse: TUNING.grenade.fuse, byPlayer: true, resting: false });
      this.emit({ type: "grenade", pos: start, byPlayer: true });
      this.throwAiming = false;
      this.arcPreview = [];
    }
  }

  private updateProjectiles(dt: number): void {
    const g = TUNING.sim.gravity;
    for (const pr of this.projectiles) {
      pr.fuse -= dt;
      if (!pr.resting) {
        pr.vel.y -= g * dt;
        const d = scale(pr.vel, dt);
        const l = len(d);
        if (l > 1e-6) {
          const hit = this.world.raycast(pr.pos, scale(d, 1 / l), l);
          if (hit) {
            if (pr.kind === "bottle") {
              // Bottles shatter on impact and make a distracting noise.
              pr.fuse = -1;
              pr.pos = hit.point;
              this.makeNoise({ pos: hit.point, radius: TUNING.stealth.noise.bottle, kind: "bottle" });
              this.emit({ type: "sound", kind: "impact", pos: hit.point });
              continue;
            }
            const n = hit.normal;
            const vn = dot(pr.vel, n);
            pr.vel = scale(sub(pr.vel, scale(n, 2 * vn)), TUNING.grenade.bounce);
            pr.pos = add(hit.point, scale(n, 0.05));
            if (n.y > 0.5 && len(pr.vel) < 1.2) {
              pr.resting = true;
              pr.vel = { x: 0, y: 0, z: 0 };
            }
          } else pr.pos = add(pr.pos, d);
        }
      }
      if (pr.kind === "grenade" && pr.fuse <= 0) this.explode(pr.pos, TUNING.grenade.radius, TUNING.grenade.damage, pr.byPlayer);
    }
    this.projectiles = this.projectiles.filter((pr) => pr.fuse > 0);
  }

  /** Enemy grenade landing near the player that can be thrown back. */
  throwBackTarget(): Projectile | null {
    return this.projectiles.find((pr) => pr.kind === "grenade" && !pr.byPlayer && dist(pr.pos, this.player.pos) < TUNING.grenade.throwBackRadius && pr.fuse > 0.4) ?? null;
  }

  // ---------------------------------------------------------------- interaction & prompts

  private visibleInteracts(): InteractDef[] {
    return this.world.data.interacts.filter((i) => (!i.hidden || this.revealedInteracts.has(i.id)) && !(i.once && this.interactsUsed.has(i.id)));
  }

  private updateInteract(input: InputFrame): void {
    const p = this.player;
    this.prompt = null;
    const pressed = input.buttons.interact.pressed;

    // Auto-pick up ammo and throwables; weapons of a different type need a button press.
    const pickups = [
      ...this.world.data.pickups.filter((k) => !this.pickupsTaken.has(k.id)).map((k) => ({ ...k, dynamic: false })),
      ...this.dynamicPickups.map((k) => ({ ...k, type: "weapon" as const, dynamic: true })),
    ];
    for (const k of pickups) {
      if (dist(k.pos, add(p.pos, { x: 0, y: 0.4, z: 0 })) > 1.4) continue;
      const take = () => {
        if (k.dynamic) this.dynamicPickups = this.dynamicPickups.filter((d) => d.id !== k.id);
        else this.pickupsTaken.add(k.id);
      };
      if (k.type === "ammo") {
        const w = this.activeWeapon();
        if (w) {
          w.reserve = Math.min(WEAPONS[w.id].reserveMax, w.reserve + Math.round(k.amount * this.opts.ammoScale));
          this.emit({ type: "pickup", label: `+${k.amount} ammo` });
        }
        take();
      } else if (k.type === "grenade") {
        if (this.grenades < 3) {
          this.grenades = Math.min(3, this.grenades + k.amount);
          this.emit({ type: "pickup", label: "Grenade" });
          take();
        }
      } else if (k.type === "bottle") {
        if (this.bottles < 3) {
          this.bottles = Math.min(3, this.bottles + k.amount);
          this.emit({ type: "pickup", label: "Bottle" });
          take();
        }
      } else if (k.type === "weapon" && k.weapon) {
        const slot = WEAPONS[k.weapon].slot;
        const owned = this.weapons[slot];
        if (owned && owned.id === k.weapon) {
          if (owned.reserve < WEAPONS[k.weapon].reserveMax) {
            owned.reserve = Math.min(WEAPONS[k.weapon].reserveMax, owned.reserve + k.amount);
            this.emit({ type: "pickup", label: `+${k.amount} ${WEAPONS[k.weapon].name} ammo` });
            take();
          }
        } else if (pressed || (this.opts.autoPickup && !owned)) {
          this.giveWeapon(k.weapon, k.amount);
          this.emit({ type: "pickup", label: WEAPONS[k.weapon].name });
          take();
          return;
        } else {
          this.prompt = { label: `Take ${WEAPONS[k.weapon].name}`, action: "interact" };
        }
      }
    }

    // Treasures need a press (or auto pickup).
    for (const t of this.world.data.collectibles) {
      if (this.treasures.has(t.id) || dist(t.pos, add(p.pos, { x: 0, y: 0.6, z: 0 })) > 1.6) continue;
      if (pressed || this.opts.autoPickup) {
        this.treasures.add(t.id);
        this.emit({ type: "treasure", id: t.id, name: t.name, description: t.description });
        return;
      }
      this.prompt = { label: `Pick up ${t.name}`, action: "interact" };
    }

    const back = this.throwBackTarget();
    if (back) {
      this.prompt = { label: "Throw back grenade", action: "interact" };
      if (pressed) {
        const v = throwVelocity(this.cam.yaw, this.cam.pitch);
        back.byPlayer = true;
        back.resting = false;
        back.pos = add(p.pos, { x: 0, y: 1.7, z: 0 });
        back.vel = v;
        back.fuse = Math.max(back.fuse, 1.1);
        return;
      }
    }

    const td = this.takedownTarget();
    if (td) this.prompt = { label: td.kind === "ledge" ? "Ledge takedown" : "Takedown", action: "melee" };

    if (p.mode === "ground" || p.mode === "air") {
      const g = p.grappleTarget(this.world);
      if (g) {
        this.prompt = { label: "Grapple", action: "interact" };
        if (pressed) {
          const hand = add(p.pos, { x: 0, y: TUNING.climb.handHeight, z: 0 });
          p.attachRope(g, Math.max(3, Math.min(7, dist(g.anchor, hand) * 0.9)));
          return;
        }
      }
      for (const z of this.world.data.ziplines) {
        if (dist(add(p.pos, { x: 0, y: TUNING.climb.handHeight, z: 0 }), z.a) < 2.2) {
          this.prompt = { label: "Zipline", action: "interact" };
          if (pressed && p.tryZipFromGround(this.world)) return;
        }
      }
      if (p.grounded && !this.prompt) {
        for (const c of this.world.crates) {
          const cc = { x: (c.min.x + c.max.x) / 2, y: c.min.y, z: (c.min.z + c.max.z) / 2 };
          if (distXZ(cc, p.pos) < (c.max.x - c.min.x) / 2 + 0.75 && Math.abs(c.min.y - p.pos.y) < 0.3) this.prompt = { label: "Hold to push / pull", action: "interact" };
        }
      }
    }

    // Levers, doors, pillars, artifacts.
    if (p.mode === "ground" || p.mode === "cover") {
      const near = this.visibleInteracts()
        .filter((i) => dist(i.pos, add(p.pos, { x: 0, y: 1, z: 0 })) < i.radius)
        .sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos))[0];
      if (near) {
        this.prompt = { label: near.label, action: "interact" };
        if (pressed) this.useInteract(near);
      }
    }
    if (p.mode === "crate") this.prompt = { label: "Push / pull", action: "interact" };
  }

  private useInteract(i: InteractDef): void {
    if (i.once) this.interactsUsed.add(i.id);
    this.emit({ type: "interact", kind: i.kind, pos: i.pos });
    for (const pz of this.puzzles) {
      if (pz.def.type === "bells" && (pz.def.listen === i.id || pz.def.bells.includes(i.id))) {
        this.useBell(pz, i);
        return;
      }
      if (pz.def.type === "pillars" && pz.def.pillars.includes(i.id)) {
        if (rotatePillar(pz, i.id)) {
          this.emit({ type: "puzzle", text: "The mechanism clicks into place.", solved: true });
          this.fireEvent(pz.def.onSolve);
        }
        return;
      }
      if (pz.def.type === "sequence" && pz.def.levers.includes(i.id)) {
        const r = pullLever(pz, i.id);
        if (r.wrong) this.emit({ type: "puzzle", text: "The levers grind back to their start." });
        if (r.solved) {
          this.emit({ type: "puzzle", text: "Something heavy shifts nearby.", solved: true });
          this.fireEvent(pz.def.onSolve);
        }
        return;
      }
    }
    this.fireEvent(i.event);
  }

  // ---------------------------------------------------------------- tagging, triggers, puzzles

  private updateTagging(dt: number): void {
    if (!this.aiming) {
      this.tagTimer.clear();
      return;
    }
    const dir = lookDir(this.cam.yaw, this.cam.pitch);
    for (const e of this.enemies) {
      if (!e.alive || e.tagged) continue;
      const h = e.head().c;
      const to = sub(h, this.cam.position);
      const d = len(to);
      if (d > TUNING.stealth.tagRange) continue;
      const ang = Math.acos(clamp(dot(norm(to), dir), -1, 1));
      if (ang > 0.07 || !this.world.lineOfSight(this.cam.position, h)) {
        this.tagTimer.delete(e.id);
        continue;
      }
      const t = (this.tagTimer.get(e.id) ?? 0) + dt;
      this.tagTimer.set(e.id, t);
      if (t >= TUNING.stealth.tagHoldTime) e.tagged = true;
    }
  }

  private updateWorldTriggers(): void {
    const p = this.player;
    for (const t of this.world.data.triggers) {
      if (t.once && this.triggersFired.has(t.id)) continue;
      if (inside(add(p.pos, { x: 0, y: 0.5, z: 0 }), t)) {
        if (!t.once && this.triggersFired.has(t.id)) continue;
        this.triggersFired.add(t.id);
        this.fireEvent(t.event);
      } else if (!t.once) this.triggersFired.delete(t.id);
    }
    // Checkpoints activate on proximity, in order, and autosave (not mid-chase).
    if (this.riding) return;
    const cps = this.world.data.checkpoints;
    for (let i = this.lastCheckpointIndex + 1; i < cps.length; i++) {
      const c = cps[i];
      if (distXZ(c.pos, p.pos) < 6 && Math.abs(c.pos.y - p.pos.y) < 2.5 && p.mode !== "dead") {
        const anyCombat = this.enemies.some((e) => e.alive && e.state === "combat" && (dist(e.pos, p.pos) < 15 || e.visibleNow));
        if (anyCombat) break;
        this.lastCheckpointIndex = i;
        this.checkpointId = c.id;
        this.emit({ type: "checkpoint", id: c.id, label: c.label });
        break;
      }
    }
  }

  /** Story scripts can save progress at a specific point (after a puzzle, before a set piece). */
  forceCheckpoint(id: string): void {
    const cps = this.world.data.checkpoints;
    const i = cps.findIndex((c) => c.id === id);
    if (i <= this.lastCheckpointIndex) return;
    this.lastCheckpointIndex = i;
    this.checkpointId = id;
    this.emit({ type: "checkpoint", id, label: cps[i].label });
  }

  private updatePuzzles(dt: number): void {
    for (const pz of this.puzzles) {
      if (pz.started && !pz.solved) pz.elapsed += dt;
      if (pz.def.type === "plates" && !pz.solved) {
        const solved = updatePlates(pz, (plate) => {
          if (inside(add(this.player.pos, { x: 0, y: 0.1, z: 0 }), plate)) return true;
          return this.world.crates.some((c) => {
            const cc = { x: (c.min.x + c.max.x) / 2, y: c.min.y + 0.05, z: (c.min.z + c.max.z) / 2 };
            return inside(cc, plate);
          });
        });
        if (solved) {
          this.emit({ type: "puzzle", text: "The plates sink with a deep rumble.", solved: true });
          this.fireEvent(pz.def.onSolve);
        }
      }
    }
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    const p = this.player;
    const ctx: EnemyContext = {
      world: this.world,
      nav: (id) => {
        const n = this.navs.get(id);
        n?.sync(this.world);
        return n;
      },
      squad: this.squad,
      player: {
        pos: p.pos,
        chest: p.chest(),
        head: p.head(),
        crouched: p.crouched,
        inGrass: p.inGrass,
        alive: !this.dead,
        iFrames: p.iFrames,
        speed: Math.hypot(p.vel.x, p.vel.z),
        coverTime: this.coverTime,
        hanging: p.hanging,
      },
      difficulty: this.difficultyMods,
      rand: this.rand,
      enemies: this.enemies,
      sightScale: this.weather?.sightScale ?? 1,
      shoot: (e, hit, damage, target) => {
        const from = add(e.pos, { x: 0, y: e.crouching ? 1.0 : e.def.height - 0.35, z: 0 });
        const miss = add(target, { x: (this.rand() - 0.5) * 1.6, y: (this.rand() - 0.3) * 1.2, z: (this.rand() - 0.5) * 1.6 });
        const to = hit ? target : miss;
        this.emit({ type: "shot", from, to, byPlayer: false, weapon: e.weapon ?? "pistol", hit });
        this.emit({ type: "sound", kind: "gunshot", pos: from });
        if (hit) this.hurtPlayer(damage, from);
      },
      throwGrenade: (e, target) => {
        const start = add(e.pos, { x: 0, y: 1.8, z: 0 });
        const t = 1.3;
        const g = TUNING.sim.gravity;
        const aim = add(target, { x: (this.rand() - 0.5) * 2, y: 0, z: (this.rand() - 0.5) * 2 });
        const vel = { x: (aim.x - start.x) / t, y: (aim.y - start.y) / t + 0.5 * g * t, z: (aim.z - start.z) / t };
        this.projectiles.push({ id: ++this.projectileId, kind: "grenade", pos: start, vel, fuse: TUNING.grenade.fuse + 0.6, byPlayer: false, resting: false });
        this.emit({ type: "grenade", pos: start, byPlayer: false });
        this.emit({ type: "dialogue", line: { speaker: "Mercenary", text: "Grenade out!", duration: 1.4 } });
      },
      melee: (e, damage) => this.hurtPlayer(damage, e.pos),
      alert: (e, at) => {
        this.stats.alerts++;
        if (this.stealthActive) this.stats.stealthBroken = true;
        for (const o of this.enemies) {
          if (o !== e && o.alive && o.spawn.arena === e.spawn.arena && dist(o.pos, e.pos) < 35) {
            o.lastKnown = { ...at };
            o.enterCombat();
          }
        }
      },
      emit: (type, e, data) => {
        if (type === "enemyAlert") this.emit({ type: "alert", pos: e.pos });
        if (type === "bossPhase") {
          this.emit({ type: "bossPhase", phase: data ?? 2 });
          this.fireEvent(`bossPhase:${data}`);
        }
      },
    };
    for (const e of this.enemies) {
      // Distant enemies sleep to save battery.
      if (dist(e.pos, p.pos) > 90 && !e.aware) continue;
      e.update(dt, ctx);
    }
    this.squad.update(
      dt,
      this.enemies.map((e) => ({ id: e.id, arena: e.spawn.arena, alive: e.alive, distanceToPlayer: dist(e.pos, p.pos), wantsToShoot: e.wantsToShoot, lastShotAgo: e.lastShotAgo })),
    );
  }

  // ---------------------------------------------------------------- bells

  private useBell(pz: PuzzleState, i: InteractDef): void {
    if (pz.def.type !== "bells" || pz.solved) return;
    const def = pz.def;
    const count = def.bells.length;
    const posOf = (index: number) => this.world.data.interacts.find((x) => x.id === def.bells[index])?.pos ?? i.pos;
    if (def.listen === i.id) {
      pz.started = true;
      this.melody = def.order.map((index, k) => ({ at: this.time + 0.5 + k * 0.9, index, count, pos: posOf(index) }));
      this.emit({ type: "puzzle", text: "The old tune plays from the carillon notes." });
      return;
    }
    const r = ringBell(pz, i.id);
    this.emit({ type: "bell", index: r.index, count, pos: i.pos, caption: bellCaption(r.index, count) });
    if (r.wrong) this.emit({ type: "puzzle", text: "The note jars against the tune. Start again." });
    if (r.solved) {
      this.emit({ type: "puzzle", text: "The tower answers with a deep chime.", solved: true });
      this.fireEvent(def.onSolve);
    }
  }

  private updateMelody(): void {
    if (!this.melody.length) return;
    const due = this.melody.filter((m) => m.at <= this.time);
    this.melody = this.melody.filter((m) => m.at > this.time);
    for (const m of due) this.emit({ type: "bell", index: m.index, count: m.count, pos: m.pos, caption: bellCaption(m.index, m.count) });
  }

  // ---------------------------------------------------------------- moving platforms & hazards

  private updateMovers(dt: number): void {
    const p = this.player;
    for (const m of this.movers) {
      // Who is standing on this group right now (before it moves)?
      const onGroup = (pos: V3) => {
        const g = this.world.groundHeight(pos.x, pos.z, pos.y + 0.05, TUNING.player.radius);
        return !!g.box && g.box.group === m.def.group && Math.abs(g.y - pos.y) < 0.06;
      };
      const carryPlayer = (p.mode === "ground" || p.mode === "cover" || p.mode === "crate") && p.grounded && onGroup(p.pos);
      const riders = this.enemies.filter((e) => e.alive && onGroup(e.pos));
      const d = stepMover(m, dt);
      if (d.x === 0 && d.y === 0 && d.z === 0) continue;
      this.world.translateGroup(m.def.group, d);
      // Hanging players follow the ledge automatically; standing ones are carried here.
      if (carryPlayer) p.pos = add(p.pos, d);
      for (const e of riders) e.pos = add(e.pos, d);
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    const body = p.aabb();
    for (const h of this.hazards) {
      if (stepHazard(h, dt) && h.def.warn) this.emit({ type: "warning", text: h.def.warn });
      const box = hazardBox(h);
      // A tunnel or avalanche also sweeps away any enemy standing in its path.
      if (box && !isFinite(h.def.damage) && h.def.kind !== "kill") {
        for (const e of this.enemies) {
          if (!e.alive || !overlaps(e.body(), box)) continue;
          e.damage(99999, e.pos, true);
          this.onEnemyKilled(e, false);
        }
      }
      if (!box || !overlaps(body, box)) {
        h.contact = 0;
        continue;
      }
      h.contact += dt;
      if (!isFinite(h.def.damage)) {
        if (!this.opts.invulnerable) this.killPlayer();
      } else this.hurtPlayer(h.def.damage * dt, p.chest());
    }
  }

  /** Sideways push from wind in a storm. */
  private applyWind(dt: number): void {
    const w = this.weather;
    const p = this.player;
    if (!w || (w.wind.x === 0 && w.wind.z === 0) || !(p.mode === "ground" || p.mode === "air")) return;
    p.moveAndCollide({ x: w.wind.x * dt, y: 0, z: w.wind.z * dt }, this.world);
  }

  /** The weather the player is standing in right now, if any. */
  get weather(): WeatherDef | null {
    const pos = this.player.pos;
    for (const w of this.world.data.weather) if (this.weatherOn.has(w.id) && inside(pos, w)) return w;
    return null;
  }

  // ---------------------------------------------------------------- searchlights

  private updateSearchlights(dt: number): void {
    const p = this.player;
    const hidden = p.inGrass && p.crouched;
    for (const s of this.searchlights) {
      const yaw = beamYaw(s.def, this.time);
      const lit = s.active && !hidden && !this.dead && inBeam(s.def, yaw, p.pos) && this.world.lineOfSight(s.def.pos, p.chest());
      if (!stepSearchlight(s, this.time, dt, lit)) continue;
      this.stats.alerts++;
      if (this.stealthActive) this.stats.stealthBroken = true;
      this.emit({ type: "searchlightAlarm", pos: { ...p.pos } });
      this.emit({ type: "alert", pos: s.def.pos });
      for (const e of this.enemies) {
        if (!e.alive || e.spawn.arena !== s.def.arena) continue;
        e.lastKnown = { ...p.pos };
        e.enterCombat();
      }
      this.fireEvent(`searchlightAlarm:${s.def.id}`);
    }
  }

  /** Highest searchlight exposure, for the HUD's "spotted" meter. */
  get searchlightExposure(): number {
    return this.searchlights.reduce((m, s) => Math.max(m, s.exposure), 0);
  }

  // ---------------------------------------------------------------- vehicles

  get riding(): boolean {
    return !!this.vehicle && !this.vehicle.done;
  }

  private enterVehicle(trackId: string): void {
    const track = this.world.data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    this.vehicle = newVehicle(track);
    const p = this.player;
    p.mode = "vehicle";
    p.crouched = false;
    p.height = TUNING.player.height;
    p.pos = seatPos(this.vehicle);
    this.cam.yaw = this.vehicle.yaw;
    this.emit({ type: "vehicle", kind: "enter", pos: { ...this.vehicle.pos } });
  }

  private updateVehicle(dt: number, input: InputFrame): void {
    const v = this.vehicle!;
    const p = this.player;
    const evs = stepVehicle(v, { steer: input.move.x, throttle: input.move.y, boost: input.buttons.sprint.held }, this.world, dt, this.time);
    const at = trackAt(v.track, v.s);
    p.pos = seatPos(v);
    p.vel = scale(at.dir, v.speed);
    p.yaw = v.track.def.mode === "gunner" ? this.cam.yaw : v.yaw;
    p.grounded = true;
    for (const e of evs) {
      if (e.type === "crash") {
        this.emit({ type: "vehicle", kind: e.wrecked ? "wreck" : "crash", pos: e.pos });
        this.emit({ type: "shake", amount: e.wrecked ? 1 : 0.7 });
        if (e.wrecked) {
          this.emit({ type: "explosion", pos: e.pos });
          this.killPlayer();
          return;
        }
      } else if (e.type === "end") this.exitVehicle();
    }
  }

  private exitVehicle(): void {
    const v = this.vehicle!;
    const p = this.player;
    const at = trackAt(v.track, v.s);
    // Step out on the driver's side, or the other side if that's blocked.
    for (const side of [-1, 1]) {
      const spot = add(v.pos, scale(at.right, side * 2.2));
      const g = this.world.groundHeight(spot.x, spot.z, spot.y + 2, TUNING.player.radius);
      const pos = { x: spot.x, y: isFinite(g.y) ? g.y : v.pos.y, z: spot.z };
      if (!this.world.overlapsSolid(p.aabb(pos, TUNING.player.height))) {
        p.teleport(pos, v.yaw);
        break;
      }
    }
    if (p.mode === "vehicle") p.teleport({ ...v.pos, y: v.pos.y + 1.7 }, v.yaw);
    for (const pu of this.pursuers) pu.alive = false;
    this.emit({ type: "vehicle", kind: "exit", pos: { ...v.pos } });
    this.fireEvent(v.track.def.onEnd);
  }

  private spawnPursuers(group: string): void {
    const v = this.vehicle;
    for (const def of this.world.data.pursuers) {
      if (def.group !== group || this.killed.has(def.id) || this.pursuers.some((x) => x.def.id === def.id)) continue;
      const track = this.world.data.tracks.find((t) => t.id === def.track);
      if (track) this.pursuers.push(newPursuer(def, track, v?.s ?? 0));
    }
  }

  private updatePursuers(dt: number): void {
    const v = this.vehicle;
    if (!v || v.done) return;
    const p = this.player;
    const mods = this.difficultyMods;
    for (const pu of this.pursuers) {
      if (!pu.alive || pu.def.track !== v.track.def.id) continue;
      if (!stepPursuer(pu, v.s, v.speed, dt, this.rand, this.time)) continue;
      const from = pursuerHead(pu).c;
      if (!this.world.lineOfSight(from, p.chest())) continue;
      const hit = this.rand() < TUNING.pursuer.hitChance * mods.enemyAccuracy;
      const miss = add(p.chest(), { x: (this.rand() - 0.5) * 2, y: (this.rand() - 0.3) * 1.4, z: (this.rand() - 0.5) * 2 });
      this.emit({ type: "shot", from, to: hit ? p.chest() : miss, byPlayer: false, weapon: "rifle", hit });
      this.emit({ type: "sound", kind: "gunshot", pos: from });
      if (hit) this.hurtPlayer(TUNING.pursuer.damage * mods.enemyDamage, from);
    }
  }

  private destroyPursuer(pu: Pursuer): void {
    pu.alive = false;
    this.killed.add(pu.def.id);
    this.stats.kills++;
    this.emit({ type: "explosion", pos: { ...pu.pos } });
    this.emit({ type: "pursuerDown", pos: { ...pu.pos } });
    this.emit({ type: "shake", amount: 0.5 });
    const left = this.pursuers.filter((x) => x.alive && x.def.group === pu.def.group).length;
    if (left === 0) this.fireEvent(`pursuitClear:${pu.def.group}`);
  }

  /** Enemies that have the player in sight (for the HUD's directional threat indicators). */
  threats(): Array<{ yaw: number; danger: number; tagged: boolean }> {
    return this.enemies
      .filter((e) => e.alive && (e.suspicion > 0.1 || e.aware))
      .map((e) => ({ yaw: angleDiff(this.cam.yaw, yawOf(sub(e.pos, this.player.pos))), danger: Math.min(1, e.suspicion), tagged: e.tagged }));
  }

  get inCombat(): boolean {
    return this.enemies.some((e) => e.alive && e.state === "combat");
  }
}

const VEHICLE_CAM = { id: "vehicle", min: { x: -1e9, y: -1e9, z: -1e9 }, max: { x: 1e9, y: 1e9, z: 1e9 }, distance: 7.5, pitch: -0.22 };

function raySphere(o: V3, d: V3, c: V3, r: number): number | null {
  const oc = sub(o, c);
  const b = dot(oc, d);
  const cc = dot(oc, oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
