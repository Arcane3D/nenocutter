import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/domain/defaults';
import type { CutterSettings, Design, DesignPath } from '../src/domain/types';
import { encodeOBJ } from '../src/export/obj';
import { encodePDF } from '../src/export/pdf';
import { encodeSTL, readSTLTriangleCount } from '../src/export/stl';
import { encode3MF } from '../src/export/threemf';
import { buildDesign } from '../src/geometry/build';
import { assessPrint } from '../src/geometry/printability';
import { heartMotifSheet, heartPoints, rectPoints } from '../src/geometry/shapes';
import { meshVolume, openEdgeCount } from '../src/geometry/mesh';
import { pathsFromSvg } from '../src/geometry/svg';
import { boundaryLoops, pathsFromRaster, rgbaToMask } from '../src/geometry/traceRaster';
import { decodeShare, encodeShare } from '../src/lib/shareCodec';
import { fromDisplay, toDisplay } from '../src/lib/units';
import { pathFrom } from '../src/geometry/shapes';

function makeDesign(paths: DesignPath[], settings: Partial<CutterSettings> = {}): Design {
  return {
    version: 1,
    id: 'test',
    title: 'Test cutter',
    paths,
    settings: { ...defaultSettings, resolution: 36, ...settings },
    tags: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('units', () => {
  it('converts millimetres and inches', () => {
    expect(toDisplay(25.4, 'in')).toBeCloseTo(1);
    expect(fromDisplay(2, 'in')).toBeCloseTo(50.8);
    expect(fromDisplay(12.5, 'mm')).toBe(12.5);
  });
});

describe('cutter mesh', () => {
  it('builds a watertight cutter in millimetres, flat on the bed', async () => {
    const design = makeDesign([pathFrom(rectPoints(-20, -15, 40, 30))], {
      sharpEdge: false,
      baseHeight: 0,
      bladeDepth: 10,
      wallThickness: 1,
      pressHandle: false,
      centerBar: false,
    });
    const result = await buildDesign(design);
    expect(result.errors, result.errors.join(' ')).toEqual([]);
    expect(result.parts.length).toBeGreaterThan(0);
    const part = result.parts[0];
    expect(part.indices.length % 3).toBe(0);
    expect(openEdgeCount(part.indices)).toBe(0);
    expect(meshVolume({ positions: part.positions, indices: part.indices })).toBeGreaterThan(200);
    expect(result.bounds.min[2]).toBeGreaterThanOrEqual(-0.05);
    expect(result.bounds.min[2]).toBeLessThan(0.05);
    expect(result.dimensions.depth).toBeGreaterThan(9);
    expect(result.dimensions.depth).toBeLessThan(12);
    expect(result.dimensions.width).toBeGreaterThan(38);
    expect(result.dimensions.width).toBeLessThan(44);
  });

  it('builds a chamfered heart and a separate stamp with grip', async () => {
    const design = makeDesign([pathFrom(heartPoints(0, 0, 70, 40))], {
      tool: 'cutter-stamp',
      resolution: 32,
      stampGrip: 'threaded',
      separateParts: true,
    });
    const result = await buildDesign(design);
    expect(result.errors, result.errors.join(' ')).toEqual([]);
    const roles = result.parts.map((part) => part.role).sort();
    expect(roles).toEqual(['cutter', 'grip', 'stamp']);
    for (const part of result.parts) {
      expect(openEdgeCount(part.indices), part.name).toBe(0);
      expect(meshVolume({ positions: part.positions, indices: part.indices })).toBeGreaterThan(1);
      let minZ = Infinity;
      for (let i = 2; i < part.positions.length; i += 3) minZ = Math.min(minZ, part.positions[i]);
      expect(minZ).toBeGreaterThanOrEqual(-0.05);
      expect(minZ).toBeLessThan(0.08);
    }
    expect(result.parts.find((part) => part.role === 'grip')?.assembly?.socketDepth).toBeGreaterThan(1);
  });

  it('builds a 16-shape cutter set without dropping shapes', async () => {
    const design = makeDesign(heartMotifSheet(), {
      tool: 'cutter-set',
      resolution: 24,
      sharpEdge: true,
      baseHeight: 2,
      bladeDepth: 8,
    });
    const result = await buildDesign(design);
    expect(result.errors, result.warnings.join(' | ')).toEqual([]);
    expect(result.parts.length).toBeGreaterThanOrEqual(16);
    for (const part of result.parts) {
      expect(openEdgeCount(part.indices), part.name).toBe(0);
      expect(part.positions.length).toBeGreaterThan(9);
    }
  });
});

describe('exports', () => {
  it('writes STL, 3MF in millimetres, OBJ, and a 1:1 PDF', async () => {
    const design = makeDesign([pathFrom(heartPoints(0, 0, 50, 24))], {
      tool: 'cutter-stamp',
      stampGrip: 'none',
      resolution: 24,
      sharpEdge: false,
      baseHeight: 2,
      bladeDepth: 6,
    });
    const result = await buildDesign(design);
    expect(result.parts.length).toBe(2);
    const stl = encodeSTL(result.parts);
    expect(readSTLTriangleCount(stl)).toBe(result.parts.reduce((sum, part) => sum + part.indices.length / 3, 0));
    expect(stl.byteLength).toBe(84 + readSTLTriangleCount(stl) * 50);
    const obj = new TextDecoder().decode(encodeOBJ(result.parts));
    expect(obj).toContain('o Cutter_1');
    expect(obj).toContain('\nv ');
    const zipped = encode3MF(result.parts);
    const files = unzipSync(zipped);
    expect(files['[Content_Types].xml']).toBeTruthy();
    expect(files['_rels/.rels']).toBeTruthy();
    const model = strFromU8(files['3D/3dmodel.model']);
    expect(model).toContain('unit="millimeter"');
    expect(model).toContain('<object id="1"');
    expect(model).toContain('<object id="2"');
    expect(model).toContain('<item objectid="1"');
    expect(model).toContain('<item objectid="2"');
    const pdf = new TextDecoder().decode(encodePDF(design));
    expect(pdf).toContain('Nenocutter');
    expect(pdf.length).toBeGreaterThan(400);
  });
});

describe('trace and share', () => {
  it('traces a filled square and a line', () => {
    const width = 24;
    const height = 24;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 6; y < 18; y++) {
      for (let x = 6; x < 18; x++) {
        const i = (y * width + x) * 4;
        rgba[i + 3] = 255;
      }
    }
    const raster = rgbaToMask(rgba, width, height, {
      threshold: 128,
      smoothing: 0.2,
      despeckle: 2,
      invert: false,
      mode: 'filled',
      brightness: 0,
      contrast: 0,
    });
    const loops = boundaryLoops(raster.mask, width, height);
    expect(loops.length).toBeGreaterThan(0);
    const paths = pathsFromRaster(raster, { ...raster, threshold: 128, smoothing: 0.4, despeckle: 2, invert: false, mode: 'filled', brightness: 0, contrast: 0 }, 40);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].closed).toBe(true);
    const line = new Uint8ClampedArray(width * height * 4);
    for (let x = 2; x < 22; x++) {
      for (let y = 11; y <= 13; y++) {
        const i = (y * width + x) * 4;
        line[i + 3] = 255;
      }
    }
    const tracedLine = pathsFromRaster(
      rgbaToMask(line, width, height, {
        threshold: 128,
        smoothing: 0.2,
        despeckle: 1,
        invert: false,
        mode: 'line',
        brightness: 0,
        contrast: 0,
      }),
      { threshold: 128, smoothing: 0.2, despeckle: 1, invert: false, mode: 'line', brightness: 0, contrast: 0 },
      30,
    );
    expect(tracedLine.some((path) => path.points.length >= 2)).toBe(true);
  });

  it('reads svg shapes and round-trips a share link', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><rect x="10" y="10" width="40" height="20"/><circle cx="70" cy="40" r="12"/></svg>`;
    const paths = pathsFromSvg(svg);
    expect(paths.length).toBe(2);
    const design = makeDesign(paths, { wallText: 'Neno' });
    const again = decodeShare(encodeShare(design));
    expect(again.paths.length).toBe(2);
    expect(again.settings.wallText).toBe('Neno');
    expect(again.settings.bladeDepth).toBe(defaultSettings.bladeDepth);
    expect(again.paths[0].points[0].x).toBeCloseTo(design.paths[0].points[0].x, 1);
  });
});

describe('printability', () => {
  it('blocks walls under the minimum and oversized parts', async () => {
    const thin = assessPrint({ ...defaultSettings, wallThickness: 0.3, minimumWall: 0.5 }, null);
    expect(thin.level).toBe('block');
    const design = makeDesign([pathFrom(rectPoints(0, 0, 240, 30))], {
      sharpEdge: false,
      baseHeight: 1,
      bladeDepth: 4,
      resolution: 20,
      bedSize: 180,
    });
    const result = await buildDesign(design);
    const report = assessPrint(design.settings, result);
    expect(report.issues.some((issue) => issue.level === 'block' && /bed/i.test(issue.message))).toBe(true);
  });
});
