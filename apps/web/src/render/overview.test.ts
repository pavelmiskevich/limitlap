import { describe, expect, test } from 'vitest';
import { overviewPlacement } from './overview.ts';

const box = { minX: -100, maxX: 300, minZ: -50, maxZ: 50 };

describe('overviewPlacement', () => {
  test('looks straight down at the centre of the track', () => {
    const placement = overviewPlacement(box, 60, 16 / 9);
    expect(placement.target).toEqual([100, 0, 0]);
    expect(placement.position[0]).toBe(100);
    expect(placement.position[2]).toBe(0);
  });

  test('in portrait the long side of the track runs along the screen', () => {
    expect(overviewPlacement(box, 60, 9 / 19.5).up).toEqual([1, 0, 0]);
    expect(overviewPlacement(box, 60, 16 / 9).up).toEqual([0, 0, -1]);
  });

  test('is high enough to fit the whole track with a margin', () => {
    for (const aspect of [9 / 19.5, 1, 16 / 9]) {
      const { position, up } = overviewPlacement(box, 60, aspect);
      const height = position[1];
      const halfV = height * Math.tan((60 * Math.PI) / 360);
      const halfH = halfV * aspect;
      const alongScreen = up[0] === 1 ? 400 : 100;
      const acrossScreen = up[0] === 1 ? 100 : 400;
      expect(halfV * 2).toBeGreaterThanOrEqual(alongScreen);
      expect(halfH * 2).toBeGreaterThanOrEqual(acrossScreen);
    }
  });
});
