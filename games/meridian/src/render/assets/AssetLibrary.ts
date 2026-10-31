// Drop-in models. The game draws everything procedurally, but any slot listed in
// public/assets/manifest.json is replaced by a real glTF/GLB model once it has loaded.
// Missing or broken files are ignored, so the game never depends on them.
//
// Prepare models with `npm run assets` (see docs/art-pipeline.md): it resizes textures to
// 1024 px, converts them to WebP and quantises the geometry, so nothing needs a decoder.

import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Slots the renderer knows how to fill. */
export const SLOTS = ["prop.jeep", "prop.crate", "prop.barrel", "prop.bell", "prop.searchlight", "env.pine"] as const;
export type Slot = (typeof SLOTS)[number];

export interface SlotEntry {
  file: string;
  /** Uniform scale applied to the model. */
  scale?: number;
  /** Extra turn in degrees, for models that face the wrong way. */
  yaw?: number;
  /** Lift in metres, for models whose origin isn't at their base. */
  y?: number;
  license: string;
  author?: string;
  source?: string;
}

export interface Manifest {
  version: 1;
  slots: Partial<Record<Slot, SlotEntry>>;
}

let manifest: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  manifest ??= fetch(`${import.meta.env.BASE_URL}assets/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : { version: 1 as const, slots: {} }))
    .catch(() => ({ version: 1 as const, slots: {} }));
  return manifest;
}

/**
 * Remembers which procedural meshes stand in for which slot, then swaps in real models.
 * The procedural mesh is kept (made invisible) and the model is parented to it, so it
 * follows any movement the renderer already does.
 */
export class AssetSwap {
  private uses: Array<{ slot: Slot; mesh: Mesh }> = [];

  register(slot: Slot, mesh: Mesh): void {
    this.uses.push({ slot, mesh });
  }

  async apply(scene: Scene): Promise<number> {
    const m = await loadManifest();
    const wanted = [...new Set(this.uses.map((u) => u.slot))].filter((s) => m.slots[s]);
    if (!wanted.length) return 0;
    // Only pull in the glTF loader when a model is actually configured.
    const [{ LoadAssetContainerAsync }] = await Promise.all([import("@babylonjs/core/Loading/sceneLoader"), import("@babylonjs/loaders/glTF/2.0")]);
    let swapped = 0;
    for (const slot of wanted) {
      const e = m.slots[slot]!;
      try {
        const container = await LoadAssetContainerAsync(`${import.meta.env.BASE_URL}assets/${e.file}`, scene);
        if (scene.isDisposed) return swapped;
        for (const u of this.uses.filter((x) => x.slot === slot && !x.mesh.isDisposed())) {
          const inst = container.instantiateModelsToScene((n) => `${u.mesh.name}-${n}`, false);
          // A pivot holds the slot's offset, turn and scale; glTF roots keep their own transforms.
          const pivot = new TransformNode(`${u.mesh.name}-model`, scene);
          pivot.parent = u.mesh;
          pivot.position = new Vector3(0, e.y ?? 0, 0);
          pivot.rotation = new Vector3(0, ((e.yaw ?? 0) * Math.PI) / 180, 0);
          pivot.scaling.setAll(e.scale ?? 1);
          for (const node of inst.rootNodes) {
            const root = node as TransformNode;
            root.parent = pivot;
            for (const child of root.getChildMeshes()) (child as AbstractMesh).isPickable = false;
          }
          u.mesh.visibility = 0;
          swapped++;
        }
      } catch (err) {
        console.warn(`Asset slot ${slot} (${e.file}) failed to load; keeping the procedural version.`, err);
      }
    }
    return swapped;
  }
}
