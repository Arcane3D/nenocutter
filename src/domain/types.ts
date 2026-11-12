export type ToolType =
  | 'cutter'
  | 'imprint'
  | 'stamp'
  | 'cutter-stamp'
  | 'cutter-set'
  | 'imprint-set'
  | 'stamp-set'
  | 'combo-set'
  | 'multi'
  | 'stencil'
  | 'topper'
  | 'practice'
  | 'roller'
  | 'sandwich'
  | 'cakepop';

export type LengthUnit = 'mm' | 'in';

export type EdgeProfile = 'sharp' | 'rounded' | 'fondant';

export type HandleShape = 'rectangular' | 'chamfered' | 'round';

export type DepthCurve = 'flat' | 'dome' | 'round' | 'chamfer';

export type AutoOutline = 'none' | 'circle' | 'rect' | 'square' | 'hull';

export type StampMode = 'emboss' | 'deboss';

export type StampGrip = 'none' | 'threaded' | 'glue-chamfer';

export type GripPlacement = 'auto' | 'manual';

export type PathRole = 'outline' | 'hole' | 'imprint' | 'support';

export interface Vec2 {
  x: number;
  y: number;
}

export type PathSource =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; cr: number }
  | { kind: 'star'; cx: number; cy: number; outer: number; inner: number; points: number }
  | { kind: 'heart'; cx: number; cy: number; size: number }
  | { kind: 'text'; text: string; x: number; y: number; height: number };

export interface DesignPath {
  id: string;
  points: Vec2[];
  closed: boolean;
  role: PathRole;
  source?: PathSource;
}

export interface CutterSettings {
  tool: ToolType;
  unit: LengthUnit;
  longestSide: number;
  lockAspect: boolean;

  bladeDepth: number;
  wallThickness: number;
  sharpEdge: boolean;
  tipWidth: number;
  chamferHeight: number;
  edgeProfile: EdgeProfile;
  supportBlade: boolean;
  supportBladeDepth: number;
  supportBladeThickness: number;
  minimumWall: number;

  imprintDepth: number;
  imprintWidth: number;
  imprintCurve: DepthCurve;
  imprintInvert: boolean;
  imprintEdgesOnly: boolean;
  deleteOuterEdge: boolean;
  innerAsImprint: boolean;

  baseHeight: number;
  baseWidth: number;
  handleShape: HandleShape;
  pressHandle: boolean;

  stampBack: number;
  stampRelief: number;
  stampMode: StampMode;
  cutterTolerance: number;
  stampGrip: StampGrip;
  gripPlacement: GripPlacement;
  gripX: number;
  gripY: number;
  socketDepth: number;
  gripClearance: number;
  threadDiameter: number;
  gripHeight: number;
  gripBottomRadius: number;

  centerBar: boolean;
  centerBarAngle: number;
  centerBarOffset: number;
  centerBarWidth: number;
  centerBarCount: number;
  centerBarSpacing: number;

  autoOutline: AutoOutline;
  outlinePadding: number;

  mirror: boolean;
  mirrorPair: boolean;
  mirrorGap: number;

  wallText: string;
  wallTextHeight: number;
  namePlate: boolean;
  namePlateText: string;
  namePlateThickness: number;
  raisedText: number;

  resolution: number;
  separateParts: boolean;

  multiRows: number;
  multiCols: number;
  multiSpacing: number;

  topperPinLength: number;
  topperPinWidth: number;
  topperPinShape: 'rect' | 'round';

  rollerDiameter: number;
  rollerLength: number;
  cakepopDiameter: number;
  bedSize: number;
}

export interface Design {
  version: 1;
  id: string;
  title: string;
  paths: DesignPath[];
  settings: CutterSettings;
  tags: string[];
  updatedAt: string;
}

export interface LibraryRecord {
  id: string;
  title: string;
  tags: string[];
  favorite: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnail: string | null;
  document: Design;
  remoteId?: string | null;
}

export type PartRole =
  | 'cutter'
  | 'stamp'
  | 'grip'
  | 'cookie'
  | 'stencil'
  | 'topper'
  | 'mold'
  | 'roller'
  | 'plate';

export interface GripAssembly {
  kind: 'grip';
  cx: number;
  cy: number;
  height: number;
  socketX: number;
  socketY: number;
  socketTop: number;
  socketDepth: number;
}

export interface BuiltPart {
  name: string;
  role: PartRole;
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
  assembly?: GripAssembly;
}

export interface BuildResult {
  parts: BuiltPart[];
  warnings: string[];
  errors: string[];
  status: 'ok' | 'empty' | 'error';
  volume: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  dimensions: { width: number; height: number; depth: number };
}

export interface BuildProgress {
  index: number;
  total: number;
  label: string;
}

export type TraceMode = 'filled' | 'line';

export interface TraceOptions {
  threshold: number;
  smoothing: number;
  despeckle: number;
  invert: boolean;
  mode: TraceMode;
  brightness: number;
  contrast: number;
}

export interface SettingsProfile {
  id: string;
  name: string;
  settings: CutterSettings;
  builtIn?: boolean;
}
