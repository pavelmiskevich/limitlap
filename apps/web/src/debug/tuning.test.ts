import { DEFAULT_PROFILE, parseProfile } from '@limitlap/sim';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PARAMETERS, loadTuning, saveTuning, setParameter, tunedProfile } from './tuning.ts';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const base = DEFAULT_PROFILE.source;

describe('tunedProfile', () => {
  test('is a valid profile with an id derived from its values', () => {
    const tuned = tunedProfile(base);
    expect(() => parseProfile(tuned)).not.toThrow();
    expect(tuned.id).toMatch(/^tuned-[0-9a-f]{8}$/);
    expect(tuned.version).toBe(1);
  });

  test('the same values give the same id, different values another one', () => {
    expect(tunedProfile(base).id).toBe(tunedProfile({ ...base }).id);
    expect(tunedProfile({ ...base, aHold: 41 }).id).not.toBe(tunedProfile(base).id);
  });
});

describe('parameters', () => {
  test('cover every tunable number of the profile', () => {
    expect(PARAMETERS.map((p) => p.path)).toEqual([
      'accel',
      'brake',
      'vTop',
      'aHold',
      'loopGravity',
      'edge.width',
      'edge.fillRate',
      'edge.drainRate',
      'deslotPause',
      'rewindLimit',
      'pedalRamp',
    ]);
  });

  test('the default profile lies inside every slider range', () => {
    for (const p of PARAMETERS) {
      const value = p.get(base);
      expect(value).toBeGreaterThanOrEqual(p.min);
      expect(value).toBeLessThanOrEqual(p.max);
    }
  });

  test('setParameter changes one value and keeps the rest', () => {
    const next = setParameter(base, 'edge.width', 0.08);
    expect(next.edge.width).toBe(0.08);
    expect(next.edge.fillRate).toBe(base.edge.fillRate);
    expect(base.edge.width).toBe(0.06);
  });
});

describe('storage', () => {
  test('keeps the tuned values across reloads', () => {
    saveTuning(setParameter(base, 'accel', 20));
    expect(loadTuning()?.accel).toBe(20);
  });

  test('broken or blocked storage gives nothing', () => {
    localStorage.setItem('limitlap:tuning', '{"accel":"fast"}');
    expect(loadTuning()).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTuning()).toBeNull();
  });
});
