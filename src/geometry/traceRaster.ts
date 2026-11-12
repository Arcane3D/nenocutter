import type { DesignPath, TraceOptions, Vec2 } from '../domain/types';
import { uid } from '../lib/ids';
import { limitPoints, signedArea, simplify } from './path';

export interface Raster {
  width: number;
  height: number;
  /** 0 empty, 1 filled. */
  mask: Uint8Array;
}

export function rgbaToMask(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: TraceOptions,
): Raster {
  const mask = new Uint8Array(width * height);
  const contrast = options.contrast;
  const brightness = options.brightness;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma = factor * (luma - 128) + 128 + brightness;
    if (a < 16) luma = 255;
    const dark = luma < options.threshold;
    const on = options.invert ? !dark : dark;
    mask[i] = on ? 1 : 0;
  }
  return { width, height, mask: despeckle(mask, width, height, options.despeckle) };
}

export function despeckle(mask: Uint8Array, width: number, height: number, minArea: number): Uint8Array {
  if (minArea <= 1) return mask;
  const out = mask.slice();
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const cells: number[] = [];
    while (stack.length) {
      const idx = stack.pop() as number;
      cells.push(idx);
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x + 1 < width ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y + 1 < height ? idx + width : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && mask[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (cells.length < minArea) {
      for (const idx of cells) out[idx] = 0;
    }
  }
  return out;
}

function solid(mask: Uint8Array, width: number, height: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return mask[y * width + x] === 1;
}

/**
 * Walk the boundary of each filled region. Outer contours are counter-clockwise
 * in image space (y down); holes wind the other way because solid stays on the left.
 */
export function boundaryLoops(mask: Uint8Array, width: number, height: number): Vec2[][] {
  const outgoing = new Map<string, Vec2[]>();
  const add = (x: number, y: number, nx: number, ny: number) => {
    const key = `${x},${y}`;
    const list = outgoing.get(key) ?? [];
    list.push({ x: nx, y: ny });
    outgoing.set(key, list);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!solid(mask, width, height, x, y)) continue;
      if (!solid(mask, width, height, x, y - 1)) add(x + 1, y, x, y);
      if (!solid(mask, width, height, x, y + 1)) add(x, y + 1, x + 1, y + 1);
      if (!solid(mask, width, height, x - 1, y)) add(x, y, x, y + 1);
      if (!solid(mask, width, height, x + 1, y)) add(x + 1, y + 1, x + 1, y);
    }
  }
  const used = new Set<string>();
  const loops: Vec2[][] = [];
  for (const [start, dests] of outgoing) {
    for (const dest of dests) {
      const [sx, sy] = start.split(',').map(Number);
      const firstKey = `${sx},${sy}->${dest.x},${dest.y}`;
      if (used.has(firstKey)) continue;
      const loop: Vec2[] = [{ x: sx, y: sy }];
      let cx = sx;
      let cy = sy;
      let nx = dest.x;
      let ny = dest.y;
      let guard = 0;
      const limit = (width + 2) * (height + 2) * 4;
      while (guard++ < limit) {
        used.add(`${cx},${cy}->${nx},${ny}`);
        loop.push({ x: nx, y: ny });
        if (nx === sx && ny === sy) break;
        const options = outgoing.get(`${nx},${ny}`) ?? [];
        const incoming = { x: nx - cx, y: ny - cy };
        let best: Vec2 | null = null;
        let bestScore = -Infinity;
        for (const option of options) {
          const key = `${nx},${ny}->${option.x},${option.y}`;
          if (used.has(key)) continue;
          const out = { x: option.x - nx, y: option.y - ny };
          const cross = incoming.x * out.y - incoming.y * out.x;
          const dot = incoming.x * out.x + incoming.y * out.y;
          const score = Math.atan2(cross, dot);
          if (score > bestScore) {
            bestScore = score;
            best = option;
          }
        }
        if (!best) break;
        cx = nx;
        cy = ny;
        nx = best.x;
        ny = best.y;
      }
      if (loop.length > 4 && loop[0].x === loop[loop.length - 1].x && loop[0].y === loop[loop.length - 1].y) {
        loop.pop();
        loops.push(dropColinear(loop));
      }
    }
  }
  return loops;
}

function dropColinear(points: Vec2[]): Vec2[] {
  if (points.length < 4) return points;
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i + points.length - 1) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (Math.abs(cross) > 1e-6) out.push(curr);
  }
  return out.length >= 3 ? out : points;
}

const N8 = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

function neighborCount(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of N8) if (solid(mask, width, height, x + dx, y + dy)) n++;
  return n;
}

function transitions(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  let count = 0;
  for (let i = 0; i < 8; i++) {
    const a = solid(mask, width, height, x + N8[i][0], y + N8[i][1]);
    const b = solid(mask, width, height, x + N8[(i + 1) % 8][0], y + N8[(i + 1) % 8][1]);
    if (!a && b) count++;
  }
  return count;
}

/** Zhang-Suen thinning. Returns a new mask of the centerline. */
export function thinMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const img = mask.slice();
  const p = (x: number, y: number, source: Uint8Array) => (solid(source, width, height, x, y) ? 1 : 0);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 80) {
    changed = false;
    for (const step of [0, 1]) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          if (!img[y * width + x]) continue;
          const n = neighborCount(img, width, height, x, y);
          if (n < 2 || n > 6) continue;
          if (transitions(img, width, height, x, y) !== 1) continue;
          const p2 = p(x, y - 1, img);
          const p4 = p(x + 1, y, img);
          const p6 = p(x, y + 1, img);
          const p8 = p(x - 1, y, img);
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          remove.push(y * width + x);
        }
      }
      if (remove.length) {
        changed = true;
        for (const idx of remove) img[idx] = 0;
      }
    }
  }
  return img;
}

export function skeletonPaths(mask: Uint8Array, width: number, height: number): Vec2[][] {
  const degree = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) degree[y * width + x] = neighborCount(mask, width, height, x, y);
    }
  }
  const used = new Uint8Array(mask.length);
  const paths: Vec2[][] = [];
  const walk = (sx: number, sy: number) => {
    const pts: Vec2[] = [];
    let x = sx;
    let y = sy;
    for (let guard = 0; guard < width * height; guard++) {
      const idx = y * width + x;
      if (used[idx] && !(x === sx && y === sy && pts.length === 0)) break;
      used[idx] = 1;
      pts.push({ x: x + 0.5, y: y + 0.5 });
      let next: [number, number] | null = null;
      for (const [dx, dy] of N8) {
        const nx = x + dx;
        const ny = y + dy;
        if (!solid(mask, width, height, nx, ny)) continue;
        const nidx = ny * width + nx;
        if (!used[nidx] || (degree[nidx] !== 2 && pts.length > 2 && (nx !== sx || ny !== sy))) {
          if (!used[nidx]) {
            next = [nx, ny];
            break;
          }
        }
      }
      if (!next) {
        for (const [dx, dy] of N8) {
          const nx = x + dx;
          const ny = y + dy;
          if (solid(mask, width, height, nx, ny) && !used[ny * width + nx]) {
            next = [nx, ny];
            break;
          }
        }
      }
      if (!next) break;
      x = next[0];
      y = next[1];
    }
    if (pts.length >= 2) paths.push(pts);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] && degree[idx] !== 2 && !used[idx]) walk(x, y);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] && !used[y * width + x]) walk(x, y);
    }
  }
  return paths;
}

export function pathsFromRaster(raster: Raster, options: TraceOptions, longestSide: number): DesignPath[] {
  const { width, height, mask } = raster;
  const smoothing = Math.max(0, options.smoothing);
  const loops =
    options.mode === 'line'
      ? skeletonPaths(thinMask(mask, width, height), width, height).map((points) => ({ points, closed: false }))
      : boundaryLoops(mask, width, height).map((points) => ({ points, closed: true }));
  if (!loops.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const loop of loops) {
    for (const p of loop.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = longestSide / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return loops
    .map((loop) => {
      const mapped = loop.points.map((p) => ({
        x: (p.x - cx) * scale,
        y: (cy - p.y) * scale,
      }));
      const epsilon = smoothing * 0.35 * (longestSide / 80);
      const simplified = limitPoints(epsilon > 0 ? simplify(mapped, epsilon) : mapped, 400);
      return {
        id: uid('trace'),
        points: simplified,
        closed: loop.closed && simplified.length >= 3,
        role: 'outline' as const,
      };
    })
    .filter((path) => path.points.length >= 2 && (path.closed ? Math.abs(signedArea(path.points)) > 0.2 : true));
}
