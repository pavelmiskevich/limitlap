import {
  botCommand,
  createCar,
  DEFAULT_PROFILE,
  fx,
  segmentLimits,
  step,
  type SimEvent,
} from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { compileTrack } from './compile.ts';
import { PROTO_RING, PROTO_RING_SOLO } from './prototypes.ts';

const ring = compileTrack(PROTO_RING);

function botLap(lane = 0, share = 0.95) {
  const track = ring.lanes[lane];
  if (!track) throw new Error('no lane');
  const events: SimEvent[] = [];
  let state = createCar();
  for (let i = 0; i < 60 * 120 && state.lap < 2; i++) {
    state = step(
      state,
      botCommand(state, track, DEFAULT_PROFILE, fx.fromFloat(share)),
      track,
      DEFAULT_PROFILE,
      events,
    );
  }
  return events;
}

describe('prototype ring', () => {
  test('comes in a four-lane and a single-lane variant of the same layout', () => {
    expect(PROTO_RING.lanes).toBe(4);
    expect(PROTO_RING_SOLO.lanes).toBe(1);
    expect(PROTO_RING_SOLO.sections).toEqual(PROTO_RING.sections);
  });

  test('has straights, turns of different radii and a loop', () => {
    const kinds = new Set(PROTO_RING.sections.map((s) => s.type));
    expect(kinds).toEqual(new Set(['straight', 'turn', 'loop']));
    const radii = PROTO_RING.sections.flatMap((s) => (s.type === 'turn' ? [s.radius] : []));
    expect(new Set(radii).size).toBeGreaterThanOrEqual(3);
  });

  test('has both slow and fast corners', () => {
    const limits = segmentLimits(ring.lanes[1] ?? ring.lanes[0]!, DEFAULT_PROFILE).flatMap((l) =>
      l.max === null ? [] : [fx.toNumber(l.max)],
    );
    expect(Math.min(...limits)).toBeLessThan(45);
    expect(Math.max(...limits)).toBeGreaterThan(60);
  });

  test('a good lap takes 20–35 seconds', () => {
    const laps = botLap(1).filter((e) => e.type === 'lap');
    const second = laps[1];
    expect(second).toBeDefined();
    const seconds = fx.toNumber(second?.time ?? fx.ZERO) / 60;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(35);
  });

  test('every lane can be driven without deslots at 95 % of the limit', () => {
    for (let lane = 0; lane < 4; lane++) {
      expect(botLap(lane).filter((e) => e.type === 'deslot')).toEqual([]);
    }
  });
});
