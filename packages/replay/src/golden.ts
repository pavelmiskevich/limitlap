/**
 * Golden replays: recorded drives with a frozen outcome. Any change of the
 * simulation that alters the result of an old replay shows up as a failing
 * test, in Node and in browser engines alike.
 */

import {
  botCommand,
  Command,
  createCar,
  DEFAULT_PROFILE,
  fx,
  step,
  type CarState,
  type Lane,
  type LaneSegment,
  type PhysicsProfile,
  type SimEvent,
} from '@limitlap/sim';
import { encodeReplay, stateChecksum, type Replay } from './format.ts';

/** Lane described in plain metres, as stored in fixtures. */
export interface LaneSpec {
  segments: (
    { kind: 'straight'; length: number } | { kind: 'turn' | 'loop'; length: number; radius: number }
  )[];
  sectors: number[];
}

export interface GoldenCase {
  name: string;
  lane: string;
  /** Replay bytes as hex. */
  replay: string;
  expected: {
    checksum: number;
    /** Lap times in raw fixed-point ticks. */
    laps: number[];
    deslots: number;
  };
}

export const LANES: Record<string, LaneSpec> = {
  ring: {
    segments: [
      { kind: 'straight', length: 200 },
      { kind: 'turn', length: 120, radius: 60 },
      { kind: 'straight', length: 150 },
      { kind: 'turn', length: 90, radius: 25 },
      { kind: 'straight', length: 100 },
      { kind: 'loop', length: 60, radius: 10 },
      { kind: 'turn', length: 100, radius: 120 },
    ],
    sectors: [0, 320, 560],
  },
  hairpins: {
    segments: [
      { kind: 'straight', length: 140 },
      { kind: 'turn', length: 40, radius: 15 },
      { kind: 'straight', length: 60.5 },
      { kind: 'turn', length: 45.25, radius: 18.75 },
      { kind: 'straight', length: 90 },
      { kind: 'turn', length: 200, radius: 95 },
    ],
    sectors: [0, 180, 336.75],
  },
};

export function buildLane(spec: LaneSpec): Lane {
  const segments: LaneSegment[] = spec.segments.map((s) =>
    s.kind === 'straight'
      ? { kind: 'straight', length: fx.fromFloat(s.length) }
      : { kind: s.kind, length: fx.fromFloat(s.length), radius: fx.fromFloat(s.radius) },
  );
  return {
    length: segments.reduce((sum, s) => fx.add(sum, s.length), fx.ZERO),
    segments,
    sectors: spec.sectors.map((s) => fx.fromFloat(s)),
  };
}

export interface Drive {
  state: CarState;
  events: SimEvent[];
}

/** Runs recorded commands through the simulation. */
export function playCommands(commands: Uint8Array, lane: Lane, profile: PhysicsProfile): Drive {
  const events: SimEvent[] = [];
  let state = createCar();
  for (const command of commands) state = step(state, command as Command, lane, profile, events);
  return { state, events };
}

export function summarize(drive: Drive): GoldenCase['expected'] {
  return {
    checksum: stateChecksum(drive.state),
    laps: drive.events.flatMap((e) => (e.type === 'lap' ? [e.time as number] : [])),
    deslots: drive.events.filter((e) => e.type === 'deslot').length,
  };
}

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

// ---------------------------------------------------------------- generation

function botDrive(lane: Lane, profile: PhysicsProfile, share: number, laps: number): Uint8Array {
  const target = fx.fromFloat(share);
  const commands: number[] = [];
  let state = createCar();
  while (state.lap < laps && commands.length < 60 * 600) {
    const command = botCommand(state, lane, profile, target);
    commands.push(command);
    state = step(state, command, lane, profile);
  }
  return Uint8Array.from(commands);
}

/** Pseudo-random driver: throttle-heavy, with bursts of braking and holding. */
function noisyDrive(ticks: number, seed: number): Uint8Array {
  const commands = new Uint8Array(ticks);
  let s = seed >>> 0;
  let current: number = Command.Accel;
  for (let i = 0; i < ticks; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (s % 23 === 0)
      current = [Command.Accel, Command.Accel, Command.Hold, Command.Brake][s % 4] ?? 0;
    commands[i] = current;
  }
  return commands;
}

export function generateCases(profile: PhysicsProfile = DEFAULT_PROFILE): GoldenCase[] {
  const plans: { name: string; lane: string; commands: (lane: Lane) => Uint8Array }[] = [
    { name: 'ring-bot-85', lane: 'ring', commands: (l) => botDrive(l, profile, 0.85, 3) },
    { name: 'ring-bot-97', lane: 'ring', commands: (l) => botDrive(l, profile, 0.97, 3) },
    { name: 'ring-bot-108', lane: 'ring', commands: (l) => botDrive(l, profile, 1.08, 2) },
    { name: 'hairpins-bot-93', lane: 'hairpins', commands: (l) => botDrive(l, profile, 0.93, 3) },
    { name: 'hairpins-noise', lane: 'hairpins', commands: () => noisyDrive(60 * 90, 7) },
    { name: 'ring-noise', lane: 'ring', commands: () => noisyDrive(60 * 90, 1234) },
  ];

  return plans.map(({ name, lane: laneName, commands: make }) => {
    const lane = buildLane(LANES[laneName] as LaneSpec);
    const commands = make(lane);
    const drive = playCommands(commands, lane, profile);
    const replay: Replay = {
      header: {
        trackId: `golden-${laneName}`,
        trackVersion: 1,
        profileId: profile.id,
        profileVersion: profile.version,
        seed: 0,
        lane: 0,
        flags: 0,
      },
      commands,
      checksum: stateChecksum(drive.state),
    };
    return {
      name,
      lane: laneName,
      replay: toHex(encodeReplay(replay)),
      expected: summarize(drive),
    };
  });
}
