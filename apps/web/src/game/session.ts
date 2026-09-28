/**
 * One driving session: a car on a lane, advanced by the simulation one step
 * at a time. Keeps the previous state for interpolation and records every
 * command, which later becomes the replay.
 */

import {
  createCar,
  fx,
  step,
  type CarState,
  type Command,
  type CompiledTrack,
  type Lane,
  type PhysicsProfile,
  type SimEvent,
} from '@limitlap/sim';

export interface SessionOptions {
  track: CompiledTrack;
  lane: number;
  profile: PhysicsProfile;
}

export interface Session {
  readonly track: CompiledTrack;
  readonly lane: Lane;
  readonly laneIndex: number;
  profile: PhysicsProfile;
  state: CarState;
  previous: CarState;
  /** Events of the last step only. */
  lastEvents: SimEvent[];
  /** Every event since the start. */
  readonly events: SimEvent[];
  readonly commands: number[];
  update(command: Command): void;
  /** Distance to draw the car at, between the last two steps; may exceed the lap length. */
  renderDistance(alpha: number): number;
  reset(): void;
}

export function createSession({ track, lane: laneIndex, profile }: SessionOptions): Session {
  const lane = track.lanes[laneIndex];
  if (!lane) throw new Error(`track ${track.id} has no lane ${laneIndex}`);
  const length = fx.toNumber(lane.length);

  const session: Session = {
    track,
    lane,
    laneIndex,
    profile,
    state: createCar(),
    previous: createCar(),
    lastEvents: [],
    events: [],
    commands: [],

    update(command) {
      const events: SimEvent[] = [];
      session.previous = session.state;
      session.state = step(session.state, command, lane, session.profile, events);
      session.lastEvents = events;
      session.events.push(...events);
      session.commands.push(command);
    },

    renderDistance(alpha) {
      const from = fx.toNumber(session.previous.distance);
      let to = fx.toNumber(session.state.distance);
      if (session.state.lap > session.previous.lap) to += length;
      return from + (to - from) * alpha;
    },

    reset() {
      session.state = createCar();
      session.previous = session.state;
      session.lastEvents = [];
      session.events.length = 0;
      session.commands.length = 0;
    },
  };
  return session;
}
