// Characters without model files: a jointed body built from capsules, boxes and spheres,
// merged into ONE skinned mesh (one draw call per character, important on phones) and
// animated in code from the simulation's state: walking, crouching, hanging, aiming, swimming...
//
// Bones use the usual humanoid layout, so a rigged glTF character with matching bone names
// could replace this later (see docs/art-pipeline.md).

import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCapsuleVertexData } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { CreateSphereVertexData } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Space } from "@babylonjs/core/Maths/math.axis";
import type { Scene } from "@babylonjs/core/scene";
import type { V3 } from "../sim/math";

// ------------------------------------------------------------------ skeleton layout

const BONES = ["hips", "spine", "chest", "head", "shoulderL", "elbowL", "shoulderR", "elbowR", "thighL", "kneeL", "thighR", "kneeR"] as const;
export type BoneName = (typeof BONES)[number];

/** Joint positions in metres for a 1.8 m character facing +Z (left is -X). */
const JOINTS: Record<BoneName, { parent: BoneName | null; at: [number, number, number] }> = {
  hips: { parent: null, at: [0, 0.95, 0] },
  spine: { parent: "hips", at: [0, 1.1, 0] },
  chest: { parent: "spine", at: [0, 1.32, 0] },
  head: { parent: "chest", at: [0, 1.52, 0] },
  shoulderL: { parent: "chest", at: [-0.19, 1.42, 0] },
  elbowL: { parent: "shoulderL", at: [-0.21, 1.13, 0] },
  shoulderR: { parent: "chest", at: [0.19, 1.42, 0] },
  elbowR: { parent: "shoulderR", at: [0.21, 1.13, 0] },
  thighL: { parent: "hips", at: [-0.1, 0.92, 0] },
  kneeL: { parent: "thighL", at: [-0.1, 0.5, 0] },
  thighR: { parent: "hips", at: [0.1, 0.92, 0] },
  kneeR: { parent: "thighR", at: [0.1, 0.5, 0] },
};

// ------------------------------------------------------------------ outfits

export interface Outfit {
  skin: string;
  top: string;
  bottom: string;
  boots: string;
  hair: string;
  accent: string;
  /** Extra width on the torso and arms (heavies, brutes). */
  bulk?: number;
  helmet?: boolean;
  hood?: boolean;
  ponytail?: boolean;
  armor?: boolean;
}

export const OUTFITS = {
  ines: { skin: "#c68a62", top: "#2a8c82", bottom: "#8a7350", boots: "#4a3322", hair: "#3b2416", accent: "#d9b36c", ponytail: true },
  rifleman: { skin: "#d2a07a", top: "#8f3b2c", bottom: "#3b3b36", boots: "#26221d", hair: "#2b2b2b", accent: "#c9a447", helmet: true },
  shotgunner: { skin: "#b07a54", top: "#b5652a", bottom: "#3a352c", boots: "#26221d", hair: "#1c1a18", accent: "#c9a447", bulk: 0.08 },
  sniper: { skin: "#d9ab86", top: "#5d3b6e", bottom: "#33312d", boots: "#26221d", hair: "#2b2b2b", accent: "#c9a447", hood: true },
  grenadier: { skin: "#a8724c", top: "#8a6d20", bottom: "#3b3b36", boots: "#26221d", hair: "#1c1a18", accent: "#c9a447", helmet: true },
  heavy: { skin: "#c08e66", top: "#2f3e4b", bottom: "#23282d", boots: "#191b1d", hair: "#1c1a18", accent: "#c9a447", bulk: 0.18, helmet: true, armor: true },
  brute: { skin: "#9c6844", top: "#6b1d1d", bottom: "#2d2620", boots: "#191b1d", hair: "#1c1a18", accent: "#c9a447", bulk: 0.22 },
  kessa: { skin: "#e0b08a", top: "#9c7a22", bottom: "#2b2a28", boots: "#1e1a16", hair: "#a3361f", accent: "#e7c35a", ponytail: true },
} satisfies Record<string, Outfit>;

export const outfitFor = (archetype: string): Outfit => {
  if (archetype === "lieutenant" || archetype === "kessa") return OUTFITS.kessa;
  return (OUTFITS as Record<string, Outfit>)[archetype] ?? OUTFITS.rifleman;
};

// ------------------------------------------------------------------ mesh building

interface Part {
  bone: BoneName;
  vd: VertexData;
  color: string;
}

const box = (w: number, h: number, d: number) => CreateBoxVertexData({ width: w, height: h, depth: d });
const capsule = (r: number, h: number) => CreateCapsuleVertexData({ radius: r, height: h, tessellation: 8, capSubdivisions: 2 });
const sphere = (d: number) => CreateSphereVertexData({ diameter: d, segments: 6 });

function place(vd: VertexData, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): VertexData {
  vd.transform(Matrix.Scaling(sx, sy, sz).multiply(Matrix.Translation(x, y, z)));
  return vd;
}

function parts(o: Outfit): Part[] {
  const b = o.bulk ?? 0;
  const out: Part[] = [];
  const add = (bone: BoneName, vd: VertexData, color: string) => out.push({ bone, vd, color });
  // Torso.
  add("hips", place(box(0.32 + b, 0.2, 0.2 + b * 0.5), 0, 0.95, 0), o.bottom);
  add("spine", place(capsule(0.14 + b * 0.5, 0.36), 0, 1.13, 0), o.top);
  add("chest", place(box(0.38 + b, 0.3, 0.22 + b * 0.6), 0, 1.33, 0), o.top);
  if (o.armor) add("chest", place(box(0.42 + b, 0.26, 0.28 + b * 0.6), 0, 1.31, 0.01), o.accent);
  add("chest", place(box(0.06, 0.32, 0.01), 0.1, 1.3, 0.12 + b * 0.3), o.accent); // strap
  // Head.
  add("head", place(capsule(0.06, 0.12), 0, 1.53, 0), o.skin); // neck
  add("head", place(sphere(0.23), 0, 1.65, 0.01, 1, 1.12, 1), o.skin);
  if (o.helmet) add("head", place(sphere(0.27), 0, 1.71, -0.005, 1, 0.75, 1.05), o.accent);
  else if (o.hood) add("head", place(sphere(0.28), 0, 1.68, -0.03, 1, 1.05, 1.05), o.top);
  else add("head", place(sphere(0.245), 0, 1.69, -0.025, 1, 0.9, 1), o.hair);
  if (o.ponytail) add("head", place(capsule(0.04, 0.22), 0, 1.6, -0.15), o.hair);
  // Arms and hands.
  for (const s of [-1, 1] as const) {
    const sh: BoneName = s < 0 ? "shoulderL" : "shoulderR";
    const el: BoneName = s < 0 ? "elbowL" : "elbowR";
    add(sh, place(capsule(0.055 + b * 0.25, 0.32), 0.205 * s, 1.28, 0), o.top);
    add(el, place(capsule(0.048 + b * 0.2, 0.28), 0.215 * s, 1.0, 0), o.skin);
    add(el, place(sphere(0.085), 0.215 * s, 0.84, 0.01), o.skin);
    // Legs and boots.
    const th: BoneName = s < 0 ? "thighL" : "thighR";
    const kn: BoneName = s < 0 ? "kneeL" : "kneeR";
    add(th, place(capsule(0.08 + b * 0.25, 0.46), 0.1 * s, 0.71, 0), o.bottom);
    add(kn, place(capsule(0.065 + b * 0.2, 0.44), 0.1 * s, 0.28, 0), o.bottom);
    add(kn, place(box(0.11, 0.1, 0.24), 0.1 * s, 0.05, 0.04), o.boots);
  }
  return out;
}

// ------------------------------------------------------------------ the figure

export type Anim = "idle" | "move" | "air" | "hang" | "climb" | "rope" | "zip" | "swim" | "aim" | "cover" | "drive" | "dead" | "roll" | "stunned";

export interface Pose {
  pos: V3;
  yaw: number;
  anim: Anim;
  /** Horizontal speed in m/s (drives the walk cycle). */
  speed: number;
  /** 0 standing .. 1 fully crouched. */
  crouch: number;
  /** Camera pitch when aiming (radians, up is positive). */
  aimPitch: number;
  /** 0..1 lying down (death). */
  lie: number;
  /** Extra forward roll (dodge roll), radians. */
  roll: number;
  /** One-handed aim (hanging or on a rope). */
  oneHanded?: boolean;
}

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export class Figure {
  readonly mesh: Mesh;
  readonly mat: PBRMaterial;
  readonly gun: Mesh;
  readonly blob: Mesh | null;
  private bones = new Map<BoneName, Bone>();
  private rest = new Map<BoneName, Vector3>();
  private cur = new Map<BoneName, Vector3>();
  private tmp = new Vector3();
  private phase = 0;
  private idleTime = 0;
  private hipDrop = 0;

  constructor(scene: Scene, name: string, outfit: Outfit, height: number, blobShadow: boolean) {
    const scale = height / 1.8;
    const skel = new Skeleton(`${name}-skel`, `${name}-skel`, scene);
    for (const b of BONES) {
      const j = JOINTS[b];
      const p = j.parent ? JOINTS[j.parent].at : [0, 0, 0];
      const local = Matrix.Translation((j.at[0] - p[0]) * scale, (j.at[1] - p[1]) * scale, (j.at[2] - p[2]) * scale);
      const bone = new Bone(b, skel, j.parent ? this.bones.get(j.parent)! : null, local);
      this.bones.set(b, bone);
      this.rest.set(b, new Vector3(local.m[12], local.m[13], local.m[14]));
      this.cur.set(b, Vector3.Zero());
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    const mi: number[] = [];
    const mw: number[] = [];
    for (const part of parts(outfit)) {
      const base = positions.length / 3;
      const c = Color3.FromHexString(part.color).toLinearSpace();
      const bi = BONES.indexOf(part.bone);
      const pos = part.vd.positions!;
      for (let i = 0; i < pos.length; i += 3) {
        positions.push(pos[i] * scale, pos[i + 1] * scale, pos[i + 2] * scale);
        colors.push(c.r, c.g, c.b, 1);
        mi.push(bi, 0, 0, 0);
        mw.push(1, 0, 0, 0);
      }
      normals.push(...part.vd.normals!);
      for (const ix of part.vd.indices!) indices.push(ix + base);
    }
    const vd = new VertexData();
    vd.positions = positions;
    vd.normals = normals;
    vd.indices = indices;
    vd.colors = colors;
    vd.matricesIndices = mi;
    vd.matricesWeights = mw;
    this.mesh = new Mesh(name, scene);
    vd.applyToMesh(this.mesh);
    this.mesh.skeleton = skel;
    this.mesh.numBoneInfluencers = 1;
    this.mesh.isPickable = false;

    this.mat = new PBRMaterial(`${name}-mat`, scene);
    this.mat.albedoColor = Color3.White();
    this.mat.metallic = 0;
    this.mat.roughness = 0.78;
    this.mat.environmentIntensity = 0.5;
    this.mesh.material = this.mat;

    this.gun = MeshBuilder.CreateBox(`${name}-gun`, { width: 0.055, height: 0.42, depth: 0.1 }, scene);
    const gm = new StandardMaterial(`${name}-gunMat`, scene);
    gm.diffuseColor = new Color3(0.08, 0.08, 0.09);
    gm.specularColor = new Color3(0.3, 0.3, 0.3);
    this.gun.material = gm;
    this.gun.attachToBone(this.bones.get("elbowR")!, this.mesh);
    this.gun.position.set(0.015, -0.33 * scale, 0.05);
    this.gun.isPickable = false;

    this.blob = blobShadow ? blob(scene, name) : null;
  }

  dispose(): void {
    this.gun.dispose();
    this.blob?.dispose();
    this.mesh.skeleton?.dispose();
    this.mesh.dispose();
  }

  setEnabled(on: boolean): void {
    this.mesh.setEnabled(on);
    this.blob?.setEnabled(on);
  }

  /** Sets one bone's target rotation for this frame (blended in update). */
  private targets = new Map<BoneName, [number, number, number]>();
  private set(b: BoneName, x: number, y = 0, z = 0): void {
    this.targets.set(b, [x, y, z]);
  }

  update(dt: number, p: Pose): void {
    this.targets.clear();
    this.phase += p.speed * dt * 1.9;
    const swing = Math.min(1, p.speed / 5.6);
    const a = p.anim;
    const legL = Math.sin(this.phase);
    const legR = Math.sin(this.phase + Math.PI);
    let drop = 0;

    if (a === "move" || a === "idle" || a === "aim" || a === "cover") {
      const amp = 0.15 + 0.55 * swing;
      this.set("thighL", -legL * amp);
      this.set("thighR", -legR * amp);
      this.set("kneeL", Math.max(0, -Math.cos(this.phase)) * amp * 1.5);
      this.set("kneeR", Math.max(0, Math.cos(this.phase)) * amp * 1.5);
      this.set("shoulderL", legR * amp * 0.8, 0, -0.08);
      this.set("shoulderR", legL * amp * 0.8, 0, 0.08);
      this.set("elbowL", -0.25 - swing * 0.35);
      this.set("elbowR", -0.25 - swing * 0.35);
      this.set("spine", 0.06 * swing, Math.sin(this.phase) * 0.08 * swing);
      if (a === "idle") {
        this.idleTime += dt;
        this.set("chest", Math.sin(this.idleTime * 1.4) * 0.025);
        this.set("thighL", 0);
        this.set("thighR", 0);
        this.set("kneeL", 0.04);
        this.set("kneeR", 0.04);
      }
    }
    if (p.crouch > 0.01 && (a === "move" || a === "idle" || a === "aim" || a === "cover")) {
      const c = p.crouch;
      drop = 0.4 * c;
      const t = this.targets;
      t.set("thighL", [(t.get("thighL")?.[0] ?? 0) * 0.5 - 1.25 * c, 0, 0]);
      t.set("thighR", [(t.get("thighR")?.[0] ?? 0) * 0.5 - 1.25 * c, 0, 0]);
      t.set("kneeL", [(t.get("kneeL")?.[0] ?? 0) * 0.5 + 2.0 * c, 0, 0]);
      t.set("kneeR", [(t.get("kneeR")?.[0] ?? 0) * 0.5 + 2.0 * c, 0, 0]);
      this.set("spine", 0.35 * c);
    }
    if (a === "aim" || a === "cover") {
      const pitch = a === "aim" ? p.aimPitch : 0;
      this.set("shoulderR", -Math.PI / 2 - pitch, 0, 0.05);
      this.set("elbowR", 0);
      if (!p.oneHanded) {
        this.set("shoulderL", -Math.PI / 2.3 - pitch, 0, 0.5);
        this.set("elbowL", -0.5);
      }
      this.set("chest", -pitch * 0.3);
    }
    if (a === "air") {
      this.set("thighL", -0.7);
      this.set("thighR", -0.25);
      this.set("kneeL", 1.1);
      this.set("kneeR", 0.6);
      this.set("shoulderL", -0.6, 0, -0.7);
      this.set("shoulderR", -0.4, 0, 0.7);
      this.set("elbowL", -0.4);
      this.set("elbowR", -0.4);
    }
    if (a === "hang" || a === "climb" || a === "zip") {
      const reach = a === "climb" ? Math.sin(this.phase * 2) * 0.35 : 0;
      this.set("shoulderL", -Math.PI + 0.15 + reach, 0, -0.12);
      this.set("shoulderR", -Math.PI + 0.15 - reach, 0, 0.12);
      this.set("elbowL", -0.25);
      this.set("elbowR", -0.25);
      this.set("thighL", -0.25 - reach * 0.6);
      this.set("thighR", -0.1 + reach * 0.6);
      this.set("kneeL", 0.5);
      this.set("kneeR", 0.3);
      this.set("head", -0.35);
    }
    if (a === "rope") {
      this.set("shoulderL", -Math.PI + 0.1, 0, -0.1);
      this.set("shoulderR", -Math.PI + 0.45, 0, 0.1);
      this.set("elbowR", -0.4);
      this.set("thighL", -0.5);
      this.set("thighR", -0.35);
      this.set("kneeL", 0.6);
      this.set("kneeR", 0.6);
      if (p.oneHanded) {
        this.set("shoulderR", -Math.PI / 2 - p.aimPitch, 0, 0.05);
        this.set("elbowR", 0);
      }
    }
    if (a === "swim") {
      const s = Math.sin(this.phase * 1.5);
      this.set("shoulderL", -Math.PI + s * 1.1, 0, -0.3);
      this.set("shoulderR", -Math.PI - s * 1.1, 0, 0.3);
      this.set("thighL", s * 0.4);
      this.set("thighR", -s * 0.4);
      this.set("head", -0.9);
    }
    if (a === "drive") {
      drop = 0.42;
      this.set("thighL", -1.45);
      this.set("thighR", -1.45);
      this.set("kneeL", 1.45);
      this.set("kneeR", 1.45);
      this.set("shoulderL", -1.1, 0, 0.25);
      this.set("shoulderR", -1.1, 0, -0.25);
      this.set("elbowL", -0.45);
      this.set("elbowR", -0.45);
    }
    if (a === "stunned") {
      this.set("head", 0.6);
      this.set("spine", 0.4);
      this.set("shoulderL", 0.2, 0, -0.2);
      this.set("shoulderR", 0.2, 0, 0.2);
      drop = 0.15;
    }
    if (a === "dead" || a === "roll") {
      this.set("thighL", -1.0);
      this.set("thighR", -1.0);
      this.set("kneeL", 1.6);
      this.set("kneeR", 1.6);
      this.set("shoulderL", -1.2);
      this.set("shoulderR", -1.2);
      this.set("spine", a === "roll" ? 0.8 : 0);
      if (a === "dead") {
        this.set("thighL", -0.1);
        this.set("thighR", 0.1);
        this.set("kneeL", 0.2);
        this.set("kneeR", 0.1);
        this.set("shoulderL", -2.6, 0, -0.4);
        this.set("shoulderR", 0.3, 0, 0.6);
      }
    }

    // Blend every bone toward its target (bones with no target relax back to rest).
    const k = a === "roll" ? 1 : damp(16, dt);
    for (const b of BONES) {
      const t = this.targets.get(b) ?? [0, 0, 0];
      const c = this.cur.get(b)!;
      c.x += (t[0] - c.x) * k;
      c.y += (t[1] - c.y) * k;
      c.z += (t[2] - c.z) * k;
      this.bones.get(b)!.setRotation(c, Space.LOCAL);
    }
    this.hipDrop += (drop - this.hipDrop) * damp(14, dt);
    const r = this.rest.get("hips")!;
    this.tmp.set(r.x, r.y - this.hipDrop, r.z);
    this.bones.get("hips")!.setPosition(this.tmp, Space.LOCAL);

    // Whole-body placement.
    const m = this.mesh;
    m.position.set(p.pos.x, p.pos.y + (a === "swim" ? -0.9 : 0), p.pos.z);
    m.rotation.y = p.yaw;
    m.rotation.x = p.lie * (Math.PI / 2) + p.roll + (a === "swim" ? 1.3 : 0);
    if (this.blob) {
      this.blob.position.set(p.pos.x, p.pos.y + 0.03, p.pos.z);
      this.blob.setEnabled(this.mesh.isEnabled() && a !== "swim");
    }
  }
}

/** Soft round shadow for the Low tier (no shadow map). */
function blob(scene: Scene, name: string): Mesh {
  const m = MeshBuilder.CreateDisc(`${name}-blob`, { radius: 0.45, tessellation: 16 }, scene);
  m.rotation.x = Math.PI / 2;
  const mat = new StandardMaterial(`${name}-blobMat`, scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.alpha = 0.35;
  mat.disableLighting = true;
  m.material = mat;
  m.isPickable = false;
  return m;
}
