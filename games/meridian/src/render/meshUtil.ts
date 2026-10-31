// Builds one mesh from several coloured primitive shapes (vertex colours, one material, one
// draw call). Used for props like the jeep, bells and searchlight housings.

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBoxVertexData } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export interface Shape {
  vd: VertexData;
  color: string;
}

export const boxShape = (w: number, h: number, d: number, x: number, y: number, z: number, color: string): Shape => {
  const vd = CreateBoxVertexData({ width: w, height: h, depth: d });
  vd.transform(Matrix.Translation(x, y, z));
  return { vd, color };
};

/** Cylinder lying along X (wheels) or standing along Y. */
export const cylShape = (dTop: number, dBottom: number, h: number, x: number, y: number, z: number, color: string, alongX = false, tess = 14): Shape => {
  const vd = CreateCylinderVertexData({ height: h, diameterTop: dTop, diameterBottom: dBottom, tessellation: tess });
  const m = alongX ? Matrix.RotationZ(Math.PI / 2).multiply(Matrix.Translation(x, y, z)) : Matrix.Translation(x, y, z);
  vd.transform(m);
  return { vd, color };
};

export function mergeShapes(scene: Scene, name: string, shapes: Shape[], opts: { roughness?: number; metallic?: number } = {}): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];
  for (const s of shapes) {
    const base = positions.length / 3;
    const c = Color3.FromHexString(s.color).toLinearSpace();
    positions.push(...s.vd.positions!);
    normals.push(...s.vd.normals!);
    for (let i = 0; i < s.vd.positions!.length / 3; i++) colors.push(c.r, c.g, c.b, 1);
    for (const ix of s.vd.indices!) indices.push(ix + base);
  }
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  vd.indices = indices;
  vd.colors = colors;
  const mesh = new Mesh(name, scene);
  vd.applyToMesh(mesh);
  const mat = new PBRMaterial(`${name}-mat`, scene);
  mat.albedoColor = Color3.White();
  mat.roughness = opts.roughness ?? 0.6;
  mat.metallic = opts.metallic ?? 0.2;
  mat.environmentIntensity = 0.5;
  mesh.material = mat;
  mesh.isPickable = false;
  return mesh;
}

/** The Ch4 jeep: body, hood, roll bar, four wheels and (for enemy jeeps) a mounted gun. */
export function jeepMesh(scene: Scene, name: string, paint: string, mountedGun: boolean): Mesh {
  const tyre = "#1b1b1b";
  const shapes: Shape[] = [
    boxShape(1.9, 0.55, 3.9, 0, 0.78, 0, paint),
    boxShape(1.8, 0.28, 1.25, 0, 1.18, 1.25, paint),
    boxShape(1.7, 0.08, 0.06, 0, 1.75, 0.55, "#2a2a2a"), // windscreen frame
    boxShape(0.06, 0.5, 0.06, -0.82, 1.5, 0.55, "#2a2a2a"),
    boxShape(0.06, 0.5, 0.06, 0.82, 1.5, 0.55, "#2a2a2a"),
    boxShape(0.07, 0.75, 0.07, -0.85, 1.42, -0.6, "#333"), // roll bar
    boxShape(0.07, 0.75, 0.07, 0.85, 1.42, -0.6, "#333"),
    boxShape(1.77, 0.07, 0.07, 0, 1.8, -0.6, "#333"),
    boxShape(0.7, 0.35, 0.5, -0.45, 1.2, 0.0, "#4a3a2a"), // seats
    boxShape(0.7, 0.35, 0.5, 0.45, 1.2, 0.0, "#4a3a2a"),
    boxShape(1.6, 0.1, 0.12, 0, 0.9, 1.98, "#888"), // bumper
    cylShape(0.7, 0.7, 0.28, 0, 1.05, -2.05, tyre, false),
  ];
  for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) shapes.push(cylShape(0.8, 0.8, 0.3, x, 0.4, z, tyre, true));
  if (mountedGun) {
    shapes.push(cylShape(0.12, 0.12, 0.9, 0, 1.6, -1.2, "#333"));
    shapes.push(boxShape(0.16, 0.18, 1.0, 0, 2.05, -1.0, "#1d1d1d"));
  }
  return mergeShapes(scene, name, shapes, { roughness: 0.55, metallic: 0.35 });
}

/** A church bell hanging from a short beam, origin at the top of the bell. */
export function bellMesh(scene: Scene, name: string, size: number): Mesh {
  return mergeShapes(
    scene,
    name,
    [
      cylShape(0.28 * size, 0.62 * size, 0.62 * size, 0, -0.31 * size, 0, "#8a6a2c", false, 18),
      cylShape(0.66 * size, 0.66 * size, 0.06 * size, 0, -0.64 * size, 0, "#6e5320", false, 18),
      boxShape(0.9, 0.12, 0.12, 0, 0.06, 0, "#4a3220"),
    ],
    { roughness: 0.35, metallic: 0.9 },
  );
}
