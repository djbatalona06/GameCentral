// Ambient life: birds circling overhead, fish schools in the water, and dust motes (or fireflies at
// night) drifting around the camera. Pure decoration: it reads the simulation and never changes it,
// so it cannot affect gameplay. Counts scale with the quality tier and drop with Reduce motion.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { GameSim } from "../sim/GameSim";
import type { VolumeDef } from "../sim/world/types";
import { flakeTexture } from "./SetPieces";

export interface AmbientOptions {
  night: boolean;
  /** Weather particle budget of the quality tier; ambient life uses a slice of it. */
  particles: number;
  reduceMotion: boolean;
}

interface Bird {
  radius: number;
  height: number;
  speed: number;
  phase: number;
  flap: number;
}

interface School {
  vol: VolumeDef;
  phase: number;
  flee: Vector3;
  center: Vector3;
  fish: Array<{ radius: number; speed: number; phase: number; bob: number }>;
  /** Seconds until one fish leaps out of the water, and the leap in progress (fish index, time). */
  nextLeap: number;
  leap: { i: number; t: number } | null;
}

/** How long a leap lasts and how high it goes. */
const LEAP_TIME = 0.7;
const LEAP_HEIGHT = 0.7;

/** A simple bird: two thin wings in a shallow V, about 1.6 m across. Faces +Z. */
function birdMesh(scene: Scene): Mesh {
  const m = new Mesh("bird", scene);
  const vd = new VertexData();
  // body point, left tip, left back, right tip, right back
  vd.positions = [0, 0, 0.32, -0.8, 0.16, -0.12, 0, 0, -0.26, 0.8, 0.16, -0.12];
  vd.indices = [0, 1, 2, 0, 2, 3];
  const normals: number[] = [];
  VertexData.ComputeNormals(vd.positions, vd.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(m);
  return m;
}

export class Ambient {
  private birds: Bird[] = [];
  private birdMeshes: Mesh | null = null;
  private birdCenter = new Vector3();
  private schools: School[] = [];
  private fishMesh: Mesh | null = null;
  private motes: ParticleSystem | null = null;
  private readonly moteEmitter = new Vector3();
  private time = 0;
  private readonly m = new Matrix();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  /** Called when a fish leaves or re-enters the water, so the renderer can splash. */
  onSplash: ((at: { x: number; y: number; z: number }) => void) | null = null;

  constructor(scene: Scene, sim: GameSim, opts: AmbientOptions) {
    const data = sim.world.data;
    const budget = Math.max(0.3, opts.particles / 600) * (opts.reduceMotion ? 0.5 : 1);
    const coastal = data.water.length > 0;

    // Birds: gulls over water by day, darker birds (swallows, hawks) inland. None at night.
    if (!opts.night) {
      const count = Math.round((coastal ? 9 : 5) * budget);
      const mesh = birdMesh(scene);
      const mat = new StandardMaterial("birdMat", scene);
      mat.backFaceCulling = false;
      mat.diffuseColor = coastal ? new Color3(0.92, 0.92, 0.9) : new Color3(0.18, 0.16, 0.15);
      mat.emissiveColor = coastal ? new Color3(0.6, 0.6, 0.6) : new Color3(0.05, 0.05, 0.05);
      mat.specularColor = Color3.Black();
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      for (let i = 0; i < count; i++) {
        this.birds.push({
          radius: 10 + ((i * 7.3) % 18),
          height: (coastal ? 9 : 16) + ((i * 3.7) % 7),
          speed: (0.12 + ((i * 0.37) % 0.12)) * (i % 2 ? 1 : -1),
          phase: i * 2.399,
          flap: 6 + (i % 3),
        });
        mesh.thinInstanceAdd(Matrix.Identity(), false);
      }
      if (count) mesh.thinInstanceBufferUpdated("matrix");
      this.birdMeshes = count ? mesh : (mesh.dispose(), null);
    }

    // Fish: a small school in every body of water big enough to swim in.
    const pools = data.water.filter((w) => (w.max.x - w.min.x) * (w.max.z - w.min.z) > 30 && w.max.y - w.min.y > 0.8);
    if (pools.length) {
      const mesh = MeshBuilder.CreateSphere("fish", { diameter: 1, segments: 4 }, scene);
      const mat = new StandardMaterial("fishMat", scene);
      // Dark backs read best through bright water, the way real fish look from above.
      mat.diffuseColor = new Color3(0.12, 0.16, 0.2);
      mat.specularColor = new Color3(0.4, 0.4, 0.4);
      mat.emissiveColor = new Color3(0.02, 0.03, 0.04);
      mesh.material = mat;
      mesh.isPickable = false;
      mesh.alwaysSelectAsActiveMesh = true;
      const perSchool = Math.max(4, Math.round(12 * budget));
      pools.forEach((vol, si) => {
        const school: School = { vol, phase: si * 1.7, flee: new Vector3(), center: new Vector3(), fish: [], nextLeap: 2 + si * 1.3, leap: null };
        for (let i = 0; i < perSchool; i++) {
          school.fish.push({ radius: 0.6 + ((i * 0.41) % 1.4), speed: 0.7 + ((i * 0.23) % 0.5), phase: (i / perSchool) * Math.PI * 2, bob: i * 1.3 });
          mesh.thinInstanceAdd(Matrix.Identity(), false);
        }
        this.schools.push(school);
      });
      mesh.thinInstanceBufferUpdated("matrix");
      this.fishMesh = mesh;
    }

    // Dust motes in daylight, fireflies at night, floating around the camera.
    if (!opts.reduceMotion) {
      const cap = Math.round((opts.night ? 70 : 90) * budget);
      const ps = new ParticleSystem("motes", cap, scene);
      ps.particleTexture = flakeTexture(scene);
      ps.emitter = this.moteEmitter;
      ps.minEmitBox = new Vector3(-12, -2, -12);
      ps.maxEmitBox = new Vector3(12, 5, 12);
      ps.direction1 = new Vector3(-0.15, -0.05, -0.15);
      ps.direction2 = new Vector3(0.15, 0.12, 0.15);
      ps.minEmitPower = 0.2;
      ps.maxEmitPower = 0.5;
      ps.minLifeTime = 4;
      ps.maxLifeTime = 8;
      ps.emitRate = cap / 6;
      if (opts.night) {
        ps.blendMode = ParticleSystem.BLENDMODE_ADD;
        ps.minSize = 0.06;
        ps.maxSize = 0.12;
        // Fireflies blink: bright, dark, bright again over their life.
        ps.addColorGradient(0, new Color4(0, 0, 0, 0));
        ps.addColorGradient(0.2, new Color4(0.8, 1, 0.35, 1));
        ps.addColorGradient(0.45, new Color4(0.1, 0.15, 0.05, 0.1));
        ps.addColorGradient(0.7, new Color4(1, 0.9, 0.35, 1));
        ps.addColorGradient(1, new Color4(0, 0, 0, 0));
      } else {
        ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
        ps.minSize = 0.025;
        ps.maxSize = 0.06;
        ps.addColorGradient(0, new Color4(1, 0.96, 0.85, 0));
        ps.addColorGradient(0.3, new Color4(1, 0.96, 0.85, 0.35));
        ps.addColorGradient(1, new Color4(1, 0.96, 0.85, 0));
      }
      ps.start();
      this.motes = ps;
    }
  }

  update(dt: number, sim: GameSim, cameraPos: Vector3): void {
    this.time += dt;
    const t = this.time;
    const player = sim.player.pos;
    this.moteEmitter.copyFrom(cameraPos);

    const birds = this.birdMeshes;
    if (birds) {
      // The flock drifts lazily after the player, so it is always somewhere overhead.
      this.birdCenter.x += (player.x - this.birdCenter.x) * Math.min(1, dt * 0.08);
      this.birdCenter.z += (player.z - this.birdCenter.z) * Math.min(1, dt * 0.08);
      this.birdCenter.y = player.y;
      this.birds.forEach((b, i) => {
        const a = b.phase + t * b.speed;
        const x = this.birdCenter.x + Math.cos(a) * b.radius;
        const z = this.birdCenter.z + Math.sin(a) * b.radius;
        const y = this.birdCenter.y + b.height + Math.sin(t * 0.3 + b.phase) * 1.5;
        // Heading along the circle; bank into the turn.
        const dx = -Math.sin(a) * Math.sign(b.speed);
        const dz = Math.cos(a) * Math.sign(b.speed);
        const yaw = Math.atan2(dx, dz);
        const bank = -0.35 * Math.sign(b.speed);
        // Flap in bursts, then glide.
        const gliding = Math.sin(t * 0.5 + b.phase) > 0.2;
        const flap = gliding ? 0.6 : Math.sin(t * b.flap + b.phase) * 1.6;
        Quaternion.FromEulerAnglesToRef(0, yaw, bank, this.q);
        this.s.set(1, flap, 1);
        this.p.set(x, y, z);
        Matrix.ComposeToRef(this.s, this.q, this.p, this.m);
        birds.thinInstanceSetMatrixAt(i, this.m, i === this.birds.length - 1);
      });
    }

    const fish = this.fishMesh;
    if (fish) {
      let idx = 0;
      const total = this.schools.reduce((n, s) => n + s.fish.length, 0);
      for (const s of this.schools) {
        const v = s.vol;
        const cx = (v.min.x + v.max.x) / 2;
        const cz = (v.min.z + v.max.z) / 2;
        const hx = (v.max.x - v.min.x) / 2 - 1.5;
        const hz = (v.max.z - v.min.z) / 2 - 1.5;
        // The school wanders slowly around its pool...
        s.center.set(cx + Math.sin(t * 0.07 + s.phase) * hx * 0.7, v.max.y - 0.3, cz + Math.cos(t * 0.05 + s.phase) * hz * 0.7);
        // ...and darts away from a swimmer who gets close.
        const ddx = s.center.x + s.flee.x - player.x;
        const ddz = s.center.z + s.flee.z - player.z;
        const d = Math.hypot(ddx, ddz);
        if (d < 3.5 && Math.abs(player.y - s.center.y) < 2.5) {
          s.flee.x += (ddx / (d || 1)) * dt * 4;
          s.flee.z += (ddz / (d || 1)) * dt * 4;
        }
        s.flee.scaleInPlace(Math.max(0, 1 - dt * 0.3));
        const fx = Math.max(v.min.x + 0.5, Math.min(v.max.x - 0.5, s.center.x + s.flee.x));
        const fz = Math.max(v.min.z + 0.5, Math.min(v.max.z - 0.5, s.center.z + s.flee.z));
        // Every few seconds one fish leaps clear of the surface.
        s.nextLeap -= dt;
        if (!s.leap && s.nextLeap <= 0) {
          s.leap = { i: Math.floor((t * 7.13) % s.fish.length), t: 0 };
          s.nextLeap = 4 + ((t * 3.7) % 5);
        }
        s.fish.forEach((f, fi) => {
          const a = f.phase + t * f.speed;
          const x = fx + Math.cos(a) * f.radius;
          const z = fz + Math.sin(a) * f.radius;
          let y = Math.max(v.min.y + 0.15, s.center.y + Math.sin(t * 1.3 + f.bob) * 0.08 - f.radius * 0.08);
          let pitch = 0;
          if (s.leap && s.leap.i === fi) {
            const before = s.leap.t;
            s.leap.t += dt;
            const k = Math.min(1, s.leap.t / LEAP_TIME);
            const surface = v.max.y;
            y = surface - 0.1 + Math.sin(Math.PI * k) * LEAP_HEIGHT;
            pitch = (k - 0.5) * 1.8; // nose up going out, nose down coming back
            if (before === 0 || k >= 1) this.onSplash?.({ x, y: surface, z });
            if (k >= 1) s.leap = null;
          }
          const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + Math.sin(t * 6 + f.bob) * 0.12; // little tail wiggle
          Quaternion.FromEulerAnglesToRef(pitch, yaw, 0, this.q);
          this.s.set(0.11, 0.07, 0.36);
          this.p.set(x, y, z);
          Matrix.ComposeToRef(this.s, this.q, this.p, this.m);
          idx++;
          fish.thinInstanceSetMatrixAt(idx - 1, this.m, idx === total);
        });
      }
    }
  }

  dispose(): void {
    this.birdMeshes?.dispose();
    this.fishMesh?.dispose();
    this.motes?.dispose();
    this.birdMeshes = null;
    this.fishMesh = null;
    this.motes = null;
  }
}
