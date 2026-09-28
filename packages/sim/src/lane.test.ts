import { describe, expect, test } from 'vitest';
import { fx } from './fixed.ts';
import { validateLane, type Lane } from './lane.ts';

const m = (meters: number) => fx.fromInt(meters);

function lane(overrides: Partial<Lane> = {}): Lane {
  return {
    length: m(300),
    segments: [
      { kind: 'straight', length: m(100) },
      { kind: 'turn', length: m(150), radius: m(50) },
      { kind: 'loop', length: m(50), radius: m(8) },
    ],
    sectors: [m(0), m(100), m(250)],
    ...overrides,
  };
}

describe('validateLane', () => {
  test('accepts a consistent lane', () => {
    expect(validateLane(lane())).toEqual([]);
  });

  test('segment lengths must add up to the lane length', () => {
    expect(validateLane(lane({ length: m(301) }))).toEqual([
      'segments add up to 300 m, lane length is 301 m',
    ]);
  });

  test('segments must have a positive length', () => {
    const bad = lane({
      segments: [
        { kind: 'straight', length: m(0) },
        { kind: 'straight', length: m(300) },
      ],
    });
    expect(validateLane(bad)).toContain('segment 0: length must be positive');
  });

  test('turns and loops need a positive radius', () => {
    const bad = lane({
      segments: [
        { kind: 'straight', length: m(100) },
        { kind: 'turn', length: m(150), radius: m(0) },
        { kind: 'loop', length: m(50), radius: m(-8) },
      ],
    });
    expect(validateLane(bad)).toEqual([
      'segment 1: radius must be positive',
      'segment 2: radius must be positive',
    ]);
  });

  test('sectors start at zero, ascend and stay inside the lane', () => {
    expect(validateLane(lane({ sectors: [m(10)] }))).toContain('sectors must start at 0');
    expect(validateLane(lane({ sectors: [m(0), m(200), m(100)] }))).toContain(
      'sector 2 does not come after sector 1',
    );
    expect(validateLane(lane({ sectors: [m(0), m(300)] }))).toContain(
      'sector 1 lies outside the lane',
    );
  });

  test('a lane needs at least one segment', () => {
    expect(validateLane(lane({ segments: [], length: m(0) }))).toContain('lane has no segments');
  });
});
