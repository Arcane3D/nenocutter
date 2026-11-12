import { useMemo, useState, type ReactNode } from 'react';
import { TOOL_LABELS } from '../domain/defaults';
import { builtInPresets, loadCustomPresets, saveCustomPreset } from '../domain/presets';
import type { CutterSettings, ToolType } from '../domain/types';
import { formatEstimate } from '../geometry/estimate';
import { fromDisplay, toDisplay } from '../lib/units';
import { artworkSize, useDesignStore } from '../store/designStore';

let activeQuery = '';

const GUIDES: Record<string, string> = {
  tool: 'Pick what you are making. A set turns every disconnected shape into its own tool.',
  size: 'Sizes are the artwork’s real millimetres. The 3D label shows the printed part, including a mirrored copy or a grid.',
  blade: 'Blade depth is how far the wall rises. 12.5 mm is a comfortable everyday cutter.',
  sharp: 'A sharp edge tapers the inside of the wall to the tip width over the chamfer height.',
  fondant: 'Fondant uses a one-sided taper along the whole blade so the edge is kind to soft icing.',
  wall: 'Wall thickness is the structural blade. The minimum wall blocks export when the blade is thinner than this.',
  imprint: 'Imprint depth 0 sits flush. A few millimetres presses a line into the dough without cutting through.',
  base: 'The base is the wider foot you press on. Width is the foot’s full thickness, not extra on top of the blade.',
  grip: 'A stamp grip is a separate printed handle. Threaded or glue-chamfer, placed in the middle or at an X/Y you choose.',
  bars: 'Center bars bridge floating islands so they stay attached to the cutter.',
  outline: 'Auto outline wraps the artwork in a circle, rectangle, square, or convex hull and turns the art into an inner line.',
  mirror: 'Mirror flips the art. A mirrored pair keeps the original and adds a copy with a gap between them.',
  text: 'Wall text becomes cutting letters. A name plate is a tab with raised lettering. Both are free.',
  resolution: 'Resolution 100 is the everyday default. Lower it for a big sheet of shapes if a build feels heavy.',
  separate: 'Keep parts separate to get one 3MF object per cutter, stamp, or grip. Combine them when you want a single STL.',
  bed: 'The bed size is only a warning. It does not scale the model.',
  multi: 'Multi cutter repeats the shape in a grid. Spacing is the empty gap between neighbours.',
  preview: 'Surface, dough, ruler, and coin change only the picture. The exported mesh stays the same.',
};

export function SettingsPanel({ open = false }: { open?: boolean }) {
  const design = useDesignStore((state) => state.design);
  const patchSettings = useDesignStore((state) => state.patchSettings);
  const resizeTo = useDesignStore((state) => state.resizeTo);
  const result = useDesignStore((state) => state.result);
  const [query, setQuery] = useState('');
  const [guide, setGuide] = useState(GUIDES.tool);
  const [profiles, setProfiles] = useState(loadCustomPresets);
  const settings = design.settings;
  const size = artworkSize(design);
  const q = query.trim().toLowerCase();
  activeQuery = q;

  const presets = useMemo(() => [...builtInPresets, ...profiles], [profiles]);

  return (
    <aside className={`settings ${open ? 'open' : ''}`} aria-label="Cutter settings">
      <h2>Settings</h2>
      <input className="search" placeholder="Search settings" aria-label="Search settings" value={query} onChange={(event) => setQuery(event.target.value)} />
      <label className="field">
        Profile
        <select
          value=""
          onFocus={() => setGuide('Profiles remember a full set of cutter, stamp, and grip numbers.')}
          onChange={(event) => {
            const preset = presets.find((item) => item.id === event.target.value);
            if (preset) patchSettings(preset.settings, true);
          }}
        >
          <option value="">Choose a profile</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn"
        type="button"
        onClick={() => {
          const name = window.prompt('Name this profile');
          if (name) setProfiles(saveCustomPreset(name, settings));
        }}
      >
        Save profile
      </button>

      <details className="section" open>
        <summary>Tool</summary>
        <Field label="Tool" keywords="set cutter stamp" guide={GUIDES.tool} onGuide={setGuide}>
            <select value={settings.tool} onChange={(event) => patchSettings({ tool: event.target.value as ToolType }, true)}>
              {Object.entries(TOOL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
      </details>

      <details className="section" open>
        <summary>Size</summary>
        <Field label="Unit" keywords="millimetres inches" guide={GUIDES.size} onGuide={setGuide}>
            <select value={settings.unit} onChange={(event) => patchSettings({ unit: event.target.value as 'mm' | 'in' }, true)}>
              <option value="mm">Millimetres</option>
              <option value="in">Inches</option>
            </select>
          </Field>
        <LengthField label="Longest side" mm={size.longest || settings.longestSide} unit={settings.unit} guide={GUIDES.size} onGuide={setGuide} onChange={(mm) => resizeTo({ longest: mm })} />
        <LengthField label="Width" mm={size.width} unit={settings.unit} guide={GUIDES.size} onGuide={setGuide} onChange={(mm) => resizeTo({ width: mm })} />
        <LengthField label="Height" mm={size.height} unit={settings.unit} guide={GUIDES.size} onGuide={setGuide} onChange={(mm) => resizeTo({ height: mm })} />
        <label className="check">
          <input type="checkbox" checked={settings.lockAspect} onChange={(event) => patchSettings({ lockAspect: event.target.checked }, true)} />
          Lock aspect ratio
        </label>
      </details>

      <details className="section" open>
        <summary>Blade</summary>
        <LengthField label="Blade depth" mm={settings.bladeDepth} unit={settings.unit} guide={GUIDES.blade} onGuide={setGuide} onChange={(bladeDepth) => patchSettings({ bladeDepth })} />
        <LengthField label="Blade thickness" mm={settings.wallThickness} unit={settings.unit} guide={GUIDES.wall} onGuide={setGuide} onChange={(wallThickness) => patchSettings({ wallThickness })} />
        <LengthField label="Minimum wall" mm={settings.minimumWall} unit={settings.unit} guide={GUIDES.wall} onGuide={setGuide} onChange={(minimumWall) => patchSettings({ minimumWall })} />
        <label className="check">
          <input type="checkbox" checked={settings.sharpEdge} onChange={(event) => patchSettings({ sharpEdge: event.target.checked })} />
          Sharp edge
        </label>
        <LengthField label="Chamfer tip" mm={settings.tipWidth} unit={settings.unit} guide={GUIDES.sharp} onGuide={setGuide} onChange={(tipWidth) => patchSettings({ tipWidth })} />
        <LengthField label="Chamfer height" mm={settings.chamferHeight} unit={settings.unit} guide={GUIDES.sharp} onGuide={setGuide} onChange={(chamferHeight) => patchSettings({ chamferHeight })} />
        <Field label="Edge profile" guide={GUIDES.fondant} onGuide={setGuide}>
          <select value={settings.edgeProfile} onChange={(event) => patchSettings({ edgeProfile: event.target.value as CutterSettings['edgeProfile'] })}>
            <option value="sharp">Sharp chamfer</option>
            <option value="rounded">Rounded edge</option>
            <option value="fondant">Fondant one-sided taper</option>
          </select>
        </Field>
        <label className="check">
          <input type="checkbox" checked={settings.supportBlade} onChange={(event) => patchSettings({ supportBlade: event.target.checked })} />
          Extra support blade
        </label>
        <LengthField label="Support depth" mm={settings.supportBladeDepth} unit={settings.unit} guide="A second, shorter wall inside the cutter for tall or delicate outlines." onGuide={setGuide} onChange={(supportBladeDepth) => patchSettings({ supportBladeDepth })} />
        <LengthField label="Support thickness" mm={settings.supportBladeThickness} unit={settings.unit} guide="Thickness of the inner support wall." onGuide={setGuide} onChange={(supportBladeThickness) => patchSettings({ supportBladeThickness })} />
      </details>

      <details className="section">
        <summary>Imprint</summary>
        <LengthField label="Imprint depth" mm={settings.imprintDepth} unit={settings.unit} guide={GUIDES.imprint} onGuide={setGuide} onChange={(imprintDepth) => patchSettings({ imprintDepth })} />
        <LengthField label="Imprint width" mm={settings.imprintWidth} unit={settings.unit} guide={GUIDES.imprint} onGuide={setGuide} onChange={(imprintWidth) => patchSettings({ imprintWidth })} />
        <Field label="Depth curve" guide="Flat, dome, round, or chamfer changes the top of an imprint rib." onGuide={setGuide}>
          <select value={settings.imprintCurve} onChange={(event) => patchSettings({ imprintCurve: event.target.value as CutterSettings['imprintCurve'] })}>
            <option value="flat">Flat</option>
            <option value="dome">Dome</option>
            <option value="round">Round</option>
            <option value="chamfer">Chamfer</option>
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={settings.imprintEdgesOnly} onChange={(event) => patchSettings({ imprintEdgesOnly: event.target.checked })} /> Edges only</label>
        <label className="check"><input type="checkbox" checked={settings.imprintInvert} onChange={(event) => patchSettings({ imprintInvert: event.target.checked })} /> Invert imprint</label>
        <label className="check"><input type="checkbox" checked={settings.deleteOuterEdge} onChange={(event) => patchSettings({ deleteOuterEdge: event.target.checked })} /> Delete outer edge</label>
      </details>

      <details className="section">
        <summary>Base and handle</summary>
        <LengthField label="Base height" mm={settings.baseHeight} unit={settings.unit} guide={GUIDES.base} onGuide={setGuide} onChange={(baseHeight) => patchSettings({ baseHeight })} />
        <LengthField label="Base width" mm={settings.baseWidth} unit={settings.unit} guide={GUIDES.base} onGuide={setGuide} onChange={(baseWidth) => patchSettings({ baseWidth })} />
        <Field label="Handle shape" guide="Rectangular, chamfered, or round corners on the base foot." onGuide={setGuide}>
          <select value={settings.handleShape} onChange={(event) => patchSettings({ handleShape: event.target.value as CutterSettings['handleShape'] })}>
            <option value="round">Round</option>
            <option value="chamfered">Chamfered</option>
            <option value="rectangular">Rectangular</option>
          </select>
        </Field>
        <label className="check"><input type="checkbox" checked={settings.pressHandle} onChange={(event) => patchSettings({ pressHandle: event.target.checked })} /> Press handle</label>
      </details>

      <details className="section">
        <summary>Stamp and grip</summary>
        <LengthField label="Stamp back" mm={settings.stampBack} unit={settings.unit} guide="Thickness of the stamp backing plate." onGuide={setGuide} onChange={(stampBack) => patchSettings({ stampBack })} />
        <LengthField label="Stamp imprint depth" mm={settings.stampRelief} unit={settings.unit} guide="How far the stamp face stands proud of the back, or how deep a deboss cuts." onGuide={setGuide} onChange={(stampRelief) => patchSettings({ stampRelief })} />
        <LengthField label="Cutter tolerance" mm={settings.cutterTolerance} unit={settings.unit} guide="Extra clearance so a matched stamp fits inside the cutter." onGuide={setGuide} onChange={(cutterTolerance) => patchSettings({ cutterTolerance })} />
        <Field label="Stamp face" guide="Emboss raises the design. Deboss presses it into the back." onGuide={setGuide}>
          <select value={settings.stampMode} onChange={(event) => patchSettings({ stampMode: event.target.value as CutterSettings['stampMode'] })}>
            <option value="emboss">Emboss</option>
            <option value="deboss">Deboss</option>
          </select>
        </Field>
        <Field label="Stamp grip" guide={GUIDES.grip} onGuide={setGuide}>
          <select value={settings.stampGrip} onChange={(event) => patchSettings({ stampGrip: event.target.value as CutterSettings['stampGrip'] })}>
            <option value="none">None</option>
            <option value="threaded">Threaded</option>
            <option value="glue-chamfer">Glue chamfer</option>
          </select>
        </Field>
        <Field label="Grip placement" guide="Auto uses the middle of the stamp. Manual uses the X and Y offsets." onGuide={setGuide}>
          <select value={settings.gripPlacement} onChange={(event) => patchSettings({ gripPlacement: event.target.value as CutterSettings['gripPlacement'] })}>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <LengthField label="Grip X" mm={settings.gripX} unit={settings.unit} guide="Manual offset from the stamp center." onGuide={setGuide} onChange={(gripX) => patchSettings({ gripX })} />
        <LengthField label="Grip Y" mm={settings.gripY} unit={settings.unit} guide="Manual offset from the stamp center." onGuide={setGuide} onChange={(gripY) => patchSettings({ gripY })} />
        <LengthField label="Socket depth" mm={settings.socketDepth} unit={settings.unit} guide={GUIDES.grip} onGuide={setGuide} onChange={(socketDepth) => patchSettings({ socketDepth })} />
        <LengthField label="Clearance" mm={settings.gripClearance} unit={settings.unit} guide="Gap between the peg and the socket so a printed thread can start." onGuide={setGuide} onChange={(gripClearance) => patchSettings({ gripClearance })} />
        <LengthField label="Thread diameter" mm={settings.threadDiameter} unit={settings.unit} guide={GUIDES.grip} onGuide={setGuide} onChange={(threadDiameter) => patchSettings({ threadDiameter })} />
        <LengthField label="Grip height" mm={settings.gripHeight} unit={settings.unit} guide={GUIDES.grip} onGuide={setGuide} onChange={(gripHeight) => patchSettings({ gripHeight })} />
        <LengthField label="Bottom rounding" mm={settings.gripBottomRadius} unit={settings.unit} guide="Rounds the end of the handle that sits on the print bed." onGuide={setGuide} onChange={(gripBottomRadius) => patchSettings({ gripBottomRadius })} />
      </details>

      <details className="section">
        <summary>Connectors</summary>
        <label className="check"><input type="checkbox" checked={settings.centerBar} onChange={(event) => patchSettings({ centerBar: event.target.checked })} /> Center bars</label>
        <Field label="Bar angle" guide={GUIDES.bars} onGuide={setGuide}>
          <input type="number" value={settings.centerBarAngle} onChange={(event) => patchSettings({ centerBarAngle: Number(event.target.value) })} />
        </Field>
        <LengthField label="Bar position" mm={settings.centerBarOffset} unit={settings.unit} guide={GUIDES.bars} onGuide={setGuide} onChange={(centerBarOffset) => patchSettings({ centerBarOffset })} />
        <LengthField label="Bar width" mm={settings.centerBarWidth} unit={settings.unit} guide={GUIDES.bars} onGuide={setGuide} onChange={(centerBarWidth) => patchSettings({ centerBarWidth })} />
        <Field label="Bar count" guide={GUIDES.bars} onGuide={setGuide}>
          <input type="number" min={1} max={6} value={settings.centerBarCount} onChange={(event) => patchSettings({ centerBarCount: Number(event.target.value) })} />
        </Field>
        <Field label="Auto outline" guide={GUIDES.outline} onGuide={setGuide}>
          <select value={settings.autoOutline} onChange={(event) => patchSettings({ autoOutline: event.target.value as CutterSettings['autoOutline'] })}>
            <option value="none">None</option>
            <option value="circle">Circle</option>
            <option value="rect">Rectangle</option>
            <option value="square">Square</option>
            <option value="hull">Hull</option>
          </select>
        </Field>
        <LengthField label="Outline padding" mm={settings.outlinePadding} unit={settings.unit} guide={GUIDES.outline} onGuide={setGuide} onChange={(outlinePadding) => patchSettings({ outlinePadding })} />
        <label className="check"><input type="checkbox" checked={settings.mirror} onChange={(event) => patchSettings({ mirror: event.target.checked })} /> Mirror</label>
        <label className="check"><input type="checkbox" checked={settings.mirrorPair} onChange={(event) => patchSettings({ mirrorPair: event.target.checked })} /> Mirrored pair</label>
        <LengthField label="Pair spacing" mm={settings.mirrorGap} unit={settings.unit} guide={GUIDES.mirror} onGuide={setGuide} onChange={(mirrorGap) => patchSettings({ mirrorGap })} />
      </details>

      <details className="section">
        <summary>Text</summary>
        <Field label="Wall text" guide={GUIDES.text} onGuide={setGuide}>
          <input value={settings.wallText} onChange={(event) => patchSettings({ wallText: event.target.value })} />
        </Field>
        <LengthField label="Wall text height" mm={settings.wallTextHeight} unit={settings.unit} guide={GUIDES.text} onGuide={setGuide} onChange={(wallTextHeight) => patchSettings({ wallTextHeight })} />
        <label className="check"><input type="checkbox" checked={settings.namePlate} onChange={(event) => patchSettings({ namePlate: event.target.checked })} /> Name plate</label>
        <Field label="Name plate text" guide={GUIDES.text} onGuide={setGuide}>
          <input value={settings.namePlateText} onChange={(event) => patchSettings({ namePlateText: event.target.value })} />
        </Field>
        <LengthField label="Name plate thickness" mm={settings.namePlateThickness} unit={settings.unit} guide={GUIDES.text} onGuide={setGuide} onChange={(namePlateThickness) => patchSettings({ namePlateThickness })} />
        <LengthField label="Raised text" mm={settings.raisedText} unit={settings.unit} guide={GUIDES.text} onGuide={setGuide} onChange={(raisedText) => patchSettings({ raisedText })} />
      </details>

      <details className="section">
        <summary>Layout and print</summary>
        <Field label="Resolution" guide={GUIDES.resolution} onGuide={setGuide}>
          <input type="range" min={16} max={160} value={settings.resolution} onChange={(event) => patchSettings({ resolution: Number(event.target.value) })} />
        </Field>
        <label className="check"><input type="checkbox" checked={settings.separateParts} onChange={(event) => patchSettings({ separateParts: event.target.checked })} /> Keep parts separate</label>
        <Field label="Rows" guide={GUIDES.multi} onGuide={setGuide}><input type="number" min={1} max={8} value={settings.multiRows} onChange={(event) => patchSettings({ multiRows: Number(event.target.value) })} /></Field>
        <Field label="Columns" guide={GUIDES.multi} onGuide={setGuide}><input type="number" min={1} max={8} value={settings.multiCols} onChange={(event) => patchSettings({ multiCols: Number(event.target.value) })} /></Field>
        <LengthField label="Grid spacing" mm={settings.multiSpacing} unit={settings.unit} guide={GUIDES.multi} onGuide={setGuide} onChange={(multiSpacing) => patchSettings({ multiSpacing })} />
        <LengthField label="Bed size" mm={settings.bedSize} unit={settings.unit} guide={GUIDES.bed} onGuide={setGuide} onChange={(bedSize) => patchSettings({ bedSize })} />
        <Field label="Bed preset" guide={GUIDES.bed} onGuide={setGuide}>
          <select value={settings.bedSize} onChange={(event) => patchSettings({ bedSize: Number(event.target.value) }, true)}>
            {[120, 180, 220, 256, 300].map((size) => (
              <option key={size} value={size}>{size} mm</option>
            ))}
          </select>
        </Field>
        <LengthField label="Topper pin" mm={settings.topperPinLength} unit={settings.unit} guide="Length of the stick on a cake topper." onGuide={setGuide} onChange={(topperPinLength) => patchSettings({ topperPinLength })} />
        <LengthField label="Roller diameter" mm={settings.rollerDiameter} unit={settings.unit} guide="Diameter of the texture roller." onGuide={setGuide} onChange={(rollerDiameter) => patchSettings({ rollerDiameter })} />
        <LengthField label="Cake pop diameter" mm={settings.cakepopDiameter} unit={settings.unit} guide="Cavity diameter of the two-part mold." onGuide={setGuide} onChange={(cakepopDiameter) => patchSettings({ cakepopDiameter })} />
        <p>{result ? formatEstimate(result.volume) : 'Estimate appears after the preview builds.'}</p>
      </details>
      <div className="guide" role="note">
        <strong>Guide. </strong>
        {guide}
      </div>
    </aside>
  );
}

function Field({
  label,
  guide,
  keywords = '',
  onGuide,
  children,
}: {
  label: string;
  guide: string;
  keywords?: string;
  onGuide: (guide: string) => void;
  children: ReactNode;
}) {
  const haystack = `${label} ${keywords} ${guide}`.toLowerCase();
  if (activeQuery && !haystack.includes(activeQuery)) return null;
  return (
    <label className="field" onFocus={() => onGuide(guide)} onMouseEnter={() => onGuide(guide)}>
      {label}
      {children}
    </label>
  );
}

function LengthField({
  label,
  mm,
  unit,
  guide,
  onGuide,
  onChange,
}: {
  label: string;
  mm: number;
  unit: 'mm' | 'in';
  guide: string;
  onGuide: (guide: string) => void;
  onChange: (mm: number) => void;
}) {
  const shown = Number.isFinite(mm) ? toDisplay(mm, unit) : 0;
  return (
    <Field label={`${label} (${unit})`} guide={guide} onGuide={onGuide}>
      <input
        type="number"
        step={unit === 'in' ? 0.01 : 0.1}
        value={Number(shown.toFixed(unit === 'in' ? 3 : 2))}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(fromDisplay(next, unit));
        }}
      />
    </Field>
  );
}

