/**
 * Local ghost of the best lap. The record is the replay of the session up to
 * the end of that lap plus the moment the lap started; the ghost is rebuilt
 * by playing the replay through the simulation and follows the player's
 * current lap time.
 */

import { buildReplay, decodeReplay, encodeReplay } from '@limitlap/replay';
import {
  createCar,
  fx,
  step,
  type Command,
  type Fx,
  type Lane,
  type LapEvent,
  type PhysicsProfile,
} from '@limitlap/sim';
import type { Session } from './session.ts';

export interface GhostRecord {
  /** Replay bytes as hex. */
  replay: string;
  /** Moment the lap started, raw fixed-point ticks. */
  lapStart: number;
  /** Lap time, raw fixed-point ticks. */
  lapTime: number;
}

export interface Ghost {
  /** Distance at every tick, unwrapped across laps. */
  distances: Float64Array;
  /** Moment the lap started, ticks. */
  lapStart: number;
  /** Lap time, ticks. */
  lapTime: number;
  record: GhostRecord;
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) =>
  Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

export function recordBestLap(session: Session, lap: LapEvent): GhostRecord {
  const replay = buildReplay(
    {
      trackId: session.track.id,
      trackVersion: session.track.version,
      profileId: session.profile.id,
      profileVersion: session.profile.version,
      seed: 0,
      lane: session.laneIndex,
      flags: 0,
    },
    session.commands,
    session.state,
  );
  return {
    replay: toHex(encodeReplay(replay)),
    lapStart: fx.sub(session.state.lapStart, lap.time),
    lapTime: lap.time,
  };
}

export function buildGhost(record: GhostRecord, lane: Lane, profile: PhysicsProfile): Ghost {
  const commands = decodeReplay(fromHex(record.replay)).commands;
  const length = fx.toNumber(lane.length);
  const distances = new Float64Array(commands.length + 1);
  let state = createCar();
  for (let tick = 1; tick <= commands.length; tick++) {
    state = step(state, commands[tick - 1] as Command, lane, profile);
    distances[tick] = state.lap * length + fx.toNumber(state.distance);
  }
  return {
    distances,
    lapStart: fx.toNumber(record.lapStart as Fx),
    lapTime: fx.toNumber(record.lapTime as Fx),
    record,
  };
}

/** Ghost distance `sinceLapStart` ticks into its lap, or `null` outside the lap. */
export function ghostDistanceAt(ghost: Ghost, sinceLapStart: number): number | null {
  if (sinceLapStart < 0 || sinceLapStart > ghost.lapTime) return null;
  const moment = ghost.lapStart + sinceLapStart;
  const last = ghost.distances.length - 1;
  const i = Math.min(Math.floor(moment), last);
  const next = Math.min(i + 1, last);
  const f = moment - i;
  return (ghost.distances[i] ?? 0) * (1 - f) + (ghost.distances[next] ?? 0) * f;
}

export const ghostKey = (track: string, profile: string, lane: number) =>
  `limitlap:ghost:${track}:${profile}:${lane}`;

export function loadGhost(key: string): GhostRecord | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return null;
    const { replay, lapStart, lapTime } = raw as Record<string, unknown>;
    if (typeof replay !== 'string' || typeof lapStart !== 'number' || typeof lapTime !== 'number') {
      return null;
    }
    return { replay, lapStart, lapTime };
  } catch {
    return null;
  }
}

export function saveGhost(key: string, record: GhostRecord): void {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Storage full or blocked: the ghost just is not kept.
  }
}
