import type { DesignPath, TraceOptions } from '../domain/types';
import { fitPaths } from '../geometry/path';
import { pathsFromSvg } from '../geometry/svg';
import { pathsFromRaster, rgbaToMask } from '../geometry/traceRaster';

type TracerApi = {
  imagedataToSVG: (image: ImageData, options?: Record<string, unknown>) => string;
};

export async function pathsFromImageFile(file: File, options: TraceOptions, longestSide: number): Promise<DesignPath[]> {
  if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) {
    return fitPaths(pathsFromSvg(await file.text()), longestSide);
  }
  const bitmap = await decodeFile(file);
  const edited = applyAdjustments(bitmap, options.brightness, options.contrast);
  try {
    const traced = await traceWithVtracer(edited, options);
    if (traced.length) return fitPaths(traced, longestSide);
  } catch {
    /* The wasm tracer is optional. ImageTracer and the built-in contour walk follow. */
  }
  try {
    const traced = await traceWithImageTracer(edited, options);
    if (traced.length) return fitPaths(traced, longestSide);
  } catch {
    /* Built-in contour walk is the last resort and is covered by unit tests. */
  }
  const raster = rgbaToMask(edited.data, edited.width, edited.height, options);
  return pathsFromRaster(raster, options, longestSide);
}

async function decodeFile(file: File): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 720 / Math.max(image.width, image.height));
    const width = Math.max(8, Math.round(image.width * scale));
    const height = Math.max(8, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser could not read the image.');
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function applyAdjustments(image: ImageData, brightness: number, contrast: number): ImageData {
  const copy = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast || 1));
  for (let i = 0; i < copy.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const value = factor * (copy.data[i + c] - 128) + 128 + brightness;
      copy.data[i + c] = Math.max(0, Math.min(255, value));
    }
  }
  return copy;
}

async function traceWithVtracer(image: ImageData, options: TraceOptions): Promise<DesignPath[]> {
  const wasmUrl = (await import('@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm?url')).default as string;
  const tracer = (await import('../vendor/vtracer-browser.js')) as {
    initVtracer: (url: string) => Promise<void>;
    vectorize_rgba: (rgba: Uint8Array, width: number, height: number, options?: Record<string, unknown>) => string;
  };
  await tracer.initVtracer(wasmUrl);
  const svg = tracer.vectorize_rgba(new Uint8Array(image.data), image.width, image.height, {
    clustering: 'bw',
    mode: options.mode === 'line' ? 'spline' : 'polygon',
    binaryThreshold: options.threshold,
    filterSpeckle: Math.max(0, Math.round(options.despeckle)),
    simplify: Math.max(0.2, options.smoothing),
    hierarchical: 'cutout',
  });
  return pathsFromSvg(svg);
}

async function traceWithImageTracer(image: ImageData, options: TraceOptions): Promise<DesignPath[]> {
  const mod = (await import('imagetracerjs')) as { default?: TracerApi } & Partial<TracerApi>;
  const api = typeof mod.imagedataToSVG === 'function' ? (mod as TracerApi) : mod.default;
  if (!api) return [];
  const svg = api.imagedataToSVG(image, {
    numberofcolors: 2,
    ltres: Math.max(0.5, options.smoothing),
    qtres: Math.max(0.5, options.smoothing),
    pathomit: options.despeckle,
    strokewidth: 1,
    scale: 1,
    roundcoords: 2,
    colorsampling: 0,
    pal: options.invert
      ? [
          { r: 255, g: 255, b: 255, a: 255 },
          { r: 0, g: 0, b: 0, a: 255 },
        ]
      : [
          { r: 0, g: 0, b: 0, a: 255 },
          { r: 255, g: 255, b: 255, a: 255 },
        ],
  });
  return pathsFromSvg(svg);
}
