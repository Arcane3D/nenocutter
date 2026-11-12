export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

export interface MeshBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export function meshBounds(mesh: MeshData): MeshBounds {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const p = mesh.positions;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]);
    maxX = Math.max(maxX, p[i]);
    maxY = Math.max(maxY, p[i + 1]);
    maxZ = Math.max(maxZ, p[i + 2]);
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function translateMesh(mesh: MeshData, dx: number, dy: number, dz: number): MeshData {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
  return { positions, indices: mesh.indices };
}

export function rotateMeshX180(mesh: MeshData): MeshData {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = -positions[i + 1];
    positions[i + 2] = -positions[i + 2];
  }
  const indices = new Uint32Array(mesh.indices);
  for (let i = 0; i < indices.length; i += 3) {
    const tmp = indices[i + 1];
    indices[i + 1] = indices[i + 2];
    indices[i + 2] = tmp;
  }
  return { positions, indices };
}

/** Edges used by a number of triangles other than 2. Zero means watertight. */
export function openEdgeCount(indices: Uint32Array): number {
  const map = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    tally(indices[i], indices[i + 1]);
    tally(indices[i + 1], indices[i + 2]);
    tally(indices[i + 2], indices[i]);
  }
  let bad = 0;
  for (const count of map.values()) if (count !== 2) bad++;
  return bad;

  function tally(a: number, b: number) {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}

export function meshVolume(mesh: MeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let volume = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    volume +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return volume;
}

export function concatMeshes(meshes: MeshData[]): MeshData {
  let posCount = 0;
  let idxCount = 0;
  for (const mesh of meshes) {
    posCount += mesh.positions.length;
    idxCount += mesh.indices.length;
  }
  const positions = new Float32Array(posCount);
  const indices = new Uint32Array(idxCount);
  let po = 0;
  let io = 0;
  let base = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, po);
    const vertBase = base;
    for (let i = 0; i < mesh.indices.length; i++) indices[io + i] = mesh.indices[i] + vertBase;
    po += mesh.positions.length;
    io += mesh.indices.length;
    base += mesh.positions.length / 3;
  }
  return { positions, indices };
}

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}
