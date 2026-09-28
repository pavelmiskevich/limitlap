/**
 * The car on its lane: one-dimensional state advanced in fixed ticks.
 * `step` is pure — the same state, command, lane and profile always give the
 * same next state.
 */

import { TICKS_PER_SECOND } from './constants.ts';
import { fx, type Fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import type { PhysicsProfile } from './profile.ts';

/** One input per tick. Numeric so a replay stores it in two bits. */
export const Command = {
  Hold: 0,
  Accel: 1,
  Brake: 2,
} as const;
export type Command = (typeof Command)[keyof typeof Command];

export interface CarState {
  /** Ticks since the start. */
  readonly tick: number;
  /** Completed laps. */
  readonly lap: number;
  /** Distance from the start/finish line along the lane, metres. */
  readonly distance: Fx;
  /** Speed along the lane, m/s. */
  readonly speed: Fx;
  /** Index of the lane segment the car is in. */
  readonly segment: number;
}

export function createCar(): CarState {
  return { tick: 0, lap: 0, distance: fx.ZERO, speed: fx.ZERO, segment: 0 };
}

const TICKS = fx.fromInt(TICKS_PER_SECOND);

const segmentEnds = new WeakMap<Lane, Fx[]>();

/** Distance at which each segment ends, cached per lane. */
function endsOf(lane: Lane): Fx[] {
  let ends = segmentEnds.get(lane);
  if (!ends) {
    let total = fx.ZERO;
    ends = lane.segments.map((segment) => (total = fx.add(total, segment.length)));
    segmentEnds.set(lane, ends);
  }
  return ends;
}

function nextSpeed(speed: Fx, command: Command, profile: PhysicsProfile): Fx {
  switch (command) {
    case Command.Accel:
      return fx.min(fx.add(speed, profile.accelPerTick), profile.vTop);
    case Command.Brake:
      return fx.max(fx.sub(speed, profile.brakePerTick), fx.ZERO);
    case Command.Hold:
      return speed;
  }
}

export function step(
  state: CarState,
  command: Command,
  lane: Lane,
  profile: PhysicsProfile,
): CarState {
  const speed = nextSpeed(state.speed, command, profile);
  let distance = fx.add(state.distance, fx.div(speed, TICKS));
  let lap = state.lap;
  let segment = state.segment;

  while (distance >= lane.length) {
    distance = fx.sub(distance, lane.length);
    lap += 1;
    segment = 0;
  }

  const ends = endsOf(lane);
  while (segment < ends.length - 1 && distance >= (ends[segment] ?? lane.length)) {
    segment += 1;
  }

  return { tick: state.tick + 1, lap, distance, speed, segment };
}
