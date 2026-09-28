import { describe, expect, test } from 'vitest';
import standard from '../profiles/standard-1.json' with { type: 'json' };
import { fx } from './fixed.ts';
import { DEFAULT_PROFILE, parseProfile, ProfileError, type ProfileJson } from './profile.ts';

function variant(patch: (json: Record<string, unknown>) => void): unknown {
  const json = JSON.parse(JSON.stringify(standard)) as Record<string, unknown>;
  patch(json);
  return json;
}

function issuesOf(json: unknown): string[] {
  try {
    parseProfile(json);
  } catch (error) {
    if (error instanceof ProfileError) return error.issues;
    throw error;
  }
  return [];
}

describe('default profile', () => {
  test('the profile in the repository is valid', () => {
    expect(() => parseProfile(standard)).not.toThrow();
  });

  test('DEFAULT_PROFILE is the parsed standard profile', () => {
    expect(DEFAULT_PROFILE.key).toBe('standard@1');
    expect(DEFAULT_PROFILE.source).toEqual(standard);
  });
});

describe('conversion to per-tick values', () => {
  const base: ProfileJson = standard;
  const profile = parseProfile({
    ...base,
    accel: 12,
    brake: 30,
    deslotPause: 0.5,
    rewindLimit: 10,
    edge: { width: 0.06, fillRate: 3, drainRate: 1.5 },
  });

  test('accelerations become speed change per tick', () => {
    expect(profile.accelPerTick).toBe(fx.div(fx.fromInt(12), fx.fromInt(60)));
    expect(profile.brakePerTick).toBe(fx.div(fx.fromInt(30), fx.fromInt(60)));
  });

  test('rates become change per tick', () => {
    expect(profile.edgeFillPerTick).toBe(fx.div(fx.fromInt(3), fx.fromInt(60)));
    expect(profile.edgeDrainPerTick).toBe(fx.div(fx.fromFloat(1.5), fx.fromInt(60)));
  });

  test('durations become whole ticks', () => {
    expect(profile.deslotPauseTicks).toBe(30);
    expect(profile.rewindLimitTicks).toBe(600);
  });

  test('plain values keep their units', () => {
    expect(profile.vTop).toBe(fx.fromFloat(base.vTop));
    expect(profile.aHold).toBe(fx.fromFloat(base.aHold));
    expect(profile.edgeWidth).toBe(fx.fromFloat(0.06));
  });

  test('the key combines id and version', () => {
    expect(parseProfile({ ...base, id: 'season-2', version: 3 }).key).toBe('season-2@3');
  });
});

describe('validation', () => {
  test('rejects a non-object', () => {
    expect(issuesOf(42)).toEqual(['profile must be an object']);
  });

  test('id must be a lowercase slug', () => {
    expect(issuesOf(variant((j) => (j.id = 'Standard Profile')))).toEqual([
      'id: use lowercase letters, digits and dashes',
    ]);
  });

  test('version must be a positive integer', () => {
    expect(issuesOf(variant((j) => (j.version = 1.5)))).toEqual([
      'version: must be an integer ≥ 1',
    ]);
  });

  test('physical values must be positive numbers', () => {
    expect(
      issuesOf(
        variant((j) => {
          j.accel = 0;
          j.vTop = '90';
        }),
      ),
    ).toEqual(['accel: must be a number > 0', 'vTop: must be a number > 0']);
  });

  test('edge width must be a fraction up to 0.5', () => {
    expect(issuesOf(variant((j) => ((j.edge as Record<string, unknown>).width = 0.8)))).toEqual([
      'edge.width: must be a number in (0, 0.5]',
    ]);
  });

  test('durations are limited', () => {
    expect(issuesOf(variant((j) => (j.rewindLimit = 120)))).toEqual([
      'rewindLimit: must be a number in [0, 60]',
    ]);
  });

  test('probabilistic deslot needs a boolean switch', () => {
    expect(
      issuesOf(variant((j) => ((j.probabilisticDeslot as Record<string, unknown>).enabled = 'no'))),
    ).toEqual(['probabilisticDeslot.enabled: must be true or false']);
  });

  test('missing and unknown keys are reported', () => {
    expect(
      issuesOf(
        variant((j) => {
          delete j.brake;
          j.acel = 12;
        }),
      ),
    ).toEqual(['brake: must be a number > 0', 'acel: unknown key']);
  });

  test('the error message lists every issue', () => {
    expect(() => parseProfile(variant((j) => (j.accel = -1)))).toThrow(
      'invalid physics profile:\n- accel: must be a number > 0',
    );
  });
});
