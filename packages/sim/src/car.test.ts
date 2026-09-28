import { describe, expect, test } from 'vitest';
import { Command, createCar, step, type CarState } from './car.ts';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { DEFAULT_PROFILE as profile } from './profile.ts';

const m = (meters: number) => fx.fromInt(meters);

const lane: Lane = {
  length: m(300),
  segments: [
    { kind: 'straight', length: m(100) },
    { kind: 'turn', length: m(150), radius: m(80) },
    { kind: 'straight', length: m(50) },
  ],
  sectors: [m(0)],
};

function run(state: CarState, command: Command, ticks: number): CarState {
  let current = state;
  for (let i = 0; i < ticks; i++) current = step(current, command, lane, profile);
  return current;
}

const atSpeed = (speed: number, distance = 0): CarState => ({
  ...createCar(),
  speed: fx.fromInt(speed),
  distance: fx.fromInt(distance),
});

describe('createCar', () => {
  test('starts at the line, standing, in the first segment', () => {
    expect(createCar()).toEqual({
      tick: 0,
      lap: 0,
      distance: 0,
      speed: 0,
      segment: 0,
      grip: 0,
      slip: 0,
      pause: 0,
      sector: 0,
      sectorStart: 0,
      lapStart: 0,
    });
  });
});

describe('speed', () => {
  test('throttle adds accelPerTick every tick', () => {
    expect(run(createCar(), Command.Accel, 3).speed).toBe(3 * profile.accelPerTick);
  });

  test('speed never exceeds vTop', () => {
    const straight: Lane = {
      length: m(1000),
      segments: [{ kind: 'straight', length: m(1000) }],
      sectors: [m(0)],
    };
    let state = createCar();
    for (let i = 0; i < 60 * 60; i++) state = step(state, Command.Accel, straight, profile);
    expect(state.speed).toBe(profile.vTop);
  });

  test('without commands the speed is kept', () => {
    expect(run(atSpeed(30), Command.Hold, 120).speed).toBe(fx.fromInt(30));
  });

  test('brake removes brakePerTick every tick and stops at zero', () => {
    expect(run(atSpeed(30), Command.Brake, 2).speed).toBe(
      fx.fromInt(30) - 2 * profile.brakePerTick,
    );
    expect(run(atSpeed(1), Command.Brake, 60).speed).toBe(0);
  });

  test('speed never jumps by more than one tick of acceleration or braking', () => {
    const limit = fx.max(profile.accelPerTick, profile.brakePerTick);
    let state = createCar();
    const commands = [Command.Accel, Command.Brake, Command.Hold];
    for (let i = 0; i < 600; i++) {
      const next = step(state, commands[i % 3] ?? Command.Hold, lane, profile);
      expect(fx.abs(fx.sub(next.speed, state.speed))).toBeLessThanOrEqual(limit);
      state = next;
    }
  });
});

describe('movement', () => {
  test('each tick moves the car by speed / 60', () => {
    const next = step(atSpeed(30), Command.Hold, lane, profile);
    expect(next.distance).toBe(fx.fromFloat(0.5));
    expect(next.tick).toBe(1);
  });

  test('crossing a segment boundary advances the segment index', () => {
    const next = run(atSpeed(30, 99), Command.Hold, 2);
    expect(next.distance).toBe(m(100));
    expect(next.segment).toBe(1);
  });

  test('finishing a lap wraps the distance and counts the lap', () => {
    const next = run({ ...atSpeed(60, 299), segment: 2 }, Command.Hold, 2);
    expect(next.lap).toBe(1);
    expect(next.distance).toBe(m(1));
    expect(next.segment).toBe(0);
  });

  test('a fast car can cross several short segments in one tick', () => {
    const shortLane: Lane = {
      length: m(3),
      segments: [
        { kind: 'straight', length: m(1) },
        { kind: 'straight', length: m(1) },
        { kind: 'straight', length: m(1) },
      ],
      sectors: [m(0)],
    };
    const next = step(atSpeed(150), Command.Hold, shortLane, profile);
    expect(next.distance).toBe(fx.fromFloat(2.5));
    expect(next.segment).toBe(2);
  });
});

describe('determinism', () => {
  test('the same commands give the same state', () => {
    const commands = Array.from({ length: 900 }, (_, i) =>
      i % 7 === 0 ? Command.Brake : i % 3 === 0 ? Command.Hold : Command.Accel,
    );
    const drive = () => commands.reduce((s, c) => step(s, c, lane, profile), createCar());
    expect(drive()).toEqual(drive());
  });
});
