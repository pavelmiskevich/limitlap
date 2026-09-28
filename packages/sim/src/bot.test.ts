import { describe, expect, test } from 'vitest';
import { botCommand } from './bot.ts';
import { Command, createCar, step, type CarState, type SimEvent } from './car.ts';
import { fx, type Fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { DEFAULT_PROFILE as profile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

const lane: Lane = {
  length: m(820),
  segments: [
    { kind: 'straight', length: m(200) },
    { kind: 'turn', length: m(120), radius: m(60) },
    { kind: 'straight', length: m(150) },
    { kind: 'turn', length: m(90), radius: m(25) },
    { kind: 'straight', length: m(100) },
    { kind: 'loop', length: m(60), radius: m(10) },
    { kind: 'turn', length: m(100), radius: m(120) },
  ],
  sectors: [m(0), m(320), m(560)],
};

function race(share: number, laps = 2) {
  const events: SimEvent[] = [];
  const target: Fx = fx.fromFloat(share);
  let state: CarState = createCar();
  for (let i = 0; i < 60 * 300 && state.lap < laps; i++) {
    state = step(state, botCommand(state, lane, profile, target), lane, profile, events);
  }
  return { state, events, deslots: events.filter((e) => e.type === 'deslot') };
}

describe('botCommand', () => {
  test('at 90 % of the limit the bot finishes laps without a deslot', () => {
    const { state, deslots } = race(0.9);
    expect(state.lap).toBe(2);
    expect(deslots).toEqual([]);
  });

  test('at 110 % of the limit the bot keeps deslotting', () => {
    const { deslots } = race(1.1, 1);
    expect(deslots.length).toBeGreaterThanOrEqual(3);
  });

  test('a faster share gives a faster lap while it stays on the lane', () => {
    const lapOf = (share: number) => race(share, 1).events.find((e) => e.type === 'lap')?.time;
    const slow = lapOf(0.8) ?? fx.ZERO;
    const fast = lapOf(0.95) ?? fx.ZERO;
    expect(race(0.95, 1).deslots).toEqual([]);
    expect(fast).toBeLessThan(slow);
  });

  test('on a long straight the bot goes flat out', () => {
    const straight: Lane = {
      length: m(2000),
      segments: [{ kind: 'straight', length: m(2000) }],
      sectors: [m(0)],
    };
    const standing = createCar();
    expect(botCommand(standing, straight, profile, fx.fromFloat(0.9))).toBe(Command.Accel);
  });

  test('the bot brakes before a turn it cannot take at its speed', () => {
    const fast: CarState = { ...createCar(), speed: fx.fromInt(85), distance: m(150) };
    expect(botCommand(fast, lane, profile, fx.fromFloat(0.9))).toBe(Command.Brake);
  });

  test('the same share always drives the same race', () => {
    expect(race(0.93).events).toEqual(race(0.93).events);
  });
});
