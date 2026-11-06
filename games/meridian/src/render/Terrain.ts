// The land around each chapter's playable area, made in Blender (assets-src/blender/
// render_backgrounds.py --terrain) and shipped as public/assets/terrain/chNN.glb.
//
// It is only scenery: nothing collides with it. Inside the playable area it sits just under the
// level's floors; outside the low rock edges it carries on as open ground, hills and coast that
// fade into the fog and meet the chapter's panorama on the horizon.
//
// The Blender script writes vertices already in game coordinates (x right, y up, z forward),
// so the mesh is used without the glTF loader's handedness root (which would mirror it).

import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { LevelData } from "../sim/world/types";

/** Chapters that have Blender terrain. The train (ch06) has moving scenery instead. */
export const TERRAIN_CHAPTERS = ["ch01", "ch02", "ch03", "ch04", "ch05", "ch07"] as const;

export const terrainUrl = (chapterId: string, low: boolean): string => `${import.meta.env.BASE_URL}assets/terrain/${chapterId}${low ? "-lo" : ""}.glb`;

/** The glTF stores linear colours; this material shows vertex colours as they look in Blender. */
function toGamma(mesh: Mesh): void {
  const c = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!c) return;
  const out = new Float32Array(c.length);
  for (let i = 0; i < c.length; i++) out[i] = (i & 3) === 3 ? 1 : Math.pow(Math.max(0, c[i]), 1 / 2.2);
  mesh.setVerticesData(VertexBuffer.ColorKind, out, false, 4);
}

function terrainMaterial(scene: Scene, night: boolean): StandardMaterial {
  const m = new StandardMaterial("terrain", scene);
  m.diffuseColor = Color3.White();
  m.specularColor = Color3.Black();
  // A little self-light so the far hills keep their colour against the fog at night.
  m.emissiveColor = new Color3(1, 1, 1).scale(night ? 0.12 : 0.06);
  // The mesh is used without the glTF root's mirror, which flips its winding: draw both sides.
  m.backFaceCulling = false;
  m.fogEnabled = true;
  return m;
}

/** Where to put the fallback ground: just under the most common floor height. */
export function fallbackGroundY(level: LevelData): number {
  const ys = level.checkpoints.map((c) => c.pos.y).sort((a, b) => a - b);
  return (ys[Math.floor(ys.length / 2)] ?? 0) - 0.6;
}

/**
 * Loads the chapter's terrain. If the file is missing (or the network fails) a wide, plain
 * ground plane in the fog colour stands in, so the world never just stops at the edges.
 */
export async function loadTerrain(scene: Scene, chapterId: string, level: LevelData, opts: { low: boolean; night: boolean; fogHex: string }): Promise<AbstractMesh | null> {
  if (level.scroll) return null; // the train: its scenery scrolls past (SetPieces)
  const mat = terrainMaterial(scene, opts.night);
  if ((TERRAIN_CHAPTERS as readonly string[]).includes(chapterId)) {
    try {
      const [{ LoadAssetContainerAsync }] = await Promise.all([import("@babylonjs/core/Loading/sceneLoader"), import("@babylonjs/loaders/glTF/2.0")]);
      const container = await LoadAssetContainerAsync(terrainUrl(chapterId, opts.low), scene);
      if (scene.isDisposed) return null;
      const mesh = container.meshes.find((m) => m.getTotalVertices() > 0) as Mesh | undefined;
      if (mesh) {
        container.addAllToScene();
        // Keep the mesh's own transform (quantisation scale), drop the handedness root.
        mesh.parent = null;
        for (const m of container.meshes) if (m !== mesh) m.dispose();
        for (const t of container.transformNodes) t.dispose();
        toGamma(mesh);
        mesh.material?.dispose();
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.alwaysSelectAsActiveMesh = true; // one big mesh: skip the per-frame culling test
        mesh.freezeWorldMatrix();
        mesh.name = `terrain-${chapterId}`;
        return mesh;
      }
    } catch (err) {
      console.warn(`Terrain for ${chapterId} failed to load; using a plain ground instead.`, err);
    }
  }
  if (scene.isDisposed) return null;
  const g = MeshBuilder.CreateGround("terrain-fallback", { width: 1400, height: 1400, subdivisions: 2 }, scene);
  const cps = level.checkpoints;
  g.position.x = cps.reduce((n, c) => n + c.pos.x, 0) / Math.max(1, cps.length);
  g.position.z = cps.reduce((n, c) => n + c.pos.z, 0) / Math.max(1, cps.length);
  g.position.y = fallbackGroundY(level);
  mat.diffuseColor = Color3.FromHexString(opts.fogHex).scale(0.85);
  g.material = mat;
  g.isPickable = false;
  g.freezeWorldMatrix();
  return g;
}
