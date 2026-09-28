import { createTrackGeometry, parseTrack, type TrackJson } from '@limitlap/tracks';
import { describe, expect, test } from 'vitest';
import { ribbonPositions, sampleDistances } from './ribbon.ts';

const json: TrackJson = {
  id: 'oval',
  version: 1,
  lanes: 2,
  laneSpacing: 4,
  sections: [
    { type: 'straight', length: 100 },
    { type: 'turn', radius: 50, angle: 180, direction: 'left' },
    { type: 'loop', radius: 8 },
    { type: 'straight', length: 100 },
    { type: 'turn', radius: 50, angle: 180, direction: 'left' },
  ],
  sectors: [2],
};
const geometry = createTrackGeometry(parseTrack(json));

describe('sampleDistances', () => {
  test('covers the whole lap and closes it', () => {
    const d = sampleDistances(geometry.centre.length, 1);
    expect(d[0]).toBe(0);
    expect(d.at(-1)).toBe(geometry.centre.length);
  });

  test('keeps the step no longer than asked', () => {
    const d = sampleDistances(10.5, 1);
    for (let i = 1; i < d.length; i++) expect((d[i] ?? 0) - (d[i - 1] ?? 0)).toBeLessThanOrEqual(1);
  });
});

describe('ribbonPositions', () => {
  const distances = [0, 10, 20];
  const flat = ribbonPositions(geometry.centre, distances, 3, -3);

  test('has two vertices per sample, three coordinates each', () => {
    expect(flat).toHaveLength(distances.length * 2 * 3);
  });

  test('puts the left edge to the left and the right edge to the right', () => {
    // At the start the track runs along +X, left is −Z.
    expect(Array.from(flat.slice(0, 6))).toEqual([0, 0, -3, 0, 0, 3]);
  });

  test('keeps the ribbon width along the whole lap', () => {
    const all = sampleDistances(geometry.centre.length, 2);
    const positions = ribbonPositions(geometry.centre, all, 2, -2);
    for (let i = 0; i < all.length; i++) {
      const [ax, ay, az, bx, by, bz] = positions.slice(i * 6, i * 6 + 6);
      const width = Math.hypot((ax ?? 0) - (bx ?? 0), (ay ?? 0) - (by ?? 0), (az ?? 0) - (bz ?? 0));
      expect(width).toBeCloseTo(4, 4); // vertex buffers are Float32
    }
  });
});
