import type { Font } from 'opentype.js';
import opentype from 'opentype.js';
import type { DesignPath, Vec2 } from '../domain/types';
import { uid } from '../lib/ids';
import { boundsOf, signedArea } from './path';

type Cmd = {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
};

let fontPromise: Promise<Font> | null = null;

export function loadCutterFont(): Promise<Font> {
  if (!fontPromise) fontPromise = readFont();
  return fontPromise;
}

async function readFont(): Promise<Font> {
  const url = new URL('../assets/fonts/Nunito-Medium.ttf', import.meta.url);
  try {
    const response = await fetch(url);
    if (response.ok) return opentype.parse(await response.arrayBuffer());
  } catch {
    /* Node cannot always fetch file URLs. */
  }
  const { readFile } = await import(/* @vite-ignore */ 'node:fs/promises');
  const buf = await readFile(url);
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

function quad(p0: Vec2, p1: Vec2, p2: Vec2, steps: number): Vec2[] {
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

function cubic(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, steps: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

export function contoursFromFont(font: Font, text: string, height: number): Vec2[][] {
  const safe = text.replace(/\s+/g, ' ').trim();
  if (!safe) return [];
  const path = font.getPath(safe, 0, 0, 72);
  const commands = path.commands as Cmd[];
  const contours: Vec2[][] = [];
  let current: Vec2[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const steps = 5;
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (current.length > 2) contours.push(current);
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
      sx = cx;
      sy = cy;
      current = [{ x: cx, y: cy }];
    } else if (cmd.type === 'L') {
      cx = cmd.x ?? cx;
      cy = cmd.y ?? cy;
      current.push({ x: cx, y: cy });
    } else if (cmd.type === 'Q') {
      const c1 = { x: cmd.x1 ?? cx, y: cmd.y1 ?? cy };
      const p = { x: cmd.x ?? cx, y: cmd.y ?? cy };
      const pts = quad({ x: cx, y: cy }, c1, p, steps);
      current.push(...pts);
      cx = p.x;
      cy = p.y;
    } else if (cmd.type === 'C') {
      const c1 = { x: cmd.x1 ?? cx, y: cmd.y1 ?? cy };
      const c2 = { x: cmd.x2 ?? cx, y: cmd.y2 ?? cy };
      const p = { x: cmd.x ?? cx, y: cmd.y ?? cy };
      const pts = cubic({ x: cx, y: cy }, c1, c2, p, steps);
      current.push(...pts);
      cx = p.x;
      cy = p.y;
    } else if (cmd.type === 'Z') {
      current.push({ x: sx, y: sy });
      if (current.length > 2) contours.push(current);
      current = [];
      cx = sx;
      cy = sy;
    }
  }
  if (current.length > 2) contours.push(current);
  const flipped = contours.map((contour) => contour.map((p) => ({ x: p.x, y: -p.y })));
  const box = boundsOf(flipped.map((points) => ({ points })));
  if (box.height < 1e-3) return [];
  const scale = height / box.height;
  return flipped
    .map((contour) => contour.map((p) => ({ x: (p.x - box.minX) * scale, y: (p.y - box.minY) * scale })))
    .filter((contour) => contour.length >= 3 && Math.abs(signedArea(contour)) > 0.05);
}

export function textPaths(font: Font, text: string, x: number, y: number, height: number, role: DesignPath['role']): DesignPath[] {
  return contoursFromFont(font, text, height).map((points) => ({
    id: uid('text'),
    points: points.map((p) => ({ x: p.x + x, y: p.y + y })),
    closed: true,
    role: signedArea(points) < 0 ? 'hole' : role,
    source: { kind: 'text', text, x, y, height },
  }));
}
