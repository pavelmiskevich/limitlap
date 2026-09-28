import { describe, expect, test } from 'vitest';
import { Command, createCar, step, type CarState, type SimEvent } from './car.ts';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { bestLap } from './laps.ts';
import { DEFAULT_PROFILE as profile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

const lane: Lane = {
  length: m(300),
  segments: [{ kind: 'straight', length: m(300) }],
  sectors: [m(0), m(100), m(200)],
};

function drive(speed: number, ticks: number) {
  const events: SimEvent[] = [];
  let state: CarState = { ...createCar(), speed: fx.fromInt(speed) };
  for (let i = 0; i < ticks; i++) state = step(state, Command.Hold, lane, profile, events);
  return { state, events };
}

describe('sectors and laps', () => {
  test('each sector boundary reports the sector time in ticks', () => {
    // 30 m/s = 0.5 m per tick: 100 m take exactly 200 ticks.
    const { events } = drive(30, 400);
    expect(events).toEqual([
      { type: 'sector', tick: 200, lap: 1, sector: 0, time: fx.fromInt(200) },
      { type: 'sector', tick: 400, lap: 1, sector: 1, time: fx.fromInt(200) },
    ]);
  });

  test('the finish line closes the last sector and the lap, in that order', () => {
    const { events } = drive(30, 600);
    expect(events.slice(-2)).toEqual([
      { type: 'sector', tick: 600, lap: 1, sector: 2, time: fx.fromInt(200) },
      { type: 'lap', tick: 600, lap: 1, time: fx.fromInt(600) },
    ]);
  });

  test('the second lap is timed from the moment the first one ended', () => {
    const { events, state } = drive(30, 1200);
    const laps = events.filter((e) => e.type === 'lap');
    expect(laps.map((e) => [e.lap, e.time])).toEqual([
      [1, fx.fromInt(600)],
      [2, fx.fromInt(600)],
    ]);
    expect(state.lap).toBe(2);
    expect(state.sector).toBe(0);
  });

  test('crossing between ticks is interpolated within the tick', () => {
    // 31 m/s: the car covers fx(31/60) m per tick, so 300 m take about 580.65 ticks.
    const { events } = drive(31, 600);
    const lap = events.find((e) => e.type === 'lap');
    const perTick = fx.toNumber(fx.div(fx.fromInt(31), fx.fromInt(60)));
    expect(lap?.tick).toBe(581);
    expect(fx.toNumber(lap?.time ?? fx.ZERO)).toBeCloseTo(300 / perTick, 3);
  });

  test('a sector boundary right after the finish is timed from the new lap', () => {
    const shortFirstSector: Lane = { ...lane, sectors: [m(0), fx.fromFloat(0.25)] };
    const events: SimEvent[] = [];
    // 60 m/s = 1 m per tick: from 299.5 m the finish is crossed half-way through the tick
    // and the 0.25 m boundary at three quarters.
    const start: CarState = {
      ...createCar(),
      speed: fx.fromInt(60),
      distance: fx.fromFloat(299.5),
      sector: 1,
    };
    step(start, Command.Hold, shortFirstSector, profile, events);
    expect(events).toEqual([
      { type: 'sector', tick: 1, lap: 1, sector: 1, time: fx.fromFloat(0.5) },
      { type: 'lap', tick: 1, lap: 1, time: fx.fromFloat(0.5) },
      { type: 'sector', tick: 1, lap: 2, sector: 0, time: fx.fromFloat(0.25) },
    ]);
  });

  test('a deslot does not reset lap timing', () => {
    const turnLane: Lane = {
      length: m(300),
      segments: [
        { kind: 'straight', length: m(100) },
        { kind: 'turn', length: m(100), radius: m(20) },
        { kind: 'straight', length: m(100) },
      ],
      sectors: [m(0)],
    };
    const events: SimEvent[] = [];
    let state: CarState = { ...createCar(), speed: fx.fromInt(60) };
    for (let i = 0; i < 3000 && state.lap === 0; i++) {
      state = step(state, Command.Hold, turnLane, profile, events);
      if (state.speed === 0) state = { ...state, speed: fx.fromInt(20) };
    }
    const types = events.map((e) => e.type);
    expect(types).toContain('deslot');
    expect(types.at(-1)).toBe('lap');
  });
});

describe('bestLap', () => {
  test('returns the fastest lap time', () => {
    const { events } = drive(30, 1200);
    expect(bestLap(events)).toBe(fx.fromInt(600));
  });

  test('is null before the first lap', () => {
    expect(bestLap(drive(30, 10).events)).toBeNull();
  });
});
