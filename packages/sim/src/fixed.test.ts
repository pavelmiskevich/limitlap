import { describe, expect, test } from 'vitest';
import { fx, FX_ONE, type Fx } from './fixed.ts';

const raw = (n: number) => n as Fx;

describe('construction', () => {
  test('fromInt scales by FX_ONE', () => {
    expect(fx.fromInt(3)).toBe(3 * FX_ONE);
    expect(fx.fromInt(-2)).toBe(-2 * FX_ONE);
  });

  test('fromInt rejects fractions', () => {
    expect(() => fx.fromInt(1.5)).toThrow(RangeError);
  });

  test('fromRatio gives the truncated quotient', () => {
    expect(fx.fromRatio(1, 2)).toBe(FX_ONE / 2);
    expect(fx.fromRatio(1, 3)).toBe(21845);
    expect(fx.fromRatio(-1, 3)).toBe(-21845);
  });

  test('fromRatio rejects fractions and a zero denominator', () => {
    expect(() => fx.fromRatio(1.5, 2)).toThrow(RangeError);
    expect(() => fx.fromRatio(1, 0)).toThrow(RangeError);
  });

  test('fromFloat rounds to the nearest representable value', () => {
    expect(fx.fromFloat(12.5)).toBe(12.5 * FX_ONE);
    expect(fx.fromFloat(0.1)).toBe(6554);
    expect(fx.fromFloat(-0.1)).toBe(-6554);
    expect(fx.fromFloat(1 / FX_ONE / 2)).toBe(1);
  });

  test('fromFloat rejects non-finite numbers', () => {
    expect(() => fx.fromFloat(Number.NaN)).toThrow(RangeError);
    expect(() => fx.fromFloat(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  test('toInt truncates toward zero', () => {
    expect(fx.toInt(fx.fromFloat(2.75))).toBe(2);
    expect(fx.toInt(fx.fromFloat(-2.75))).toBe(-2);
    expect(fx.toInt(fx.fromFloat(-0.5))).toBe(0);
  });

  test('toNumber inverts fromFloat for exact values', () => {
    expect(fx.toNumber(fx.fromFloat(-7.25))).toBe(-7.25);
  });
});

describe('add and sub', () => {
  test('add and sub are exact', () => {
    expect(fx.add(fx.fromFloat(1.5), fx.fromFloat(2.25))).toBe(fx.fromFloat(3.75));
    expect(fx.sub(fx.fromInt(1), fx.fromInt(3))).toBe(fx.fromInt(-2));
  });

  test('overflow throws instead of losing precision', () => {
    const big = raw(Number.MAX_SAFE_INTEGER);
    expect(() => fx.add(big, raw(1))).toThrow(RangeError);
    expect(() => fx.sub(raw(-Number.MAX_SAFE_INTEGER), raw(1))).toThrow(RangeError);
  });
});

describe('mul', () => {
  test('multiplies fractional values exactly', () => {
    expect(fx.mul(fx.fromFloat(1.5), fx.fromFloat(2.5))).toBe(fx.fromFloat(3.75));
  });

  test('handles signs', () => {
    expect(fx.mul(fx.fromInt(-3), fx.fromInt(4))).toBe(fx.fromInt(-12));
    expect(fx.mul(fx.fromInt(-3), fx.fromInt(-4))).toBe(fx.fromInt(12));
  });

  test('truncates toward zero', () => {
    // 1/65536 * 0.5 = 1/131072, below resolution
    expect(fx.mul(raw(1), fx.fromFloat(0.5))).toBe(0);
    expect(fx.mul(raw(-1), fx.fromFloat(0.5))).toBe(0);
    expect(fx.mul(raw(3), fx.fromFloat(0.5))).toBe(1);
    expect(fx.mul(raw(-3), fx.fromFloat(0.5))).toBe(-1);
  });

  test('stays exact when the intermediate product exceeds 2^53', () => {
    const a = fx.fromInt(5000);
    const b = fx.fromInt(4000);
    expect(fx.mul(a, b)).toBe(fx.fromInt(20_000_000));
  });

  test('overflow throws', () => {
    const big = fx.fromInt(2 ** 30);
    expect(() => fx.mul(big, big)).toThrow(RangeError);
  });
});

describe('div', () => {
  test('divides exactly when representable', () => {
    expect(fx.div(fx.fromInt(3), fx.fromInt(4))).toBe(fx.fromFloat(0.75));
  });

  test('truncates toward zero', () => {
    expect(fx.div(fx.fromInt(1), fx.fromInt(3))).toBe(21845);
    expect(fx.div(fx.fromInt(-1), fx.fromInt(3))).toBe(-21845);
  });

  test('division by zero throws', () => {
    expect(() => fx.div(fx.fromInt(1), fx.ZERO)).toThrow(RangeError);
  });

  test('overflow throws', () => {
    expect(() => fx.div(fx.fromInt(2 ** 30), raw(1))).toThrow(RangeError);
  });
});

describe('sqrt', () => {
  test('exact squares', () => {
    expect(fx.sqrt(fx.fromInt(4))).toBe(fx.fromInt(2));
    expect(fx.sqrt(fx.fromFloat(0.25))).toBe(fx.fromFloat(0.5));
    expect(fx.sqrt(fx.ZERO)).toBe(0);
  });

  test('negative input throws', () => {
    expect(() => fx.sqrt(fx.fromInt(-1))).toThrow(RangeError);
  });

  test('is the floor of the true root on 10 000 values', () => {
    let seed = 12345;
    for (let i = 0; i < 10_000; i++) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      const a = i < 5_000 ? i : seed * 64;
      const r = fx.sqrt(raw(a));
      const target = BigInt(a) * BigInt(FX_ONE);
      const rr = BigInt(r);
      expect(rr * rr <= target && (rr + 1n) * (rr + 1n) > target).toBe(true);
    }
  });
});

describe('comparison and helpers', () => {
  test('min, max, clamp, abs, neg', () => {
    const one = fx.fromInt(1);
    const two = fx.fromInt(2);
    expect(fx.min(one, two)).toBe(one);
    expect(fx.max(one, two)).toBe(two);
    expect(fx.clamp(fx.fromInt(5), one, two)).toBe(two);
    expect(fx.clamp(fx.fromInt(-5), one, two)).toBe(one);
    expect(fx.abs(fx.fromInt(-3))).toBe(fx.fromInt(3));
    expect(fx.neg(one)).toBe(fx.fromInt(-1));
  });
});
