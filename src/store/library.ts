import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Design, LibraryRecord } from '../domain/types';
import { nowIso, uid } from '../lib/ids';

const DB = 'nenocutter';

interface Schema extends DBSchema {
  designs: { key: string; value: LibraryRecord };
  kv: { key: string; value: unknown };
}

let database: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!database) {
    database = openDB<Schema>(DB, 1, {
      upgrade(database) {
        database.createObjectStore('designs', { keyPath: 'id' });
        database.createObjectStore('kv');
      },
    });
  }
  return database;
}

export async function listLibrary(): Promise<LibraryRecord[]> {
  const all = await (await db()).getAll('designs');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLibraryRecord(id: string): Promise<LibraryRecord | undefined> {
  return (await db()).get('designs', id);
}

export async function upsertLibrary(record: LibraryRecord): Promise<void> {
  await (await db()).put('designs', record);
}

export async function saveDesign(design: Design, thumbnail: string | null, existingId?: string): Promise<LibraryRecord> {
  const id = existingId ?? design.id ?? uid('design');
  const current = await getLibraryRecord(id);
  const record: LibraryRecord = {
    id,
    title: design.title,
    tags: design.tags,
    favorite: current?.favorite ?? false,
    trashedAt: null,
    createdAt: current?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    thumbnail,
    document: { ...design, id, updatedAt: nowIso() },
    remoteId: current?.remoteId ?? null,
  };
  await upsertLibrary(record);
  await (await db()).put('kv', id, 'current-id');
  return record;
}

export async function rememberCurrent(design: Design): Promise<void> {
  await (await db()).put('kv', design, 'current');
}

export async function loadCurrent(): Promise<Design | null> {
  const value = await (await db()).get('kv', 'current');
  return (value as Design | undefined) ?? null;
}

export function thumbnailOf(paths: Design['paths']): string | null {
  if (typeof document === 'undefined' || !paths.length) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff6ea';
  ctx.fillRect(0, 0, 240, 180);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    for (const point of path.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = 150 / span;
  const ox = 120 - ((minX + maxX) / 2) * scale;
  const oy = 90 + ((minY + maxY) / 2) * scale;
  ctx.translate(ox, oy);
  ctx.scale(scale, -scale);
  ctx.lineWidth = 1.4 / scale;
  ctx.strokeStyle = '#6a4632';
  ctx.fillStyle = 'rgba(244, 214, 184, 0.85)';
  for (const path of paths) {
    if (path.points.length < 2) continue;
    ctx.beginPath();
    path.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    if (path.closed) ctx.closePath();
    if (path.role !== 'hole') ctx.fill();
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
}
