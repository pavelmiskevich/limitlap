import { createTrackGeometry, parseTrack } from '@limitlap/tracks';
import { describe, expect, test } from 'vitest';
import { outwardSign } from './turn.ts';

const track = (direction: 'left' | 'right') =>
  createTrackGeometry(
    parseTrack({
      id: 'loop-test',
      version: 1,
      lanes: 1,
      laneSpacing: 4,
      sections: [
        { type: 'straight', length: 100 },
        { type: 'turn', radius: 50, angle: 180, direction },
        { type: 'straight', length: 100 },
        { type: 'turn', radius: 50, angle: 180, direction },
      ],
      sectors: [1],
    }),
  ).centre;

describe('outwardSign', () => {
  test('outside of a left turn is to the right (against `left`)', () => {
    expect(outwardSign(track('left'), 150)).toBe(-1);
  });

  test('outside of a right turn is to the left', () => {
    expect(outwardSign(track('right'), 150)).toBe(1);
  });

  test('a straight has no outside', () => {
    expect(outwardSign(track('left'), 20)).toBe(0);
  });
});
