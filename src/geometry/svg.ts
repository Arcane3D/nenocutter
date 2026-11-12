import type { DesignPath, Vec2 } from '../domain/types';
import { uid } from '../lib/ids';
import { boundsOf } from './path';

interface Subpath {
  points: Vec2[];
}

function sampleQuadratic(p0: Vec2, p1: Vec2, p2: Vec2, steps: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return pts;
}

function sampleCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, steps: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

function sampleArc(x1: number, y1: number, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x2: number, y2: number): Vec2[] {
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-6) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-6 || ry < 1e-6) return [{ x: x2, y: y2 }];
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  let rx2 = rx * rx;
  let ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const lambda = x1p2 / rx2 + y1p2 / ry2;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }
  const sign = large !== sweep ? 1 : -1;
  const sq = Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2));
  const coef = sign * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * ((-ry * x1p) / rx);
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const start = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;
  const steps = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 18)));
  const pts: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = start + delta * (i / steps);
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push({ x: cos * x - sin * y + cx, y: sin * x + cos * y + cy });
  }
  return pts;
}

function tokenizePath(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    const raw = match[0];
    tokens.push(/[a-zA-Z]/.test(raw) ? raw : Number(raw));
  }
  return tokens;
}

export function parsePathData(d: string, curveSteps = 6): Subpath[] {
  const tokens = tokenizePath(d);
  const subs: Subpath[] = [];
  let current: Vec2[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let command = '';
  let i = 0;
  const rel = () => command === command.toLowerCase();
  const read = () => tokens[i++] as number;
  const hasNum = () => i < tokens.length && typeof tokens[i] === 'number';
  const pushCurve = (pts: Vec2[]) => {
    current.push(...pts);
    const last = pts[pts.length - 1];
    if (last) {
      cx = last.x;
      cy = last.y;
    }
  };
  const start = (x: number, y: number) => {
    if (current.length > 1) subs.push({ points: current });
    cx = x;
    cy = y;
    sx = x;
    sy = y;
    current = [{ x, y }];
  };

  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') command = tokens[i++] as string;
    if (!command) break;
    const lower = command.toLowerCase();
    if (lower === 'm') {
      let first = true;
      while (hasNum()) {
        const x = read();
        const y = read();
        const px = rel() ? cx + x : x;
        const py = rel() ? cy + y : y;
        if (first) {
          start(px, py);
          first = false;
        } else {
          current.push({ x: px, y: py });
          cx = px;
          cy = py;
        }
      }
      command = rel() ? 'l' : 'L';
    } else if (lower === 'l') {
      while (hasNum()) {
        const x = read();
        const y = read();
        cx = rel() ? cx + x : x;
        cy = rel() ? cy + y : y;
        current.push({ x: cx, y: cy });
      }
    } else if (lower === 'h') {
      while (hasNum()) {
        const x = read();
        cx = rel() ? cx + x : x;
        current.push({ x: cx, y: cy });
      }
    } else if (lower === 'v') {
      while (hasNum()) {
        const y = read();
        cy = rel() ? cy + y : y;
        current.push({ x: cx, y: cy });
      }
    } else if (lower === 'q') {
      while (hasNum()) {
        const x1 = read();
        const y1 = read();
        const x = read();
        const y = read();
        const c1 = { x: rel() ? cx + x1 : x1, y: rel() ? cy + y1 : y1 };
        const p = { x: rel() ? cx + x : x, y: rel() ? cy + y : y };
        pushCurve(sampleQuadratic({ x: cx, y: cy }, c1, p, curveSteps));
      }
    } else if (lower === 'c') {
      while (hasNum()) {
        const x1 = read();
        const y1 = read();
        const x2 = read();
        const y2 = read();
        const x = read();
        const y = read();
        const c1 = { x: rel() ? cx + x1 : x1, y: rel() ? cy + y1 : y1 };
        const c2 = { x: rel() ? cx + x2 : x2, y: rel() ? cy + y2 : y2 };
        const p = { x: rel() ? cx + x : x, y: rel() ? cy + y : y };
        pushCurve(sampleCubic({ x: cx, y: cy }, c1, c2, p, curveSteps));
      }
    } else if (lower === 'a') {
      while (hasNum()) {
        const rx = read();
        const ry = read();
        const angle = read();
        const large = read();
        const sweep = read();
        const x = read();
        const y = read();
        const px = rel() ? cx + x : x;
        const py = rel() ? cy + y : y;
        pushCurve(sampleArc(cx, cy, rx, ry, angle, large !== 0, sweep !== 0, px, py));
      }
    } else if (lower === 'z') {
      if (current.length) current.push({ x: sx, y: sy });
      if (current.length > 1) subs.push({ points: current });
      current = [];
      cx = sx;
      cy = sy;
      if (hasNum()) command = rel() ? 'm' : 'M';
    } else if (lower === 's' || lower === 't') {
      // Smooth curves fall back to a line so a file still imports.
      while (hasNum()) {
        if (lower === 's') {
          read();
          read();
        }
        const x = read();
        const y = read();
        cx = rel() ? cx + x : x;
        cy = rel() ? cy + y : y;
        current.push({ x: cx, y: cy });
      }
    } else {
      break;
    }
  }
  if (current.length > 1) subs.push({ points: current });
  return subs;
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(tag);
  return match ? (match[2] ?? match[3] ?? '') : null;
}

function numList(value: string): number[] {
  return (value.match(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
}

export function pathsFromSvg(svgText: string): DesignPath[] {
  const paths: DesignPath[] = [];
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svgText);
  const vb = viewBox ? numList(viewBox[1]) : [];
  const tags = svgText.match(/<(path|polygon|polyline|rect|circle|ellipse)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const kind = /^<([a-z]+)/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    if (kind === 'path') {
      const d = attr(tag, 'd');
      if (!d) continue;
      for (const sub of parsePathData(d)) {
        if (sub.points.length >= 2) {
          paths.push({
            id: uid('svg'),
            points: sub.points,
            closed: sub.points.length >= 3,
            role: 'outline',
          });
        }
      }
    } else if (kind === 'polygon' || kind === 'polyline') {
      const raw = attr(tag, 'points');
      if (!raw) continue;
      const nums = numList(raw);
      const points: Vec2[] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
      if (points.length >= 2) {
        paths.push({
          id: uid('svg'),
          points,
          closed: kind === 'polygon' || points.length >= 3,
          role: 'outline',
        });
      }
    } else if (kind === 'rect') {
      const x = Number(attr(tag, 'x') ?? 0);
      const y = Number(attr(tag, 'y') ?? 0);
      const w = Number(attr(tag, 'width') ?? 0);
      const h = Number(attr(tag, 'height') ?? 0);
      if (w > 0 && h > 0) {
        paths.push({
          id: uid('svg'),
          points: [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          closed: true,
          role: 'outline',
        });
      }
    } else if (kind === 'circle' || kind === 'ellipse') {
      const cx = Number(attr(tag, 'cx') ?? 0);
      const cy = Number(attr(tag, 'cy') ?? 0);
      const rx = kind === 'circle' ? Number(attr(tag, 'r') ?? 0) : Number(attr(tag, 'rx') ?? 0);
      const ry = kind === 'circle' ? rx : Number(attr(tag, 'ry') ?? 0);
      if (rx > 0 && ry > 0) {
        const points: Vec2[] = [];
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
        }
        paths.push({ id: uid('svg'), points, closed: true, role: 'outline' });
      }
    }
  }
  if (!paths.length) return [];
  const box = boundsOf(paths);
  const height = vb.length === 4 ? vb[3] : box.maxY;
  const minY = vb.length === 4 ? vb[1] : box.minY;
  const flipped = paths.map((path) => ({
    ...path,
    points: path.points.map((p) => ({ x: p.x, y: minY + height - p.y })),
  }));
  const nested = assignNesting(flipped);
  return nested;
}

function assignNesting(paths: DesignPath[]): DesignPath[] {
  const boxOf = (pts: Vec2[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, area: Math.abs((maxX - minX) * (maxY - minY)) };
  };
  const items = paths.map((path, index) => ({ path, index, box: boxOf(path.points) }));
  items.sort((a, b) => b.box.area - a.box.area);
  const depth = new Map<number, number>();
  for (const item of items) {
    const c = {
      x: (item.box.minX + item.box.maxX) / 2,
      y: (item.box.minY + item.box.maxY) / 2,
    };
    let d = 0;
    for (const other of items) {
      if (other.index === item.index || other.box.area <= item.box.area) continue;
      const inside =
        c.x > other.box.minX && c.x < other.box.maxX && c.y > other.box.minY && c.y < other.box.maxY;
      if (inside) d++;
    }
    depth.set(item.index, d);
  }
  return paths.map((path, index) => ({
    ...path,
    role: (depth.get(index) ?? 0) % 2 === 1 ? 'hole' : 'outline',
    closed: path.points.length >= 3,
  }));
}
