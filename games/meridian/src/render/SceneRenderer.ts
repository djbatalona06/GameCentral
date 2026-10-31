// Draws the GameSim with Babylon.js. The renderer only reads simulation state; it never changes it.
// Static level geometry is merged per material for few draw calls; moving things (player,
// enemies, crates, effects) are synced every frame from the simulation.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/outlineRenderer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { GameSim, SimEvent } from "../sim/GameSim";
import { lookDir, type V3 } from "../sim/math";
import type { BoxDef, Material as MatName } from "../sim/world/types";
import type { RuntimeBox } from "../sim/world/World";
import type { Enemy } from "../sim/ai/Enemy";
import type { Settings } from "../core/Settings";
import { MATERIAL_COLORS, HIGH_CONTRAST_ENV, PALETTE, climbTexture, flatMaterial, gridTexture } from "./greybox";
import { ColorPostProcess } from "./ColorPostProcess";

const v = (p: V3) => new Vector3(p.x, p.y, p.z);

interface Figure {
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  armL: Mesh;
  armR: Mesh;
  gun: Mesh;
  mat: StandardMaterial;
}

interface EnemyVisual {
  fig: Figure;
  meter: Mesh;
  meterMat: StandardMaterial;
  laser: Mesh;
  baseColor: Color3;
}

interface Fx {
  mesh: Mesh;
  life: number;
  max: number;
  kind: "tracer" | "flash" | "explosion" | "spark";
}

export class SceneRenderer {
  readonly engine: Engine;
  scene: Scene | null = null;
  private camera: UniversalCamera | null = null;
  private color: ColorPostProcess | null = null;
  private shadows: ShadowGenerator | null = null;
  private sim: GameSim | null = null;
  private envMats = new Map<string, StandardMaterial>();
  private dynamicBoxes = new Map<string, Mesh>();
  private falling: Array<{ mesh: Mesh; vy: number; t: number }> = [];
  private crateMeshes: Mesh[] = [];
  private ledgeMeshes = new Map<string, Mesh>();
  private pickupMeshes = new Map<string, Mesh>();
  private treasureMeshes = new Map<string, Mesh>();
  private interactMeshes = new Map<string, Mesh>();
  private dropMeshes = new Map<string, Mesh>();
  private pillarFaces = new Map<string, StandardMaterial>();
  private ropeMeshes = new Map<string, Mesh>();
  private player: Figure | null = null;
  private enemies = new Map<string, EnemyVisual>();
  private projectileMeshes: Mesh[] = [];
  private arcDots: Mesh[] = [];
  private fx: Fx[] = [];
  private fxPool: Record<Fx["kind"], Mesh[]> = { tracer: [], flash: [], explosion: [], spark: [] };
  private revision = -1;
  private time = 0;
  private shake = 0;
  private settings: () => Settings;
  private baseScaling = 1;
  scaling = 1;
  private fpsWindow: number[] = [];

  constructor(canvas: HTMLCanvasElement, settings: () => Settings) {
    this.settings = settings;
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.applyQuality();
    window.addEventListener("resize", () => this.engine.resize());
  }

  /** Low/medium/high quality. "auto" guesses from the device. */
  applyQuality(): void {
    const q = this.resolvedQuality();
    const dpr = Math.min(window.devicePixelRatio || 1, q === "high" ? 2 : q === "medium" ? 1.5 : 1);
    this.baseScaling = 1 / dpr;
    this.scaling = this.baseScaling;
    this.engine.setHardwareScalingLevel(this.scaling);
  }

  resolvedQuality(): "low" | "medium" | "high" {
    const q = this.settings().video.quality;
    if (q !== "auto") return q;
    const cores = navigator.hardwareConcurrency || 4;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (mobile) return cores >= 8 ? "medium" : "low";
    return cores >= 8 ? "high" : "medium";
  }

  // ------------------------------------------------------------------ level construction

  load(sim: GameSim): void {
    this.dispose();
    this.sim = sim;
    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.skipPointerMovePicking = true;
    const sky = sim.world.data.sky;
    scene.clearColor = Color4.FromHexString(sky.top + "ff");
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = sky.fogDensity;
    scene.fogColor = Color3.FromHexString(sky.fog);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);

    const cam = new UniversalCamera("cam", new Vector3(0, 2, -5), scene);
    cam.minZ = 0.08;
    cam.maxZ = 600;
    cam.inputs.clear();
    this.camera = cam;
    this.color = new ColorPostProcess(cam);

    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = 0.75;
    hemi.groundColor = Color3.FromHexString(sky.bottom).scale(0.5);
    const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.35), scene);
    sun.intensity = 0.95;
    sun.position = new Vector3(40, 80, -40);
    if (this.resolvedQuality() !== "low") {
      this.shadows = new ShadowGenerator(this.resolvedQuality() === "high" ? 2048 : 1024, sun);
      this.shadows.useBlurExponentialShadowMap = this.resolvedQuality() === "high";
      this.shadows.bias = 0.002;
    }

    this.buildEnvironment();
    this.player = this.makeFigure("player", this.settings().a11y.highContrast ? PALETTE.playerHigh : PALETTE.player, 1.8);
    this.applyAccessibility();
    this.revision = sim.world.revision;
  }

  private envMat(name: MatName | "hc"): StandardMaterial {
    const hc = this.settings().a11y.highContrast;
    const key = hc ? "hc" : name;
    let m = this.envMats.get(key);
    if (!m) {
      m = new StandardMaterial(`env-${key}`, this.scene!);
      m.diffuseTexture = gridTexture(this.scene!, hc ? HIGH_CONTRAST_ENV : MATERIAL_COLORS[name as MatName], `grid-${key}`);
      m.specularColor = new Color3(0.04, 0.04, 0.04);
      this.envMats.set(key, m);
    }
    return m;
  }

  private boxMesh(b: { min: V3; max: V3 }, name: string): Mesh {
    const w = b.max.x - b.min.x;
    const h = b.max.y - b.min.y;
    const d = b.max.z - b.min.z;
    // Face UVs scaled by face size so the 1 m grid tiles correctly on any box.
    const faceUV = [
      new Vector4(0, 0, w, h),
      new Vector4(0, 0, w, h),
      new Vector4(0, 0, d, h),
      new Vector4(0, 0, d, h),
      new Vector4(0, 0, w, d),
      new Vector4(0, 0, w, d),
    ];
    const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d, faceUV }, this.scene!);
    m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
    return m;
  }

  private buildEnvironment(): void {
    const sim = this.sim!;
    const scene = this.scene!;
    const data = sim.world.data;
    const staticByMat = new Map<string, Mesh[]>();
    const isDynamic = (b: BoxDef) => !!b.group || b.hp !== undefined || b.explosive || b.hidden;

    for (const b of sim.world.boxes) {
      const mesh = this.boxMesh(b, b.id);
      if (b.explosive) {
        mesh.material = flatMaterial(scene, `barrel-${b.id}`, "#c0392b", { emissive: 0.15 });
      } else mesh.material = this.envMat(b.material);
      mesh.receiveShadows = true;
      if (isDynamic(b)) {
        this.dynamicBoxes.set(b.id, mesh);
        mesh.setEnabled(!b.removed);
        this.shadows?.addShadowCaster(mesh);
      } else {
        const list = staticByMat.get(b.material) ?? [];
        list.push(mesh);
        staticByMat.set(b.material, list);
      }
    }
    for (const r of data.ramps) {
      const len = r.axis === "x" ? r.max.x - r.min.x : r.max.z - r.min.z;
      const rise = r.max.y - r.min.y;
      const width = r.axis === "x" ? r.max.z - r.min.z : r.max.x - r.min.x;
      const slope = Math.hypot(len, rise);
      const m = MeshBuilder.CreateBox(r.id, { width: r.axis === "x" ? slope : width, depth: r.axis === "z" ? slope : width, height: 0.2 }, scene);
      m.position.set((r.min.x + r.max.x) / 2, (r.min.y + r.max.y) / 2 - 0.1, (r.min.z + r.max.z) / 2);
      const ang = Math.atan2(rise, len) * r.dir;
      if (r.axis === "z") m.rotation.x = -ang;
      else m.rotation.z = ang;
      m.material = r.slide ? flatMaterial(scene, `slide-${r.id}`, "#b9a77a") : this.envMat(r.material);
      m.receiveShadows = true;
      staticByMat.set(r.material, [...(staticByMat.get(r.material) ?? []), m]);
    }
    for (const [mat, meshes] of staticByMat) {
      const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
      if (merged) {
        merged.name = `static-${mat}`;
        merged.receiveShadows = true;
        merged.freezeWorldMatrix();
        merged.isPickable = false;
      }
    }

    // Chalk-marked ledges: the visual language for "you can grab this".
    const chalk = flatMaterial(scene, "chalk", PALETTE.chalk, { emissive: 0.35 });
    const crumble = flatMaterial(scene, "crumble", PALETTE.crumble, { emissive: 0.35 });
    const staticLedges: Mesh[] = [];
    for (const l of sim.world.ledges) {
      const len = Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z);
      const alongX = Math.abs(l.b.x - l.a.x) > Math.abs(l.b.z - l.a.z);
      const m = MeshBuilder.CreateBox(l.id, { width: alongX ? len : 0.07, height: 0.05, depth: alongX ? 0.07 : len }, scene);
      m.position.set((l.a.x + l.b.x) / 2 + l.normal.x * 0.035, l.a.y - 0.02, (l.a.z + l.b.z) / 2 + l.normal.z * 0.035);
      m.material = l.crumble ? crumble : chalk;
      if (l.crumble || l.group) this.ledgeMeshes.set(l.id, m);
      else staticLedges.push(m);
    }
    if (staticLedges.length) Mesh.MergeMeshes(staticLedges, true, true)?.freezeWorldMatrix();

    // Free-climb walls get a hand-hold pattern overlay.
    if (data.climbWalls.length) {
      const climbMat = new StandardMaterial("climbMat", scene);
      climbMat.diffuseTexture = climbTexture(scene);
      climbMat.useAlphaFromDiffuseTexture = true;
      climbMat.emissiveColor = new Color3(0.4, 0.4, 0.35);
      for (const w of data.climbWalls) {
        const width = w.normal.x !== 0 ? w.max.z - w.min.z : w.max.x - w.min.x;
        const height = w.max.y - w.min.y;
        const p = MeshBuilder.CreatePlane(w.id, { width, height, frontUVs: new Vector4(0, 0, width, height), sideOrientation: Mesh.DOUBLESIDE }, scene);
        const face = w.normal.x !== 0 ? (w.normal.x > 0 ? w.max.x : w.min.x) : w.normal.z > 0 ? w.max.z : w.min.z;
        p.position.set(w.normal.x !== 0 ? face + w.normal.x * 0.03 : (w.min.x + w.max.x) / 2, (w.min.y + w.max.y) / 2, w.normal.z !== 0 ? face + w.normal.z * 0.03 : (w.min.z + w.max.z) / 2);
        p.rotation.y = Math.atan2(-w.normal.x, -w.normal.z);
        p.material = climbMat;
      }
    }

    // Water surfaces.
    const water = flatMaterial(scene, "water", PALETTE.water, { alpha: 0.55, specular: 0.6 });
    for (const wv of data.water) {
      const p = MeshBuilder.CreateGround(wv.id, { width: wv.max.x - wv.min.x, height: wv.max.z - wv.min.z }, scene);
      p.position.set((wv.min.x + wv.max.x) / 2, wv.max.y - 0.02, (wv.min.z + wv.max.z) / 2);
      p.material = water;
    }

    // Tall grass as thin-instanced blades.
    if (data.grass.length) {
      const blade = MeshBuilder.CreateBox("blade", { width: 0.07, height: 1, depth: 0.07 }, scene);
      blade.material = flatMaterial(scene, "grassMat", PALETTE.grass);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const mats: Matrix[] = [];
      for (const g of data.grass) {
        const area = (g.max.x - g.min.x) * (g.max.z - g.min.z);
        const h = g.max.y - g.min.y;
        for (let i = 0; i < area * 7; i++) {
          const x = g.min.x + rnd() * (g.max.x - g.min.x);
          const z = g.min.z + rnd() * (g.max.z - g.min.z);
          const s = h * (0.75 + rnd() * 0.35);
          const q = Quaternion.FromEulerAngles((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3);
          mats.push(Matrix.Compose(new Vector3(1, s, 1), q, new Vector3(x, g.min.y + s / 2, z)));
        }
      }
      blade.thinInstanceAdd(mats);
      blade.isPickable = false;
    }

    // Ropes, grapple rings and ziplines.
    const ropeMat = flatMaterial(scene, "rope", "#c9a46a");
    for (const r of data.ropes) {
      if (r.grapple) {
        const ring = MeshBuilder.CreateTorus(`ring-${r.id}`, { diameter: 0.7, thickness: 0.12 }, scene);
        ring.position = v(r.anchor);
        ring.material = flatMaterial(scene, `ringMat-${r.id}`, PALETTE.interact, { emissive: 0.5 });
        ring.rotation.x = Math.PI / 2;
        const beam = MeshBuilder.CreateBox(`ringBeam-${r.id}`, { width: 0.3, height: 1.2, depth: 0.3 }, scene);
        beam.position = v(r.anchor).add(new Vector3(0, 0.9, 0));
        beam.material = this.envMat("wood");
      }
      const rope = MeshBuilder.CreateBox(`rope-${r.id}`, { width: 0.05, height: 1, depth: 0.05 }, scene);
      rope.material = ropeMat;
      this.ropeMeshes.set(r.id, rope);
    }
    for (const z of data.ziplines) {
      MeshBuilder.CreateTube(z.id, { path: [v(z.a), v(z.b)], radius: 0.035 }, scene).material = flatMaterial(scene, `zip-${z.id}`, "#444");
      const post = MeshBuilder.CreateBox(`zipPost-${z.id}`, { width: 0.2, height: 2.5, depth: 0.2 }, scene);
      post.position = v(z.a).add(new Vector3(0, -0.6, 0.2));
      post.material = this.envMat("wood");
    }

    // Crates.
    const crateMat = flatMaterial(scene, "crateMat", "#a06a36");
    for (const c of sim.world.crates) {
      const m = this.boxMesh(c, c.id);
      m.material = crateMat;
      this.shadows?.addShadowCaster(m);
      m.receiveShadows = true;
      this.crateMeshes.push(m);
    }

    // Pickups and treasures.
    for (const p of data.pickups) {
      const m =
        p.type === "grenade"
          ? MeshBuilder.CreateSphere(p.id, { diameter: 0.3, segments: 6 }, scene)
          : p.type === "bottle"
            ? MeshBuilder.CreateCylinder(p.id, { height: 0.35, diameter: 0.12 }, scene)
            : MeshBuilder.CreateBox(p.id, { width: p.type === "weapon" ? 0.9 : 0.4, height: 0.22, depth: 0.25 }, scene);
      m.position = v(p.pos);
      m.material = flatMaterial(scene, `pk-${p.id}`, p.type === "ammo" ? "#3c8d40" : p.type === "weapon" ? "#2c3e50" : p.type === "grenade" ? "#556b2f" : "#7fb8a4", { emissive: 0.25 });
      this.pickupMeshes.set(p.id, m);
    }
    const gold = flatMaterial(scene, "gold", PALETTE.treasure, { emissive: 0.6, specular: 0.8 });
    const goldBeam = flatMaterial(scene, "goldBeam", PALETTE.treasure, { emissive: 1, alpha: 0.18 });
    for (const t of data.collectibles) {
      const m = MeshBuilder.CreatePolyhedron(t.id, { type: 1, size: 0.16 }, scene);
      m.position = v(t.pos);
      m.material = gold;
      const beam = MeshBuilder.CreateCylinder(`${t.id}-beam`, { height: 3, diameter: 0.12 }, scene);
      beam.parent = m;
      beam.position.y = 1.5;
      beam.material = goldBeam;
      this.treasureMeshes.set(t.id, m);
    }

    // Interactables: a floating marker, plus coloured faces for puzzle pillars.
    const markMat = flatMaterial(scene, "interactMark", PALETTE.interact, { emissive: 0.7 });
    for (const i of data.interacts) {
      const m = MeshBuilder.CreatePolyhedron(`mark-${i.id}`, { type: 1, size: 0.1 }, scene);
      m.position = v(i.pos).add(new Vector3(0, 0.6, 0));
      m.material = markMat;
      this.interactMeshes.set(i.id, m);
      if (i.kind === "pillar") {
        const face = MeshBuilder.CreateBox(`face-${i.id}`, { width: 0.7, height: 0.7, depth: 0.05 }, scene);
        face.position = v(i.pos).add(new Vector3(0, 0.4, -0.05));
        const fm = flatMaterial(scene, `faceMat-${i.id}`, "#f2c94c", { emissive: 0.5 });
        face.material = fm;
        this.pillarFaces.set(i.id, fm);
      }
      if (i.kind === "lever") {
        const h = MeshBuilder.CreateCylinder(`lever-${i.id}`, { height: 0.8, diameter: 0.08 }, scene);
        h.position = v(i.pos).add(new Vector3(0, 0.2, 0.6));
        h.rotation.x = 0.5;
        h.material = flatMaterial(scene, `leverMat-${i.id}`, "#c0392b", { emissive: 0.3 });
      }
    }
    for (const pz of sim.chapter.script!.puzzles) {
      if (pz.type !== "plates") continue;
      pz.plates.forEach((pl, k) => {
        const m = MeshBuilder.CreateBox(`plate-${pz.id}-${k}`, { width: pl.max.x - pl.min.x, height: 0.06, depth: pl.max.z - pl.min.z }, scene);
        m.position.set((pl.min.x + pl.max.x) / 2, pl.min.y + 0.12, (pl.min.z + pl.max.z) / 2);
        m.material = flatMaterial(scene, `plateMat-${k}`, PALETTE.interact, { emissive: 0.4 });
      });
    }

    for (let i = 0; i < 40; i++) {
      const d = MeshBuilder.CreateSphere(`arc${i}`, { diameter: i === 39 ? 0.5 : 0.09, segments: 4 }, scene);
      d.material = flatMaterial(scene, `arcMat${i}`, i === 39 ? "#ff6b6b" : "#ffffff", { emissive: 0.9, alpha: i === 39 ? 0.5 : 0.85 });
      d.setEnabled(false);
      this.arcDots.push(d);
    }
    for (const m of this.envMats.values()) m.freeze();
  }

  // ------------------------------------------------------------------ characters

  private makeFigure(name: string, color: string, height: number): Figure {
    const scene = this.scene!;
    const s = height / 1.8;
    const root = new TransformNode(name, scene);
    const mat = flatMaterial(scene, `${name}-mat`, color);
    const body = MeshBuilder.CreateCapsule(`${name}-body`, { height: 1.25 * s, radius: 0.27 * s }, scene);
    body.parent = root;
    body.position.y = 0.72 * s;
    body.material = mat;
    const head = MeshBuilder.CreateSphere(`${name}-head`, { diameter: 0.34 * s, segments: 8 }, scene);
    head.parent = root;
    head.position.y = 1.58 * s;
    head.material = flatMaterial(scene, `${name}-headMat`, "#d9a77c");
    const arm = (side: number) => {
      const a = MeshBuilder.CreateBox(`${name}-arm${side}`, { width: 0.12 * s, height: 0.6 * s, depth: 0.12 * s }, scene);
      a.setPivotPoint(new Vector3(0, 0.28 * s, 0));
      a.parent = root;
      a.position.set(0.33 * s * side, 1.08 * s, 0);
      a.material = mat;
      return a;
    };
    const armL = arm(-1);
    const armR = arm(1);
    const gun = MeshBuilder.CreateBox(`${name}-gun`, { width: 0.07, height: 0.12, depth: 0.45 }, scene);
    gun.parent = armR;
    gun.position.set(0, -0.3 * s, 0.18);
    gun.material = flatMaterial(scene, `${name}-gunMat`, "#222");
    for (const m of [body, head, armL, armR]) this.shadows?.addShadowCaster(m);
    return { root, body, head, armL, armR, gun, mat };
  }

  private enemyVisual(e: Enemy): EnemyVisual {
    let ev = this.enemies.get(e.id);
    if (ev) return ev;
    const scene = this.scene!;
    const hc = this.settings().a11y.highContrast;
    const fig = this.makeFigure(`enemy-${e.id}`, hc ? PALETTE.enemyHigh : e.def.color, e.def.height);
    if (!e.weapon) fig.gun.setEnabled(false);
    const meterMat = flatMaterial(scene, `meter-${e.id}`, "#ffd400", { emissive: 1 });
    meterMat.disableLighting = true;
    const meter = MeshBuilder.CreatePlane(`meterPlane-${e.id}`, { width: 0.6, height: 0.09 }, scene);
    meter.billboardMode = Mesh.BILLBOARDMODE_ALL;
    meter.material = meterMat;
    meter.parent = fig.root;
    meter.position.y = e.def.height + 0.35;
    const laser = MeshBuilder.CreateBox(`laser-${e.id}`, { width: 0.02, height: 0.02, depth: 1 }, scene);
    const lm = flatMaterial(scene, `laserMat-${e.id}`, PALETTE.laser, { emissive: 1, alpha: 0.7 });
    lm.disableLighting = true;
    laser.material = lm;
    laser.setEnabled(false);
    ev = { fig, meter, meterMat, laser, baseColor: Color3.FromHexString(hc ? PALETTE.enemyHigh : e.def.color) };
    this.enemies.set(e.id, ev);
    return ev;
  }

  private poseFigure(f: Figure, o: { pos: V3; yaw: number; crouch: number; armsUp: boolean; aimPitch: number | null; roll: number; lie: number; swim: boolean }): void {
    f.root.position.set(o.pos.x, o.pos.y, o.pos.z);
    f.root.rotation.y = o.yaw;
    f.root.rotation.x = o.lie * (Math.PI / 2) + o.roll;
    f.root.scaling.y = 1 - o.crouch * 0.38;
    if (o.swim) f.root.position.y += 0.3;
    if (o.armsUp) {
      f.armL.rotation.x = f.armR.rotation.x = Math.PI;
    } else if (o.aimPitch !== null) {
      f.armR.rotation.x = -Math.PI / 2 - o.aimPitch;
      f.armL.rotation.x = -Math.PI / 2.4 - o.aimPitch;
    } else {
      const swing = Math.sin(this.time * 9) * 0.5;
      f.armL.rotation.x = swing * (o.crouch ? 0.3 : 1);
      f.armR.rotation.x = -swing * (o.crouch ? 0.3 : 1);
    }
  }

  // ------------------------------------------------------------------ per-frame sync

  render(dt: number): void {
    const sim = this.sim;
    const scene = this.scene;
    if (!sim || !scene || !this.camera) return;
    this.time += dt;
    this.syncWorld(dt);
    this.syncPlayer();
    this.syncEnemies(dt);
    this.syncProps();
    this.syncFx(dt);
    this.syncCamera(dt);
    scene.render();
    this.dynamicResolution();
  }

  private syncWorld(dt: number): void {
    const sim = this.sim!;
    if (sim.world.revision !== this.revision) {
      this.revision = sim.world.revision;
      for (const b of sim.world.boxes as RuntimeBox[]) {
        const m = this.dynamicBoxes.get(b.id);
        if (!m) continue;
        if (b.removed && m.isEnabled() && !this.falling.some((f) => f.mesh === m)) this.falling.push({ mesh: m, vy: 0, t: 0 });
        if (!b.removed && !m.isEnabled()) {
          m.position.y = (b.min.y + b.max.y) / 2;
          m.setEnabled(true);
        }
      }
      for (const l of sim.world.ledges) {
        const m = this.ledgeMeshes.get(l.id);
        if (m) m.setEnabled(!l.removed);
      }
    }
    // Collapsing pieces fall and fade away.
    for (const f of this.falling) {
      f.t += dt;
      f.vy -= 18 * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.rotation.x += dt * 0.6;
      if (f.t > 1.6) f.mesh.setEnabled(false);
    }
    this.falling = this.falling.filter((f) => f.t <= 1.6);
    sim.world.crates.forEach((c, i) => {
      const m = this.crateMeshes[i];
      if (m) m.position.set((c.min.x + c.max.x) / 2, (c.min.y + c.max.y) / 2, (c.min.z + c.max.z) / 2);
    });
  }

  private syncPlayer(): void {
    const sim = this.sim!;
    const p = sim.player;
    const f = this.player!;
    const visible = !(sim.aiming && sim.cam.scoped);
    f.root.setEnabled(visible || !!sim.cutscene);
    const crouch = (1.8 - p.height) / 0.7;
    this.poseFigure(f, {
      pos: p.pos,
      yaw: p.yaw,
      crouch: p.mode === "roll" ? 0.8 : Math.max(0, Math.min(1, crouch)),
      armsUp: ["hang", "rope", "zip", "wall", "ledgeHop"].includes(p.mode) && !sim.aiming,
      aimPitch: sim.aiming || sim.throwAiming ? sim.cam.pitch : null,
      roll: p.mode === "roll" ? (1 - p.rollTimer / 0.55) * Math.PI * 2 : 0,
      lie: p.mode === "dead" ? 1 : 0,
      swim: p.mode === "swim",
    });
    if (sim.aiming && (p.mode === "hang" || p.mode === "rope")) f.armL.rotation.x = Math.PI;
    f.gun.setEnabled(!!sim.activeWeapon() && (sim.aiming || p.mode === "cover" || sim.inCombat));
  }

  private syncEnemies(dt: number): void {
    const sim = this.sim!;
    for (const e of sim.enemies) {
      const ev = this.enemyVisual(e);
      const f = ev.fig;
      if (!e.alive && e.deadTime > 10) {
        f.root.setEnabled(false);
        ev.laser.setEnabled(false);
        continue;
      }
      this.poseFigure(f, {
        pos: e.pos,
        yaw: e.yaw,
        crouch: e.crouching ? 1 : 0,
        armsUp: false,
        aimPitch: e.alive && e.state === "combat" && e.weapon ? 0 : null,
        roll: 0,
        lie: e.alive ? (e.state === "stunned" ? 0.25 : 0) : Math.min(1, e.deadTime * 3),
        swim: false,
      });
      // Flash white during a melee wind-up (counter cue), red when hit.
      const flash = e.counterable ? 0.9 : e.hitFlash > 0 ? 0.6 : 0;
      f.mat.emissiveColor = e.counterable ? new Color3(flash, flash, flash) : new Color3(flash, flash * 0.1, flash * 0.1);
      const tagged = e.tagged && e.alive;
      for (const m of [f.body, f.head]) {
        m.renderOutline = tagged;
        if (tagged) {
          m.outlineColor = new Color3(1, 0.85, 0.2);
          m.outlineWidth = 0.03;
        }
      }
      // Suspicion meter above the head.
      const showMeter = e.alive && ((e.suspicion > 0.05 && !e.aware) || (e.aware && e.sinceSeen < 1.5 && e.reactTimer > 0));
      ev.meter.setEnabled(showMeter);
      if (showMeter) {
        const s = Math.min(1, e.suspicion);
        ev.meter.scaling.x = Math.max(0.05, s);
        ev.meterMat.emissiveColor = e.aware ? new Color3(1, 0.1, 0.1) : new Color3(1, 1 - s * 0.6, 0.1);
      }
      // Sniper laser telegraph.
      const lasing = e.alive && e.def.laserTime && e.laserTimer > 0.05;
      ev.laser.setEnabled(!!lasing);
      if (lasing) {
        const from = v(e.eye);
        const to = v(sim.player.chest());
        const d = to.subtract(from);
        ev.laser.position = from.add(d.scale(0.5));
        ev.laser.scaling.z = d.length();
        ev.laser.lookAt(to);
        const k = e.laserTimer / (e.def.laserTime ?? 1);
        ev.laser.scaling.x = ev.laser.scaling.y = 1 + k * 3;
      }
    }
    void dt;
  }

  private syncProps(): void {
    const sim = this.sim!;
    const bob = Math.sin(this.time * 2.5) * 0.08;
    for (const [id, m] of this.pickupMeshes) {
      const taken = sim.pickupsTaken.has(id);
      m.setEnabled(!taken);
      if (!taken) m.rotation.y = this.time;
    }
    for (const [id, m] of this.treasureMeshes) {
      const got = sim.treasures.has(id);
      m.setEnabled(!got);
      if (!got) {
        m.rotation.y = this.time * 1.5;
        m.position.y = sim.world.data.collectibles.find((c) => c.id === id)!.pos.y + bob;
      }
    }
    const visible = new Set(
      sim.world.data.interacts.filter((i) => (!i.hidden || sim.revealedInteracts.has(i.id)) && !(i.once && sim.interactsUsed.has(i.id))).map((i) => i.id),
    );
    for (const [id, m] of this.interactMeshes) {
      m.setEnabled(visible.has(id));
      m.rotation.y = this.time * 2;
    }
    const faceColors = ["#f2c94c", "#f5f5f5", "#4aa3ff", "#3ecf8e"];
    for (const pz of sim.puzzles) {
      if (pz.def.type !== "pillars") continue;
      pz.def.pillars.forEach((pid, k) => {
        const fm = this.pillarFaces.get(pid);
        if (fm) {
          const c = Color3.FromHexString(faceColors[pz.pillars[k] ?? 0]);
          fm.diffuseColor = c;
          fm.emissiveColor = c.scale(pz.solved ? 0.9 : 0.5);
        }
      });
    }
    // Enemy weapon drops.
    for (const d of sim.dynamicPickups) {
      if (!this.dropMeshes.has(d.id)) {
        const m = MeshBuilder.CreateBox(d.id, { width: 0.8, height: 0.18, depth: 0.22 }, this.scene!);
        m.material = flatMaterial(this.scene!, `drop-${d.id}`, "#2c3e50", { emissive: 0.3 });
        m.position = v(d.pos);
        this.dropMeshes.set(d.id, m);
      }
      this.dropMeshes.get(d.id)!.rotation.y = this.time;
    }
    for (const [id, m] of this.dropMeshes) {
      if (!sim.dynamicPickups.some((d) => d.id === id)) {
        m.dispose();
        this.dropMeshes.delete(id);
      }
    }
    // Ropes hang straight down, or stretch to the player's hand while swinging.
    for (const r of sim.world.data.ropes) {
      const m = this.ropeMeshes.get(r.id)!;
      const attached = sim.player.rope?.def.id === r.id;
      if (r.grapple && !attached) {
        m.setEnabled(false);
        continue;
      }
      m.setEnabled(true);
      const a = v(r.anchor);
      const b = attached ? v(sim.player.rope!.hand) : a.add(new Vector3(0, -r.length, 0));
      const d = b.subtract(a);
      m.position = a.add(d.scale(0.5));
      m.scaling.y = d.length();
      const up = new Vector3(0, 1, 0);
      const axis = Vector3.Cross(up, d.normalizeToNew());
      const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, d.normalizeToNew()))));
      m.rotationQuaternion = axis.length() > 1e-6 ? Quaternion.RotationAxis(axis.normalize(), ang) : Quaternion.Identity();
    }
    // Grenades in flight.
    while (this.projectileMeshes.length < sim.projectiles.length) {
      const m = MeshBuilder.CreateSphere(`proj${this.projectileMeshes.length}`, { diameter: 0.22, segments: 6 }, this.scene!);
      m.material = flatMaterial(this.scene!, `projMat${this.projectileMeshes.length}`, "#2f3b1f", { emissive: 0.2 });
      this.projectileMeshes.push(m);
    }
    this.projectileMeshes.forEach((m, i) => {
      const p = sim.projectiles[i];
      m.setEnabled(!!p);
      if (p) {
        m.position = v(p.pos);
        (m.material as StandardMaterial).emissiveColor = p.kind === "grenade" && p.fuse < 1 && Math.sin(this.time * 30) > 0 ? new Color3(1, 0.2, 0.1) : new Color3(0.1, 0.1, 0.1);
      }
    });
    // Throw arc preview.
    const pts = sim.arcPreview;
    this.arcDots.forEach((d, i) => {
      if (i === 39) {
        d.setEnabled(pts.length > 0);
        if (pts.length) d.position = v(pts[pts.length - 1].pos);
        return;
      }
      const p = pts[i * 2];
      d.setEnabled(!!p);
      if (p) d.position = v(p.pos);
    });
  }

  // ------------------------------------------------------------------ effects

  private spawnFx(kind: Fx["kind"], life: number): Mesh {
    let m = this.fxPool[kind].pop();
    if (!m) {
      const scene = this.scene!;
      if (kind === "tracer") m = MeshBuilder.CreateBox("tracer", { width: 0.025, height: 0.025, depth: 1 }, scene);
      else m = MeshBuilder.CreateSphere(kind, { diameter: 1, segments: 8 }, scene);
      const mat = new StandardMaterial(`${kind}Mat`, scene);
      mat.disableLighting = true;
      m.material = mat;
      m.isPickable = false;
    }
    m.setEnabled(true);
    this.fx.push({ mesh: m, life, max: life, kind });
    return m;
  }

  /** Turns simulation events into visual effects. */
  handleEvent(ev: SimEvent): void {
    if (!this.scene) return;
    if (ev.type === "shot") {
      const from = v(ev.from);
      const to = v(ev.to);
      const t = this.spawnFx("tracer", 0.07);
      const d = to.subtract(from);
      t.position = from.add(d.scale(0.5));
      t.scaling.z = Math.max(0.01, d.length());
      t.lookAt(to);
      (t.material as StandardMaterial).emissiveColor = Color3.FromHexString(ev.byPlayer ? PALETTE.tracerPlayer : PALETTE.tracerEnemy);
      const fl = this.spawnFx("flash", 0.05);
      fl.position = from;
      fl.scaling.setAll(0.25);
      (fl.material as StandardMaterial).emissiveColor = new Color3(1, 0.85, 0.4);
      if (ev.byPlayer) {
        const sp = this.spawnFx("spark", 0.12);
        sp.position = to;
        sp.scaling.setAll(0.12);
        (sp.material as StandardMaterial).emissiveColor = ev.hit ? new Color3(1, 0.2, 0.15) : new Color3(0.9, 0.9, 0.7);
      }
    } else if (ev.type === "explosion") {
      const e = this.spawnFx("explosion", 0.45);
      e.position = v(ev.pos);
      (e.material as StandardMaterial).emissiveColor = new Color3(1, 0.55, 0.15);
    } else if (ev.type === "shake") {
      this.shake = Math.max(this.shake, ev.amount);
    } else if (ev.type === "playerHurt") {
      this.shake = Math.max(this.shake, 0.15);
    }
  }

  private syncFx(dt: number): void {
    for (const f of this.fx) {
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      const mat = f.mesh.material as StandardMaterial;
      mat.alpha = f.kind === "tracer" ? k : k * 0.9;
      if (f.kind === "explosion") f.mesh.scaling.setAll(1 + (1 - k) * 8);
      if (f.life <= 0) {
        f.mesh.setEnabled(false);
        this.fxPool[f.kind].push(f.mesh);
      }
    }
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  private syncCamera(dt: number): void {
    const sim = this.sim!;
    const cam = this.camera!;
    const s = this.settings();
    const shakeAmt = (this.shake + sim.cam.shake) * s.a11y.cameraShake * (s.a11y.reduceMotion ? 0.2 : 1);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const jitter = new Vector3((Math.random() - 0.5) * shakeAmt * 0.15, (Math.random() - 0.5) * shakeAmt * 0.15, 0);
    if (sim.cam.rail) {
      cam.position = v(sim.cam.rail.position);
      cam.setTarget(v(sim.cam.rail.target));
      cam.fov = 0.9;
      return;
    }
    cam.position = v(sim.cam.position).add(jitter);
    const dir = lookDir(sim.cam.yaw, sim.cam.pitch);
    cam.setTarget(cam.position.add(new Vector3(dir.x, dir.y, dir.z)));
    cam.fov = sim.cam.fov;
  }

  private dynamicResolution(): void {
    const s = this.settings().video;
    if (!s.dynamicResolution) return;
    this.fpsWindow.push(this.engine.getFps());
    if (this.fpsWindow.length < 60) return;
    const avg = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
    this.fpsWindow = [];
    const target = s.fpsCap;
    if (avg < target * 0.85 && this.scaling < 2) this.scaling = Math.min(2, this.scaling + 0.15);
    else if (avg > target * 0.97 && this.scaling > this.baseScaling) this.scaling = Math.max(this.baseScaling, this.scaling - 0.05);
    this.engine.setHardwareScalingLevel(this.scaling);
  }

  // ------------------------------------------------------------------ settings & cleanup

  applyAccessibility(): void {
    const s = this.settings();
    this.color?.set(s.a11y.colorblind, s.a11y.colorblindStrength, s.video.brightness);
  }

  /** Projects a world point to screen pixels (for HUD markers). Returns null when behind the camera. */
  project(p: V3): { x: number; y: number } | null {
    if (!this.scene || !this.camera) return null;
    const cam = this.camera;
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const vp = cam.viewport.toGlobal(w, h);
    const pos = Vector3.Project(v(p), Matrix.Identity(), this.scene.getTransformMatrix(), vp);
    if (pos.z < 0 || pos.z > 1) return null;
    const scale = this.engine.getHardwareScalingLevel();
    return { x: pos.x * scale, y: pos.y * scale };
  }

  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
    this.camera = null;
    this.sim = null;
    this.envMats.clear();
    this.dynamicBoxes.clear();
    this.falling = [];
    this.crateMeshes = [];
    this.ledgeMeshes.clear();
    this.pickupMeshes.clear();
    this.treasureMeshes.clear();
    this.interactMeshes.clear();
    this.dropMeshes.clear();
    this.pillarFaces.clear();
    this.ropeMeshes.clear();
    this.enemies.clear();
    this.projectileMeshes = [];
    this.arcDots = [];
    this.fx = [];
    this.fxPool = { tracer: [], flash: [], explosion: [], spark: [] };
    this.shadows = null;
  }

  /** For tests and the debug overlay. */
  meshCount(): number {
    return this.scene?.meshes.filter((m: AbstractMesh) => m.isEnabled()).length ?? 0;
  }
}
