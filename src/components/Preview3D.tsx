import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { BuiltPart } from '../domain/types';
import type { MaterialPreset, SceneToggles, SurfacePreset } from '../store/prefs';
import { usePrefs } from '../store/prefs';
import { useDesignStore } from '../store/designStore';

const SURFACE: Record<SurfacePreset, { color: string; roughness: number; clearcoat: number; map?: 'marble' | 'wood' }> = {
  cream: { color: '#f4e4cf', roughness: 0.28, clearcoat: 0.65 },
  porcelain: { color: '#f7f1ea', roughness: 0.18, clearcoat: 0.85 },
  blush: { color: '#f0c2ae', roughness: 0.32, clearcoat: 0.45 },
  cocoa: { color: '#6b4636', roughness: 0.4, clearcoat: 0.25 },
  slate: { color: '#4d5856', roughness: 0.45, clearcoat: 0.2 },
  marble: { color: '#f7f2ec', roughness: 0.22, clearcoat: 0.7, map: 'marble' },
  wood: { color: '#c89562', roughness: 0.55, clearcoat: 0.08, map: 'wood' },
};

export function Preview3D({ parts }: { parts: BuiltPart[] }) {
  const scene = usePrefs((state) => state.scene);
  const surface = usePrefs((state) => state.surface);
  const material = usePrefs((state) => state.material);
  const layerLines = usePrefs((state) => state.layerLines);
  const paths = useDesignStore((state) => state.design.paths);
  const bounds = useMemo(() => unionBounds(parts), [parts]);

  return (
    <>
      <Canvas camera={{ position: [bounds.span * 1.2, -bounds.span, bounds.depth + bounds.span * 0.8], fov: 35 }} gl={{ antialias: true }}>
        <color attach="background" args={['#f6ecdf']} />
        <hemisphereLight args={['#fff4e8', '#c9a27a', 1.1]} />
        <directionalLight position={[40, -30, 80]} intensity={1.4} />
        <directionalLight position={[-30, 20, 40]} intensity={0.35} />
        {scene.dough && <Dough bounds={bounds} />}
        {scene.cutout && <CutMark bounds={bounds} />}
        {parts.map((part) => (
          <PartMesh
            key={part.name + part.role}
            part={part}
            surface={surface}
            material={material}
            layerLines={layerLines}
            assembled={scene.assembled}
            edges={scene.edges}
          />
        ))}
        {scene.extraCutter && parts[0] && (
          <PartMesh
            part={{ ...parts[0], positions: shift(parts[0].positions, bounds.width + 12, 0, 0) }}
            surface="porcelain"
            material="solid"
            layerLines={false}
            assembled={false}
            edges={false}
          />
        )}
        {scene.cookie && <Cookie paths={paths} bounds={bounds} />}
        {scene.ruler && <Ruler length={Math.max(80, Math.ceil(bounds.width / 10) * 10)} y={bounds.minY - 12} />}
        {scene.coin && <Coin position={[bounds.maxX + 18, bounds.minY, 1]} />}
        <OrbitControls makeDefault enableDamping />
        <FitView bounds={bounds} />
        {scene.dimensions && <DimensionSprite bounds={bounds} />}
      </Canvas>
    </>
  );
}

function PartMesh({
  part,
  surface,
  material,
  layerLines,
  assembled,
  edges,
}: {
  part: BuiltPart;
  surface: SurfacePreset;
  material: MaterialPreset;
  layerLines: boolean;
  assembled: boolean;
  edges: boolean;
}) {
  const look = SURFACE[surface];
  const geometry = useMemo(() => {
    const positions = assembled ? assemble(part) : part.positions;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geo.computeVertexNormals();
    if (material !== 'solid' || layerLines) geo.setAttribute('color', new THREE.BufferAttribute(paint(positions, material, layerLines, look.color), 3));
    if (look.map) geo.setAttribute('uv', new THREE.BufferAttribute(planarUv(positions), 2));
    return geo;
  }, [part, assembled, material, layerLines, look.color, look.map]);
  const texture = useMemo(() => (look.map === 'marble' ? marbleTexture() : look.map === 'wood' ? woodTexture() : null), [look.map]);
  const edgeGeo = useMemo(() => (edges ? new THREE.EdgesGeometry(geometry, 35) : null), [edges, geometry]);
  return (
    <group>
      <mesh geometry={geometry} castShadow>
        <meshPhysicalMaterial
          color={look.color}
          roughness={material === 'glitter' ? 0.18 : look.roughness}
          metalness={material === 'glitter' ? 0.35 : 0.04}
          clearcoat={look.clearcoat}
          clearcoatRoughness={0.18}
          vertexColors={material !== 'solid' || layerLines}
          map={texture}
          iridescence={material === 'glitter' ? 0.7 : 0}
          iridescenceIOR={1.3}
        />
      </mesh>
      {edgeGeo && (
        <lineSegments geometry={edgeGeo}>
          <lineBasicMaterial color="#8d5a32" transparent opacity={0.45} />
        </lineSegments>
      )}
    </group>
  );
}

function Dough({ bounds }: { bounds: Bounds }) {
  return (
    <mesh position={[bounds.cx, bounds.cy, -3]} rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[Math.max(bounds.span * 0.72, 40), Math.max(bounds.span * 0.78, 44), 6, 48]} />
      <meshStandardMaterial color="#e7c39a" roughness={0.72} />
    </mesh>
  );
}

function CutMark({ bounds }: { bounds: Bounds }) {
  return (
    <mesh position={[bounds.cx, bounds.cy, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[Math.min(bounds.width, bounds.height) * 0.28, Math.min(bounds.width, bounds.height) * 0.34, 48]} />
      <meshStandardMaterial color="#c9845a" roughness={0.8} />
    </mesh>
  );
}

function Cookie({ paths, bounds }: { paths: { points: { x: number; y: number }[]; closed: boolean; role: string }[]; bounds: Bounds }) {
  const geometry = useMemo(() => {
    const outline = paths.find((path) => path.closed && path.role === 'outline');
    if (!outline) return null;
    const shape = new THREE.Shape(outline.points.map((point) => new THREE.Vector2(point.x, point.y)));
    return new THREE.ExtrudeGeometry(shape, { depth: 8, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 2 });
  }, [paths]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} position={[bounds.maxX + bounds.width * 0.2 + 8, bounds.minY, 0]}>
      <meshStandardMaterial color="#d9a36a" roughness={0.66} />
    </mesh>
  );
}

function Ruler({ length, y }: { length: number; y: number }) {
  const ticks = [];
  for (let x = 0; x <= length; x += 10) {
    ticks.push(
      <mesh key={x} position={[x, y - (x % 50 === 0 ? 2.2 : 1.2), 0.4]}>
        <boxGeometry args={[0.4, x % 50 === 0 ? 4 : 2, 0.4]} />
        <meshStandardMaterial color="#4e3428" />
      </mesh>,
    );
  }
  return (
    <group>
      <mesh position={[length / 2, y, 0.3]}>
        <boxGeometry args={[length, 1.2, 0.6]} />
        <meshStandardMaterial color="#f7efe4" />
      </mesh>
      {ticks}
    </group>
  );
}

function Coin({ position }: { position: [number, number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e2b15d';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#8d5a32';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, 220, 220);
    ctx.fillStyle = '#4e3428';
    ctx.font = '64px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('25', 128, 120);
    ctx.font = '28px Georgia';
    ctx.fillText('mm', 128, 160);
    const map = new THREE.CanvasTexture(canvas);
    return map;
  }, []);
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[12.5, 12.5, 1.8, 40]} />
      <meshStandardMaterial map={texture} color="#e2b15d" metalness={0.45} roughness={0.35} />
    </mesh>
  );
}

function DimensionSprite({ bounds }: { bounds: Bounds }) {
  const label = `${bounds.width.toFixed(1)} × ${bounds.height.toFixed(1)} × ${bounds.depth.toFixed(1)} mm`;
  return (
    <Html position={[bounds.cx, bounds.minY - 8, bounds.depth * 0.5]} center>
      <div className="dim-label">{label}</div>
    </Html>
  );
}

function FitView({ bounds }: { bounds: Bounds }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    camera.position.set(bounds.cx + bounds.span * 0.05, bounds.cy - bounds.span * 0.85, bounds.span * 1.45);
    camera.lookAt(bounds.cx, bounds.cy, bounds.depth / 2);
    if (controls) {
      controls.target.set(bounds.cx, bounds.cy, bounds.depth / 2);
      controls.update();
    }
  }, [bounds, camera, controls]);
  return null;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  depth: number;
  cx: number;
  cy: number;
  span: number;
}

function unionBounds(parts: BuiltPart[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = 0;
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 3) {
      minX = Math.min(minX, part.positions[i]);
      minY = Math.min(minY, part.positions[i + 1]);
      maxX = Math.max(maxX, part.positions[i]);
      maxY = Math.max(maxY, part.positions[i + 1]);
      maxZ = Math.max(maxZ, part.positions[i + 2]);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: -20, minY: -20, maxX: 20, maxY: 20, width: 40, height: 40, depth: 10, cx: 0, cy: 0, span: 40 };
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    span: Math.max(maxX - minX, maxY - minY, 30),
  };
}

function assemble(part: BuiltPart): Float32Array {
  if (!part.assembly) return part.positions;
  const a = part.assembly;
  const src = part.positions;
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i] - a.cx;
    const y = -(src[i + 1] - a.cy);
    const z = -(src[i + 2] - a.height);
    out[i] = x + a.socketX;
    out[i + 1] = y + a.socketY;
    out[i + 2] = z + (a.socketTop - a.socketDepth);
  }
  return out;
}

function shift(positions: Float32Array, dx: number, dy: number, dz: number): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] + dx;
    out[i + 1] = positions[i + 1] + dy;
    out[i + 2] = positions[i + 2] + dz;
  }
  return out;
}

function paint(positions: Float32Array, material: MaterialPreset, layerLines: boolean, hex: string): Float32Array {
  const base = new THREE.Color(hex);
  const alt = base.clone().offsetHSL(0.03, 0.05, -0.12);
  const colors = new Float32Array(positions.length);
  let maxZ = 1;
  for (let i = 2; i < positions.length; i += 3) maxZ = Math.max(maxZ, positions[i]);
  for (let i = 0; i < positions.length; i += 3) {
    const z = positions[i + 2];
    const t = z / maxZ;
    const color = base.clone();
    if (material === 'dual') color.lerp(alt, z > 4 ? 1 : 0);
    if (material === 'gradient') color.lerp(alt, t);
    if (material === 'glitter' && ((i / 3) * 17) % 11 === 0) color.offsetHSL(0.08, 0.2, 0.15);
    if (layerLines && Math.floor(z / 0.2) % 2 === 0) color.multiplyScalar(0.9);
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  return colors;
}

function planarUv(positions: Float32Array): Float32Array {
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0, u = 0; i < positions.length; i += 3, u += 2) {
    uv[u] = positions[i] / 40;
    uv[u + 1] = positions[i + 1] / 40;
  }
  return uv;
}

function marbleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f7f3ee';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(180, 170, 160, 0.45)';
  for (let i = 0; i < 18; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 16);
    ctx.bezierCurveTo(80, i * 16 + 20, 140, i * 16 - 24, 256, i * 16 + 6);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 256; y++) {
    const band = 150 + Math.sin(y / 7) * 25 + (y % 13);
    ctx.fillStyle = `rgb(${band}, ${band * 0.62}, ${band * 0.32})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function SceneTogglesPanel({ scene }: { scene: SceneToggles }) {
  const toggle = usePrefs((state) => state.toggleScene);
  const setSurface = usePrefs((state) => state.setSurface);
  const setMaterial = usePrefs((state) => state.setMaterial);
  const setLayerLines = usePrefs((state) => state.setLayerLines);
  const surface = usePrefs((state) => state.surface);
  const material = usePrefs((state) => state.material);
  const layerLines = usePrefs((state) => state.layerLines);
  const items: { key: keyof SceneToggles; label: string }[] = [
    { key: 'dough', label: 'Dough sheet' },
    { key: 'cutout', label: 'Cut-out mark' },
    { key: 'cookie', label: 'Loose cookie' },
    { key: 'extraCutter', label: 'Another cutter' },
    { key: 'ruler', label: 'Ruler' },
    { key: 'coin', label: '25 mm coin' },
    { key: 'assembled', label: 'Assembled grip' },
    { key: 'dimensions', label: 'Dimensions' },
    { key: 'edges', label: 'Edge highlight' },
  ];
  return (
    <div className="layers panel" aria-label="Preview layers">
      <strong>Layers</strong>
      {items.map((item) => (
        <label key={item.key}>
          <input type="checkbox" checked={scene[item.key]} onChange={() => toggle(item.key)} />
          {item.label}
        </label>
      ))}
      <label>
        Surface
        <select value={surface} onChange={(event) => setSurface(event.target.value as SurfacePreset)} aria-label="Surface preset">
          {Object.keys(SURFACE).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Print look
        <select value={material} onChange={(event) => setMaterial(event.target.value as MaterialPreset)} aria-label="Print material preview">
          <option value="solid">Solid</option>
          <option value="dual">Dual colour</option>
          <option value="gradient">Gradient</option>
          <option value="glitter">Glitter</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={layerLines} onChange={(event) => setLayerLines(event.target.checked)} />
        Layer lines
      </label>
      <p className="free-note">Preview only. Exports ignore colour, dough, and the coin.</p>
    </div>
  );
}
