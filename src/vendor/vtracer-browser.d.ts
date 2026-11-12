export function initVtracer(url: string): Promise<void>;
export function vectorize_rgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  options?: Record<string, unknown>,
): string;
export function vectorize_bytes(data: Uint8Array, options?: Record<string, unknown>): string;
