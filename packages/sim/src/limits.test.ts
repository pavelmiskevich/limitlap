import { describe, expect, test } from 'vitest';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { segmentLimits } from './limits.ts';
import { DEFAULT_PROFILE as profile, parseProfile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

const lane: Lane = {
  length: m(400),
  segments: [
    { kind: 'straight', length: m(100) },
    { kind: 'turn', length: m(100), radius: m(40) },
    { kind: 'turn', length: m(150), radius: m(90) },
    { kind: 'loop', length: m(50), radius: m(8) },
  ],
  sectors: [m(0)],
};

describe('segmentLimits', () => {
  test('a turn is limited to √(aHold · r)', () => {
    const limits = segmentLimits(lane, profile);
    expect(limits[1]?.max).toBe(fx.sqrt(fx.mul(profile.aHold, m(40))));
  });

  test('with aHold 40 m/s² a 90 m turn holds 60 m/s', () => {
    const limits = segmentLimits(lane, parseProfile({ ...profile.source, aHold: 40 }));
    expect(limits[2]?.max).toBe(fx.fromInt(60));
  });

  test('the limit grows with the radius', () => {
    const [, tight, wide] = segmentLimits(lane, profile);
    expect(wide?.max).toBeGreaterThan(tight?.max ?? Infinity);
  });

  test('straights have no limit besides vTop', () => {
    expect(segmentLimits(lane, profile)[0]?.max).toBeNull();
  });

  test('limits are computed once per lane and profile', () => {
    expect(segmentLimits(lane, profile)).toBe(segmentLimits(lane, profile));
    const other = parseProfile({ ...profile.source, version: 2, aHold: 20 });
    expect(segmentLimits(lane, other)).not.toBe(segmentLimits(lane, profile));
  });
});
