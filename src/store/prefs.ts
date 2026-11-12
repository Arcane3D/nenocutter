import { create } from 'zustand';

export type SurfacePreset = 'cream' | 'porcelain' | 'blush' | 'cocoa' | 'slate' | 'marble' | 'wood';
export type MaterialPreset = 'solid' | 'dual' | 'gradient' | 'glitter';

export interface SceneToggles {
  dough: boolean;
  cutout: boolean;
  cookie: boolean;
  extraCutter: boolean;
  ruler: boolean;
  coin: boolean;
  assembled: boolean;
  dimensions: boolean;
  edges: boolean;
}

interface PrefsState {
  theme: 'light' | 'dark';
  scene: SceneToggles;
  surface: SurfacePreset;
  material: MaterialPreset;
  layerLines: boolean;
  tourSeen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleScene: (key: keyof SceneToggles) => void;
  setSurface: (surface: SurfacePreset) => void;
  setMaterial: (material: MaterialPreset) => void;
  setLayerLines: (layerLines: boolean) => void;
  setTourSeen: (tourSeen: boolean) => void;
  setShortcutsOpen: (shortcutsOpen: boolean) => void;
  setSettingsOpen: (settingsOpen: boolean) => void;
}

const KEY = 'nenocutter-prefs';

function load(): Partial<PrefsState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PrefsState>;
  } catch {
    return {};
  }
}

const stored = typeof localStorage === 'undefined' ? {} : load();

export const usePrefs = create<PrefsState>((set, get) => ({
  theme: stored.theme ?? 'light',
  scene: {
    dough: true,
    cutout: false,
    cookie: false,
    extraCutter: false,
    ruler: false,
    coin: false,
    assembled: true,
    dimensions: true,
    edges: true,
    ...stored.scene,
  },
  surface: stored.surface ?? 'cream',
  material: stored.material ?? 'solid',
  layerLines: stored.layerLines ?? false,
  tourSeen: stored.tourSeen ?? false,
  shortcutsOpen: false,
  settingsOpen: false,
  setTheme: (theme) => {
    set({ theme });
    persist();
  },
  toggleScene: (key) => {
    set({ scene: { ...get().scene, [key]: !get().scene[key] } });
    persist();
  },
  setSurface: (surface) => {
    set({ surface });
    persist();
  },
  setMaterial: (material) => {
    set({ material, layerLines: material !== 'solid' ? get().layerLines : get().layerLines });
    persist();
  },
  setLayerLines: (layerLines) => {
    set({ layerLines });
    persist();
  },
  setTourSeen: (tourSeen) => {
    set({ tourSeen });
    persist();
  },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));

function persist() {
  const { theme, scene, surface, material, layerLines, tourSeen } = usePrefs.getState();
  localStorage.setItem(KEY, JSON.stringify({ theme, scene, surface, material, layerLines, tourSeen }));
}
