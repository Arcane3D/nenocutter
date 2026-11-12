import type { DesignPath, Vec2 } from '../domain/types';
import { uid } from '../lib/ids';

export function circlePoints(cx: number, cy: number, r: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(8, segments);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, segments: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(8, segments);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

export function rectPoints(x: number, y: number, w: number, h: number, radius = 0, segments = 6): Vec2[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 0.05) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  const corners = [
    { cx: x + w - r, cy: y + r, a0: -Math.PI / 2 },
    { cx: x + w - r, cy: y + h - r, a0: 0 },
    { cx: x + r, cy: y + h - r, a0: Math.PI / 2 },
    { cx: x + r, cy: y + r, a0: Math.PI },
  ];
  const pts: Vec2[] = [];
  for (const corner of corners) {
    for (let i = 0; i <= segments; i++) {
      const a = corner.a0 + (i / segments) * (Math.PI / 2);
      pts.push({ x: corner.cx + Math.cos(a) * r, y: corner.cy + Math.sin(a) * r });
    }
  }
  return pts;
}

export function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(3, points);
  for (let i = 0; i < n * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

/** Classic heart, `size` is the approximate width in millimetres. */
export function heartPoints(cx: number, cy: number, size: number, segments = 64): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(16, segments);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push({ x: cx + (x * size) / 34, y: cy + (y * size) / 34 });
  }
  return pts;
}

export function flowerPoints(cx: number, cy: number, radius: number, petals: number, segments = 80): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(24, segments);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = radius * (0.68 + 0.32 * Math.cos(petals * a));
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

export function jewelPoints(cx: number, cy: number, size: number): Vec2[] {
  const s = size / 2;
  return [
    { x: cx, y: cy + s },
    { x: cx + s * 0.72, y: cy + s * 0.28 },
    { x: cx + s * 0.55, y: cy - s * 0.15 },
    { x: cx + s * 0.85, y: cy - s * 0.55 },
    { x: cx, y: cy - s },
    { x: cx - s * 0.85, y: cy - s * 0.55 },
    { x: cx - s * 0.55, y: cy - s * 0.15 },
    { x: cx - s * 0.72, y: cy + s * 0.28 },
  ];
}

export function arrowPoints(cx: number, cy: number, size: number): Vec2[] {
  const w = size;
  const h = size * 0.42;
  return [
    { x: cx - w * 0.48, y: cy - h * 0.18 },
    { x: cx + w * 0.05, y: cy - h * 0.18 },
    { x: cx + w * 0.05, y: cy - h * 0.48 },
    { x: cx + w * 0.5, y: cy },
    { x: cx + w * 0.05, y: cy + h * 0.48 },
    { x: cx + w * 0.05, y: cy + h * 0.18 },
    { x: cx - w * 0.48, y: cy + h * 0.18 },
  ];
}

export function keyPoints(cx: number, cy: number, size: number): Vec2[] {
  const bow: Vec2[] = [];
  const r = size * 0.22;
  const bx = cx - size * 0.22;
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI * 0.55 + (i / 18) * Math.PI * 1.9;
    bow.push({ x: bx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 1.15 });
  }
  const shaft = size * 0.46;
  return [
    ...bow,
    { x: bx + r * 0.2, y: cy - size * 0.06 },
    { x: cx + shaft, y: cy - size * 0.06 },
    { x: cx + shaft, y: cy - size * 0.16 },
    { x: cx + shaft - size * 0.08, y: cy - size * 0.16 },
    { x: cx + shaft - size * 0.08, y: cy - size * 0.06 },
    { x: cx + shaft - size * 0.16, y: cy - size * 0.06 },
    { x: cx + shaft - size * 0.16, y: cy - size * 0.18 },
    { x: cx + shaft - size * 0.24, y: cy - size * 0.18 },
    { x: cx + shaft - size * 0.24, y: cy - size * 0.06 },
    { x: bx + r * 0.15, y: cy - size * 0.08 },
  ];
}

export function bowPoints(cx: number, cy: number, size: number): Vec2[] {
  const s = size * 0.5;
  return [
    { x: cx, y: cy + s * 0.12 },
    { x: cx + s * 0.18, y: cy + s * 0.42 },
    { x: cx + s * 0.72, y: cy + s * 0.62 },
    { x: cx + s * 0.95, y: cy + s * 0.18 },
    { x: cx + s * 0.55, y: cy },
    { x: cx + s * 0.95, y: cy - s * 0.18 },
    { x: cx + s * 0.72, y: cy - s * 0.62 },
    { x: cx + s * 0.18, y: cy - s * 0.42 },
    { x: cx, y: cy - s * 0.12 },
    { x: cx - s * 0.18, y: cy - s * 0.42 },
    { x: cx - s * 0.72, y: cy - s * 0.62 },
    { x: cx - s * 0.95, y: cy - s * 0.18 },
    { x: cx - s * 0.55, y: cy },
    { x: cx - s * 0.95, y: cy + s * 0.18 },
    { x: cx - s * 0.72, y: cy + s * 0.62 },
    { x: cx - s * 0.18, y: cy + s * 0.42 },
  ];
}

export function wreathRings(cx: number, cy: number, size: number): Vec2[][] {
  return [circlePoints(cx, cy, size * 0.48, 48), circlePoints(cx, cy, size * 0.3, 40)];
}

export function pathFrom(points: Vec2[], role: DesignPath['role'] = 'outline', id?: string): DesignPath {
  return { id: id ?? uid('path'), points, closed: true, role };
}

export interface Motif {
  name: string;
  paths: DesignPath[];
}

/** Sixteen original heart-themed motifs, each its own disconnected shape. */
export function heartMotifSheet(): DesignPath[] {
  const cell = 16;
  const gap = 2.2;
  const origin = 2;
  const makers: ((cx: number, cy: number, size: number) => DesignPath[])[] = [
    (cx, cy, s) => [pathFrom(heartPoints(cx, cy, s * 0.86, 48))],
    (cx, cy, s) => [pathFrom(heartPoints(cx, cy, s * 0.7, 40).map((p) => ({ x: cx + (p.x - cx) * 1.15, y: cy + (p.y - cy) * 0.82 })))],
    (cx, cy, s) => [pathFrom(starPoints(cx, cy, s * 0.46, s * 0.2, 5))],
    (cx, cy, s) => [pathFrom(flowerPoints(cx, cy, s * 0.44, 6, 72))],
    (cx, cy, s) => [pathFrom(keyPoints(cx, cy - s * 0.02, s * 0.92))],
    (cx, cy, s) => [pathFrom(arrowPoints(cx, cy, s * 0.9))],
    (cx, cy, s) => [pathFrom(arrowPoints(cx, cy, s * 0.72).map((p) => ({ x: cx + (p.y - cy), y: cy - (p.x - cx) })))],
    (cx, cy, s) => [pathFrom(flowerPoints(cx, cy, s * 0.46, 8, 80))],
    (cx, cy, s) => {
      const rings = wreathRings(cx, cy, s * 0.92);
      return [pathFrom(rings[0], 'outline'), pathFrom(rings[1], 'hole')];
    },
    (cx, cy, s) => [pathFrom(jewelPoints(cx, cy, s * 0.84))],
    (cx, cy, s) => [pathFrom(bowPoints(cx, cy, s * 0.9))],
    (cx, cy, s) => [pathFrom(flowerPoints(cx, cy, s * 0.4, 5, 64))],
    (cx, cy, s) => [pathFrom(rectPoints(cx - s * 0.36, cy - s * 0.28, s * 0.72, s * 0.56, s * 0.12, 4))],
    (cx, cy, s) => {
      const outer = heartPoints(cx, cy, s * 0.88, 48);
      const inner = heartPoints(cx, cy + s * 0.04, s * 0.42, 36);
      return [pathFrom(outer, 'outline'), pathFrom(inner, 'hole')];
    },
    (cx, cy, s) => [pathFrom(keyPoints(cx + s * 0.04, cy, s * 0.7))],
    (cx, cy, s) => [pathFrom(bowPoints(cx, cy, s * 0.62))],
  ];
  const paths: DesignPath[] = [];
  makers.forEach((make, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const cx = origin + col * (cell + gap) + cell / 2;
    const cy = origin + row * (cell + gap) + cell / 2;
    paths.push(...make(cx, cy, cell * 0.92));
  });
  return paths;
}

export const MOTIF_NAMES = [
  'Heart',
  'Wide heart',
  'Star',
  'Flower',
  'Key',
  'Arrow',
  'Up arrow',
  'Daisy',
  'Wreath',
  'Jewel',
  'Bow',
  'Blossom',
  'Plaque',
  'Open heart',
  'Small key',
  'Small bow',
];
