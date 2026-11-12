import type { DesignPath } from '../domain/types';
import { uid } from '../lib/ids';
import { getManifold } from './build';
import { limitPoints, signedArea } from './path';

export async function booleanPaths(paths: DesignPath[], op: 'union' | 'subtract'): Promise<DesignPath[]> {
  const api = await getManifold();
  const contours = paths
    .filter((path) => path.closed && path.points.length >= 3)
    .map((path) => limitPoints(path.points, 400).map((point) => [point.x, point.y] as [number, number]));
  if (contours.length < 2) return paths;
  const sections = contours.map((contour) => api.CrossSection.ofPolygons([contour], 'EvenOdd'));
  const result =
    op === 'union'
      ? api.CrossSection.union(sections)
      : sections.slice(1).reduce((acc, section) => acc.subtract(section), sections[0]);
  const polygons = result.toPolygons();
  sections.forEach((section) => section.delete());
  result.delete();
  return polygons
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const points = polygon.map(([x, y]) => ({ x, y }));
      return {
        id: uid('bool'),
        points,
        closed: true,
        role: signedArea(points) < 0 ? 'hole' : 'outline',
      } satisfies DesignPath;
    });
}
