// Level data: plain JSON-like objects produced by the LevelBuilder DSL.
// Everything here is axis-aligned greybox geometry so collision stays simple and deterministic.

import type { V3 } from "../math";
import type { ArchetypeId } from "../ai/archetypes";
import type { WeaponId } from "../combat/weapons";

export type Material = "ground" | "sand" | "rock" | "stone" | "wood" | "metal" | "plaster" | "foliage";

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

export type InteractKind = "lever" | "door" | "examine" | "pillar" | "plate" | "valve";

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
  killY: number;
}
