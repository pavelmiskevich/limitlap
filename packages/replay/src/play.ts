/** Recording a drive into a replay and playing a replay back through the simulation. */

import {
  createCar,
  step,
  type CarState,
  type Command,
  type Lane,
  type PhysicsProfile,
  type SimEvent,
} from '@limitlap/sim';
import { stateChecksum, type Replay, type ReplayHeader } from './format.ts';

export function buildReplay(
  header: ReplayHeader,
  commands: ArrayLike<number>,
  finalState: CarState,
): Replay {
  return {
    header: { ...header },
    commands: Uint8Array.from(commands),
    checksum: stateChecksum(finalState),
  };
}

export interface Playback {
  state: CarState;
  events: SimEvent[];
  /** The final state matches the checksum stored in the replay. */
  valid: boolean;
}

/** Runs commands through the simulation from a standing start. */
export function playCommands(
  commands: ArrayLike<number>,
  lane: Lane,
  profile: PhysicsProfile,
): { state: CarState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let state = createCar();
  for (let i = 0; i < commands.length; i++) {
    state = step(state, commands[i] as Command, lane, profile, events);
  }
  return { state, events };
}

export function playReplay(replay: Replay, lane: Lane, profile: PhysicsProfile): Playback {
  const { state, events } = playCommands(replay.commands, lane, profile);
  return { state, events, valid: stateChecksum(state) === replay.checksum };
}
