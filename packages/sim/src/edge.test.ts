import { describe, expect, test } from 'vitest';
import { Command, createCar, step, type CarState, type SimEvent } from './car.ts';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { segmentLimits } from './limits.ts';
import { DEFAULT_PROFILE, parseProfile, type PhysicsProfile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

// aHold 40 · r 90 → the turn holds exactly 60 m/s.
const profile = parseProfile({
  ...DEFAULT_PROFILE.source,
  aHold: 40,
  edge: { width: 0.06, fillRate: 3, drainRate: 1.5 },
});
const LIMIT = fx.fromInt(60);

const lane: Lane = {
  length: m(400),
  segments: [
    { kind: 'straight', length: m(100) },
    { kind: 'turn', length: m(60), radius: m(90) },
    { kind: 'straight', length: m(240) },
  ],
  sectors: [m(0)],
};

/** A car in the turn, moving at `limit · (1 + excess)`. */
const inTurn = (excess: number, extra: Partial<CarState> = {}): CarState => ({
  ...createCar(),
  distance: m(101),
  segment: 1,
  speed: fx.mul(LIMIT, fx.add(fx.ONE, fx.fromFloat(excess))),
  ...extra,
});

function drive(
  state: CarState,
  ticks: number,
  command: Command = Command.Hold,
  p: PhysicsProfile = profile,
) {
  const events: SimEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) current = step(current, command, lane, p, events);
  return { state: current, events };
}

test('the turn in this lane holds exactly 60 m/s', () => {
  expect(segmentLimits(lane, profile)[1]?.max).toBe(LIMIT);
});

describe('edge zone', () => {
  test('at or below the limit the grip meter stays empty', () => {
    const { state, events } = drive(inTurn(0), 10);
    expect(state.grip).toBe(0);
    expect(state.slip).toBe(0);
    expect(events).toEqual([]);
  });

  test('inside the zone the meter fills in proportion to the excess', () => {
    const { state } = drive(inTurn(0.03), 1);
    const expected = fx.mul(profile.edgeFillPerTick, fx.div(fx.fromFloat(0.03), profile.edgeWidth));
    expect(fx.toNumber(state.grip)).toBeCloseTo(fx.toNumber(expected), 3);
    expect(fx.toNumber(state.slip)).toBeCloseTo(0.5, 3);
  });

  test('a bigger excess fills the meter faster', () => {
    const small = drive(inTurn(0.01), 5).state.grip;
    const big = drive(inTurn(0.04), 5).state.grip;
    expect(big).toBeGreaterThan(small);
  });

  test('below the limit the meter drains down to zero', () => {
    const filled = inTurn(0, { grip: fx.fromFloat(0.1) });
    const once = drive(filled, 1).state.grip;
    expect(once).toBe(fx.sub(fx.fromFloat(0.1), profile.edgeDrainPerTick));
    expect(drive(filled, 60).state.grip).toBe(0);
  });

  test('on a straight the meter drains', () => {
    const car = { ...createCar(), speed: fx.fromInt(80), grip: fx.fromFloat(0.5) };
    expect(drive(car, 1).state.grip).toBeLessThan(fx.fromFloat(0.5));
  });

  test('an excess beyond the zone width deslots at once', () => {
    const { events } = drive(inTurn(0.07), 1);
    expect(events).toEqual([
      { type: 'deslot', tick: 1, distance: expect.any(Number) as number, cause: 'over-limit' },
    ]);
    expect(events[0]?.distance).toBeGreaterThan(m(101));
  });

  test('a full meter deslots', () => {
    const { events } = drive(inTurn(0.05, { grip: fx.fromFloat(0.99) }), 1);
    expect(events).toEqual([expect.objectContaining({ type: 'deslot', cause: 'grip' })]);
  });

  test('driving inside the zone is faster than at the limit when the meter holds', () => {
    // 1.5 % over: the meter fills at 0.75 per second, the turn takes about a second.
    const atLimit = drive(inTurn(0, { distance: m(100) }), 80);
    const onEdge = drive(inTurn(0.015, { distance: m(100) }), 80);
    expect(onEdge.events).toEqual([]);
    expect(onEdge.state.distance).toBeGreaterThan(atLimit.state.distance);
  });

  test('the zone width comes from the profile', () => {
    const narrow = parseProfile({
      ...profile.source,
      edge: { ...profile.source.edge, width: 0.02 },
    });
    expect(drive(inTurn(0.03), 1, Command.Hold, narrow).events).toHaveLength(1);
    expect(drive(inTurn(0.03), 1).events).toHaveLength(0);
  });
});

describe('deslot and magnetic capture', () => {
  test('the car is put back on the lane at the deslot point with zero speed', () => {
    const before = inTurn(0.07);
    const { state } = drive(before, 1);
    expect(state.speed).toBe(0);
    expect(state.grip).toBe(0);
    expect(state.distance).toBeGreaterThanOrEqual(before.distance);
  });

  test('without a pause the car accelerates on the next tick', () => {
    const { state } = drive(inTurn(0.07), 2, Command.Accel);
    expect(state.speed).toBe(profile.accelPerTick);
  });

  test('the pause from the profile holds the car in place', () => {
    const paused = parseProfile({ ...profile.source, deslotPause: 0.5 });
    const deslotted = drive(inTurn(0.07), 1, Command.Hold, paused).state;
    expect(deslotted.pause).toBe(30);

    const during = drive(deslotted, 30, Command.Accel, paused).state;
    expect(during.speed).toBe(0);
    expect(during.distance).toBe(deslotted.distance);

    const after = drive(during, 1, Command.Accel, paused).state;
    expect(after.speed).toBe(paused.accelPerTick);
  });

  test('every deslot is reported once', () => {
    const car = { ...createCar(), speed: fx.fromInt(90) };
    const { events } = drive(car, 200, Command.Accel);
    const deslots = events.filter((e) => e.type === 'deslot');
    expect(deslots.length).toBeGreaterThanOrEqual(1);
    expect(new Set(deslots.map((e) => e.tick)).size).toBe(deslots.length);
  });
});

test('the default profile keeps a deslot pause of zero', () => {
  expect(DEFAULT_PROFILE.deslotPauseTicks).toBe(0);
});
