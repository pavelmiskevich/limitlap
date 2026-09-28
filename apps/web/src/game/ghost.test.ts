import { botCommand, DEFAULT_PROFILE as profile, fx, type SimEvent } from '@limitlap/sim';
import { compileTrack, PROTO_RING } from '@limitlap/tracks';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  buildGhost,
  ghostDistanceAt,
  ghostKey,
  loadGhost,
  recordBestLap,
  saveGhost,
  type GhostRecord,
} from './ghost.ts';
import { createSession } from './session.ts';

const track = compileTrack(PROTO_RING);

function driveTwoLaps(share = 0.97) {
  const session = createSession({ track, lane: 1, profile });
  const laps: SimEvent[] = [];
  while (session.state.lap < 2) {
    session.update(botCommand(session.state, session.lane, profile, fx.fromFloat(share)));
    laps.push(...session.lastEvents.filter((e) => e.type === 'lap'));
  }
  return { session, laps };
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('recordBestLap', () => {
  test('keeps the lap with its start moment and time', () => {
    const { session, laps } = driveTwoLaps();
    const lap = laps[1];
    if (lap?.type !== 'lap') throw new Error('no lap');
    const record = recordBestLap(session, lap);
    expect(record.lapTime).toBe(lap.time);
    expect(record.lapStart).toBe(fx.sub(session.state.lapStart, lap.time));
  });
});

describe('ghost timeline', () => {
  const { session, laps } = driveTwoLaps();
  const lap = laps[1];
  if (lap?.type !== 'lap') throw new Error('no lap');
  const ghost = buildGhost(recordBestLap(session, lap), session.lane, profile);
  const length = fx.toNumber(session.lane.length);

  test('starts the lap on the start line and ends it a lap later', () => {
    const start = ghostDistanceAt(ghost, 0) ?? NaN;
    const end = ghostDistanceAt(ghost, fx.toNumber(lap.time)) ?? NaN;
    // Distance from the start line, whichever side of it the sample falls on.
    const offLine = ((start + length / 2) % length) - length / 2;
    expect(offLine).toBeCloseTo(0, 1);
    expect(end - start).toBeCloseTo(length, 1);
  });

  test('moves forward all the way', () => {
    let previous = -Infinity;
    for (let t = 0; t < fx.toNumber(lap.time); t += 7.5) {
      const d = ghostDistanceAt(ghost, t) ?? NaN;
      expect(d).toBeGreaterThan(previous);
      previous = d;
    }
  });

  test('disappears after its lap is over', () => {
    expect(ghostDistanceAt(ghost, fx.toNumber(lap.time) + 1)).toBeNull();
  });
});

describe('ghost storage', () => {
  const record: GhostRecord = { replay: 'abcd', lapStart: 123, lapTime: 456 };
  const key = ghostKey('proto-ring@1', 'standard@1', 1);

  test('the key separates track, profile and lane', () => {
    expect(key).toBe('limitlap:ghost:proto-ring@1:standard@1:1');
  });

  test('saves and loads a ghost', () => {
    saveGhost(key, record);
    expect(loadGhost(key)).toEqual(record);
  });

  test('missing, broken or blocked storage gives no ghost', () => {
    expect(loadGhost(key)).toBeNull();
    localStorage.setItem(key, '{"replay":1}');
    expect(loadGhost(key)).toBeNull();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadGhost(key)).toBeNull();
  });
});
