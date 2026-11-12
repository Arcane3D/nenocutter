import { create } from 'zustand';
import type { BuildResult, CutterSettings, Design, DesignPath, TraceOptions, Vec2 } from '../domain/types';
import { defaultSettings, defaultTraceOptions } from '../domain/defaults';
import { pathFrom, heartPoints } from '../geometry/shapes';
import { boundsOf, resizePaths, translatePoints } from '../geometry/path';
import { nowIso, uid } from '../lib/ids';

export type EditorTool = 'select' | 'pen' | 'freehand' | 'node' | 'rect' | 'ellipse' | 'star' | 'heart' | 'text';
export type StageView = 'draw' | 'preview' | 'split';

interface DesignState {
  design: Design;
  past: Design[];
  future: Design[];
  selected: string[];
  tool: EditorTool;
  view: StageView;
  zoom: number;
  panX: number;
  panY: number;
  snap: boolean;
  grid: boolean;
  trace: TraceOptions;
  result: BuildResult | null;
  building: boolean;
  buildLabel: string;
  pendingImport: DesignPath[] | null;
  replaceDesign: (design: Design, record?: boolean) => void;
  commit: (recipe: (design: Design) => Design) => void;
  patchSettings: (partial: Partial<CutterSettings>, record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  setSelected: (ids: string[]) => void;
  setTool: (tool: EditorTool) => void;
  setView: (view: StageView) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setSnap: (snap: boolean) => void;
  setGrid: (grid: boolean) => void;
  setTrace: (partial: Partial<TraceOptions>) => void;
  setResult: (result: BuildResult | null) => void;
  setBuilding: (building: boolean, label?: string) => void;
  setPendingImport: (paths: DesignPath[] | null) => void;
  moveSelected: (dx: number, dy: number, record?: boolean) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  setRole: (id: string, role: DesignPath['role']) => void;
  updatePathPoints: (id: string, points: Vec2[], record?: boolean) => void;
  addPath: (path: DesignPath) => void;
  resizeTo: (next: { width?: number; height?: number; longest?: number }) => void;
}

function starter(): Design {
  return {
    version: 1,
    id: 'welcome-heart',
    title: 'Welcome heart',
    paths: [pathFrom(heartPoints(0, 0, 75, 64), 'outline', 'welcome-heart-path')],
    settings: { ...defaultSettings },
    tags: ['starter'],
    updatedAt: nowIso(),
  };
}

function snapshot(design: Design): Design {
  return structuredClone(design);
}

export const useDesignStore = create<DesignState>((set, get) => ({
  design: starter(),
  past: [],
  future: [],
  selected: [],
  tool: 'select',
  view: 'split',
  zoom: 4,
  panX: 0,
  panY: 0,
  snap: true,
  grid: true,
  trace: { ...defaultTraceOptions },
  result: null,
  building: false,
  buildLabel: '',
  pendingImport: null,
  replaceDesign: (design, record = true) => {
    const current = get().design;
    set({
      design: { ...design, updatedAt: nowIso() },
      past: record ? [...get().past, snapshot(current)].slice(-60) : get().past,
      future: record ? [] : get().future,
      selected: [],
    });
  },
  commit: (recipe) => {
    const current = get().design;
    const next = recipe(snapshot(current));
    next.updatedAt = nowIso();
    set({
      design: next,
      past: [...get().past, snapshot(current)].slice(-60),
      future: [],
    });
  },
  patchSettings: (partial, record = false) => {
    if (record) {
      get().commit((design) => ({ ...design, settings: { ...design.settings, ...partial } }));
      return;
    }
    set({
      design: {
        ...get().design,
        settings: { ...get().design.settings, ...partial },
        updatedAt: nowIso(),
      },
    });
  },
  undo: () => {
    const { past, design, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ design: previous, past: past.slice(0, -1), future: [snapshot(design), ...future].slice(0, 60) });
  },
  redo: () => {
    const { past, design, future } = get();
    const next = future[0];
    if (!next) return;
    set({ design: next, future: future.slice(1), past: [...past, snapshot(design)].slice(-60) });
  },
  setSelected: (selected) => set({ selected }),
  setTool: (tool) => set({ tool }),
  setView: (view) => set({ view }),
  setZoom: (zoom) => set({ zoom: Math.min(40, Math.max(0.4, zoom)) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setSnap: (snap) => set({ snap }),
  setGrid: (grid) => set({ grid }),
  setTrace: (partial) => set({ trace: { ...get().trace, ...partial } }),
  setResult: (result) => set({ result, building: false }),
  setBuilding: (building, label = '') => set({ building, buildLabel: label }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  moveSelected: (dx, dy, record = true) => {
    if (!dx && !dy) return;
    const apply = (design: Design): Design => ({
      ...design,
      paths: design.paths.map((path) =>
        get().selected.includes(path.id)
          ? { ...path, source: undefined, points: translatePoints(path.points, dx, dy) }
          : path,
      ),
    });
    if (record) get().commit(apply);
    else set({ design: { ...apply(get().design), updatedAt: nowIso() } });
  },
  deleteSelected: () => {
    const ids = new Set(get().selected);
    if (!ids.size) return;
    get().commit((design) => ({ ...design, paths: design.paths.filter((path) => !ids.has(path.id)) }));
    set({ selected: [] });
  },
  duplicateSelected: () => {
    const ids = new Set(get().selected);
    const copies = get()
      .design.paths.filter((path) => ids.has(path.id))
      .map((path) => ({
        ...path,
        id: uid('copy'),
        source: undefined,
        points: translatePoints(path.points, 6, 6),
      }));
    if (!copies.length) return;
    get().commit((design) => ({ ...design, paths: [...design.paths, ...copies] }));
    set({ selected: copies.map((path) => path.id) });
  },
  setRole: (id, role) => {
    get().commit((design) => ({
      ...design,
      paths: design.paths.map((path) => (path.id === id ? { ...path, role } : path)),
    }));
  },
  updatePathPoints: (id, points, record = true) => {
    const apply = (design: Design): Design => ({
      ...design,
      paths: design.paths.map((path) => (path.id === id ? { ...path, points, source: undefined } : path)),
    });
    if (record) get().commit(apply);
    else set({ design: { ...apply(get().design), updatedAt: nowIso() } });
  },
  addPath: (path) => {
    get().commit((design) => ({ ...design, paths: [...design.paths, path] }));
    set({ selected: [path.id] });
  },
  resizeTo: (next) => {
    get().commit((design) => {
      const paths = resizePaths(design.paths, next, design.settings.lockAspect);
      const box = boundsOf(paths);
      return {
        ...design,
        paths,
        settings: {
          ...design.settings,
          longestSide: Math.max(box.width, box.height) || design.settings.longestSide,
        },
      };
    });
  },
}));

export function artworkSize(design: Design): { width: number; height: number; longest: number } {
  const box = boundsOf(design.paths);
  return { width: box.width, height: box.height, longest: Math.max(box.width, box.height) };
}
