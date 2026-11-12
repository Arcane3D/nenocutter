import type { CutterSettings, SettingsProfile } from './types';
import { defaultSettings } from './defaults';

export const builtInPresets: SettingsProfile[] = [
  { id: 'everyday', name: 'Everyday cutter', builtIn: true, settings: { ...defaultSettings } },
  {
    id: 'sturdy',
    name: 'Sturdy PLA',
    builtIn: true,
    settings: {
      ...defaultSettings,
      wallThickness: 1.2,
      baseWidth: 5,
      tipWidth: 0.45,
      minimumWall: 0.8,
    },
  },
  {
    id: 'fondant',
    name: 'Fondant taper',
    builtIn: true,
    settings: {
      ...defaultSettings,
      edgeProfile: 'fondant',
      wallThickness: 1.4,
      bladeDepth: 18,
      tipWidth: 0.35,
      baseHeight: 4,
    },
  },
  {
    id: 'imprint',
    name: 'Imprint details',
    builtIn: true,
    settings: {
      ...defaultSettings,
      tool: 'imprint',
      imprintDepth: 3,
      imprintWidth: 0.8,
      imprintCurve: 'round',
      imprintEdgesOnly: true,
    },
  },
  {
    id: 'stamp',
    name: 'Matched stamp',
    builtIn: true,
    settings: {
      ...defaultSettings,
      tool: 'cutter-stamp',
      stampBack: 5.5,
      stampRelief: 3,
      cutterTolerance: 0.9,
      stampGrip: 'threaded',
    },
  },
  {
    id: 'mini',
    name: 'Mini multi',
    builtIn: true,
    settings: {
      ...defaultSettings,
      tool: 'multi',
      longestSide: 40,
      multiRows: 3,
      multiCols: 3,
      multiSpacing: 3,
      bladeDepth: 10,
    },
  },
];

const KEY = 'nenocutter-profiles';

export function loadCustomPresets(): SettingsProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SettingsProfile[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPreset(name: string, settings: CutterSettings): SettingsProfile[] {
  const next = [...loadCustomPresets().filter((preset) => preset.name !== name), { id: `custom-${Date.now()}`, name, settings }];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
