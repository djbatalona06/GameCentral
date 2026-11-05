// "Game feel" effects: little bursts that make actions feel solid. Bullet impacts kick up sparks or
// dust, feet puff dust on landings and rolls, water splashes ring outwards, the muzzle lights up
// the scene for a moment, and the camera widens a touch while sprinting and dips on hard landings.
// Render-only: none of this changes the simulation.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { V3 } from "../sim/math";
import { flakeTexture } from "./SetPieces";

type BurstKind = "spark" | "hit" | "dust" | "splash";

interface Burst {
  ps: ParticleSystem;
  emitter: Vector3;
}

const BURST_LOOK: Record<BurstKind, { c1: Color4; c2: Color4; size: [number, number]; power: [number, number]; life: [number, number]; gravity: number; add: boolean }> = {
  spark: { c1: new Color4(1, 0.85, 0.45, 1), c2: new Color4(1, 0.55, 0.2, 1), size: [0.03, 0.07], power: [2, 5], life: [0.15, 0.35], gravity: -9, add: true },
  hit: { c1: new Color4(0.55, 0.08, 0.06, 0.9), c2: new Color4(0.35, 0.05, 0.04, 0.7), size: [0.06, 0.14], power: [0.8, 2], life: [0.25, 0.5], gravity: -6, add: false },
  dust: { c1: new Color4(0.78, 0.72, 0.62, 0.55), c2: new Color4(0.65, 0.6, 0.52, 0.4), size: [0.15, 0.35], power: [0.4, 1.1], life: [0.5, 0.9], gravity: 0.4, add: false },
  splash: { c1: new Color4(0.85, 0.95, 1, 0.9), c2: new Color4(0.6, 0.8, 0.9, 0.7), size: [0.05, 0.12], power: [2, 4], life: [0.4, 0.8], gravity: -9, add: false },
};

export class Juice {
  /** A few emitters per kind, used in turn, so two bursts in one frame don't share a spot. */
  private bursts: Record<BurstKind, Burst[]> = { spark: [], hit: [], dust: [], splash: [] };
  private next: Record<BurstKind, number> = { spark: 0, hit: 0, dust: 0, splash: 0 };
  private rings: Array<{ mesh: Mesh; t: number }> = [];
  private ringPool: Mesh[] = [];
  private ringMat: StandardMaterial;
  private muzzle: PointLight | null = null;
  private muzzleT = 0;
  private texture: Texture;
  /** Camera: extra field-of-view factor (sprint) and downward dip (hard landing). */
  fovMul = 1;
  dip = 0;

  constructor(private scene: Scene, private rich: boolean) {
    this.texture = flakeTexture(scene);
    for (const kind of Object.keys(BURST_LOOK) as BurstKind[]) {
      const n = kind === "dust" ? 4 : 3;
      for (let i = 0; i < n; i++) this.bursts[kind].push(this.makeBurst(kind));
    }
    this.ringMat = new StandardMaterial("ringMat", scene);
    this.ringMat.disableLighting = true;
    this.ringMat.emissiveColor = new Color3(0.85, 0.95, 1);
    this.ringMat.alpha = 0.45;
    // A point light per shot costs shader time, so only richer quality tiers get the muzzle glow.
    if (rich) {
      this.muzzle = new PointLight("muzzle", Vector3.Zero(), scene);
      this.muzzle.diffuse = new Color3(1, 0.8, 0.45);
      this.muzzle.specular = new Color3(1, 0.8, 0.45);
      this.muzzle.range = 7;
      this.muzzle.intensity = 0;
    }
  }

  private makeBurst(kind: BurstKind): Burst {
    const look = BURST_LOOK[kind];
    const emitter = new Vector3();
    const ps = new ParticleSystem(`burst-${kind}`, 24, this.scene);
    ps.particleTexture = this.texture;
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-0.05, 0, -0.05);
    ps.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
    ps.color1 = look.c1;
    ps.color2 = look.c2;
    ps.colorDead = new Color4(look.c2.r, look.c2.g, look.c2.b, 0);
    ps.minSize = look.size[0];
    ps.maxSize = look.size[1];
    ps.minEmitPower = look.power[0];
    ps.maxEmitPower = look.power[1];
    ps.minLifeTime = look.life[0];
    ps.maxLifeTime = look.life[1];
    ps.gravity = new Vector3(0, look.gravity, 0);
    ps.direction1 = new Vector3(-1, kind === "dust" ? 0.1 : 0.6, -1);
    ps.direction2 = new Vector3(1, kind === "dust" ? 0.5 : 1.6, 1);
    ps.blendMode = look.add ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.start();
    return { ps, emitter };
  }

  /** Throws a short puff of particles at a point. */
  burst(kind: BurstKind, at: V3, count: number): void {
    const list = this.bursts[kind];
    const b = list[this.next[kind]++ % list.length];
    b.emitter.set(at.x, at.y, at.z);
    b.ps.manualEmitCount = Math.round(count * (this.rich ? 1 : 0.6));
  }

  /** An expanding ring on the water surface. */
  ring(at: V3): void {
    let m = this.ringPool.pop();
    if (!m) {
      m = MeshBuilder.CreateTorus("ring", { diameter: 1, thickness: 0.025, tessellation: 24 }, this.scene);
      m.material = this.ringMat.clone("ringMatI");
      m.isPickable = false;
    }
    m.setEnabled(true);
    m.position.set(at.x, at.y + 0.03, at.z);
    m.scaling.setAll(0.3);
    this.rings.push({ mesh: m, t: 0 });
  }

  /** Lights up the area around the gun for one frame or two. */
  muzzleFlash(at: V3): void {
    if (!this.muzzle) return;
    this.muzzle.position.set(at.x, at.y, at.z);
    this.muzzle.intensity = 2.2;
    this.muzzleT = 0.05;
  }

  update(dt: number, sprinting: boolean, calm: boolean): void {
    if (this.muzzle) {
      this.muzzleT -= dt;
      this.muzzle.intensity = this.muzzleT > 0 ? 2.2 * (this.muzzleT / 0.05) : 0;
    }
    for (const r of this.rings) {
      r.t += dt;
      const k = r.t / 0.9;
      r.mesh.scaling.set(0.3 + k * 2.6, 1, 0.3 + k * 2.6);
      (r.mesh.material as StandardMaterial).alpha = Math.max(0, 0.45 * (1 - k));
      if (k >= 1) {
        r.mesh.setEnabled(false);
        this.ringPool.push(r.mesh);
      }
    }
    this.rings = this.rings.filter((r) => r.t < 0.9);
    // Camera feel. "calm" (Reduce motion) turns both off.
    const wantFov = sprinting && !calm ? 1.07 : 1;
    this.fovMul += (wantFov - this.fovMul) * Math.min(1, dt * 5);
    this.dip = calm ? 0 : Math.max(0, this.dip - dt * 1.6);
  }

  hardLanding(): void {
    this.dip = 0.35;
  }
}
