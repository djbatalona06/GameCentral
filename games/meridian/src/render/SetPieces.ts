// Visuals for the Act 1 systems: searchlight beams, tunnel mouths and avalanches sweeping
// along their path, scenery streaming past the train, and weather particles.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { GameSim } from "../sim/GameSim";
import { hazardBox } from "../sim/world/Dynamics";
import type { WeatherDef } from "../sim/world/types";
import { boxShape, cylShape, mergeShapes } from "./meshUtil";

const glow = (scene: Scene, name: string, color: string, alpha: number): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = Color3.FromHexString(color);
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  m.alpha = alpha;
  m.alphaMode = Constants.ALPHA_ADD;
  m.backFaceCulling = false;
  m.disableDepthWrite = true;
  return m;
};

// ------------------------------------------------------------------ searchlights

interface Beam {
  id: string;
  cone: Mesh;
  pool: Mesh;
  housing: Mesh;
  length: number;
  pitch: number;
}

export class Searchlights {
  private beams: Beam[] = [];

  constructor(scene: Scene, sim: GameSim) {
    const coneMat = glow(scene, "beamMat", "#fff2c4", 0.13);
    const poolMat = glow(scene, "poolMat", "#fff2c4", 0.22);
    for (const s of sim.searchlights) {
      const d = s.def;
      const reach = d.range * 0.75;
      const pitch = Math.atan2(d.pos.y, reach);
      const length = Math.hypot(d.pos.y, reach);
      const cone = MeshBuilder.CreateCylinder(`beam-${d.id}`, { height: length, diameterTop: 0.25, diameterBottom: 2 * length * Math.tan(d.cone), tessellation: 18, cap: Mesh.NO_CAP }, scene);
      cone.material = coneMat;
      cone.isPickable = false;
      const pool = MeshBuilder.CreateDisc(`pool-${d.id}`, { radius: length * Math.tan(d.cone) * 1.15, tessellation: 24 }, scene);
      pool.rotation.x = Math.PI / 2;
      pool.material = poolMat;
      pool.isPickable = false;
      const housing = mergeShapes(scene, `lamp-${d.id}`, [cylShape(0.7, 0.9, 0.8, 0, 0, 0, "#2d3238", true), boxShape(0.3, 0.6, 0.3, 0, -0.5, 0, "#2d3238")], { metallic: 0.8, roughness: 0.4 });
      housing.position.set(d.pos.x, d.pos.y, d.pos.z);
      this.beams.push({ id: d.id, cone, pool, housing, length, pitch });
    }
  }

  sync(sim: GameSim): void {
    for (const b of this.beams) {
      const s = sim.searchlights.find((x) => x.def.id === b.id)!;
      b.cone.setEnabled(s.active);
      b.pool.setEnabled(s.active);
      const dir = new Vector3(Math.sin(s.yaw) * Math.cos(b.pitch), -Math.sin(b.pitch), Math.cos(s.yaw) * Math.cos(b.pitch));
      const apex = new Vector3(s.def.pos.x, s.def.pos.y, s.def.pos.z);
      // The cylinder's narrow top points back at the lamp.
      b.cone.position = apex.add(dir.scale(b.length / 2));
      b.cone.rotationQuaternion = rotationFromUp(dir.scale(-1));
      const hit = apex.add(dir.scale(b.length));
      b.pool.position.set(hit.x, 0.05 + Math.max(0, hit.y), hit.z);
      b.housing.rotation.y = s.yaw - Math.PI / 2;
      // Warm up the beam colour as the player's exposure rises.
      (b.cone.material as StandardMaterial).emissiveColor = Color3.Lerp(Color3.FromHexString("#fff2c4"), Color3.FromHexString("#ff6b4a"), s.exposure);
    }
  }
}

function rotationFromUp(dir: Vector3): Quaternion {
  const up = Vector3.Up();
  const d = dir.normalizeToNew();
  const axis = Vector3.Cross(up, d);
  const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, d))));
  return axis.length() < 1e-6 ? Quaternion.Identity() : Quaternion.RotationAxis(axis.normalize(), ang);
}

// ------------------------------------------------------------------ sweeping hazards

export class Hazards {
  private meshes = new Map<string, Mesh>();

  constructor(scene: Scene, sim: GameSim, rock: PBRMaterial) {
    const snow = new StandardMaterial("avalancheMat", scene);
    snow.diffuseColor = new Color3(0.93, 0.96, 1);
    snow.emissiveColor = new Color3(0.35, 0.38, 0.42);
    snow.alpha = 0.92;
    for (const h of sim.hazards) {
      const d = h.def;
      if (d.kind === "kill") continue;
      const w = d.max.x - d.min.x;
      const ht = d.max.y - d.min.y;
      const dp = d.max.z - d.min.z;
      let m: Mesh;
      if (d.kind === "tunnel") {
        // The tunnel mouth: a thick roof slab plus side walls down to the ground (purely visual).
        m = MeshBuilder.CreateBox(`tunnel-${d.id}`, { width: w, height: ht, depth: Math.max(dp, 6) }, scene);
        m.material = rock;
        const walls = MeshBuilder.CreateBox(`tunnelWalls-${d.id}`, { width: 2.5, height: d.min.y + 2, depth: Math.max(dp, 6) }, scene);
        walls.material = rock;
        walls.parent = m;
        walls.position.set(-w / 2 + 1.25 - 0.5, -ht / 2 - (d.min.y + 2) / 2 + 0.5, 0);
        const wall2 = walls.clone(`tunnelWalls2-${d.id}`);
        wall2.parent = m;
        wall2.position.x = w / 2 - 1.25 + 0.5;
        const lamp = MeshBuilder.CreateBox(`tunnelLamp-${d.id}`, { width: w * 0.9, height: 0.15, depth: 0.15 }, scene);
        lamp.material = glow(scene, `tunnelLampMat-${d.id}`, "#ffb347", 0.9);
        lamp.parent = m;
        lamp.position.set(0, -ht / 2 + 0.2, -Math.max(dp, 6) / 2);
      } else {
        m = MeshBuilder.CreateBox(`hazard-${d.id}`, { width: w, height: ht, depth: dp }, scene);
        m.material = snow;
      }
      m.isPickable = false;
      m.setEnabled(false);
      this.meshes.set(d.id, m);
    }
  }

  sync(sim: GameSim): void {
    for (const h of sim.hazards) {
      const m = this.meshes.get(h.def.id);
      if (!m) continue;
      const box = hazardBox(h);
      m.setEnabled(!!box);
      if (box) m.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    }
  }
}

// ------------------------------------------------------------------ train scenery

/** Ground, poles and trees streaming past the (stationary) train. */
export class Scrolling {
  private ground: Mesh;
  private props: Mesh;
  private z: number[] = [];
  private x: number[] = [];
  private kind: number[] = [];
  private mats: Matrix[] = [];
  private offset = 0;

  constructor(scene: Scene, private speed: number, groundMat: PBRMaterial, centerZ: number) {
    this.ground = MeshBuilder.CreateGround("scrollGround", { width: 160, height: 520 }, scene);
    this.ground.position.set(0, -0.2, centerZ);
    this.ground.material = groundMat;
    for (const t of [groundMat.albedoTexture, groundMat.bumpTexture, groundMat.metallicTexture]) {
      const tex = t as Texture | null;
      if (tex) {
        tex.uScale = 80;
        tex.vScale = 260;
      }
    }
    this.props = mergeShapes(scene, "scrollProp", [cylShape(0.25, 0.25, 7, 0, 3.5, 0, "#4a3a2a"), boxShape(2.2, 0.15, 0.15, 0, 6.6, 0, "#4a3a2a")], { roughness: 0.9, metallic: 0 });
    const pine = mergeShapes(scene, "scrollPine", [cylShape(0.3, 0.4, 2.5, 0, 1.25, 0, "#3b2a1c"), cylShape(0, 3.4, 4.5, 0, 4.5, 0, "#1f3a26"), cylShape(0, 2.6, 3.4, 0, 6.6, 0, "#24432c")], { roughness: 0.9, metallic: 0 });
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const pole = i % 6 === 0;
      this.kind.push(pole ? 0 : 1);
      this.x.push(pole ? side * 5.5 : side * (8 + rnd() * 50));
      this.z.push(centerZ - 260 + rnd() * 520);
      this.mats.push(Matrix.Identity());
    }
    const poles = this.kind.map((k, i) => (k === 0 ? i : -1)).filter((i) => i >= 0);
    const trees = this.kind.map((k, i) => (k === 1 ? i : -1)).filter((i) => i >= 0);
    this.props.thinInstanceAdd(poles.map(() => Matrix.Identity()));
    pine.thinInstanceAdd(trees.map(() => Matrix.Identity()));
    this.poleIdx = poles;
    this.treeIdx = trees;
    this.pine = pine;
    this.centerZ = centerZ;
  }

  private poleIdx: number[];
  private treeIdx: number[];
  private pine: Mesh;
  private centerZ: number;

  update(dt: number): void {
    const d = this.speed * dt;
    this.offset += d;
    const tex = (this.ground.material as PBRMaterial).albedoTexture as Texture | null;
    for (const t of [tex, (this.ground.material as PBRMaterial).bumpTexture as Texture | null, (this.ground.material as PBRMaterial).metallicTexture as Texture | null]) {
      if (t) t.vOffset = (this.offset / 2) % 1;
    }
    const lo = this.centerZ - 260;
    for (let i = 0; i < this.z.length; i++) {
      this.z[i] -= d;
      if (this.z[i] < lo) this.z[i] += 520;
    }
    const write = (mesh: Mesh, list: number[]) => {
      list.forEach((i, k) => {
        Matrix.TranslationToRef(this.x[i], 0, this.z[i], this.mats[i]);
        mesh.thinInstanceSetMatrixAt(k, this.mats[i], k === list.length - 1);
      });
    };
    write(this.props, this.poleIdx);
    write(this.pine, this.treeIdx);
  }
}

// ------------------------------------------------------------------ weather particles

function flakeTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture("flake", { width: 32, height: 32 }, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  t.hasAlpha = true;
  t.update();
  return t;
}

export class Weather {
  private ps: ParticleSystem;
  private kind: WeatherDef["kind"] | null = null;
  readonly emitter = new Vector3();

  constructor(scene: Scene, capacity: number) {
    this.ps = new ParticleSystem("weather", capacity, scene);
    this.ps.particleTexture = flakeTexture(scene);
    this.ps.emitter = this.emitter;
    this.ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.ps.minEmitBox = new Vector3(-14, -2, -14);
    this.ps.maxEmitBox = new Vector3(14, 10, 14);
  }

  /** Switches the particle look when the player walks into (or out of) a weather volume. */
  set(w: WeatherDef | null): void {
    const kind = w?.kind ?? null;
    if (kind === this.kind) return;
    this.kind = kind;
    const ps = this.ps;
    ps.stop();
    if (!w) return;
    const wind = new Vector3(w.wind.x, 0, w.wind.z);
    if (w.kind === "snow") {
      ps.color1 = new Color4(1, 1, 1, 0.9);
      ps.color2 = new Color4(0.9, 0.95, 1, 0.7);
      ps.minSize = 0.04;
      ps.maxSize = 0.11;
      ps.minLifeTime = 3;
      ps.maxLifeTime = 5;
      ps.direction1 = wind.add(new Vector3(-0.3, -1.4, -0.3));
      ps.direction2 = wind.add(new Vector3(0.3, -0.9, 0.3));
      ps.minEmitPower = ps.maxEmitPower = 1;
    } else if (w.kind === "sandstorm") {
      ps.color1 = new Color4(0.85, 0.7, 0.45, 0.55);
      ps.color2 = new Color4(0.7, 0.55, 0.35, 0.35);
      ps.minSize = 0.08;
      ps.maxSize = 0.35;
      ps.minLifeTime = 0.8;
      ps.maxLifeTime = 1.6;
      ps.direction1 = new Vector3(Math.sign(w.wind.x || 1) * 10, -0.2, -1);
      ps.direction2 = new Vector3(Math.sign(w.wind.x || 1) * 16, 0.4, 1);
      ps.minEmitPower = ps.maxEmitPower = 1;
    } else {
      ps.color1 = new Color4(0.7, 0.8, 0.95, 0.5);
      ps.color2 = new Color4(0.6, 0.7, 0.9, 0.35);
      ps.minSize = 0.02;
      ps.maxSize = 0.05;
      ps.minLifeTime = 0.6;
      ps.maxLifeTime = 1;
      ps.direction1 = new Vector3(0, -14, 0);
      ps.direction2 = new Vector3(0.5, -18, 0.5);
      ps.minEmitPower = ps.maxEmitPower = 1;
    }
    ps.emitRate = ps.getCapacity() / ((ps.minLifeTime + ps.maxLifeTime) / 2);
    ps.start();
  }
}
