import { describe, expect, test } from 'vitest';
import { Command, createCar, fx } from '@limitlap/sim';
import { decodeReplay, encodeReplay, ReplayError, stateChecksum, type Replay } from './format.ts';
import { REPLAY_FORMAT_VERSION } from './index.ts';

function commandsWithChanges(ticks: number, changes: number): Uint8Array {
  const commands = new Uint8Array(ticks);
  const every = ticks / changes;
  const cycle = [Command.Accel, Command.Hold, Command.Brake, Command.Accel];
  for (let i = 0; i < ticks; i++) commands[i] = cycle[((i / every) % cycle.length) | 0] ?? 0;
  return commands;
}

const sample = (commands = commandsWithChanges(3600, 120)): Replay => ({
  header: {
    trackId: 'ring',
    trackVersion: 3,
    profileId: 'standard',
    profileVersion: 1,
    seed: 0xdeadbeef,
    lane: 2,
    flags: 0,
  },
  commands,
  checksum: 0x12345678,
});

describe('encode and decode', () => {
  test('a replay survives a round trip', () => {
    const replay = sample();
    expect(decodeReplay(encodeReplay(replay))).toEqual(replay);
  });

  test('a replay without commands survives a round trip', () => {
    const replay = sample(new Uint8Array(0));
    expect(decodeReplay(encodeReplay(replay))).toEqual(replay);
  });

  test('long runs and large numbers survive a round trip', () => {
    const replay = sample(new Uint8Array(200_000).fill(Command.Accel));
    replay.header.trackVersion = 2 ** 40;
    expect(decodeReplay(encodeReplay(replay))).toEqual(replay);
  });

  test('a minute with 120 command changes takes a few hundred bytes', () => {
    expect(encodeReplay(sample()).length).toBeLessThan(400);
  });

  test('the first byte is the format version', () => {
    expect(encodeReplay(sample())[0]).toBe(REPLAY_FORMAT_VERSION);
  });

  test('commands outside Hold / Accel / Brake are rejected', () => {
    expect(() => encodeReplay(sample(new Uint8Array([1, 3])))).toThrow(ReplayError);
  });
});

describe('damaged data', () => {
  test('a flipped byte is detected', () => {
    const bytes = encodeReplay(sample());
    bytes[10] = (bytes[10] ?? 0) ^ 0xff;
    expect(() => decodeReplay(bytes)).toThrow('replay is damaged');
  });

  test('truncated data is detected', () => {
    const bytes = encodeReplay(sample());
    expect(() => decodeReplay(bytes.slice(0, bytes.length - 7))).toThrow(ReplayError);
    expect(() => decodeReplay(new Uint8Array(0))).toThrow(ReplayError);
  });

  test('an unknown format version is rejected', () => {
    const bytes = encodeReplay(sample());
    bytes[0] = REPLAY_FORMAT_VERSION + 1;
    expect(() => decodeReplay(bytes)).toThrow('unsupported replay format');
  });
});

describe('stateChecksum', () => {
  test('equal states give equal checksums', () => {
    expect(stateChecksum(createCar())).toBe(stateChecksum(createCar()));
  });

  test('any change of the state changes the checksum', () => {
    const base = createCar();
    const variants = [
      { ...base, tick: 1 },
      { ...base, speed: fx.fromInt(1) },
      { ...base, distance: fx.fromFloat(0.5) },
      { ...base, grip: 1 as typeof base.grip },
      { ...base, lap: 1 },
    ];
    const sums = new Set([base, ...variants].map(stateChecksum));
    expect(sums.size).toBe(variants.length + 1);
  });

  test('is an unsigned 32-bit number', () => {
    const sum = stateChecksum({ ...createCar(), distance: fx.fromInt(123456) });
    expect(Number.isInteger(sum) && sum >= 0 && sum < 2 ** 32).toBe(true);
  });
});
