import type { DesignPath, Vec2 } from '../domain/types';

export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export function signedArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function boundsOf(paths: { points: Vec2[] }[]): Bounds2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const p of path.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const hit = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x;
    if (hit) inside = !inside;
  }
  return inside;
}

export function centroid(points: Vec2[]): Vec2 {
  if (!points.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function rdpOpen(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length < 3) return points.slice();
  let max = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSegment(points[i], a, b);
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max > epsilon) {
    const left = rdpOpen(points.slice(0, index + 1), epsilon);
    const right = rdpOpen(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

export function simplify(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length < 4 || epsilon <= 0) return points.slice();
  const closed =
    dist(points[0], points[points.length - 1]) < 1e-6 ||
    (points.length > 2 && dist(points[0], points[points.length - 1]) < epsilon * 0.25);
  const body = closed && dist(points[0], points[points.length - 1]) < 1e-4 ? points.slice(0, -1) : points;
  if (body.length < 3) return points.slice();
  const anchor = body[0];
  let far = 1;
  let farD = 0;
  for (let i = 1; i < body.length; i++) {
    const d = dist(anchor, body[i]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const left = rdpOpen(body.slice(0, far + 1), epsilon);
  const right = rdpOpen(body.slice(far).concat([body[0]]), epsilon);
  const merged = left.slice(0, -1).concat(right.slice(0, -1));
  return merged.length >= 3 ? merged : points.slice();
}

export function limitPoints(points: Vec2[], max: number): Vec2[] {
  if (points.length <= max) return points.slice();
  let eps = 0.05;
  let current = points;
  for (let i = 0; i < 10 && current.length > max; i++) {
    current = simplify(points, eps);
    eps *= 1.7;
  }
  if (current.length > max) {
    const step = Math.ceil(current.length / max);
    const sampled = current.filter((_, index) => index % step === 0);
    return sampled.length >= 3 ? sampled : current.slice(0, max);
  }
  return current;
}

export function translatePoints(points: Vec2[], dx: number, dy: number): Vec2[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function scalePoints(points: Vec2[], sx: number, sy: number, origin: Vec2): Vec2[] {
  return points.map((p) => ({
    x: origin.x + (p.x - origin.x) * sx,
    y: origin.y + (p.y - origin.y) * sy,
  }));
}

export function fitPaths(paths: DesignPath[], longest: number): DesignPath[] {
  const box = boundsOf(paths);
  const side = Math.max(box.width, box.height);
  if (side < 1e-6) return paths;
  const s = longest / side;
  return paths.map((path) => ({
    ...path,
    source: undefined,
    points: path.points.map((p) => ({
      x: (p.x - box.cx) * s,
      y: (p.y - box.cy) * s,
    })),
  }));
}

export function resizePaths(
  paths: DesignPath[],
  next: { width?: number; height?: number; longest?: number },
  lockAspect: boolean,
): DesignPath[] {
  const box = boundsOf(paths);
  if (box.width < 1e-6 || box.height < 1e-6) return paths;
  let sx = 1;
  let sy = 1;
  if (next.longest && next.longest > 0) {
    sx = sy = next.longest / Math.max(box.width, box.height);
  } else if (next.width && next.width > 0 && (lockAspect || next.height == null)) {
    sx = sy = next.width / box.width;
  } else {
    if (next.width && next.width > 0) sx = next.width / box.width;
    if (next.height && next.height > 0) sy = next.height / box.height;
    if (lockAspect) sy = sx;
  }
  const origin = { x: box.cx, y: box.cy };
  return paths.map((path) => ({
    ...path,
    source: undefined,
    points: scalePoints(path.points, sx, sy, origin),
  }));
}

export function mirrorPaths(paths: DesignPath[], gap: number, pair: boolean): DesignPath[] {
  const box = boundsOf(paths);
  const flipPoint = (p: Vec2): Vec2 => ({ x: box.minX + box.maxX - p.x, y: p.y });
  const flipped = paths.map((path) => ({
    ...path,
    id: `${path.id}-mirror`,
    source: undefined,
    points: path.points.map(flipPoint),
  }));
  if (!pair) return flipped;
  const shift = box.width + gap;
  const copy = flipped.map((path) => ({
    ...path,
    points: translatePoints(path.points, shift, 0),
  }));
  return [...paths, ...copy];
}

/** Stroke an open polyline into filled ribbons the boolean engine can union. */
export function strokePolyline(points: Vec2[], width: number): Vec2[][] {
  if (points.length < 2 || width <= 0) return [];
  const hw = width / 2;
  const shapes: Vec2[][] = [];
  const segs = points.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    shapes.push([
      { x: a.x + nx, y: a.y + ny },
      { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ]);
  }
  const capAt = points.length > 2 ? [points[0], points[points.length - 1]] : [points[0], points[points.length - 1]];
  for (const p of capAt) shapes.push(regularPolygon(p.x, p.y, hw, 8));
  for (const p of points) shapes.push(regularPolygon(p.x, p.y, hw, 8));
  return shapes;
}

export function regularPolygon(cx: number, cy: number, radius: number, sides: number): Vec2[] {
  const pts: Vec2[] = [];
  const n = Math.max(3, sides);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

export function scallop(points: Vec2[], amplitude: number, waves: number): Vec2[] {
  const c = centroid(points);
  return points.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const radial = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const k = 1 + (amplitude / radial) * Math.sin(waves * angle);
    return { x: c.x + dx * k, y: c.y + dy * k };
  });
}

export function countTopLevel(paths: DesignPath[]): number {
  const outlines = paths.filter((p) => p.closed && p.role === 'outline' && p.points.length >= 3);
  return outlines.length;
}

export function topLevelGroups(paths: DesignPath[]): DesignPath[][] {
  const closed = paths.filter((p) => p.closed && p.points.length >= 3 && p.role !== 'support');
  const items = closed
    .map((path) => ({ path, area: Math.abs(signedArea(path.points)), c: centroid(path.points) }))
    .sort((a, b) => b.area - a.area);
  const groups: { root: DesignPath; children: DesignPath[] }[] = [];
  for (const item of items) {
    if (item.path.role === 'outline') {
      const parent = groups.find((group) => pointInPoly(item.c, group.root.points));
      if (parent) parent.children.push(item.path);
      else groups.push({ root: item.path, children: [] });
    } else {
      const parent = groups.find((group) => pointInPoly(item.c, group.root.points));
      if (parent) parent.children.push(item.path);
      else groups.push({ root: item.path, children: [] });
    }
  }
  return groups.map((group) => [group.root, ...group.children]);
}
