import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

describe('vtracer', () => {
  it('vectorizes a black square', () => {
    const require = createRequire(import.meta.url);
    const vtracer = require('@visioncortex/vtracer') as {
      convertPixels: (rgba: Uint8Array, width: number, height: number, options?: Record<string, unknown>) => string;
    };
    const width = 24;
    const height = 24;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 255;
      rgba[i + 1] = 255;
      rgba[i + 2] = 255;
      rgba[i + 3] = 255;
    }
    for (let y = 6; y < 18; y++) {
      for (let x = 6; x < 18; x++) {
        const index = (y * width + x) * 4;
        rgba[index] = 0;
        rgba[index + 1] = 0;
        rgba[index + 2] = 0;
      }
    }
    const svg = vtracer.convertPixels(rgba, width, height, {
      clustering: 'bw',
      mode: 'polygon',
      binaryThreshold: 200,
      filterSpeckle: 2,
    });
    expect(svg).toContain('<svg');
    expect(svg.toLowerCase()).toContain('path');
  });
});
