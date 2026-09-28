import { describe, expect, test } from 'vitest';
import { formatDelta, formatLapTime, formatSpeed } from './format.ts';

describe('formatLapTime', () => {
  test('shows minutes, seconds and milliseconds from ticks', () => {
    expect(formatLapTime(0)).toBe('0:00.000');
    expect(formatLapTime(60 * 21.5)).toBe('0:21.500');
    expect(formatLapTime(60 * 62.25)).toBe('1:02.250');
  });

  test('rounds to the nearest millisecond', () => {
    expect(formatLapTime(1)).toBe('0:00.017');
  });
});

describe('formatDelta', () => {
  test('slower is plus, faster is a real minus sign, zero has no sign', () => {
    expect(formatDelta(60 * 0.231)).toBe('+0.231');
    expect(formatDelta(-60 * 0.15)).toBe('−0.150');
    expect(formatDelta(0)).toBe('0.000');
  });
});

describe('formatSpeed', () => {
  test('converts metres per second to whole km/h', () => {
    expect(formatSpeed(25)).toBe('90');
    expect(formatSpeed(0.1)).toBe('0');
  });
});
