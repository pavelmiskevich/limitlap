import { describe, expect, test } from 'vitest';
import { Command, createCar, step, type CarState, type SimEvent } from './car.ts';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { segmentLimits } from './limits.ts';
import { DEFAULT_PROFILE, parseProfile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

// loopGravity 10 · r 10 → the loop needs at least 10 m/s.
const profile = parseProfile({ ...DEFAULT_PROFILE.source, loopGravity: 10 });

const lane: Lane = {
  length: m(200),
  segments: [
    { kind: 'straight', length: m(100) },
    { kind: 'loop', length: m(60), radius: m(10) },
    { kind: 'straight', length: m(40) },
  ],
  sectors: [m(0)],
};

const inLoop = (speed: number): CarState => ({
  ...createCar(),
  distance: m(110),
  segment: 1,
  speed: fx.fromInt(speed),
});

function drive(state: CarState, ticks: number, command: Command = Command.Hold) {
  const events: SimEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) current = step(current, command, lane, profile, events);
  return { state: current, events };
}

describe('speed window', () => {
  test('a loop needs at least √(loopGravity · r)', () => {
    expect(segmentLimits(lane, profile)[1]).toEqual({ min: fx.fromInt(10), max: null });
  });

  test('a turn has an upper bound only', () => {
    const turnLane: Lane = {
      length: m(100),
      segments: [{ kind: 'turn', length: m(100), radius: m(90) }],
      sectors: [m(0)],
    };
    expect(segmentLimits(turnLane, profile)[0]?.min).toBeNull();
  });

  test('the loop is passed above the minimum speed', () => {
    expect(drive(inLoop(12), 60).events).toEqual([]);
  });

  test('below the minimum speed the car falls off the loop', () => {
    const { events } = drive(inLoop(9), 1);
    expect(events).toEqual([expect.objectContaining({ type: 'deslot', cause: 'too-slow' })]);
  });

  test('braking inside the loop below the minimum makes the car fall', () => {
    const { events } = drive(inLoop(11), 60, Command.Brake);
    expect(events.map((e) => e.cause)).toEqual(['too-slow']);
  });

  test('after falling the car is captured at the loop exit with zero speed', () => {
    const { state } = drive(inLoop(9), 1);
    expect(state.distance).toBe(m(160));
    expect(state.segment).toBe(2);
    expect(state.speed).toBe(0);
  });

  test('the car does not get stuck after falling', () => {
    const { state, events } = drive(inLoop(9), 120, Command.Accel);
    expect(events).toHaveLength(1);
    expect(state.distance).toBeGreaterThan(m(160));
  });

  test('a fall from a loop that ends the lap counts the lap', () => {
    const lastLoop: Lane = {
      length: m(160),
      segments: [
        { kind: 'straight', length: m(100) },
        { kind: 'loop', length: m(60), radius: m(10) },
      ],
      sectors: [m(0)],
    };
    const state = step(inLoop(9), Command.Hold, lastLoop, profile);
    expect(state.lap).toBe(1);
    expect(state.distance).toBe(0);
    expect(state.segment).toBe(0);
  });
});
