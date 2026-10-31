// Draws the GameSim with Babylon.js. The renderer only reads simulation state; it never changes it.
// Static level geometry is merged per material for few draw calls; moving things (characters,
// vehicles, crates, moving platforms, effects) are synced every frame from the simulation.
//
// Look: physically based materials painted from noise (render/materials/ProceduralPBR.ts),
// a gradient sky, ACES tone mapping, a sun with shadows, and skinned procedural characters.
// Every costly feature is switched by the quality tier table in render/Quality.ts.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/outlineRenderer";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";

import type { GameSim, SimEvent } from "../sim/GameSim";
import { lookDir, type V3 } from "../sim/math";
import { fovForAspect } from "../sim/player/CameraRig";
import type { BoxDef, Material as MatName } from "../sim/world/types";
import type { RuntimeBox } from "../sim/world/World";
import type { Enemy } from "../sim/ai/Enemy";
import type { Pursuer } from "../sim/vehicle/Vehicle";
import type { PlayerMode } from "../sim/player/PlayerController";
import type { Settings } from "../core/Settings";
import { HIGH_CONTRAST_ENV, PALETTE, climbTexture, flatMaterial, gridTexture } from "./greybox";
import { ColorPostProcess } from "./ColorPostProcess";
import { TIERS, autoTier, type Tier, type TierSpec } from "./Quality";
import { proceduralPBR } from "./materials/ProceduralPBR";
import { createSky, luminance } from "./Sky";
import { createWaterMaterial } from "./WaterShader";
import { Figure, OUTFITS, outfitFor, type Anim, type Outfit } from "./Figure";
import { bellMesh, jeepMesh } from "./meshUtil";
import { Hazards, Scrolling, Searchlights, Weather } from "./SetPieces";
import { AssetSwap } from "./assets/AssetLibrary";

const v = (p: V3) => new Vector3(p.x, p.y, p.z);

interface EnemyVisual {
  fig: Figure;
  meter: Mesh;
  meterMat: StandardMaterial;
  laser: Mesh;
  last: Vector3;
  speed: number;
}

interface PursuerVisual {
  jeep: Mesh;
  gunner: Figure;
  driver: Figure;
}

interface Fx {
  mesh: Mesh;
  life: number;
  max: number;
  kind: "tracer" | "flash" | "explosion" | "spark";
}

/** Bram: Ines's mentor, who rides along in the Ch4 jeep. */
const BRAM: Outfit = { skin: "#5b3a26", top: "#3d5a73", bottom: "#4a4538", boots: "#2a2118", hair: "#bdb7ab", accent: "#c9a447", bulk: 0.06 };

export class SceneRenderer {
  readonly engine: Engine;
  scene: Scene | null = null;
  private camera: UniversalCamera | null = null;
  private color: ColorPostProcess | null = null;
  private shadows: ShadowGenerator | null = null;
  private sun: DirectionalLight | null = null;
  private sim: GameSim | null = null;
  private tier: TierSpec = TIERS.medium;
  private envMats = new Map<string, PBRMaterial | StandardMaterial>();
  private dynamicBoxes = new Map<string, Mesh>();
  private moverGroups = new Set<string>();
  private falling: Array<{ mesh: Mesh; vy: number; t: number }> = [];
  private crateMeshes: Mesh[] = [];
  private ledgeMeshes = new Map<string, Mesh>();
  private pickupMeshes = new Map<string, Mesh>();
  private treasureMeshes = new Map<string, Mesh>();
  private interactMeshes = new Map<string, Mesh>();
  private bellMeshes = new Map<string, { mesh: Mesh; swing: number; flash: number }>();
  private dropMeshes = new Map<string, Mesh>();
  private pillarFaces = new Map<string, StandardMaterial>();
  private ropeMeshes = new Map<string, Mesh>();
  private player: Figure | null = null;
  private bram: Figure | null = null;
  private jeep: Mesh | null = null;
  private jeepParked: { pos: Vector3; yaw: number } | null = null;
  private enemies = new Map<string, EnemyVisual>();
  private pursuers = new Map<string, PursuerVisual>();
  private searchlights: Searchlights | null = null;
  private hazards: Hazards | null = null;
  private scrolling: Scrolling | null = null;
  private weather: Weather | null = null;
  private baseFog = 0;
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
  private instrumentation: SceneInstrumentation | null = null;

  constructor(canvas: HTMLCanvasElement, settings: () => Settings) {
    this.settings = settings;
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
    this.applyQuality();
    window.addEventListener("resize", () => this.engine.resize());
  }

  /** Applies the quality tier's resolution. "Auto" guesses from the device. */
  applyQuality(): void {
    this.tier = TIERS[this.resolvedQuality()];
    const dpr = Math.min(window.devicePixelRatio || 1, this.tier.maxDpr);
    this.baseScaling = 1 / dpr;
    this.scaling = this.baseScaling;
    this.engine.setHardwareScalingLevel(this.scaling);
  }

  resolvedQuality(): Tier {
    const q = this.settings().video.quality;
    if (q !== "auto") return q;
    return autoTier(navigator.hardwareConcurrency || 4, /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  }

  // ------------------------------------------------------------------ level construction

  load(sim: GameSim): void {
    this.dispose();
    this.applyQuality();
    this.sim = sim;
    const tier = this.tier;
    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.skipPointerMovePicking = true;
    if (new URLSearchParams(location.search).has("debug")) this.instrumentation = new SceneInstrumentation(scene);
    const sky = sim.world.data.sky;
    const night = luminance(sky.top) < 0.25;
    scene.clearColor = Color4.FromHexString(sky.fog + "ff");
    scene.fogMode = Scene.FOGMODE_EXP2;
    this.baseFog = sky.fogDensity;
    scene.fogDensity = sky.fogDensity;
    scene.fogColor = Color3.FromHexString(sky.fog);
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);

    // Filmic tone mapping: bright skies roll off softly instead of clipping.
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = night ? 1.35 : 1.05;
    ip.contrast = 1.12;

    const cam = new UniversalCamera("cam", new Vector3(0, 2, -5), scene);
    cam.minZ = 0.08;
    cam.maxZ = 600;
    cam.inputs.clear();
    this.camera = cam;

    const sunDir = night ? new Vector3(0.35, -0.8, 0.45).normalize() : new Vector3(-0.45, -0.85, 0.35).normalize();
    const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), scene);
    hemi.intensity = night ? 0.55 : 0.85;
    hemi.diffuse = Color3.FromHexString(sky.top).scale(0.5).add(new Color3(0.5, 0.5, 0.5));
    hemi.groundColor = Color3.FromHexString(sky.bottom).scale(0.45);
    const sun = new DirectionalLight("sun", sunDir, scene);
    sun.intensity = night ? 1.1 : 2.6;
    sun.diffuse = night ? new Color3(0.62, 0.72, 1) : new Color3(1, 0.93, 0.82);
    sun.position = sunDir.scale(-80);
    this.sun = sun;
    createSky(scene, { top: sky.top, horizon: sky.fog, bottom: sky.bottom }, sunDir, night);

    if (tier.shadows !== "blob") {
      if (tier.shadows === "cascaded") {
        const csm = new CascadedShadowGenerator(2048, sun);
        csm.numCascades = 3;
        csm.lambda = 0.85;
        csm.shadowMaxZ = 120;
        csm.usePercentageCloserFiltering = true;
        this.shadows = csm;
      } else {
        const sg = new ShadowGenerator(tier.shadows === "pcf2048" ? 2048 : 1024, sun);
        sg.usePercentageCloserFiltering = true;
        sg.filteringQuality = tier.shadows === "pcf2048" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
        // A tight shadow box that follows the player keeps shadows sharp on big levels.
        sun.autoUpdateExtends = false;
        sun.shadowFrustumSize = 70;
        sun.shadowMinZ = 1;
        sun.shadowMaxZ = 200;
        this.shadows = sg;
      }
      this.shadows.bias = 0.0015;
      this.shadows.normalBias = 0.02;
    }

    if (tier.fxaa || tier.bloom) {
      const pl = new DefaultRenderingPipeline("pipeline", false, scene, [cam]);
      pl.fxaaEnabled = tier.fxaa;
      pl.bloomEnabled = tier.bloom;
      pl.bloomThreshold = 0.85;
      pl.bloomWeight = 0.25;
      pl.bloomKernel = 48;
      pl.imageProcessingEnabled = true;
    }
    if (tier.ssao) {
      const ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [cam]);
      ssao.radius = 1.6;
      ssao.totalStrength = 1.1;
      ssao.samples = 12;
    }
    // Colour-blind correction runs last so it sees the final image.
    this.color = new ColorPostProcess(cam);

    const swap = new AssetSwap();
    this.buildEnvironment(swap);
    const hc = this.settings().a11y.highContrast;
    const ines = hc ? { ...OUTFITS.ines, top: PALETTE.playerHigh, bottom: PALETTE.playerHigh } : OUTFITS.ines;
    this.player = this.makeFigure("player", ines, 1.8);
    this.buildActOneVisuals(swap);
    this.applyAccessibility();
    this.revision = sim.world.revision;
    void swap.apply(scene);
  }

  private makeFigure(name: string, outfit: Outfit, height: number): Figure {
    const f = new Figure(this.scene!, name, outfit, height, this.tier.shadows === "blob");
    this.shadows?.addShadowCaster(f.mesh);
    return f;
  }

  private envMat(name: MatName | "hc"): PBRMaterial | StandardMaterial {
    const hc = this.settings().a11y.highContrast;
    const key = hc ? "hc" : name;
    let m = this.envMats.get(key);
    if (!m) {
      if (hc) {
        const sm = new StandardMaterial(`env-${key}`, this.scene!);
        sm.diffuseTexture = gridTexture(this.scene!, HIGH_CONTRAST_ENV, `grid-${key}`);
        sm.specularColor = new Color3(0.04, 0.04, 0.04);
        m = sm;
      } else m = proceduralPBR(this.scene!, name as MatName, this.tier.textureSize);
      this.envMats.set(key, m);
    }
    return m;
  }

  private boxMesh(b: { min: V3; max: V3 }, name: string): Mesh {
    const w = b.max.x - b.min.x;
    const h = b.max.y - b.min.y;
    const d = b.max.z - b.min.z;
    // Face UVs scaled by face size (metres) so textures tile at the same size on any box.
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

  private buildEnvironment(swap: AssetSwap): void {
    const sim = this.sim!;
    const scene = this.scene!;
    const data = sim.world.data;
    const staticByMat = new Map<string, Mesh[]>();
    for (const mv of data.movers) this.moverGroups.add(mv.group);
    const isDynamic = (b: BoxDef) => !!b.group || b.hp !== undefined || b.explosive || b.hidden;

    for (const b of sim.world.boxes) {
      const mesh = this.boxMesh(b, b.id);
      if (b.explosive) {
        mesh.material = flatMaterial(scene, `barrel-${b.id}`, "#b8322a", { emissive: 0.08, specular: 0.3 });
        swap.register("prop.barrel", mesh);
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
      const m = MeshBuilder.CreateBox(r.id, { width: r.axis === "x" ? slope : width, depth: r.axis === "z" ? slope : width, height: 0.2, faceUV: Array(6).fill(new Vector4(0, 0, width, slope)) }, scene);
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
        this.shadows?.addShadowCaster(merged);
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

    // Water surfaces: animated shader, no reflection pass.
    if (data.water.length) {
      const sky = data.sky;
      const water = createWaterMaterial(scene, { deep: "#0f3a4a", shallow: "#2f7f8c", sky: sky.top, fog: sky.fog, fogDensity: sky.fogDensity }, this.sun!.direction);
      for (const wv of data.water) {
        const w = wv.max.x - wv.min.x;
        const d = wv.max.z - wv.min.z;
        const p = MeshBuilder.CreateGround(wv.id, { width: w, height: d, subdivisionsX: Math.min(40, Math.ceil(w / 2)), subdivisionsY: Math.min(40, Math.ceil(d / 2)) }, scene);
        p.position.set((wv.min.x + wv.max.x) / 2, wv.max.y - 0.02, (wv.min.z + wv.max.z) / 2);
        p.material = water;
      }
    }

    // Tall grass (and scrub, juniper) as thin-instanced tapered blades.
    if (data.grass.length) {
      const blade = MeshBuilder.CreateCylinder("blade", { height: 1, diameterTop: 0, diameterBottom: 0.09, tessellation: 3 }, scene);
      const gm = new PBRMaterial("grassMat", scene);
      gm.albedoColor = Color3.FromHexString(PALETTE.grass).toLinearSpace();
      gm.roughness = 0.85;
      gm.metallic = 0;
      gm.backFaceCulling = false;
      blade.material = gm;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const mats: Matrix[] = [];
      for (const g of data.grass) {
        const area = (g.max.x - g.min.x) * (g.max.z - g.min.z);
        const h = g.max.y - g.min.y;
        for (let i = 0; i < area * this.tier.grassDensity; i++) {
          const x = g.min.x + rnd() * (g.max.x - g.min.x);
          const z = g.min.z + rnd() * (g.max.z - g.min.z);
          const s = h * (0.7 + rnd() * 0.4);
          const q = Quaternion.FromEulerAngles((rnd() - 0.5) * 0.4, rnd() * Math.PI, (rnd() - 0.5) * 0.4);
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
      const rope = MeshBuilder.CreateCylinder(`rope-${r.id}`, { height: 1, diameter: 0.05, tessellation: 6 }, scene);
      rope.material = ropeMat;
      this.ropeMeshes.set(r.id, rope);
    }
    for (const z of data.ziplines) {
      MeshBuilder.CreateTube(z.id, { path: [v(z.a), v(z.b)], radius: 0.035 }, scene).material = flatMaterial(scene, `zip-${z.id}`, "#444", { specular: 0.4 });
      const post = MeshBuilder.CreateBox(`zipPost-${z.id}`, { width: 0.2, height: 2.5, depth: 0.2 }, scene);
      post.position = v(z.a).add(new Vector3(0, -0.6, 0.2));
      post.material = this.envMat("wood");
    }

    // Crates use the wood material.
    for (const c of sim.world.crates) {
      const m = this.boxMesh(c, c.id);
      m.material = this.envMat("wood");
      this.shadows?.addShadowCaster(m);
      m.receiveShadows = true;
      this.crateMeshes.push(m);
      swap.register("prop.crate", m);
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

    // Interactables: a floating marker, plus props for pillars, levers, panels and bells.
    const markMat = flatMaterial(scene, "interactMark", PALETTE.interact, { emissive: 0.7 });
    for (const i of data.interacts) {
      const m = MeshBuilder.CreatePolyhedron(`mark-${i.id}`, { type: 1, size: 0.1 }, scene);
      m.position = v(i.pos).add(new Vector3(0, i.kind === "bell" ? 1.5 : 0.6, 0));
      m.material = markMat;
      this.interactMeshes.set(i.id, m);
      if (i.kind === "pillar") {
        const face = MeshBuilder.CreateBox(`face-${i.id}`, { width: 0.7, height: 0.7, depth: 0.05 }, scene);
        face.position = v(i.pos).add(new Vector3(0, 0.4, -0.05));
        const fm = flatMaterial(scene, `faceMat-${i.id}`, "#f2c94c", { emissive: 0.5 });
        face.material = fm;
        this.pillarFaces.set(i.id, fm);
      }
      if (i.kind === "lever" || i.kind === "valve") {
        const h = MeshBuilder.CreateCylinder(`lever-${i.id}`, { height: 0.8, diameter: 0.08 }, scene);
        h.position = v(i.pos).add(new Vector3(0, 0.2, 0.3));
        h.rotation.x = 0.5;
        h.material = flatMaterial(scene, `leverMat-${i.id}`, i.kind === "valve" ? "#c0392b" : "#b03a2e", { emissive: 0.3 });
      }
      if (i.kind === "panel") {
        const box = MeshBuilder.CreateBox(`panel-${i.id}`, { width: 0.6, height: 0.8, depth: 0.2 }, scene);
        box.position = v(i.pos);
        box.material = flatMaterial(scene, `panelMat-${i.id}`, "#c7a23a", { emissive: 0.15, specular: 0.4 });
      }
      if (i.kind === "bell") {
        const count = sim.chapter.script!.puzzles.find((p) => p.type === "bells" && p.bells.includes(i.id));
        const index = count && count.type === "bells" ? count.bells.indexOf(i.id) : 0;
        const bell = bellMesh(scene, `bell-${i.id}`, 1.25 - index * 0.15);
        bell.position = v(i.pos).add(new Vector3(0, 1.3, 0));
        this.shadows?.addShadowCaster(bell);
        this.bellMeshes.set(i.id, { mesh: bell, swing: 0, flash: 0 });
        swap.register("prop.bell", bell);
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

  /** Jeeps, searchlights, tunnels, avalanches, train scenery and weather. */
  private buildActOneVisuals(swap: AssetSwap): void {
    const sim = this.sim!;
    const scene = this.scene!;
    const data = sim.world.data;
    const vehicleSpot = data.interacts.find((i) => i.kind === "vehicle");
    if (data.tracks.length) {
      this.jeep = jeepMesh(scene, "jeep", "#5f6b3a", false);
      this.shadows?.addShadowCaster(this.jeep);
      swap.register("prop.jeep", this.jeep);
      this.bram = this.makeFigure("bram", BRAM, 1.82);
      const start = data.tracks[0].points[0];
      this.jeepParked = { pos: vehicleSpot ? new Vector3(vehicleSpot.pos.x, start.y, vehicleSpot.pos.z + 1.5) : v(start), yaw: 0 };
    }
    if (sim.searchlights.length) this.searchlights = new Searchlights(scene, sim);
    if (data.hazards.some((h) => h.kind !== "kill")) this.hazards = new Hazards(scene, sim, this.envMat("rock") as PBRMaterial);
    if (data.scroll) {
      const zs = data.boxes.map((b) => (b.min.z + b.max.z) / 2);
      const centre = (Math.min(...zs) + Math.max(...zs)) / 2;
      this.scrolling = new Scrolling(scene, data.scroll.speed, proceduralPBR(scene, "rock", this.tier.textureSize), centre);
    }
    if (data.weather.length) this.weather = new Weather(scene, this.tier.particles);
  }

  // ------------------------------------------------------------------ characters

  private enemyVisual(e: Enemy): EnemyVisual {
    let ev = this.enemies.get(e.id);
    if (ev) return ev;
    const scene = this.scene!;
    const hc = this.settings().a11y.highContrast;
    const base = outfitFor(e.def.id);
    const outfit = hc ? { ...base, top: PALETTE.enemyHigh, bottom: PALETTE.enemyHigh } : base;
    const fig = this.makeFigure(`enemy-${e.id}`, outfit, e.def.height);
    if (!e.weapon) fig.gun.setEnabled(false);
    const meterMat = flatMaterial(scene, `meter-${e.id}`, "#ffd400", { emissive: 1 });
    meterMat.disableLighting = true;
    const meter = MeshBuilder.CreatePlane(`meterPlane-${e.id}`, { width: 0.6, height: 0.09 }, scene);
    meter.billboardMode = Mesh.BILLBOARDMODE_ALL;
    meter.material = meterMat;
    const laser = MeshBuilder.CreateBox(`laser-${e.id}`, { width: 0.02, height: 0.02, depth: 1 }, scene);
    const lm = flatMaterial(scene, `laserMat-${e.id}`, PALETTE.laser, { emissive: 1, alpha: 0.7 });
    lm.disableLighting = true;
    laser.material = lm;
    laser.setEnabled(false);
    ev = { fig, meter, meterMat, laser, last: v(e.pos), speed: 0 };
    this.enemies.set(e.id, ev);
    return ev;
  }

  // ------------------------------------------------------------------ per-frame sync

  render(dt: number): void {
    const sim = this.sim;
    const scene = this.scene;
    if (!sim || !scene || !this.camera) return;
    this.time += dt;
    this.syncWorld(dt);
    this.syncPlayer(dt);
    this.syncEnemies(dt);
    this.syncVehicles(dt);
    this.syncProps(dt);
    this.syncSetPieces(dt);
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
    // Moving platforms: follow the simulation's boxes and ledges.
    if (this.moverGroups.size) {
      for (const b of sim.world.boxes) {
        if (!b.group || !this.moverGroups.has(b.group)) continue;
        this.dynamicBoxes.get(b.id)?.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
      }
      for (const l of sim.world.ledges) {
        if (!l.group || !this.moverGroups.has(l.group)) continue;
        this.ledgeMeshes.get(l.id)?.position.set((l.a.x + l.b.x) / 2 + l.normal.x * 0.035, l.a.y - 0.02, (l.a.z + l.b.z) / 2 + l.normal.z * 0.035);
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

  private playerAnim(mode: PlayerMode, aiming: boolean, speed: number, grounded: boolean): Anim {
    if (aiming && mode !== "hang" && mode !== "rope") return "aim";
    switch (mode) {
      case "hang":
      case "ledgeHop":
      case "climbUp":
        return "hang";
      case "wall":
        return "climb";
      case "rope":
        return "rope";
      case "zip":
        return "zip";
      case "swim":
        return "swim";
      case "roll":
        return "roll";
      case "cover":
        return "cover";
      case "dead":
        return "dead";
      case "vehicle":
        return "drive";
      case "air":
        return "air";
      default:
        return !grounded ? "air" : speed > 0.3 ? "move" : "idle";
    }
  }

  private syncPlayer(dt: number): void {
    const sim = this.sim!;
    const p = sim.player;
    const f = this.player!;
    const visible = !(sim.aiming && sim.cam.scoped);
    f.setEnabled(visible || !!sim.cutscene);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    let anim = this.playerAnim(p.mode, sim.aiming || sim.throwAiming, speed, p.grounded);
    let pos: V3 = p.pos;
    let yaw = p.yaw;
    // In the jeep the figure sits in a seat (driving) or stands at the back (gunner).
    if (p.mode === "vehicle" && sim.vehicle && this.jeep) {
      const gunner = sim.vehicle.track.def.mode === "gunner";
      pos = this.seat(gunner ? 0 : -0.45, gunner ? 0.78 : 0.55, gunner ? -1.2 : 0.1);
      yaw = gunner ? sim.cam.yaw : this.jeep.rotation.y;
      anim = gunner ? (sim.aiming ? "aim" : "idle") : "drive";
    }
    f.update(dt, {
      pos,
      yaw,
      anim,
      speed: p.mode === "vehicle" ? 0 : speed,
      crouch: Math.max(0, Math.min(1, (1.8 - p.height) / 0.7)),
      aimPitch: sim.cam.pitch,
      lie: p.mode === "dead" ? 1 : 0,
      roll: p.mode === "roll" ? (1 - p.rollTimer / 0.55) * Math.PI * 2 : 0,
      oneHanded: p.mode === "hang" || p.mode === "rope",
    });
    f.gun.setEnabled(!!sim.activeWeapon() && (sim.aiming || p.mode === "cover" || sim.inCombat || (p.mode === "vehicle" && sim.vehicle?.track.def.mode === "gunner")));
  }

  /** A point on the jeep in local seat coordinates (x right, y up, z forward). */
  private seat(x: number, y: number, z: number): V3 {
    const j = this.jeep!;
    const yaw = j.rotation.y;
    return { x: j.position.x + Math.cos(yaw) * x + Math.sin(yaw) * z, y: j.position.y + y, z: j.position.z - Math.sin(yaw) * x + Math.cos(yaw) * z };
  }

  private syncEnemies(dt: number): void {
    const sim = this.sim!;
    const camPos = this.camera!.position;
    for (const e of sim.enemies) {
      const ev = this.enemyVisual(e);
      const f = ev.fig;
      if (!e.alive && e.deadTime > 10) {
        f.setEnabled(false);
        ev.meter.setEnabled(false);
        ev.laser.setEnabled(false);
        continue;
      }
      const now = v(e.pos);
      ev.speed = dt > 0 ? Math.min(8, Vector3.Distance(now, ev.last) / dt) : 0;
      ev.last.copyFrom(now);
      // Far-away characters hold their pose to save time on phones.
      if (Vector3.Distance(now, camPos) < this.tier.animDistance || !e.alive) {
        const anim: Anim = !e.alive ? "dead" : e.state === "stunned" ? "stunned" : e.state === "combat" && e.weapon && ev.speed < 0.5 ? "aim" : ev.speed > 0.3 ? "move" : "idle";
        f.update(dt, {
          pos: e.pos,
          yaw: e.yaw,
          anim,
          speed: ev.speed,
          crouch: e.crouching ? 1 : 0,
          aimPitch: 0,
          lie: e.alive ? 0 : Math.min(1, e.deadTime * 3),
          roll: 0,
        });
      }
      // Flash white during a melee wind-up (counter cue), red when hit.
      const flash = e.counterable ? 0.9 : e.hitFlash > 0 ? 0.6 : 0;
      f.mat.emissiveColor = e.counterable ? new Color3(flash, flash, flash) : new Color3(flash, flash * 0.1, flash * 0.1);
      const tagged = e.alive && e.tagged;
      f.mesh.renderOutline = tagged;
      if (tagged) {
        f.mesh.outlineColor = new Color3(1, 0.85, 0.2);
        f.mesh.outlineWidth = 0.03;
      }
      // Suspicion meter above the head.
      const showMeter = e.alive && ((e.suspicion > 0.05 && !e.aware) || (e.aware && e.sinceSeen < 1.5 && e.reactTimer > 0));
      ev.meter.setEnabled(showMeter);
      if (showMeter) {
        ev.meter.position.set(e.pos.x, e.pos.y + e.def.height + 0.35, e.pos.z);
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
  }

  private syncVehicles(dt: number): void {
    const sim = this.sim!;
    const j = this.jeep;
    if (!j) return;
    const veh = sim.vehicle;
    if (veh) {
      j.position.set(veh.pos.x, veh.pos.y, veh.pos.z);
      j.rotation.y = veh.yaw;
    } else if (this.jeepParked) {
      j.position.copyFrom(this.jeepParked.pos);
      j.rotation.y = this.jeepParked.yaw;
    }
    // Bram rides along: passenger while Ines drives, driver once she takes the gun.
    const bram = this.bram!;
    const riding = sim.riding;
    bram.setEnabled(riding);
    if (riding) {
      const gunner = veh!.track.def.mode === "gunner";
      bram.update(dt, { pos: this.seat(gunner ? -0.45 : 0.45, 0.55, 0.1), yaw: j.rotation.y, anim: "drive", speed: 0, crouch: 0, aimPitch: 0, lie: 0, roll: 0 });
    }
    // Enemy jeeps, each with a driver and a gunner on the back.
    for (const pu of sim.pursuers) {
      let pv = this.pursuers.get(pu.def.id);
      if (!pv) pv = this.makePursuer(pu);
      const show = pu.alive && riding;
      pv.jeep.setEnabled(show);
      pv.gunner.setEnabled(show);
      pv.driver.setEnabled(show);
      if (!show) continue;
      pv.jeep.position.set(pu.pos.x, pu.pos.y, pu.pos.z);
      pv.jeep.rotation.y = pu.yaw;
      const local = (x: number, y: number, z: number): V3 => ({ x: pu.pos.x + Math.cos(pu.yaw) * x + Math.sin(pu.yaw) * z, y: pu.pos.y + y, z: pu.pos.z - Math.sin(pu.yaw) * x + Math.cos(pu.yaw) * z });
      const toPlayer = Math.atan2(sim.player.pos.x - pu.pos.x, sim.player.pos.z - pu.pos.z);
      pv.gunner.update(dt, { pos: local(0, 0.78, -1.2), yaw: toPlayer, anim: "aim", speed: 0, crouch: 0, aimPitch: 0, lie: 0, roll: 0 });
      pv.driver.update(dt, { pos: local(-0.45, 0.55, 0.1), yaw: pu.yaw, anim: "drive", speed: 0, crouch: 0, aimPitch: 0, lie: 0, roll: 0 });
      pv.gunner.mat.emissiveColor = pu.hitFlash > 0 ? new Color3(0.6, 0.06, 0.06) : Color3.Black();
    }
  }

  private makePursuer(pu: Pursuer): PursuerVisual {
    const jeep = jeepMesh(this.scene!, `pjeep-${pu.def.id}`, "#7a3b22", true);
    this.shadows?.addShadowCaster(jeep);
    const pv = { jeep, gunner: this.makeFigure(`pgun-${pu.def.id}`, OUTFITS.rifleman, 1.8), driver: this.makeFigure(`pdrv-${pu.def.id}`, OUTFITS.shotgunner, 1.8) };
    this.pursuers.set(pu.def.id, pv);
    return pv;
  }

  private syncSetPieces(dt: number): void {
    const sim = this.sim!;
    this.searchlights?.sync(sim);
    this.hazards?.sync(sim);
    this.scrolling?.update(dt);
    const w = sim.weather;
    if (this.weather) {
      this.weather.set(w);
      this.weather.emitter.copyFrom(this.camera!.position);
    }
    // Weather thickens the fog smoothly.
    const want = this.baseFog + (w?.fog ?? 0);
    this.scene!.fogDensity += (want - this.scene!.fogDensity) * Math.min(1, dt * 1.5);
    // Keep the sharp shadow box centred on the player.
    if (this.sun && this.shadows && !(this.shadows instanceof CascadedShadowGenerator)) {
      const p = sim.player.pos;
      this.sun.position.set(p.x - this.sun.direction.x * 80, p.y - this.sun.direction.y * 80, p.z - this.sun.direction.z * 80);
    }
  }

  private syncProps(dt: number): void {
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
      m.setEnabled(visible.has(id) && !(sim.riding && sim.world.data.interacts.find((i) => i.id === id)?.kind === "vehicle"));
      m.rotation.y = this.time * 2;
    }
    // Bells swing and glow when rung.
    for (const b of this.bellMeshes.values()) {
      b.swing = Math.max(0, b.swing - dt * 0.8);
      b.flash = Math.max(0, b.flash - dt * 1.5);
      b.mesh.rotation.x = Math.sin(this.time * 7) * 0.35 * b.swing;
      const mat = b.mesh.material as PBRMaterial;
      mat.emissiveColor = new Color3(1, 0.8, 0.35).scale(b.flash * 0.8);
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
    } else if (ev.type === "bell") {
      let best: { mesh: Mesh; swing: number; flash: number } | null = null;
      let bestD = Infinity;
      for (const b of this.bellMeshes.values()) {
        const d = Vector3.Distance(b.mesh.position, v(ev.pos));
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (best) {
        best.swing = 1;
        best.flash = 1;
      }
    } else if (ev.type === "vehicle" && ev.kind === "exit" && this.jeep) {
      this.jeepParked = { pos: this.jeep.position.clone(), yaw: this.jeep.rotation.y };
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
      cam.fov = fovForAspect(0.9, this.engine.getAspectRatio(cam));
      return;
    }
    cam.position = v(sim.cam.position).add(jitter);
    const dir = lookDir(sim.cam.yaw, sim.cam.pitch);
    cam.setTarget(cam.position.add(new Vector3(dir.x, dir.y, dir.z)));
    cam.fov = fovForAspect(sim.cam.fov, this.engine.getAspectRatio(cam));
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

  /** Draw-call and triangle counts, for the debug overlay and performance tests. */
  stats(): { drawCalls: number; triangles: number; tier: Tier } {
    const scene = this.scene;
    let tris = 0;
    if (scene) for (const m of scene.getActiveMeshes().data) tris += m.getTotalIndices() / 3;
    return { drawCalls: this.instrumentation?.drawCallsCounter.current ?? 0, triangles: Math.round(tris), tier: this.resolvedQuality() };
  }

  dispose(): void {
    this.instrumentation?.dispose();
    this.instrumentation = null;
    this.scene?.dispose();
    this.scene = null;
    this.camera = null;
    this.sim = null;
    this.sun = null;
    this.envMats.clear();
    this.dynamicBoxes.clear();
    this.moverGroups.clear();
    this.falling = [];
    this.crateMeshes = [];
    this.ledgeMeshes.clear();
    this.pickupMeshes.clear();
    this.treasureMeshes.clear();
    this.interactMeshes.clear();
    this.bellMeshes.clear();
    this.dropMeshes.clear();
    this.pillarFaces.clear();
    this.ropeMeshes.clear();
    this.enemies.clear();
    this.pursuers.clear();
    this.player = null;
    this.bram = null;
    this.jeep = null;
    this.jeepParked = null;
    this.searchlights = null;
    this.hazards = null;
    this.scrolling = null;
    this.weather = null;
    this.projectileMeshes = [];
    this.arcDots = [];
    this.fx = [];
    this.fxPool = { tracer: [], flash: [], explosion: [], spark: [] };
    this.shadows = null;
  }
}
