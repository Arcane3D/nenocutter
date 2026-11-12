import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../auth/supabase';
import { createShare, pushDesign } from '../auth/cloud';
import { TOOL_LABELS } from '../domain/defaults';
import type { Design, DesignPath, ToolType } from '../domain/types';
import { isHostCommand, postToParent } from '../embed/protocol';
import { booleanPaths } from '../geometry/boolean';
import { assessPrint } from '../geometry/printability';
import { textPaths, loadCutterFont } from '../geometry/text';
import { boundsOf, topLevelGroups, translatePoints } from '../geometry/path';
import { requestBuild } from '../geometry/workerClient';
import { encodeOBJ } from '../export/obj';
import { encodePDF } from '../export/pdf';
import { encodeSTL } from '../export/stl';
import { encode3MF } from '../export/threemf';
import { encodeShare } from '../lib/shareCodec';
import { pathsFromImageFile } from '../trace/fromBitmap';
import { saveDesign, thumbnailOf, loadCurrent, rememberCurrent } from '../store/library';
import { usePrefs } from '../store/prefs';
import { useDesignStore, type EditorTool } from '../store/designStore';
import { Canvas2D, fitCanvas } from './Canvas2D';
import { Preview3D, SceneTogglesPanel } from './Preview3D';
import { SettingsPanel } from './SettingsPanel';

const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'pen', label: 'Pen' },
  { id: 'freehand', label: 'Draw' },
  { id: 'node', label: 'Nodes' },
  { id: 'rect', label: 'Rect' },
  { id: 'ellipse', label: 'Oval' },
  { id: 'star', label: 'Star' },
  { id: 'heart', label: 'Heart' },
  { id: 'text', label: 'Text' },
];

export function Designer({ embed = false }: { embed?: boolean }) {
  const design = useDesignStore((state) => state.design);
  const result = useDesignStore((state) => state.result);
  const building = useDesignStore((state) => state.building);
  const buildLabel = useDesignStore((state) => state.buildLabel);
  const view = useDesignStore((state) => state.view);
  const tool = useDesignStore((state) => state.tool);
  const pending = useDesignStore((state) => state.pendingImport);
  const trace = useDesignStore((state) => state.trace);
  const setTool = useDesignStore((state) => state.setTool);
  const setView = useDesignStore((state) => state.setView);
  const undo = useDesignStore((state) => state.undo);
  const redo = useDesignStore((state) => state.redo);
  const setResult = useDesignStore((state) => state.setResult);
  const setBuilding = useDesignStore((state) => state.setBuilding);
  const replaceDesign = useDesignStore((state) => state.replaceDesign);
  const patchSettings = useDesignStore((state) => state.patchSettings);
  const commit = useDesignStore((state) => state.commit);
  const deleteSelected = useDesignStore((state) => state.deleteSelected);
  const duplicateSelected = useDesignStore((state) => state.duplicateSelected);
  const selected = useDesignStore((state) => state.selected);
  const setPending = useDesignStore((state) => state.setPendingImport);
  const setTrace = useDesignStore((state) => state.setTrace);
  const theme = usePrefs((state) => state.theme);
  const setTheme = usePrefs((state) => state.setTheme);
  const scene = usePrefs((state) => state.scene);
  const settingsOpen = usePrefs((state) => state.settingsOpen);
  const setSettingsOpen = usePrefs((state) => state.setSettingsOpen);
  const tourSeen = usePrefs((state) => state.tourSeen);
  const setTourSeen = usePrefs((state) => state.setTourSeen);
  const shortcutsOpen = usePrefs((state) => state.shortcutsOpen);
  const setShortcutsOpen = usePrefs((state) => state.setShortcutsOpen);
  const [exportOpen, setExportOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [textValue, setTextValue] = useState('Neno');
  const [message, setMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const report = assessPrint(design.settings, result);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let cancel = false;
    const queued = sessionStorage.getItem('nenocutter-open');
    if (queued) {
      sessionStorage.removeItem('nenocutter-open');
      replaceDesign(JSON.parse(queued) as Design, false);
      return;
    }
    loadCurrent().then((saved) => {
      if (!cancel && saved && useDesignStore.getState().design.id === 'welcome-heart') replaceDesign(saved, false);
    });
    return () => {
      cancel = true;
    };
  }, [replaceDesign]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void rememberCurrent(design);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [design]);

  useEffect(() => {
    setBuilding(true, 'Building…');
    const cancel = requestBuild(design, {
      onProgress: (progress) => setBuilding(true, progress.label),
      onResult: (next) => setResult(next),
      onError: (error) => {
        setBuilding(false, '');
        setMessage(error);
      },
    });
    return cancel;
  }, [design, setBuilding, setResult]);

  useEffect(() => {
    if (!embed) return;
    postToParent({ source: 'nenocutter', type: 'ready', version: 1 });
  }, [embed]);

  useEffect(() => {
    if (!embed) return;
    const timer = window.setTimeout(() => {
      postToParent({ source: 'nenocutter', type: 'design-changed', design });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [design, embed]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isHostCommand(event.data)) return;
      if (event.data.type === 'load-design') replaceDesign(event.data.design, true);
      if (event.data.type === 'set-settings') patchSettings(event.data.settings, true);
      if (event.data.type === 'export') void runExport(event.data.format, true);
    }
    function onPaste(event: ClipboardEvent) {
      const file = event.clipboardData?.files?.[0];
      if (file) openFile(file);
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (meta && event.key.toLowerCase() === 'y') redo();
      else if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persist();
      } else if (meta && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setExportOpen(true);
      } else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected();
      else if (event.key === '?') setShortcutsOpen(true);
      else if (event.key.toLowerCase() === 'v') setTool('select');
      else if (event.key.toLowerCase() === 'p') setTool('pen');
      else if (event.key.toLowerCase() === 'f') setTool('freehand');
      else if (event.key.toLowerCase() === 'n') setTool('node');
    }
    window.addEventListener('message', onMessage);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  });

  function openFile(file: File) {
    if (file.type.includes('svg') || file.name.toLowerCase().endsWith('.svg')) void ingest(file);
    else setStudioFile(file);
  }

  async function ingest(file: File) {
    try {
      const paths = await pathsFromImageFile(file, trace, design.settings.longestSide || 75);
      if (!paths.length) {
        setMessage('No shapes were found in that file.');
        return;
      }
      const groups = topLevelGroups(paths);
      if (groups.length > 1) setPending(paths);
      else acceptPaths(paths, 'cutter');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The file could not be read.');
    }
  }

  function acceptPaths(paths: DesignPath[], toolType: ToolType) {
    commit((current) => ({
      ...current,
      title: current.title === 'Welcome heart' ? 'Imported design' : current.title,
      paths,
      settings: { ...current.settings, tool: toolType },
    }));
    setPending(null);
  }

  function chooseImport(choice: 'largest' | 'all' | ToolType) {
    if (!pending) return;
    const groups = topLevelGroups(pending);
    if (choice === 'largest') {
      const best = groups.slice().sort((a, b) => areaOf(b[0]) - areaOf(a[0]))[0] ?? pending;
      acceptPaths(best, 'cutter');
      return;
    }
    if (choice === 'all') {
      acceptPaths(pending, 'cutter');
      return;
    }
    const next = pending.map((path) =>
      (choice === 'imprint-set' || choice === 'combo-set') && path.role === 'hole' ? { ...path, role: 'imprint' as const } : path,
    );
    acceptPaths(next, choice);
  }

  async function persist() {
    const record = await saveDesign(design, thumbnailOf(design.paths), design.id);
    replaceDesign(record.document, false);
    if (userId) {
      try {
        const remoteId = await pushDesign({ ...record, remoteId: record.remoteId }, userId);
        if (remoteId) await saveDesign({ ...record.document, id: record.id }, record.thumbnail, record.id);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Saved on this device. Cloud sync did not finish.');
        return;
      }
    }
    setMessage('Saved to your library. No account required.');
  }

  async function runExport(format: 'stl' | '3mf' | 'obj' | 'pdf', force = false) {
    if (!force && report.level === 'block') {
      const ok = window.confirm(`${report.issues.find((issue) => issue.level === 'block')?.message}\n\nExport anyway?`);
      if (!ok) return;
    }
    const safe = design.title.replace(/[^\w.-]+/g, '-').toLowerCase() || 'nenocutter';
    let bytes: Uint8Array;
    const fileName = `${safe}.${format === '3mf' ? '3mf' : format}`;
    if (format === 'pdf') bytes = encodePDF(design);
    else if (!result?.parts.length) {
      setMessage('The 3D model is not ready yet.');
      return;
    } else if (format === 'stl') bytes = encodeSTL(result.parts);
    else if (format === '3mf') bytes = encode3MF(result.parts);
    else bytes = encodeOBJ(result.parts);
    download(bytes, fileName);
    setExportOpen(false);
    if (embed) postToParent({ source: 'nenocutter', type: 'export-complete', format, fileName, byteLength: bytes.byteLength });
  }

  async function share(mode: 'view' | 'copy') {
    const compressed = `${location.origin}${location.pathname}#/s/${encodeShare(design)}`;
    if (supabaseConfigured && userId) {
      try {
        const record = await saveDesign(design, thumbnailOf(design.paths), design.id);
        const remoteId = record.remoteId ?? (await pushDesign(record, userId));
        if (remoteId) {
          const id = await createShare(remoteId, userId, mode);
          await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/share/${id}`);
          setMessage('Short share link copied. It stays free.');
          return;
        }
      } catch {
        /* Fall back to the compressed link. */
      }
    }
    await navigator.clipboard.writeText(compressed);
    setMessage(compressed.length > 1800 ? 'Link copied. It is long because the whole design is inside it, and it needs no account.' : 'Share link copied. Anyone can open it without an account.');
  }

  async function placeText() {
    const font = await loadCutterFont();
    const paths = textPaths(font, textValue || 'Neno', -20, -10, 14, 'outline');
    if (!paths.length) return;
    commit((current) => ({ ...current, paths: [...current.paths, ...paths] }));
  }

  function alignSelected(edge: 'left' | 'right' | 'hcenter' | 'top' | 'bottom' | 'vcenter') {
    const chosen = design.paths.filter((path) => selected.includes(path.id));
    if (chosen.length < 2) {
      setMessage('Select at least two shapes to align them.');
      return;
    }
    const box = boundsOf(chosen);
    commit((current) => ({
      ...current,
      paths: current.paths.map((path) => {
        if (!selected.includes(path.id)) return path;
        const item = boundsOf([path]);
        let dx = 0;
        let dy = 0;
        if (edge === 'left') dx = box.minX - item.minX;
        if (edge === 'right') dx = box.maxX - item.maxX;
        if (edge === 'hcenter') dx = box.cx - item.cx;
        if (edge === 'bottom') dy = box.minY - item.minY;
        if (edge === 'top') dy = box.maxY - item.maxY;
        if (edge === 'vcenter') dy = box.cy - item.cy;
        return { ...path, source: undefined, points: translatePoints(path.points, dx, dy) };
      }),
    }));
  }

  async function applyBoolean(op: 'union' | 'subtract') {
    const chosen = design.paths.filter((path) => selected.includes(path.id));
    if (chosen.length < 2) {
      setMessage('Select at least two shapes first.');
      return;
    }
    const merged = await booleanPaths(chosen, op);
    const rest = design.paths.filter((path) => !selected.includes(path.id));
    commit((current) => ({ ...current, paths: [...rest, ...merged] }));
  }

  const block = !building && result ? report.issues.find((issue) => issue.level === 'block') : undefined;
  const warn = report.issues.find((issue) => issue.level === 'warn');

  return (
    <div className="app">
      <a className="skip" href="#stage">Skip to the canvas</a>
      <header className="topbar">
        <Link className="brand" to={embed ? '/embed' : '/'}>
          <Logo />
          <span>
            <strong>Nenocutter</strong>
            <small>Free cutter studio</small>
          </span>
        </Link>
        <div className="top-actions">
          <button className="btn" type="button" onClick={() => undo()} aria-label="Undo">Undo</button>
          <button className="btn" type="button" onClick={() => redo()} aria-label="Redo">Redo</button>
          <button className="btn" type="button" aria-pressed={view === 'draw'} onClick={() => setView('draw')}>Draw</button>
          <button className="btn" type="button" aria-pressed={view === 'preview'} onClick={() => setView('preview')}>3D</button>
          <button className="btn" type="button" aria-pressed={view === 'split'} onClick={() => setView('split')}>Split</button>
          <label className="btn">
            {TOOL_LABELS[design.settings.tool]}
            <select aria-label="Tool type" value={design.settings.tool} onChange={(event) => patchSettings({ tool: event.target.value as ToolType }, true)} style={{ marginLeft: 8 }}>
              {Object.entries(TOOL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {!embed && (
          <nav className="nav-links">
            <Link to="/gallery">Gallery</Link>
            <Link to="/library">Library</Link>
            <Link to="/account">Account</Link>
          </nav>
        )}
        <button className="btn" type="button" onClick={() => void persist()}>Save</button>
        <div style={{ position: 'relative' }}>
          <button className="btn primary" type="button" aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}>
            Export free
          </button>
          {exportOpen && (
            <div className="menu" role="menu" aria-label="Export formats">
              <p className="free-note">STL, 3MF, OBJ, and PDF are free. No account.</p>
              {(['stl', '3mf', 'obj', 'pdf'] as const).map((format) => (
                <button key={format} className="btn" type="button" onClick={() => void runExport(format)}>
                  Download {format.toUpperCase()}
                </button>
              ))}
              <button className="btn" type="button" onClick={() => void share('view')}>Copy view link</button>
              <button className="btn" type="button" onClick={() => void share('copy')}>Copy “add to library” link</button>
            </div>
          )}
        </div>
        <button className="btn icon" type="button" aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </header>
      <nav className="toolrail" aria-label="Drawing tools">
        {TOOLS.map((item) => (
          <button key={item.id} className="tool-btn" type="button" aria-pressed={tool === item.id} onClick={() => setTool(item.id)}>
            <Icon name={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
        <button className="tool-btn" type="button" onClick={() => fileRef.current?.click()}>
          <span>Upload</span>
        </button>
        <input ref={fileRef} aria-label="Upload artwork" hidden type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) openFile(file);
          event.target.value = '';
        }} />
      </nav>
      <main className="stage" id="stage" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) openFile(file);
      }}>
        <div className="stage-toolbar">
          <button className="btn" type="button" onClick={() => {
            const node = document.getElementById('design-canvas');
            if (node) fitCanvas(node.clientWidth, node.clientHeight);
          }}>Fit</button>
          <button className="btn" type="button" onClick={() => useDesignStore.getState().setSnap(!useDesignStore.getState().snap)}>Snap</button>
          <button className="btn" type="button" onClick={() => void applyBoolean('union')}>Union</button>
          <button className="btn" type="button" onClick={() => void applyBoolean('subtract')}>Subtract</button>
          <button className="btn" type="button" onClick={() => duplicateSelected()}>Duplicate</button>
          <button className="btn" type="button" onClick={() => alignSelected('left')}>Align left</button>
          <button className="btn" type="button" onClick={() => alignSelected('hcenter')}>Align center</button>
          <button className="btn" type="button" onClick={() => alignSelected('bottom')}>Align bottom</button>
          <label className="row">
            Text
            <input className="text-input" aria-label="Text to place" value={textValue} onChange={(event) => setTextValue(event.target.value)} style={{ width: 120 }} />
          </label>
          <button className="btn" type="button" onClick={() => void placeText()}>Place text</button>
          <button className="btn" type="button" onClick={() => setSettingsOpen(!settingsOpen)}>Settings</button>
        </div>
        <div className={`viewport ${view === 'split' ? 'split' : ''}`}>
          {view !== 'preview' && (
            <div className="canvas-card">
              <Canvas2D />
            </div>
          )}
          {view !== 'draw' && (
            <div className="preview-card">
              {result?.parts.length ? <Preview3D parts={result.parts} /> : <p style={{ padding: 24 }}>{building ? buildLabel || 'Building the preview…' : 'The preview will appear here.'}</p>}
              {result?.parts.length ? (
                <div className="dim-label" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>
                  {result.dimensions.width.toFixed(1)} × {result.dimensions.height.toFixed(1)} × {result.dimensions.depth.toFixed(1)} mm
                </div>
              ) : null}
              <SceneTogglesPanel scene={scene} />
            </div>
          )}
        </div>
      </main>
      <SettingsPanel open={settingsOpen} />
      <footer className="statusbar">
        <span>
          {building ? buildLabel || 'Building…' : result ? `${result.dimensions.width.toFixed(1)} × ${result.dimensions.height.toFixed(1)} × ${result.dimensions.depth.toFixed(1)} mm` : 'Ready'}
          {result ? ` · ${result.parts.length} part${result.parts.length === 1 ? '' : 's'}` : ''}
        </span>
        <span className={block ? 'issue block' : 'issue'}>{block?.message || warn?.message || message || 'Exports, the library, and image editing stay free.'}</span>
      </footer>
      {studioFile && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="studio-title">
          <div className="modal-card">
            <h2 id="studio-title">Image studio</h2>
            <p>Adjust the trace before it becomes vectors. This editor is free and works without signing in.</p>
            <label className="field">Threshold <input type="range" min={1} max={255} value={trace.threshold} onChange={(event) => setTrace({ threshold: Number(event.target.value) })} /></label>
            <label className="field">Smoothing <input type="range" min={0} max={3} step={0.1} value={trace.smoothing} onChange={(event) => setTrace({ smoothing: Number(event.target.value) })} /></label>
            <label className="field">Despeckle <input type="range" min={0} max={80} value={trace.despeckle} onChange={(event) => setTrace({ despeckle: Number(event.target.value) })} /></label>
            <label className="field">Brightness <input type="range" min={-80} max={80} value={trace.brightness} onChange={(event) => setTrace({ brightness: Number(event.target.value) })} /></label>
            <label className="field">Contrast <input type="range" min={-80} max={80} value={trace.contrast} onChange={(event) => setTrace({ contrast: Number(event.target.value) })} /></label>
            <label className="check"><input type="checkbox" checked={trace.invert} onChange={(event) => setTrace({ invert: event.target.checked })} /> Invert</label>
            <label className="field">Mode
              <select value={trace.mode} onChange={(event) => setTrace({ mode: event.target.value as 'filled' | 'line' })}>
                <option value="filled">Edge trace, filled shapes</option>
                <option value="line">Line drawing</option>
              </select>
            </label>
            <div className="row">
              <button className="btn" type="button" onClick={() => setStudioFile(null)}>Cancel</button>
              <button className="btn primary" type="button" onClick={() => { const file = studioFile; setStudioFile(null); void ingest(file); }}>Trace</button>
            </div>
          </div>
        </div>
      )}
      {pending && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <div className="modal-card">
            <h2 id="import-title">Found {topLevelGroups(pending).length} shapes</h2>
            <p>This sheet can become one cutter or a set of separate tools. Nothing here is locked behind an account.</p>
            <div className="choice-grid">
              <button className="btn choice" type="button" onClick={() => chooseImport('largest')}>Largest only</button>
              <button className="btn choice" type="button" onClick={() => chooseImport('all')}>Outline all</button>
              <button className="btn choice" type="button" onClick={() => chooseImport('cutter-set')}>Cutter set — each shape its own tool</button>
              <button className="btn choice" type="button" onClick={() => chooseImport('imprint-set')}>Imprint cutter set</button>
              <button className="btn choice" type="button" onClick={() => chooseImport('stamp-set')}>Stamp set</button>
              <button className="btn choice" type="button" onClick={() => chooseImport('combo-set')}>Cutter + stamp set</button>
            </div>
          </div>
        </div>
      )}
      {!embed && !tourSeen && (
        <div className="tour-back">
          <div className="tour-card">
            <h2>{['Welcome', 'Bring in art', 'Tune the blade', 'Look in 3D', 'Take it with you'][tourStep]}</h2>
            <p>
              {[
                'Nenocutter designs cookie cutters, stamps, and stencils in the browser. Downloads are free.',
                'Drop a PNG, JPG, WebP, or SVG, paste from the clipboard, or start from the gallery. A sheet of shapes can become a set.',
                'Depth, wall, chamfer, base, and grip all update the preview. Search the settings if you forget a name.',
                'Orbit the glossy preview, turn on dough or a 25 mm coin, and read the live width, height, and depth.',
                'Export STL, 3MF, OBJ, or a 1:1 PDF. Save locally, or sign in only if you want cloud sync.',
              ][tourStep]}
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={() => setTourSeen(true)}>Skip</button>
              <button className="btn primary" type="button" onClick={() => (tourStep === 4 ? setTourSeen(true) : setTourStep(tourStep + 1))}>
                {tourStep === 4 ? 'Start designing' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      )}
      {shortcutsOpen && (
        <div className="modal-back" onClick={() => setShortcutsOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2>Shortcuts</h2>
            <p><kbd>Ctrl</kbd> Z undo · <kbd>Ctrl</kbd> Shift Z redo · <kbd>Ctrl</kbd> S save · <kbd>Ctrl</kbd> E export · <kbd>Ctrl</kbd> D duplicate · Delete · V select · P pen · F draw · N nodes · ? this list</p>
            <button className="btn" type="button" onClick={() => setShortcutsOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function areaOf(path: DesignPath): number {
  let sum = 0;
  for (let i = 0; i < path.points.length; i++) {
    const a = path.points[i];
    const b = path.points[(i + 1) % path.points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function Logo() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="18" fill="#fff6ea" stroke="#c4854d" strokeWidth="3" />
      <path d="M32 46c-8-6-14-11-14-18a8 8 0 0 1 14-5 8 8 0 0 1 14 5c0 7-6 12-14 18z" fill="#f0c7b0" stroke="#4e3428" strokeWidth="3" />
    </svg>
  );
}

function Icon({ name }: { name: EditorTool }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'select' && <path d="M5 4l6 16 2-6 6-2z" fill="currentColor" />}
      {name === 'pen' && <path d="M4 20l4-1 10-10-3-3L5 16z" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {name === 'freehand' && <path d="M4 16c4-8 8 4 12-6" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {name === 'node' && <><circle cx="6" cy="16" r="2" fill="currentColor" /><circle cx="18" cy="8" r="2" fill="currentColor" /><path d="M8 15l8-6" stroke="currentColor" /></>}
      {name === 'rect' && <rect x="5" y="6" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {name === 'ellipse' && <ellipse cx="12" cy="12" rx="7" ry="5" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {name === 'star' && <path d="M12 4l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" fill="currentColor" />}
      {name === 'heart' && <path d="M12 19s-6-4-6-8a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" fill="currentColor" />}
      {name === 'text' && <text x="6" y="17" fontSize="14" fill="currentColor">T</text>}
    </svg>
  );
}
