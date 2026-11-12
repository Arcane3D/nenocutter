declare module 'opentype.js' {
  export interface FontPath {
    commands: {
      type: string;
      x?: number;
      y?: number;
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
    }[];
  }
  export interface Font {
    unitsPerEm: number;
    getPath(text: string, x: number, y: number, fontSize: number): FontPath;
  }
  export function parse(buffer: ArrayBuffer): Font;
  export function load(url: string): Promise<Font>;
  const opentype: { parse: typeof parse; load: typeof load };
  export default opentype;
}

declare module 'imagetracerjs' {
  interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface ImageTracerApi {
    imagedataToSVG(imageData: ImageDataLike, options?: Record<string, unknown>): string;
  }
  const api: ImageTracerApi;
  export default api;
}

declare module 'node:module' {
  export function createRequire(filename: string | URL): (id: string) => unknown;
}

declare module 'node:fs/promises' {
  export function readFile(path: URL | string): Promise<Uint8Array>;
}

declare module '*.ttf?url' {
  const src: string;
  export default src;
}

declare module '@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm?url' {
  const src: string;
  export default src;
}
