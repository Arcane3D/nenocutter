import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { defaultSettings } from '../domain/defaults';
import type { CutterSettings, Design, DesignPath } from '../domain/types';
import { round } from './units';

interface CompactPath {
  id: string;
  pts: [number, number][];
  closed?: boolean;
  role?: DesignPath['role'];
}

interface CompactDesign {
  v: 1;
  title: string;
  paths: CompactPath[];
  settings?: Partial<CutterSettings>;
  tags?: string[];
}

function diffSettings(settings: CutterSettings): Partial<CutterSettings> {
  const diff: Partial<CutterSettings> = {};
  const entries = Object.entries(settings) as [keyof CutterSettings, CutterSettings[keyof CutterSettings]][];
  for (const [key, value] of entries) {
    if (value !== defaultSettings[key]) diff[key] = value as never;
  }
  return diff;
}

export function encodeShare(design: Design): string {
  const compact: CompactDesign = {
    v: 1,
    title: design.title,
    paths: design.paths.map((path) => ({
      id: path.id,
      pts: path.points.map((point) => [round(point.x, 2), round(point.y, 2)]),
      closed: path.closed ? undefined : false,
      role: path.role === 'outline' ? undefined : path.role,
    })),
    settings: diffSettings(design.settings),
    tags: design.tags.length ? design.tags : undefined,
  };
  const zipped = zipSync({ d: strToU8(JSON.stringify(compact)) }, { level: 9 });
  return base64Url(zipped);
}

export function decodeShare(payload: string): Design {
  const bytes = base64UrlDecode(payload);
  const files = unzipSync(bytes);
  const json = strFromU8(files.d);
  const compact = JSON.parse(json) as CompactDesign;
  if (compact.v !== 1 || !Array.isArray(compact.paths)) throw new Error('This share link is not a Nenocutter design.');
  const paths: DesignPath[] = compact.paths.map((path) => ({
    id: path.id,
    points: path.pts.map(([x, y]) => ({ x, y })),
    closed: path.closed !== false,
    role: path.role ?? 'outline',
  }));
  return {
    version: 1,
    id: `share-${compact.title}`,
    title: compact.title || 'Shared design',
    paths,
    settings: { ...defaultSettings, ...compact.settings },
    tags: compact.tags ?? [],
    updatedAt: new Date().toISOString(),
  };
}

function base64Url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
