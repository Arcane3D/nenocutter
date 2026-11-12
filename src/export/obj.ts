import type { BuiltPart } from '../domain/types';

export function encodeOBJ(parts: BuiltPart[]): Uint8Array {
  const lines: string[] = ['# Nenocutter OBJ, units millimetres'];
  let base = 1;
  for (const part of parts) {
    lines.push(`o ${part.name.replace(/\s+/g, '_')}`);
    const p = part.positions;
    for (let i = 0; i < p.length; i += 3) {
      lines.push(`v ${p[i].toFixed(4)} ${p[i + 1].toFixed(4)} ${p[i + 2].toFixed(4)}`);
    }
    const idx = part.indices;
    for (let i = 0; i < idx.length; i += 3) {
      lines.push(`f ${idx[i] + base} ${idx[i + 1] + base} ${idx[i + 2] + base}`);
    }
    base += p.length / 3;
  }
  return new TextEncoder().encode(lines.join('\n'));
}
