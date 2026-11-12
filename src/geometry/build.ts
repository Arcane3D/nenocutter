import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import Module from 'manifold-3d';
import type {
  BuildProgress,
  BuildResult,
  BuiltPart,
  CutterSettings,
  DepthCurve,
  Design,
  DesignPath,
  EdgeProfile,
  GripAssembly,
  PartRole,
  Vec2,
} from '../domain/types';
import { clamp } from '../lib/units';
import { contoursFromFont, loadCutterFont } from './text';
import type { MeshData } from './mesh';
import { meshBounds, translateMesh } from './mesh';
import { limitPoints, signedArea, strokePolyline } from './path';

interface Quality {
  segments: number;
  steps: number;
  epsilon: number;
  maxPoints: number;
  reduced: boolean;
}

interface RawPart {
  name: string;
  role: PartRole;
  mesh: MeshData;
  volume: number;
  group: number;
  socket?: { x: number; y: number; top: number; depth: number };
  gripLocal?: { cx: number; cy: number; height: number };
  assembly?: GripAssembly;
}

let manifoldPromise: Promise<ManifoldToplevel> | null = null;

export function getManifold(): Promise<ManifoldToplevel> {
  if (!manifoldPromise) {
    manifoldPromise = Module().then((api) => {
      api.setup();
      return api;
    });
  }
  return manifoldPromise;
}

function qualityFor(resolution: number, shapes: number): Quality {
  const r = clamp(resolution, 8, 200);
  let steps = Math.max(2, Math.min(10, Math.round(r / 16)));
  let maxPoints = Math.round(48 + r * 1.4);
  let reduced = false;
  if (shapes > 8) {
    steps = Math.min(steps, 4);
    maxPoints = Math.min(maxPoints, 120);
    reduced = true;
  }
  if (shapes > 20) {
    steps = Math.min(steps, 3);
    maxPoints = Math.min(maxPoints, 80);
    reduced = true;
  }
  const segments = Math.max(12, Math.round((r * 0.48) / 4) * 4);
  return { segments, steps, epsilon: Math.max(0.04, 7 / r), maxPoints, reduced };
}

function drop(value: { delete?: () => void } | null | undefined) {
  if (!value) return;
  try {
    value.delete?.();
  } catch {
    /* already released */
  }
}

function joinOf(settings: CutterSettings): 'Square' | 'Round' | 'Miter' {
  if (settings.handleShape === 'rectangular') return 'Square';
  if (settings.handleShape === 'chamfered') return 'Miter';
  return 'Round';
}

function offset(cs: CrossSection, delta: number, settings: CutterSettings, q: Quality): CrossSection {
  const grown = cs.offset(delta, joinOf(settings), 2, Math.max(8, Math.round(q.segments / 2)));
  const simple = grown.simplify(q.epsilon);
  if (simple !== grown) drop(grown);
  return simple;
}

function meshOf(manifold: Manifold): MeshData {
  const raw = manifold.getMesh();
  const stride = raw.numProp || 3;
  const count = Math.floor(raw.vertProperties.length / stride);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = raw.vertProperties[i * stride];
    positions[i * 3 + 1] = raw.vertProperties[i * stride + 1];
    positions[i * 3 + 2] = raw.vertProperties[i * stride + 2];
  }
  return { positions, indices: new Uint32Array(raw.triVerts) };
}

function alive(manifold: Manifold | null | undefined): manifold is Manifold {
  return !!manifold && !manifold.isEmpty() && manifold.status() === 'NoError' && manifold.volume() > 1e-4;
}

function unionAll(_api: ManifoldToplevel, parts: Manifold[]): Manifold | null {
  const live = parts.filter((part) => alive(part));
  for (const part of parts) {
    if (!live.includes(part)) drop(part);
  }
  if (!live.length) return null;
  let acc = live[0];
  for (let i = 1; i < live.length; i++) {
    let next: Manifold;
    try {
      next = acc.add(live[i]);
    } catch {
      drop(acc);
      drop(live[i]);
      for (let j = i + 1; j < live.length; j++) drop(live[j]);
      return null;
    }
    drop(acc);
    drop(live[i]);
    acc = next;
    if (!alive(acc)) {
      drop(acc);
      for (let j = i + 1; j < live.length; j++) drop(live[j]);
      return null;
    }
  }
  return acc;
}

function extrudeRing(
  _api: ManifoldToplevel,
  outer: CrossSection,
  inner: CrossSection | null,
  height: number,
  z: number,
  requireHole = true,
): Manifold | null {
  if (height < 0.04 || outer.isEmpty()) return null;
  if (requireHole && (!inner || inner.isEmpty() || inner.area() + 0.05 >= outer.area())) return null;
  const solid = outer.extrude(height + 0.02);
  let result = solid;
  if (inner && !inner.isEmpty() && inner.area() + 0.05 < outer.area()) {
    const hole = inner.extrude(height + 0.12).translate([0, 0, -0.04]);
    result = solid.subtract(hole);
    drop(hole);
    if (result !== solid) drop(solid);
  }
  if (!alive(result)) {
    drop(result);
    return null;
  }
  if (Math.abs(z) > 1e-6) {
    const moved = result.translate([0, 0, z]);
    drop(result);
    return moved;
  }
  return result;
}

function profileWidth(t: number, wall: number, tip: number, profile: EdgeProfile): number {
  const span = Math.max(0, wall - tip);
  if (profile === 'rounded') return tip + span * Math.sqrt(Math.max(0, 1 - t * t));
  return wall - span * t;
}

function buildWall(
  api: ManifoldToplevel,
  shape: CrossSection,
  settings: CutterSettings,
  q: Quality,
): Manifold | null {
  const wall = Math.max(0.2, settings.wallThickness);
  const tip = settings.sharpEdge ? clamp(settings.tipWidth, 0.15, wall) : wall;
  const depth = Math.max(0.4, settings.bladeDepth);
  const fondant = settings.edgeProfile === 'fondant';
  const chamfer = settings.sharpEdge ? (fondant ? depth : Math.min(settings.chamferHeight, depth)) : 0;
  const vertical = Math.max(0, depth - chamfer);
  const baseH = Math.max(0, settings.baseHeight);
  const outward = Math.max(0, settings.baseWidth - wall);
  const parts: Manifold[] = [];
  const baseOuter = outward > 0.02 ? offset(shape, outward, settings, q) : shape;
  const baseInner = offset(shape, -wall, settings, q);
  if (baseH > 0.05) {
    const base = extrudeRing(api, baseOuter, baseInner.isEmpty() ? null : baseInner, baseH, 0);
    if (base) parts.push(base);
  }
  if (!settings.deleteOuterEdge) {
    if (vertical > 0.05) {
      const inner = offset(shape, -wall, settings, q);
      const section = extrudeRing(api, shape, inner.isEmpty() ? null : inner, vertical, baseH);
      drop(inner);
      if (section) parts.push(section);
    }
    if (chamfer > 0.05) {
      const steps = q.steps;
      for (let i = 0; i < steps; i++) {
        const t = (i + 1) / steps;
        const width = Math.max(0.12, profileWidth(t, wall, tip, fondant ? 'sharp' : settings.edgeProfile));
        const inner = offset(shape, -width, settings, q);
        const z0 = baseH + vertical + (i / steps) * chamfer - (i === 0 ? 0 : 0.05);
        const z1 = baseH + vertical + ((i + 1) / steps) * chamfer;
        const section = extrudeRing(api, shape, inner.isEmpty() ? null : inner, z1 - z0, z0);
        drop(inner);
        if (section) parts.push(section);
      }
    }
  } else if (baseH <= 0.05) {
    const plate = shape.extrude(1.2);
    if (alive(plate)) parts.push(plate);
    else drop(plate);
  }
  if (settings.supportBlade) {
    const gap = 0.8;
    const outer = offset(shape, -(wall + gap), settings, q);
    if (!outer.isEmpty()) {
      const inner = offset(outer, -Math.max(0.4, settings.supportBladeThickness), settings, q);
      const height = Math.min(settings.supportBladeDepth, depth);
      const rib = extrudeRing(api, outer, inner.isEmpty() ? null : inner, height, baseH);
      drop(inner);
      if (rib) parts.push(rib);
    }
    drop(outer);
  }
  if (baseOuter !== shape) drop(baseOuter);
  drop(baseInner);
  return unionAll(api, parts);
}

function barPolygon(shape: CrossSection, angle: number, offsetMm: number, width: number): [number, number][] {
  const box = shape.bounds();
  const minX = box.min[0];
  const minY = box.min[1];
  const maxX = box.max[0];
  const maxY = box.max[1];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const len = Math.hypot(maxX - minX, maxY - minY) + 4;
  const a = (angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const px = -dy;
  const py = dx;
  const ox = cx + px * offsetMm;
  const oy = cy + py * offsetMm;
  const hw = width / 2;
  const hl = len / 2;
  return [
    [ox + dx * hl + px * hw, oy + dy * hl + py * hw],
    [ox - dx * hl + px * hw, oy - dy * hl + py * hw],
    [ox - dx * hl - px * hw, oy - dy * hl - py * hw],
    [ox + dx * hl - px * hw, oy + dy * hl - py * hw],
  ];
}

function connector(
  api: ManifoldToplevel,
  shape: CrossSection,
  settings: CutterSettings,
  _q: Quality,
): Manifold | null {
  const polys: [number, number][][] = [];
  if (settings.centerBar) {
    const count = Math.max(1, Math.round(settings.centerBarCount));
    const spacing = settings.centerBarSpacing;
    const start = settings.centerBarOffset - ((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      polys.push(barPolygon(shape, settings.centerBarAngle, start + i * spacing, Math.max(0.4, settings.centerBarWidth)));
    }
  }
  if (settings.pressHandle) {
    polys.push(barPolygon(shape, 90, 0, Math.max(8, settings.baseWidth)));
  }
  if (!polys.length) return null;
  const cs = api.CrossSection.ofPolygons(polys, 'NonZero');
  const height = Math.max(settings.baseHeight, 1.2);
  const solid = cs.extrude(height);
  drop(cs);
  return alive(solid) ? solid : (drop(solid), null);
}

function curveScale(t: number, curve: DepthCurve): number {
  if (curve === 'flat') return 1;
  if (curve === 'chamfer') return 1 - 0.45 * t;
  if (curve === 'round') return Math.sqrt(Math.max(0.08, 1 - t * t));
  return Math.max(0.2, Math.cos((t * Math.PI) / 2));
}

function buildImprint(
  api: ManifoldToplevel,
  shape: CrossSection,
  imprint: CrossSection | null,
  settings: CutterSettings,
  q: Quality,
): Manifold | null {
  if (!imprint || imprint.isEmpty() || settings.imprintDepth <= 0.02) return null;
  const depth = Math.min(settings.imprintDepth, Math.max(settings.bladeDepth, settings.imprintDepth));
  const z0 = Math.max(settings.baseHeight, 0);
  const parts: Manifold[] = [];
  if (settings.imprintEdgesOnly) {
    const inner = offset(imprint, -Math.max(0.3, settings.imprintWidth), settings, q);
    const steps = settings.imprintCurve === 'flat' ? 1 : q.steps;
    for (let i = 0; i < steps; i++) {
      const t = (i + 1) / steps;
      const scale = curveScale(t, settings.imprintCurve);
      const ringOuter: CrossSection = scale < 0.98 ? offset(imprint, -settings.imprintWidth * (1 - scale) * 0.5, settings, q) : imprint;
      const section = extrudeRing(api, ringOuter, inner.isEmpty() ? null : inner, depth / steps + 0.04, z0 + (i * depth) / steps);
      if (ringOuter !== imprint) drop(ringOuter);
      if (section) parts.push(section);
    }
    drop(inner);
  } else {
    const steps = settings.imprintCurve === 'flat' ? 1 : q.steps;
    const box = imprint.bounds();
    const cx = (box.min[0] + box.max[0]) / 2;
    const cy = (box.min[1] + box.max[1]) / 2;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const scale = curveScale(t, settings.imprintCurve);
      const layer: CrossSection =
        scale > 0.98
          ? imprint
          : imprint.translate([-cx, -cy]).scale(scale).translate([cx, cy]);
      const solid = layer.extrude(depth / steps + 0.03).translate([0, 0, z0 + (i * depth) / steps]);
      if (layer !== imprint) drop(layer);
      if (alive(solid)) parts.push(solid);
      else drop(solid);
    }
  }
  const raised = unionAll(api, parts);
  if (!raised) return null;
  if (!settings.imprintInvert) return raised;
  const plateH = z0 + depth;
  const plate = shape.extrude(plateH);
  const groove = raised.translate([0, 0, 0.02]);
  drop(raised);
  const cut = plate.subtract(groove);
  drop(plate);
  drop(groove);
  return alive(cut) ? cut : (drop(cut), null);
}

function makeOutline(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings, q: Quality): CrossSection {
  const box = shape.bounds();
  const minX = box.min[0];
  const minY = box.min[1];
  const maxX = box.max[0];
  const maxY = box.max[1];
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pad = Math.max(0, settings.outlinePadding);
  if (settings.autoOutline === 'rect') {
    return api.CrossSection.square([maxX - minX + pad * 2, maxY - minY + pad * 2], true).translate([cx, cy]);
  }
  if (settings.autoOutline === 'square') {
    const side = Math.max(maxX - minX, maxY - minY) + pad * 2;
    return api.CrossSection.square(side, true).translate([cx, cy]);
  }
  if (settings.autoOutline === 'circle') {
    const r = Math.hypot(maxX - minX, maxY - minY) / 2 + pad;
    return api.CrossSection.circle(r, q.segments).translate([cx, cy]);
  }
  if (settings.autoOutline === 'hull') return shape.hull().offset(pad, 'Round', 2, q.segments);
  return shape;
}

function toSection(api: ManifoldToplevel, paths: DesignPath[], q: Quality, stroke: number): CrossSection | null {
  const contours: [number, number][][] = [];
  for (const path of paths) {
    const pts = limitPoints(path.points, q.maxPoints);
    if (!path.closed || pts.length < 3) {
      for (const ribbon of strokePolyline(pts, stroke)) {
        if (ribbon.length >= 3) contours.push(ribbon.map((p) => [p.x, p.y]));
      }
      continue;
    }
    contours.push(pts.map((p) => [p.x, p.y]));
  }
  if (!contours.length) return null;
  const raw = api.CrossSection.ofPolygons(contours, 'EvenOdd');
  const cs = raw.simplify(q.epsilon);
  if (cs !== raw) drop(raw);
  if (cs.isEmpty()) {
    drop(cs);
    return null;
  }
  return cs;
}

function family(tool: CutterSettings['tool']): string {
  if (tool === 'imprint' || tool === 'imprint-set') return 'imprint';
  if (tool === 'stamp' || tool === 'stamp-set') return 'stamp';
  if (tool === 'cutter-stamp' || tool === 'combo-set') return 'combo';
  if (tool === 'cutter' || tool === 'cutter-set') return 'cutter';
  return tool;
}

function preparePaths(paths: DesignPath[], settings: CutterSettings): DesignPath[] {
  let next = paths.map((path) => ({ ...path, points: path.points.map((p) => ({ ...p })) }));
  if (settings.mirror || settings.mirrorPair) {
    const box = next.reduce(
      (acc, path) => {
        for (const p of path.points) {
          acc.minX = Math.min(acc.minX, p.x);
          acc.maxX = Math.max(acc.maxX, p.x);
        }
        return acc;
      },
      { minX: Infinity, maxX: -Infinity },
    );
    const width = box.maxX - box.minX;
    const flip = (path: DesignPath): DesignPath => ({
      ...path,
      id: `${path.id}-m`,
      source: undefined,
      points: path.points.map((p) => ({ x: box.minX + box.maxX - p.x, y: p.y })),
    });
    if (settings.mirrorPair) {
      const gap = settings.mirrorGap;
      next = [
        ...next,
        ...next.map(flip).map((path) => ({
          ...path,
          points: path.points.map((p) => ({ x: p.x + width + gap, y: p.y })),
        })),
      ];
    } else if (settings.mirror) {
      next = next.map(flip);
    }
  }
  if (settings.tool === 'sandwich') {
    next = next.map((path) => (path.role === 'outline' ? { ...path, points: scallop(path.points) } : path));
  }
  return next;
}

function scallop(points: Vec2[]): Vec2[] {
  if (points.length < 6) return points;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const radial = Math.hypot(dx, dy) || 1;
    const k = 1 + (1.1 / radial) * Math.sin(8 * Math.atan2(dy, dx));
    return { x: cx + dx * k, y: cy + dy * k };
  });
}

function containsPoint(api: ManifoldToplevel, shape: CrossSection, x: number, y: number): boolean {
  const dot = api.CrossSection.square(0.4, true).translate([x, y]);
  const hit = shape.intersect(dot);
  const yes = !hit.isEmpty();
  drop(dot);
  drop(hit);
  return yes;
}

async function buildStampAndGrip(
  api: ManifoldToplevel,
  shape: CrossSection,
  settings: CutterSettings,
  q: Quality,
  inset: boolean,
  group: number,
  warnings: string[],
): Promise<RawPart[]> {
  const footprint = inset ? offset(shape, -(settings.wallThickness + settings.cutterTolerance), settings, q) : shape;
  if (footprint.isEmpty()) {
    warnings.push('A stamp was skipped because the tolerance left no surface.');
    if (footprint !== shape) drop(footprint);
    return [];
  }
  const back = Math.max(1, settings.stampBack);
  const relief = Math.max(0, settings.stampRelief);
  let body = footprint.extrude(back);
  if (settings.stampMode === 'emboss' && relief > 0.05) {
    const face = offset(footprint, -0.6, settings, q);
    const raised = (face.isEmpty() ? footprint : face).extrude(relief).translate([0, 0, back]);
    const next = body.add(raised);
    drop(body);
    drop(raised);
    if (face !== footprint) drop(face);
    body = next;
  } else if (settings.stampMode === 'deboss' && relief > 0.05 && relief < back - 0.4) {
    const face = offset(footprint, -0.8, settings, q);
    if (!face.isEmpty()) {
      const cut = face.extrude(relief + 0.05).translate([0, 0, back - relief]);
      const next = body.subtract(cut);
      drop(body);
      drop(cut);
      body = next;
    }
    drop(face);
  }
  const box = footprint.bounds();
  const cx = (box.min[0] + box.max[0]) / 2 + (settings.gripPlacement === 'manual' ? settings.gripX : 0);
  const cy = (box.min[1] + box.max[1]) / 2 + (settings.gripPlacement === 'manual' ? settings.gripY : 0);
  const top = back + (settings.stampMode === 'emboss' ? relief : 0);
  let socket: RawPart['socket'];
  if (settings.stampGrip !== 'none') {
    const depth = Math.min(settings.socketDepth, Math.max(0.8, top - 0.9));
    if (depth < settings.socketDepth - 0.05) {
      warnings.push('Socket depth was shortened so the stamp keeps a solid floor.');
    }
    const radius =
      settings.stampGrip === 'threaded'
        ? settings.threadDiameter / 2
        : settings.threadDiameter / 2 + settings.gripClearance;
    const hole =
      settings.stampGrip === 'glue-chamfer'
        ? api.Manifold.cylinder(depth + 0.3, radius * 0.62, radius, q.segments).translate([cx, cy, top - depth])
        : api.Manifold.cylinder(depth + 0.3, radius, radius, q.segments).translate([cx, cy, top - depth]);
    const cut = body.subtract(hole);
    drop(body);
    drop(hole);
    body = cut;
    socket = { x: cx, y: cy, top, depth };
  }
  if (footprint !== shape) drop(footprint);
  if (!alive(body)) {
    drop(body);
    warnings.push('A stamp could not be built from one of the shapes.');
    return [];
  }
  const parts: RawPart[] = [
    { name: 'Stamp', role: 'stamp', mesh: meshOf(body), volume: body.volume(), group, socket },
  ];
  drop(body);
  if (settings.stampGrip !== 'none' && socket) {
    const grip = buildGrip(api, settings, q);
    if (grip) {
      parts.push({
        name: 'Stamp grip',
        role: 'grip',
        mesh: meshOf(grip),
        volume: grip.volume(),
        group,
        gripLocal: { cx: 0, cy: 0, height: settings.gripHeight },
      });
      drop(grip);
    }
  }
  return parts;
}

function buildGrip(api: ManifoldToplevel, settings: CutterSettings, q: Quality): Manifold | null {
  const height = Math.max(8, settings.gripHeight);
  const peg = Math.min(settings.socketDepth, height * 0.45);
  const handleR = Math.max(7, settings.threadDiameter / 2);
  const parts: Manifold[] = [];
  const handle = api.Manifold.cylinder(height - peg, handleR, handleR, q.segments);
  parts.push(handle);
  if (settings.stampGrip === 'glue-chamfer') {
    const topR = Math.max(1, settings.threadDiameter / 2 - settings.gripClearance);
    const tipR = Math.max(0.6, topR * 0.55);
    const cone = api.Manifold.cylinder(peg, tipR, topR, q.segments).translate([0, 0, height - peg]);
    parts.push(cone);
  } else {
    const crest = Math.max(1, settings.threadDiameter / 2 - settings.gripClearance);
    const coreR = Math.max(0.8, crest - 0.7);
    const core = api.Manifold.cylinder(peg, coreR, coreR, q.segments).translate([0, 0, height - peg]);
    parts.push(core);
    const pitch = 2.4;
    const turns = Math.max(1, peg / pitch);
    const steps = Math.max(10, Math.round(turns * 14));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const z = height - peg + 0.4 + t * (peg - 0.8);
      const a = t * turns * Math.PI * 2;
      const blob = api.Manifold.cylinder(0.7, 0.48, 0.48, 8).translate([Math.cos(a) * (crest - 0.2), Math.sin(a) * (crest - 0.2), z]);
      parts.push(blob);
    }
  }
  const round = Math.min(settings.gripBottomRadius, handleR - 0.4, height * 0.3);
  if (round > 0.4) {
    const cap = api.Manifold.cylinder(round, Math.max(0.8, handleR - round * 0.65), handleR, q.segments);
    parts[0] = api.Manifold.cylinder(height - peg - round, handleR, handleR, q.segments).translate([0, 0, round]);
    drop(handle);
    parts.push(cap);
  }
  return unionAll(api, parts);
}

function buildStencil(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings): Manifold | null {
  const box = shape.bounds();
  const pad = Math.max(4, settings.outlinePadding);
  const plate = api.CrossSection.square(
    [box.max[0] - box.min[0] + pad * 2, box.max[1] - box.min[1] + pad * 2],
    true,
  ).translate([(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2]);
  const thick = Math.max(1.2, settings.baseHeight);
  const solid = plate.extrude(thick);
  const cut = shape.extrude(thick + 2).translate([0, 0, -1]);
  const result = solid.subtract(cut);
  drop(plate);
  drop(solid);
  drop(cut);
  return alive(result) ? result : (drop(result), null);
}

function buildTopper(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings, q: Quality): Manifold | null {
  const face = shape.extrude(2.6);
  const box = shape.bounds();
  const cx = (box.min[0] + box.max[0]) / 2;
  const pinLen = Math.max(10, settings.topperPinLength);
  const pinW = Math.max(1.2, settings.topperPinWidth);
  const y0 = box.min[1] - pinLen + 2;
  const pinCs =
    settings.topperPinShape === 'round'
      ? api.CrossSection.circle(pinW / 2, q.segments).translate([cx, y0 + pinLen / 2])
      : api.CrossSection.square([pinW, pinLen], false).translate([cx - pinW / 2, y0]);
  const pin = pinCs.extrude(2.6);
  const result = face.add(pin);
  drop(face);
  drop(pinCs);
  drop(pin);
  return alive(result) ? result : (drop(result), null);
}

function buildCookie(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings): Manifold | null {
  const parts: Manifold[] = [];
  const base = shape.extrude(6);
  if (alive(base)) parts.push(base);
  else drop(base);
  const box = shape.bounds();
  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  for (let i = 1; i <= 4; i++) {
    const scale = 1 - i * 0.08;
    const layer = shape.translate([-cx, -cy]).scale(scale).translate([cx, cy]).extrude(1.1).translate([0, 0, 6 + (i - 1) * 1]);
    if (alive(layer)) parts.push(layer);
    else drop(layer);
  }
  if (settings.imprintDepth > 0.2) {
    const groove = shape
      .translate([-cx, -cy])
      .scale(0.72)
      .translate([cx, cy])
      .extrude(Math.min(2.2, settings.imprintDepth))
      .translate([0, 0, 8]);
    const cookie = unionAll(api, parts);
    if (!cookie) {
      drop(groove);
      return null;
    }
    const cut = cookie.subtract(groove);
    drop(cookie);
    drop(groove);
    return alive(cut) ? cut : (drop(cut), null);
  }
  return unionAll(api, parts);
}

function buildRoller(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings, q: Quality): Manifold | null {
  const radius = Math.max(8, settings.rollerDiameter / 2);
  const length = Math.max(20, settings.rollerLength);
  const cyl = api.Manifold.cylinder(length, radius, radius, q.segments);
  const box = shape.bounds();
  const span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1]) || 1;
  const scale = 12 / span;
  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  const small = shape.translate([-cx, -cy]).scale(scale);
  const plaque = small.extrude(5).translate([radius - 1.2, 0, length / 2 - 2]);
  const bumps: Manifold[] = [cyl];
  for (let i = 0; i < 4; i++) {
    const copy = i === 0 ? plaque : plaque.rotate(0, 0, i * 90);
    bumps.push(copy.translate([0, 0, 0]));
  }
  drop(small);
  const result = unionAll(api, bumps);
  return result;
}

function buildMold(api: ManifoldToplevel, settings: CutterSettings, q: Quality): RawPart[] {
  const d = Math.max(16, settings.cakepopDiameter);
  const size = d + 16;
  const block = api.Manifold.cube([size, size, size * 0.46], false);
  const ball = api.Manifold.sphere(d / 2, q.segments).translate([size / 2, size / 2, size * 0.46]);
  const cavity = block.subtract(ball);
  drop(block);
  drop(ball);
  const pin = api.Manifold.cylinder(2.4, 1.3, 1.3, 16).translate([8, size / 2, size * 0.46 - 1.2]);
  const pinB = api.Manifold.cylinder(2.4, 1.3, 1.3, 16).translate([size - 8, size / 2, size * 0.46 - 1.2]);
  const halfA = cavity.add(pin).add(pinB);
  const hole = api.Manifold.cylinder(2.8, 1.55, 1.55, 16).translate([8, size / 2, size * 0.46 - 1.4]);
  const holeB = api.Manifold.cylinder(2.8, 1.55, 1.55, 16).translate([size - 8, size / 2, size * 0.46 - 1.4]);
  const halfB = cavity.subtract(hole).subtract(holeB).translate([size + 6, 0, 0]);
  drop(cavity);
  drop(pin);
  drop(pinB);
  drop(hole);
  drop(holeB);
  const parts: RawPart[] = [];
  if (alive(halfA)) {
    parts.push({ name: 'Mold half A', role: 'mold', mesh: meshOf(halfA), volume: halfA.volume(), group: 0 });
    drop(halfA);
  } else drop(halfA);
  if (alive(halfB)) {
    parts.push({ name: 'Mold half B', role: 'mold', mesh: meshOf(halfB), volume: halfB.volume(), group: 0 });
    drop(halfB);
  } else drop(halfB);
  return parts;
}

function textSection(api: ManifoldToplevel, contours: Vec2[][], x: number, y: number): CrossSection | null {
  if (!contours.length) return null;
  const polys = contours
    .filter((contour) => contour.length >= 3)
    .map((contour) => contour.map((p) => [p.x + x, p.y + y] as [number, number]));
  if (!polys.length) return null;
  const cs = api.CrossSection.ofPolygons(polys, 'EvenOdd');
  return cs.isEmpty() ? (drop(cs), null) : cs;
}

function emptyResult(errors: string[], warnings: string[] = []): BuildResult {
  return {
    parts: [],
    warnings,
    errors,
    status: 'error',
    volume: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    dimensions: { width: 0, height: 0, depth: 0 },
  };
}

export async function buildDesign(
  design: Design,
  onProgress?: (progress: BuildProgress) => void,
): Promise<BuildResult> {
  const warnings: string[] = [];
  try {
    const api = await getManifold();
    const settings = design.settings;
    const paths = preparePaths(design.paths.filter((path) => path.points.length >= 2), settings);
    if (!paths.length) return emptyResult(['Add or trace a shape to build a cutter.']);
    const kind = family(settings.tool);
    const roughCount = Math.max(1, paths.filter((path) => path.role === 'outline').length);
    const q = qualityFor(settings.resolution, kind.endsWith('set') || settings.tool.endsWith('-set') ? roughCount : 1);
    if (q.reduced) {
      warnings.push('Resolution was eased so this multi-shape design could build without running out of memory.');
    }
    api.setCircularSegments(q.segments);
    if (kind === 'cakepop') {
      onProgress?.({ index: 1, total: 1, label: 'Building the mold' });
      const parts = finish(buildMold(api, settings, q), settings, warnings);
      return packResult(parts, warnings);
    }
    const solidPaths = paths.filter((path) => path.role === 'outline' || path.role === 'hole');
    const imprintPaths = paths.filter((path) => path.role === 'imprint');
    const supportPaths = paths.filter((path) => path.role === 'support');
    const solid = toSection(api, solidPaths.length ? solidPaths : paths, q, settings.wallThickness);
    if (!solid) return emptyResult(['The drawing did not produce a closed shape. Try smoothing less, or close the path.']);
    const setMode = settings.tool.endsWith('-set');
    const decomposed = setMode ? solid.decompose() : [solid];
    const kept: CrossSection[] = [];
    let specks = 0;
    for (const piece of decomposed) {
      if (piece.area() > 0.4) kept.push(piece);
      else {
        specks += 1;
        drop(piece);
      }
    }
    kept.sort((a, b) => b.area() - a.area());
    if (kept.length > 48) {
      kept.slice(48).forEach((piece) => drop(piece));
      kept.length = 48;
      warnings.push('Only the 48 largest shapes were built.');
    }
    const pieces = kept;
    if (specks > 0) warnings.push(`${specks} speck${specks === 1 ? '' : 's'} were left out of the set.`);
    if (!pieces.length) {
      if (setMode) drop(solid);
      return emptyResult(['No shapes were large enough to build.']);
    }
    const wantText = Boolean(settings.wallText.trim() || (settings.namePlate && settings.namePlateText.trim()));
    const font = wantText ? await loadCutterFont().catch(() => null) : null;
    if (wantText && !font) warnings.push('Text was skipped because the font could not be loaded.');
    const raw: RawPart[] = [];
    const total = pieces.length;
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      onProgress?.({ index: index + 1, total, label: `Building shape ${index + 1} of ${total}` });
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        const built = await buildPiece(api, piece, paths, imprintPaths, supportPaths, settings, q, kind, index, font, warnings);
        raw.push(...built);
      } catch (error) {
        warnings.push(`Shape ${index + 1} was skipped: ${error instanceof Error ? error.message : 'it was too complex'}.`);
      }
      if (setMode) drop(piece);
    }
    if (!setMode) drop(solid);
    else drop(solid);
    if (settings.tool === 'multi' && raw.length) {
      const copies = duplicateGrid(raw.filter((part) => part.role === 'cutter'), settings);
      raw.push(...copies);
    }
    if (!raw.length) {
      return emptyResult(
        ['Nothing printable was produced. Lower the blade thickness or enlarge the artwork.'],
        warnings,
      );
    }
    const separated = settings.separateParts ? raw : mergeParts(api, raw, warnings);
    const packed = finish(separated, settings, warnings);
    return packResult(packed, warnings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The model could not be built.';
    const friendly = /alloc|memory|too large/i.test(message)
      ? 'This design is too heavy for the current resolution. Lower the resolution or build it as a cutter set so each shape stays small.'
      : message;
    return emptyResult([friendly], warnings);
  }
}

async function buildPiece(
  api: ManifoldToplevel,
  piece: CrossSection,
  _paths: DesignPath[],
  imprintPaths: DesignPath[],
  supportPaths: DesignPath[],
  settings: CutterSettings,
  q: Quality,
  kind: string,
  index: number,
  font: Awaited<ReturnType<typeof loadCutterFont>> | null,
  warnings: string[],
): Promise<RawPart[]> {
  const label = index + 1;
  const wallShape = settings.autoOutline === 'none' ? piece : makeOutline(api, piece, settings, q);
  const imprintSource = settings.autoOutline === 'none' ? null : piece;
  const parts: RawPart[] = [];
  const solids: Manifold[] = [];
  if (kind === 'stencil') {
    const stencil = buildStencil(api, wallShape, settings);
    if (wallShape !== piece) drop(wallShape);
    if (!stencil) return [];
    parts.push({ name: `Stencil ${label}`, role: 'stencil', mesh: meshOf(stencil), volume: stencil.volume(), group: index });
    drop(stencil);
    return parts;
  }
  if (kind === 'topper') {
    const topper = buildTopper(api, wallShape, settings, q);
    if (wallShape !== piece) drop(wallShape);
    if (!topper) return [];
    parts.push({ name: `Topper ${label}`, role: 'topper', mesh: meshOf(topper), volume: topper.volume(), group: index });
    drop(topper);
    return parts;
  }
  if (kind === 'practice') {
    const cookie = buildCookie(api, wallShape, settings);
    if (wallShape !== piece) drop(wallShape);
    if (!cookie) return [];
    parts.push({ name: `Practice cookie ${label}`, role: 'cookie', mesh: meshOf(cookie), volume: cookie.volume(), group: index });
    drop(cookie);
    return parts;
  }
  if (kind === 'roller') {
    const roller = buildRoller(api, wallShape, settings, q);
    if (wallShape !== piece) drop(wallShape);
    if (!roller) return [];
    parts.push({ name: 'Texture roller', role: 'roller', mesh: meshOf(roller), volume: roller.volume(), group: index });
    drop(roller);
    return parts;
  }
  const makeCutter = kind === 'cutter' || kind === 'imprint' || kind === 'combo' || kind === 'multi' || kind === 'sandwich';
  if (makeCutter) {
    const wall = buildWall(api, wallShape, settings, q);
    if (wall) solids.push(wall);
    else warnings.push(`Shape ${label} is smaller than the blade, so its cutter was skipped.`);
    const bars = connector(api, wallShape, settings, q);
    if (bars) solids.push(bars);
    if (supportPaths.length) {
      const support = toSection(api, supportPaths, q, settings.supportBladeThickness);
      if (support) {
        const rib = support.extrude(Math.min(settings.supportBladeDepth, settings.bladeDepth)).translate([0, 0, settings.baseHeight]);
        drop(support);
        if (alive(rib)) solids.push(rib);
        else drop(rib);
      }
    }
    const localImprints = imprintPaths.filter((path) => {
      if (!path.points.length) return false;
      const c = path.points[Math.floor(path.points.length / 2)];
      return containsPoint(api, wallShape, c.x, c.y);
    });
    if (imprintSource) {
      const rib = buildImprint(api, wallShape, imprintSource, { ...settings, imprintEdgesOnly: true, imprintInvert: false }, q);
      if (rib) solids.push(rib);
    }
    if (localImprints.length && (kind === 'imprint' || kind === 'combo' || settings.imprintDepth > 0)) {
      const section = toSection(api, localImprints, q, settings.imprintWidth);
      const rib = buildImprint(api, wallShape, section, settings, q);
      drop(section);
      if (rib) solids.push(rib);
    }
    if (index === 0 && font && settings.wallText.trim()) {
      const box = wallShape.bounds();
      const contours = contoursFromFont(font, settings.wallText, settings.wallTextHeight);
      const textBoxW = contours.reduce((max, contour) => Math.max(max, ...contour.map((p) => p.x)), 0);
      const cs = textSection(api, contours, (box.min[0] + box.max[0]) / 2 - textBoxW / 2, box.min[1] - settings.wallTextHeight * 0.15);
      if (cs) {
        const letters = cs.extrude(Math.max(settings.baseHeight, settings.bladeDepth * 0.65));
        drop(cs);
        if (alive(letters)) solids.push(letters);
        else drop(letters);
      }
    }
    if (index === 0 && font && settings.namePlate && settings.namePlateText.trim()) {
      const plate = buildNamePlate(api, wallShape, settings, font);
      if (plate) solids.push(plate);
    }
    const cutter = unionAll(api, solids);
    if (cutter) {
      parts.push({
        name: piecesName(kind, label),
        role: 'cutter',
        mesh: meshOf(cutter),
        volume: cutter.volume(),
        group: index,
      });
      drop(cutter);
    }
  }
  if (kind === 'stamp' || kind === 'combo') {
    const stamps = await buildStampAndGrip(api, wallShape, settings, q, kind === 'combo', index, warnings);
    for (const part of stamps) {
      part.name = stamps.length > 1 && part.role === 'stamp' ? `Stamp ${label}` : part.name;
      if (part.role === 'stamp' && label > 1) part.name = `Stamp ${label}`;
      if (part.role === 'grip') part.name = `Grip ${label}`;
    }
    parts.push(...stamps);
  }
  if (wallShape !== piece) drop(wallShape);
  return parts;
}

function piecesName(kind: string, label: number): string {
  if (kind === 'imprint') return `Imprint cutter ${label}`;
  if (kind === 'sandwich') return `Sandwich cutter ${label}`;
  return `Cutter ${label}`;
}

function buildNamePlate(api: ManifoldToplevel, shape: CrossSection, settings: CutterSettings, font: NonNullable<Awaited<ReturnType<typeof loadCutterFont>>>): Manifold | null {
  const contours = contoursFromFont(font, settings.namePlateText, Math.max(3, settings.baseHeight));
  if (!contours.length) return null;
  let maxX = 0;
  let maxY = 0;
  for (const contour of contours) {
    for (const p of contour) {
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const box = shape.bounds();
  const margin = 2.4;
  const plateW = maxX + margin * 2;
  const plateH = maxY + margin * 2;
  const x = (box.min[0] + box.max[0]) / 2 - plateW / 2;
  const y = box.min[1] - plateH + 0.6;
  const plateCs = api.CrossSection.square([plateW, plateH], false).translate([x, y]);
  const thick = Math.max(1, settings.namePlateThickness);
  let plate = plateCs.extrude(thick);
  const text = textSection(api, contours, x + margin, y + margin);
  if (text) {
    const raised = text.extrude(Math.max(0.2, settings.raisedText)).translate([0, 0, thick]);
    const next = plate.add(raised);
    drop(plate);
    drop(raised);
    drop(text);
    plate = next;
  }
  drop(plateCs);
  return alive(plate) ? plate : (drop(plate), null);
}

function duplicateGrid(parts: RawPart[], settings: CutterSettings): RawPart[] {
  const rows = Math.max(1, Math.round(settings.multiRows));
  const cols = Math.max(1, Math.round(settings.multiCols));
  if (rows * cols <= 1) return [];
  let maxX = 0;
  let maxY = 0;
  for (const part of parts) {
    const box = meshBounds(part.mesh);
    maxX = Math.max(maxX, box.max[0] - box.min[0]);
    maxY = Math.max(maxY, box.max[1] - box.min[1]);
  }
  const copies: RawPart[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === 0 && col === 0) continue;
      const dx = col * (maxX + settings.multiSpacing);
      const dy = row * (maxY + settings.multiSpacing);
      for (const part of parts) {
        copies.push({
          ...part,
          name: `${part.name} ${row + 1}-${col + 1}`,
          mesh: translateMesh(part.mesh, dx, dy, 0),
          group: part.group + row * cols + col + 1,
        });
      }
    }
  }
  return copies;
}

function mergeParts(api: ManifoldToplevel, parts: RawPart[], warnings: string[]): RawPart[] {
  try {
    const manifolds = parts.map((part) =>
      api.Manifold.ofMesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices } as unknown as import('manifold-3d').Mesh),
    );
    const united = unionAll(api, manifolds);
    if (!united) return parts;
    const merged: RawPart = {
      name: 'Nenocutter',
      role: parts[0]?.role ?? 'cutter',
      mesh: meshOf(united),
      volume: united.volume(),
      group: 0,
    };
    drop(united);
    return [merged];
  } catch {
    warnings.push('Overlapping parts were kept separate because combining them failed.');
    return parts;
  }
}

function finish(parts: RawPart[], settings: CutterSettings, _warnings: string[]): RawPart[] {
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;
  const gap = 4;
  for (const part of parts) {
    const box = meshBounds(part.mesh);
    const w = box.max[0] - box.min[0];
    const h = box.max[1] - box.min[1];
    if (cursorX > 0 && cursorX + w > settings.bedSize) {
      cursorX = 0;
      cursorY += rowH + gap;
      rowH = 0;
    }
    const dx = cursorX - box.min[0];
    const dy = cursorY - box.min[1];
    const dz = -box.min[2];
    part.mesh = translateMesh(part.mesh, dx, dy, dz);
    if (part.socket) {
      part.socket.x += dx;
      part.socket.y += dy;
      part.socket.top += dz;
    }
    if (part.gripLocal) {
      part.gripLocal.cx += dx;
      part.gripLocal.cy += dy;
    }
    cursorX += w + gap;
    rowH = Math.max(rowH, h);
  }
  for (const grip of parts) {
    if (!grip.gripLocal) continue;
    const stamp = parts.find((part) => part.role === 'stamp' && part.group === grip.group && part.socket);
    if (!stamp?.socket) continue;
    grip.assembly = {
      kind: 'grip',
      cx: grip.gripLocal.cx,
      cy: grip.gripLocal.cy,
      height: grip.gripLocal.height,
      socketX: stamp.socket.x,
      socketY: stamp.socket.y,
      socketTop: stamp.socket.top,
      socketDepth: stamp.socket.depth,
    };
  }
  return parts;
}

function packResult(parts: RawPart[], warnings: string[]): BuildResult {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let volume = 0;
  const built: BuiltPart[] = [];
  for (const part of parts) {
    const box = meshBounds(part.mesh);
    minX = Math.min(minX, box.min[0]);
    minY = Math.min(minY, box.min[1]);
    minZ = Math.min(minZ, box.min[2]);
    maxX = Math.max(maxX, box.max[0]);
    maxY = Math.max(maxY, box.max[1]);
    maxZ = Math.max(maxZ, box.max[2]);
    volume += part.volume;
    if (part.mesh.indices.length < 3) continue;
    built.push({
      name: part.name,
      role: part.role,
      positions: part.mesh.positions,
      indices: part.mesh.indices,
      volume: part.volume,
      assembly: part.assembly,
    });
  }
  if (!built.length) {
    return emptyResult(['The model came out empty. Check the blade thickness against the artwork.'], warnings);
  }
  const bounds = {
    min: [minX, minY, minZ] as [number, number, number],
    max: [maxX, maxY, maxZ] as [number, number, number],
  };
  return {
    parts: built,
    warnings,
    errors: [],
    status: warnings.length ? 'ok' : 'ok',
    volume,
    bounds,
    dimensions: {
      width: maxX - minX,
      height: maxY - minY,
      depth: maxZ - minZ,
    },
  };
}

export function partCountEstimate(paths: DesignPath[]): number {
  return paths.filter((path) => path.role === 'outline' && path.closed && Math.abs(signedArea(path.points)) > 0.2).length;
}
