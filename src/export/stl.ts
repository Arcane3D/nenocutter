import type { BuiltPart } from '../domain/types';

export function encodeSTL(parts: BuiltPart[]): Uint8Array {
  let triangles = 0;
  for (const part of parts) triangles += part.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const header = 'Nenocutter binary STL, millimetres';
  for (let i = 0; i < 80; i++) view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, triangles, true);
  let offset = 84;
  for (const part of parts) {
    const p = part.positions;
    const idx = part.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3;
      const b = idx[i + 1] * 3;
      const c = idx[i + 2] * 3;
      const abx = p[b] - p[a];
      const aby = p[b + 1] - p[a + 1];
      const abz = p[b + 2] - p[a + 2];
      const acx = p[c] - p[a];
      const acy = p[c + 1] - p[a + 1];
      const acz = p[c + 2] - p[a + 2];
      let nx = aby * acz - abz * acy;
      let ny = abz * acx - abx * acz;
      let nz = abx * acy - aby * acx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      view.setFloat32(offset, nx, true);
      view.setFloat32(offset + 4, ny, true);
      view.setFloat32(offset + 8, nz, true);
      writeVertex(view, offset + 12, p[a], p[a + 1], p[a + 2]);
      writeVertex(view, offset + 24, p[b], p[b + 1], p[b + 2]);
      writeVertex(view, offset + 36, p[c], p[c + 1], p[c + 2]);
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }
  return new Uint8Array(buffer);
}

function writeVertex(view: DataView, offset: number, x: number, y: number, z: number) {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
}

export function readSTLTriangleCount(data: Uint8Array): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(80, true);
}
