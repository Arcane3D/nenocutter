import type { CutterSettings, TraceOptions } from './types';

/** Defaults chosen to match a sturdy everyday cutter and a fitted stamp. */
export const defaultSettings: CutterSettings = {
  tool: 'cutter',
  unit: 'mm',
  longestSide: 75,
  lockAspect: true,

  bladeDepth: 12.5,
  wallThickness: 0.8,
  sharpEdge: true,
  tipWidth: 0.4,
  chamferHeight: 2,
  edgeProfile: 'sharp',
  supportBlade: false,
  supportBladeDepth: 8,
  supportBladeThickness: 0.8,
  minimumWall: 0.5,

  imprintDepth: 3,
  imprintWidth: 0.8,
  imprintCurve: 'flat',
  imprintInvert: false,
  imprintEdgesOnly: true,
  deleteOuterEdge: false,
  innerAsImprint: true,

  baseHeight: 3.5,
  baseWidth: 4,
  handleShape: 'round',
  pressHandle: false,

  stampBack: 5.5,
  stampRelief: 3,
  stampMode: 'emboss',
  cutterTolerance: 0.9,
  stampGrip: 'none',
  gripPlacement: 'auto',
  gripX: 0,
  gripY: 0,
  socketDepth: 4,
  gripClearance: 0.2,
  threadDiameter: 15,
  gripHeight: 35,
  gripBottomRadius: 4,

  centerBar: false,
  centerBarAngle: 0,
  centerBarOffset: 0,
  centerBarWidth: 1.2,
  centerBarCount: 1,
  centerBarSpacing: 8,

  autoOutline: 'none',
  outlinePadding: 3,

  mirror: false,
  mirrorPair: false,
  mirrorGap: 10,

  wallText: '',
  wallTextHeight: 8,
  namePlate: false,
  namePlateText: '',
  namePlateThickness: 3.5,
  raisedText: 0.6,

  resolution: 100,
  separateParts: true,

  multiRows: 2,
  multiCols: 2,
  multiSpacing: 4,

  topperPinLength: 40,
  topperPinWidth: 4,
  topperPinShape: 'rect',

  rollerDiameter: 32,
  rollerLength: 80,
  cakepopDiameter: 28,
  bedSize: 220,
};

export const defaultTraceOptions: TraceOptions = {
  threshold: 128,
  smoothing: 0.8,
  despeckle: 12,
  invert: false,
  mode: 'filled',
  brightness: 0,
  contrast: 0,
};

export const TOOL_LABELS: Record<CutterSettings['tool'], string> = {
  cutter: 'Cutter',
  imprint: 'Imprint cutter',
  stamp: 'Stamp',
  'cutter-stamp': 'Cutter + stamp',
  'cutter-set': 'Cutter set',
  'imprint-set': 'Imprint set',
  'stamp-set': 'Stamp set',
  'combo-set': 'Cutter + stamp set',
  multi: 'Multi cutter',
  stencil: 'Stencil',
  topper: 'Cake topper',
  practice: 'Practice cookie',
  roller: 'Texture roller',
  sandwich: 'Sandwich cutter',
  cakepop: 'Cake pop mold',
};

export function isSetTool(tool: CutterSettings['tool']): boolean {
  return tool.endsWith('-set');
}
