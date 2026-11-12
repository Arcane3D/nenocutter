import { useEffect, useRef, useState } from 'react';
import type { DesignPath, Vec2 } from '../domain/types';
import { boundsOf, dist, pointInPoly, simplify } from '../geometry/path';
import { ellipsePoints, heartPoints, rectPoints, starPoints } from '../geometry/shapes';
import { uid } from '../lib/ids';
import { useDesignStore } from '../store/designStore';

interface Drag {
  kind: 'pan' | 'move' | 'box' | 'draw' | 'pen' | 'freehand' | 'node';
  x: number;
  y: number;
  origin: Vec2;
  points: Vec2[];
  moved: boolean;
  nodeIndex?: number;
  pathId?: string;
}

export function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [revision, bump] = useState(0);
  const design = useDesignStore((state) => state.design);
  const selected = useDesignStore((state) => state.selected);
  const tool = useDesignStore((state) => state.tool);
  const zoom = useDesignStore((state) => state.zoom);
  const panX = useDesignStore((state) => state.panX);
  const panY = useDesignStore((state) => state.panY);
  const snap = useDesignStore((state) => state.snap);
  const grid = useDesignStore((state) => state.grid);
  const setPan = useDesignStore((state) => state.setPan);
  const setZoom = useDesignStore((state) => state.setZoom);
  const setSelected = useDesignStore((state) => state.setSelected);
  const moveSelected = useDesignStore((state) => state.moveSelected);
  const addPath = useDesignStore((state) => state.addPath);
  const updatePathPoints = useDesignStore((state) => state.updatePathPoints);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 40 && rect.height > 40) fitCanvas(rect.width, rect.height);
    };
    fit();
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [design.paths.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, -zoom);
    if (grid) drawGrid(ctx, rect.width, rect.height, panX, panY, zoom);
    const ghost = mirrorGhost(design.paths, design.settings.mirror, design.settings.mirrorPair, design.settings.mirrorGap);
    for (const path of [...ghost, ...design.paths]) {
      const active = selected.includes(path.id);
      strokePath(ctx, path, active, path.id.endsWith('-mirror'));
    }
    if (drag.current?.kind === 'draw' || drag.current?.kind === 'freehand' || drag.current?.kind === 'pen') {
      strokePath(ctx, { id: 'draft', points: drag.current.points, closed: false, role: 'outline' }, true, false);
    }
    if (tool === 'node') {
      for (const path of design.paths.filter((path) => selected.includes(path.id))) {
        for (const point of path.points) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = '#c4854d';
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }, [design, selected, tool, zoom, panX, panY, grid, revision]);

  function toWorld(event: React.PointerEvent): Vec2 {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const raw = {
      x: (event.clientX - rect.left - panX) / zoom,
      y: (panY - (event.clientY - rect.top)) / zoom,
    };
    if (!snap) return raw;
    return { x: Math.round(raw.x), y: Math.round(raw.y) };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const world = toWorld(event);
    if (event.button === 1 || event.shiftKey && tool === 'select') {
      drag.current = { kind: 'pan', x: event.clientX, y: event.clientY, origin: world, points: [], moved: false };
      return;
    }
    bump((value) => value + 1);
    if (tool === 'pen') {
      const current = drag.current?.kind === 'pen' ? drag.current.points : [];
      if (current.length > 2 && dist(world, current[0]) < 8 / zoom) {
        addPath({ id: uid('pen'), points: current, closed: true, role: 'outline' });
        drag.current = null;
        return;
      }
      drag.current = { kind: 'pen', x: event.clientX, y: event.clientY, origin: world, points: [...current, world], moved: false };
      return;
    }
    if (tool === 'freehand') {
      drag.current = { kind: 'freehand', x: event.clientX, y: event.clientY, origin: world, points: [world], moved: false };
      return;
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'star' || tool === 'heart') {
      drag.current = { kind: 'draw', x: event.clientX, y: event.clientY, origin: world, points: [world, world], moved: false };
      return;
    }
    if (tool === 'node' && selected.length === 1) {
      const path = design.paths.find((item) => item.id === selected[0]);
      const hit = path?.points.findIndex((point) => dist(point, world) < 8 / zoom) ?? -1;
      if (path && hit >= 0) {
        drag.current = { kind: 'node', x: event.clientX, y: event.clientY, origin: world, points: path.points, moved: false, nodeIndex: hit, pathId: path.id };
        return;
      }
    }
    const hit = hitTest(design.paths, world, 6 / zoom);
    if (tool === 'select' || tool === 'node') {
      if (hit) {
        const next = event.shiftKey ? Array.from(new Set([...selected, hit])) : selected.includes(hit) ? selected : [hit];
        setSelected(next);
        drag.current = { kind: 'move', x: event.clientX, y: event.clientY, origin: world, points: [], moved: false };
      } else {
        if (!event.shiftKey) setSelected([]);
        drag.current = { kind: 'box', x: event.clientX, y: event.clientY, origin: world, points: [world], moved: false };
      }
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = drag.current;
    if (!current) return;
    const world = toWorld(event);
    if (current.kind === 'pan') {
      setPan(panX + event.clientX - current.x, panY + event.clientY - current.y);
      current.x = event.clientX;
      current.y = event.clientY;
      return;
    }
    if (current.kind === 'move') {
      const dx = world.x - current.origin.x;
      const dy = world.y - current.origin.y;
      if (Math.hypot(dx, dy) > 0) {
        moveSelected(dx, dy, !current.moved);
        current.moved = true;
        current.origin = world;
      }
      return;
    }
    if (current.kind === 'freehand') {
      current.points.push(world);
      current.moved = true;
      return;
    }
    bump((value) => value + 1);
    if (current.kind === 'draw') {
      current.points = shapeDraft(tool, current.origin, world);
      current.moved = true;
    }
    if (current.kind === 'node' && current.pathId != null && current.nodeIndex != null) {
      const points = current.points.map((point, index) => (index === current.nodeIndex ? world : point));
      current.points = points;
      updatePathPoints(current.pathId, points, !current.moved);
      current.moved = true;
    }
  }

  function onPointerUp() {
    const current = drag.current;
    if (!current) return;
    if (current.kind === 'freehand' && current.points.length > 2) {
      const points = simplify(current.points, 0.6);
      const closed = dist(points[0], points[points.length - 1]) < 4;
      addPath({ id: uid('draw'), points, closed, role: 'outline' });
    }
    if (current.kind === 'draw' && current.points.length > 2) {
      addPath({ id: uid('shape'), points: current.points, closed: true, role: 'outline' });
    }
    if (current.kind !== 'pen') drag.current = null;
  }

  function onWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const next = zoom * (event.deltaY > 0 ? 0.92 : 1.08);
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const worldX = (sx - panX) / zoom;
    const worldY = (panY - sy) / zoom;
    setZoom(next);
    setPan(sx - worldX * next, sy + worldY * next);
  }

  return (
    <canvas
      ref={canvasRef}
      id="design-canvas"
      aria-label="Drawing canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={() => {
        const current = drag.current;
        if (current?.kind === 'pen' && current.points.length > 2) {
          addPath({ id: uid('pen'), points: current.points, closed: false, role: 'outline' });
          drag.current = null;
        }
      }}
    />
  );
}

function shapeDraft(tool: string, a: Vec2, b: Vec2): Vec2[] {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (tool === 'rect') return rectPoints(x, y, w, h, Math.min(w, h) * 0.15, 4);
  if (tool === 'ellipse') return ellipsePoints(x + w / 2, y + h / 2, w / 2, h / 2, 40);
  if (tool === 'star') return starPoints(x + w / 2, y + h / 2, Math.max(w, h) / 2, Math.max(w, h) / 5, 5);
  return heartPoints(x + w / 2, y + h / 2, Math.max(w, h), 48);
}

function hitTest(paths: DesignPath[], point: Vec2, slop: number): string | null {
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (path.closed && path.points.length > 2 && pointInPoly(point, path.points)) return path.id;
    for (let p = 0; p < path.points.length; p++) {
      const a = path.points[p];
      const b = path.points[(p + 1) % path.points.length];
      if (!path.closed && p === path.points.length - 1) break;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len));
      const d = Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
      if (d < slop) return path.id;
    }
  }
  return null;
}

function strokePath(ctx: CanvasRenderingContext2D, path: DesignPath, active: boolean, ghost: boolean) {
  if (path.points.length < 2) return;
  ctx.beginPath();
  path.points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  if (path.closed) ctx.closePath();
  ctx.lineWidth = (active ? 1.6 : 1) / (ctx.getTransform().a || 1);
  ctx.strokeStyle = ghost ? 'rgba(140,100,70,0.35)' : active ? '#8d5a32' : '#4e3428';
  ctx.fillStyle = path.role === 'hole' ? 'rgba(255,250,244,0.01)' : ghost ? 'rgba(244,214,184,0.15)' : 'rgba(246, 220, 190, 0.55)';
  if (path.closed && path.role !== 'hole') ctx.fill();
  ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, panX: number, panY: number, zoom: number) {
  const step = zoom > 6 ? 5 : 10;
  const left = -panX / zoom;
  const right = (width - panX) / zoom;
  const top = panY / zoom;
  const bottom = (panY - height) / zoom;
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(120, 80, 50, 0.15)';
  ctx.lineWidth = 1 / zoom;
  for (let x = Math.floor(left / step) * step; x < right; x += step) {
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top);
  }
  for (let y = Math.floor(bottom / step) * step; y < top; y += step) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
}

function mirrorGhost(paths: DesignPath[], mirror: boolean, pair: boolean, gap: number): DesignPath[] {
  if (!mirror && !pair) return [];
  const box = boundsOf(paths);
  return paths.map((path) => ({
    ...path,
    id: `${path.id}-mirror`,
    points: path.points.map((point) => ({
      x: box.minX + box.maxX - point.x + (pair ? box.width + gap : 0),
      y: point.y,
    })),
  }));
}

export function fitCanvas(width: number, height: number) {
  const { design, setZoom, setPan } = useDesignStore.getState();
  const box = boundsOf(design.paths);
  const span = Math.max(box.width, box.height, 20) + 24;
  const zoom = Math.max(0.4, Math.min(width, height) / span);
  setZoom(zoom);
  setPan(width / 2 - box.cx * zoom, height / 2 + box.cy * zoom);
}
