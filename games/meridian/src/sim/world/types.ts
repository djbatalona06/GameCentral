// Level data: plain JSON-like objects produced by the LevelBuilder DSL.
// Everything here is axis-aligned greybox geometry so collision stays simple and deterministic.

import type { V3 } from "../math";
import type { ArchetypeId } from "../ai/archetypes";
import type { WeaponId } from "../combat/weapons";

export type Material = "ground" | "sand" | "rock" | "stone" | "wood" | "metal" | "plaster" | "foliage" | "snow";

export interface BoxDef {
  id: string;
  min: V3;
  max: V3;
  material: Material;
  /** Low or high cover: the player can snap to its sides. */
  cover?: "low" | "high";
  /** Ledges are generated on these edges ("n" = +Z side, "s" = -Z, "e" = +X, "w" = -X). */
  ledges?: Array<"n" | "s" | "e" | "w">;
  /** Group name so story events can remove or reveal several boxes at once. */
  group?: string;
  hidden?: boolean;
  /** Breakable wooden cover. */
  hp?: number;
  explosive?: boolean;
  /** Player may wall-jump off this box's sides. */
  wallJump?: boolean;
}

export interface RampDef {
  id: string;
  min: V3;
  max: V3;
  /** Axis the ramp rises along and whether it rises toward + or - on that axis. */
  axis: "x" | "z";
  dir: 1 | -1;
  slide?: boolean;
  material: Material;
}

export interface LedgeDef {
  id: string;
  a: V3;
  b: V3;
  /** Outward horizontal normal (points away from the wall, toward where the player hangs). */
  normal: V3;
  crumble?: boolean;
  group?: string;
}

export interface ClimbWallDef {
  id: string;
  min: V3;
  max: V3;
  normal: V3;
}

export interface RopeDef {
  id: string;
  anchor: V3;
  length: number;
  /** Grapple anchors are reached with a thrown hook instead of jumping onto a hanging rope. */
  grapple?: boolean;
}

export interface ZiplineDef {
  id: string;
  a: V3;
  b: V3;
}

export interface BeamDef {
  id: string;
  a: V3;
  b: V3;
}

export interface VolumeDef {
  id: string;
  min: V3;
  max: V3;
}

export interface CrateDef {
  id: string;
  min: V3;
  max: V3;
}

export type PickupType = "ammo" | "weapon" | "grenade" | "bottle";

export interface PickupDef {
  id: string;
  pos: V3;
  type: PickupType;
  weapon?: WeaponId;
  amount: number;
}

export interface CollectibleDef {
  id: string;
  pos: V3;
  name: string;
  description: string;
}

export type InteractKind = "lever" | "door" | "examine" | "pillar" | "plate" | "valve" | "bell" | "panel" | "vehicle";

export interface InteractDef {
  id: string;
  pos: V3;
  kind: InteractKind;
  label: string;
  radius: number;
  /** Event emitted when used. */
  event: string;
  once?: boolean;
  hidden?: boolean;
}

export interface TriggerDef {
  id: string;
  min: V3;
  max: V3;
  event: string;
  once: boolean;
}

export interface CheckpointDef {
  id: string;
  pos: V3;
  yaw: number;
  label: string;
}

export interface EnemySpawnDef {
  id: string;
  archetype: ArchetypeId;
  pos: V3;
  yaw: number;
  arena: string;
  patrol?: V3[];
  /** Spawn only when this story event fires (reinforcement waves). */
  wave?: string;
  /** Starts already hunting the player. */
  alerted?: boolean;
}

export interface ArenaDef {
  id: string;
  min: V3;
  max: V3;
}

export interface CamHintDef {
  id: string;
  min: V3;
  max: V3;
  pitch?: number;
  distance?: number;
}

/**
 * A group of boxes and ledges that moves along a path (crane containers, lifts).
 * Anyone standing on it or hanging from it is carried along.
 */
export interface MoverDef {
  id: string;
  group: string;
  /** Offsets from the starting position, visited in order. The first is usually {0,0,0}. */
  path: V3[];
  speed: number;
  mode: "loop" | "pingpong" | "once";
  /** Seconds to wait at each path point. */
  pause: number;
  startActive: boolean;
}

/**
 * A box that hurts or kills the player while it overlaps them. It can sweep along a direction
 * (a tunnel mouth rushing over a train roof, an avalanche) and repeat. Standing still on a
 * static one is fatal (falling off the train).
 */
export interface HazardDef {
  id: string;
  kind: "tunnel" | "avalanche" | "kill" | "fire";
  min: V3;
  max: V3;
  /** Metres per second. Zero for a static kill zone. */
  vel: V3;
  /** Distance travelled before the sweep ends. */
  travel: number;
  /** Seconds between sweeps (0 = only once). */
  every: number;
  /** Damage per second; Infinity kills on contact. */
  damage: number;
  startActive: boolean;
  /** Text shown (and spoken) when a sweep starts, e.g. "Tunnel! Get down!". */
  warn?: string;
}

/** The road for a vehicle chase: a centre line the jeep follows, with room to steer either side. */
export interface TrackDef {
  id: string;
  points: V3[];
  /** Total drivable width in metres. */
  width: number;
  /** "drive": the player steers. "gunner": Bram drives and the player shoots. */
  mode: "drive" | "gunner";
  /** Speed Bram holds in gunner mode, or the top speed when driving. */
  speed: number;
  /** Story event fired when the jeep reaches the end of the track. */
  onEnd: string;
}

/** An enemy jeep that chases the player along a track, with a gunner on the back. */
export interface PursuerDef {
  id: string;
  track: string;
  /** Which spawn call brings this jeep in. */
  group: string;
  /** How far behind (negative) or ahead (positive) of the player it tries to stay. */
  gap: number;
  lateral: number;
  hp: number;
}

/** Weather inside a volume: fog, reduced enemy sight, muffled footsteps and wind. */
export interface WeatherDef {
  id: string;
  kind: "sandstorm" | "snow" | "rain";
  min: V3;
  max: V3;
  /** Multiplier on how far enemies can see. */
  sightScale: number;
  /** Multiplier on how far the player's footsteps carry. */
  noiseScale: number;
  /** Extra fog density for the renderer. */
  fog: number;
  /** Sideways push in metres per second. */
  wind: V3;
  startActive: boolean;
}

/** A sweeping searchlight. Standing in its beam for too long raises the alarm in its arena. */
export interface SearchlightDef {
  id: string;
  pos: V3;
  /** Centre of the sweep and how far either side it turns (radians). */
  yaw: number;
  sweep: number;
  /** Seconds for one full sweep back and forth. */
  period: number;
  range: number;
  /** Half-width of the beam (radians). */
  cone: number;
  arena: string;
}

export interface LevelData {
  id: string;
  sky: { top: string; bottom: string; fog: string; fogDensity: number };
  boxes: BoxDef[];
  ramps: RampDef[];
  ledges: LedgeDef[];
  climbWalls: ClimbWallDef[];
  ropes: RopeDef[];
  ziplines: ZiplineDef[];
  beams: BeamDef[];
  water: VolumeDef[];
  grass: VolumeDef[];
  crates: CrateDef[];
  pickups: PickupDef[];
  collectibles: CollectibleDef[];
  interacts: InteractDef[];
  triggers: TriggerDef[];
  checkpoints: CheckpointDef[];
  enemies: EnemySpawnDef[];
  arenas: ArenaDef[];
  camHints: CamHintDef[];
  movers: MoverDef[];
  hazards: HazardDef[];
  tracks: TrackDef[];
  pursuers: PursuerDef[];
  weather: WeatherDef[];
  searchlights: SearchlightDef[];
  /** Scenery that streams past (the train level); purely visual, metres per second along -Z. */
  scroll?: { speed: number };
  killY: number;
}
