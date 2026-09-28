import { describe, expect, test } from 'vitest';
import { warningLevel, WARN_FROM } from './warning.ts';

describe('warningLevel', () => {
  test('is off below 70 % of the grip meter', () => {
    expect(WARN_FROM).toBe(0.7);
    expect(warningLevel(0, 0)).toBe(0);
    expect(warningLevel(0.69, 1.3)).toBe(0);
  });

  test('grows towards a full meter', () => {
    expect(warningLevel(0.8, 0)).toBeGreaterThan(0);
    expect(warningLevel(1, 0)).toBeGreaterThan(warningLevel(0.8, 0));
    expect(warningLevel(1, 0)).toBeLessThanOrEqual(1);
  });

  test('pulses over time', () => {
    const samples = [0, 0.1, 0.2, 0.3].map((t) => warningLevel(0.9, t));
    expect(new Set(samples.map((v) => v.toFixed(3))).size).toBeGreaterThan(1);
    for (const v of samples) expect(v).toBeGreaterThan(0);
  });
});
