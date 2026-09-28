/**
 * The car on its lane: one-dimensional state advanced in fixed ticks.
 * `step` is pure — the same state, command, lane and profile always give the
 * same next state. Events are appended to an optional list.
 */

import { TICKS_PER_SECOND } from './constants.ts';
import { fx, type Fx } from './fixed.ts';
import type { Lane } from './lane.ts';
import { segmentLimits } from './limits.ts';
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
  /** Grip meter, 0…1: fills in the edge zone, a full meter deslots the car. */
  readonly grip: Fx;
  /** How deep into the edge zone the car is, 0…1; drives the slide and sound. */
  readonly slip: Fx;
  /** Ticks left of the pause after a deslot. */
  readonly pause: number;
}

export type DeslotCause = 'over-limit' | 'grip' | 'too-slow';

export type SimEvent = {
  readonly type: 'deslot';
  readonly tick: number;
  readonly distance: Fx;
  readonly cause: DeslotCause;
};

export function createCar(): CarState {
  return {
    tick: 0,
    lap: 0,
    distance: fx.ZERO,
    speed: fx.ZERO,
    segment: 0,
    grip: fx.ZERO,
    slip: fx.ZERO,
    pause: 0,
  };
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

/** Share of speed above the limit: (v − limit) / limit, or 0 within the limit. */
function excessOver(speed: Fx, limit: Fx | null): Fx {
  if (limit === null || speed <= limit) return fx.ZERO;
  return fx.div(fx.sub(speed, limit), limit);
}

export function step(
  state: CarState,
  command: Command,
  lane: Lane,
  profile: PhysicsProfile,
  events?: SimEvent[],
): CarState {
  const tick = state.tick + 1;

  if (state.pause > 0) {
    return { ...state, tick, speed: fx.ZERO, slip: fx.ZERO, pause: state.pause - 1 };
  }

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

  const limit = segmentLimits(lane, profile)[segment];
  const excess = excessOver(speed, limit?.max ?? null);
  let grip = state.grip;
  let cause: DeslotCause | null = null;

  if (limit?.min != null && speed < limit.min) {
    cause = 'too-slow';
  } else if (excess > profile.edgeWidth) {
    cause = 'over-limit';
  } else if (excess > 0) {
    grip = fx.add(grip, fx.mul(profile.edgeFillPerTick, fx.div(excess, profile.edgeWidth)));
    if (grip >= fx.ONE) cause = 'grip';
  } else {
    grip = fx.max(fx.sub(grip, profile.edgeDrainPerTick), fx.ZERO);
  }

  if (cause !== null) {
    events?.push({ type: 'deslot', tick, distance, cause });
    if (cause === 'too-slow') {
      // Nowhere to stand inside the element: the capture sets the car down at its exit.
      distance = ends[segment] ?? lane.length;
      segment += 1;
      if (distance >= lane.length) {
        distance = fx.sub(distance, lane.length);
        lap += 1;
        segment = 0;
      }
    }
    return {
      tick,
      lap,
      distance,
      speed: fx.ZERO,
      segment,
      grip: fx.ZERO,
      slip: fx.ZERO,
      pause: profile.deslotPauseTicks,
    };
  }

  const slip = fx.min(fx.div(excess, profile.edgeWidth), fx.ONE);
  return { tick, lap, distance, speed, segment, grip, slip, pause: 0 };
}
