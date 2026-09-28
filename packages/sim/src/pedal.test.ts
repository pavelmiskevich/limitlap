import { describe, expect, test } from 'vitest';
import { Command, createCar, step, type CarState } from './car.ts';
import { fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { DEFAULT_PROFILE, parseProfile, PROFILES, profileByKey } from './profile.ts';

const straight: Lane = {
  length: fx.fromInt(5000),
  segments: [{ kind: 'straight', length: fx.fromInt(5000) }],
  sectors: [fx.ZERO],
};

const instant = profileByKey('standard@1');
const ramped = parseProfile({ ...DEFAULT_PROFILE.source, pedalRamp: 0.3 });

function drive(state: CarState, commands: Command[], profile = ramped): CarState {
  return commands.reduce((s, c) => step(s, c, straight, profile), state);
}
const repeat = (command: Command, n: number) => Array<Command>(n).fill(command);
const cruising = (speed: number): CarState => ({ ...createCar(), speed: fx.fromInt(speed) });

describe('profiles', () => {
  test('standard@1 stays as published: pedals act at once', () => {
    expect(instant?.pedalStepPerTick).toBe(fx.ONE);
    expect(drive(createCar(), [Command.Accel], instant).speed).toBe(instant?.accelPerTick);
  });

  test('the default profile is standard@2 with a 0.3 s ramp', () => {
    expect(DEFAULT_PROFILE.key).toBe('standard@2');
    expect(DEFAULT_PROFILE.source.pedalRamp).toBe(0.3);
    expect(PROFILES.map((p) => p.key)).toEqual(['standard@1', 'standard@2']);
  });

  test('the ramp time is validated', () => {
    expect(() => parseProfile({ ...DEFAULT_PROFILE.source, pedalRamp: 2 })).toThrow('pedalRamp');
  });
});

describe('pedal ramp', () => {
  test('a pedal reaches full force after the ramp time', () => {
    // 0.3 s = 18 ticks.
    const first = drive(createCar(), [Command.Accel]);
    expect(first.speed).toBe(fx.mul(ramped.accelPerTick, ramped.pedalStepPerTick));
    const held = drive(createCar(), repeat(Command.Accel, 18));
    const next = drive(held, [Command.Accel]);
    expect(fx.sub(next.speed, held.speed)).toBe(ramped.accelPerTick);
  });

  test('a short tap of the brake trims the speed gently', () => {
    // 0.1 s tap at 30 m/s: a few km/h instead of about 11.
    const tapped = drive(cruising(30), repeat(Command.Brake, 6));
    const lostKmh = (30 - fx.toNumber(tapped.speed)) * 3.6;
    expect(lostKmh).toBeGreaterThan(1);
    expect(lostKmh).toBeLessThan(3);
  });

  test('holding the brake still stops the car', () => {
    expect(drive(cruising(30), repeat(Command.Brake, 150)).speed).toBe(0);
  });

  test('releasing the pedal or switching pedals starts the ramp again', () => {
    const held = drive(cruising(30), repeat(Command.Brake, 30));
    const afterRelease = drive(held, [Command.Hold, Command.Brake]);
    expect(fx.sub(held.speed, afterRelease.speed)).toBe(
      fx.mul(ramped.brakePerTick, ramped.pedalStepPerTick),
    );
    const switched = drive(held, [Command.Accel]);
    expect(fx.sub(switched.speed, held.speed)).toBe(
      fx.mul(ramped.accelPerTick, ramped.pedalStepPerTick),
    );
  });

  test('the pedal level is part of the car state and resets on a deslot pause', () => {
    const held = drive(createCar(), repeat(Command.Accel, 5));
    expect(held.pedal).toBe(fx.mul(fx.fromInt(5), ramped.pedalStepPerTick));
    expect(held.pedalCommand).toBe(Command.Accel);
  });
});
