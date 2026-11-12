import type { Design, DesignPath } from './types';
import { defaultSettings } from './defaults';
import { uid } from '../lib/ids';
import {
  arrowPoints,
  bowPoints,
  circlePoints,
  flowerPoints,
  heartMotifSheet,
  heartPoints,
  jewelPoints,
  keyPoints,
  pathFrom,
  rectPoints,
  starPoints,
} from '../geometry/shapes';

function design(title: string, paths: DesignPath[], blurb: string, tags: string[]): Design & { blurb: string } {
  return {
    version: 1,
    id: uid('tpl'),
    title,
    paths,
    settings: { ...defaultSettings },
    tags,
    updatedAt: new Date().toISOString(),
    blurb,
  };
}

export type GalleryTemplate = Design & { blurb: string };

export function galleryTemplates(): GalleryTemplate[] {
  return [
    design('Classic heart', [pathFrom(heartPoints(0, 0, 75, 72))], 'A single heart, ready to cut.', ['heart', 'starter']),
    design('Circle', [pathFrom(circlePoints(0, 0, 36, 64))], 'A round cutter for biscuits and liners.', ['basic']),
    design('Five-point star', [pathFrom(starPoints(0, 0, 36, 15, 5))], 'A sharp star with a sturdy center.', ['basic']),
    design('Daisy', [pathFrom(flowerPoints(0, 0, 34, 8, 96))], 'Soft petals from one continuous outline.', ['flower']),
    design('Key', [pathFrom(keyPoints(0, 0, 70))], 'A key silhouette for favors and plaques.', ['motif']),
    design('Arrow', [pathFrom(arrowPoints(0, 0, 74))], 'A bold arrow that stays in one piece.', ['motif']),
    design('Bow', [pathFrom(bowPoints(0, 0, 72))], 'A ribbon bow drawn as a single loop.', ['motif']),
    design('Jewel', [pathFrom(jewelPoints(0, 0, 64))], 'A faceted gem for celebration sets.', ['motif']),
    design('Scalloped plaque', [pathFrom(rectPoints(-32, -22, 64, 44, 10, 5))], 'A name-plate friendly rounded rectangle.', ['plaque']),
    design(
      'Letter A',
      [
        pathFrom([
          { x: 0, y: 0 },
          { x: 18, y: 48 },
          { x: 36, y: 0 },
          { x: 28, y: 0 },
          { x: 24, y: 12 },
          { x: 12, y: 12 },
          { x: 8, y: 0 },
        ]),
      ],
      'A geometric letter you can duplicate into a word.',
      ['letter'],
    ),
    design(
      'Gingerbread',
      [
        pathFrom([
          { x: 0, y: 34 },
          { x: 10, y: 22 },
          { x: 22, y: 26 },
          { x: 18, y: 12 },
          { x: 28, y: 4 },
          { x: 18, y: -6 },
          { x: 12, y: 2 },
          { x: 8, y: -16 },
          { x: 0, y: -12 },
          { x: -8, y: -16 },
          { x: -12, y: 2 },
          { x: -18, y: -6 },
          { x: -28, y: 4 },
          { x: -18, y: 12 },
          { x: -22, y: 26 },
          { x: -10, y: 22 },
        ]),
      ],
      'A friendly figure with arms wide enough to print.',
      ['figure'],
    ),
    design(
      'Heart motif sheet',
      heartMotifSheet(),
      'Sixteen separate hearts, keys, arrows, flowers, a wreath, a jewel, and bows. Choose a cutter set when it opens.',
      ['sheet', 'set', 'heart'],
    ),
  ];
}
