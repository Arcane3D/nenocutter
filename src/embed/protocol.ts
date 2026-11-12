import type { CutterSettings, Design } from '../domain/types';

export const EMBED_SOURCE = 'nenocutter';
export const HOST_SOURCE = 'nenocutter-host';

export type EmbedEvent =
  | { source: typeof EMBED_SOURCE; type: 'ready'; version: 1 }
  | { source: typeof EMBED_SOURCE; type: 'design-changed'; design: Design }
  | { source: typeof EMBED_SOURCE; type: 'export-complete'; format: string; fileName: string; byteLength: number }
  | { source: typeof EMBED_SOURCE; type: 'error'; message: string };

export type HostCommand =
  | { source: typeof HOST_SOURCE; type: 'load-design'; design: Design }
  | { source: typeof HOST_SOURCE; type: 'set-settings'; settings: Partial<CutterSettings> }
  | { source: typeof HOST_SOURCE; type: 'export'; format: 'stl' | '3mf' | 'obj' | 'pdf' };

export function postToParent(message: EmbedEvent) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, '*');
  }
}

export function isHostCommand(value: unknown): value is HostCommand {
  if (!value || typeof value !== 'object') return false;
  const message = value as { source?: string; type?: string };
  return message.source === HOST_SOURCE && typeof message.type === 'string';
}
