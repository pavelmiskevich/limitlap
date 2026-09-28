/**
 * The car on its lane: one-dimensional state advanced in fixed ticks.
 * `step` is pure — the same state, command, lane and profile always give the
 * same next state. Events are appended to an optional list.
 */

import { TICKS_PER_SECOND } from './constants.ts';
import { fx, type Fx } from './fixed.ts';
import { segmentEnds, type Lane } from './lane.ts';
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
  /** Index of the sector the car is in. */
  readonly sector: number;
  /** Moment the current sector started, in ticks with a fractional part. */
  readonly sectorStart: Fx;
  /** Moment the current lap started, in ticks with a fractional part. */
  readonly lapStart: Fx;
  /** How far the pedal is pressed, 0…1: it builds up while held (profile `pedalRamp`). */
  readonly pedal: Fx;
  /** The command the pedal level belongs to. */
  readonly pedalCommand: Command;
}

export type DeslotCause = 'over-limit' | 'grip' | 'too-slow';

/** Times are in ticks with a fractional part: the crossing moment inside a tick. */
export type SimEvent =
  | {
      readonly type: 'deslot';
      readonly tick: number;
      readonly distance: Fx;
      readonly cause: DeslotCause;
    }
  | {
      readonly type: 'sector';
      readonly tick: number;
      /** Lap the sector belongs to, starting from 1. */
      readonly lap: number;
      readonly sector: number;
      readonly time: Fx;
    }
  | { readonly type: 'lap'; readonly tick: number; readonly lap: number; readonly time: Fx };

export type LapEvent = Extract<SimEvent, { type: 'lap' }>;

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
    sector: 0,
    sectorStart: fx.ZERO,
    lapStart: fx.ZERO,
    pedal: fx.ZERO,
    pedalCommand: Command.Hold,
  };
}

const TICKS = fx.fromInt(TICKS_PER_SECOND);

/** Pedal level after this tick: builds up while the same pedal is held, restarts otherwise. */
function nextPedal(state: CarState, command: Command, profile: PhysicsProfile): Fx {
  if (command === Command.Hold) return fx.ZERO;
  if (command !== state.pedalCommand) return fx.min(profile.pedalStepPerTick, fx.ONE);
  return fx.min(fx.add(state.pedal, profile.pedalStepPerTick), fx.ONE);
}

function nextSpeed(speed: Fx, command: Command, pedal: Fx, profile: PhysicsProfile): Fx {
  switch (command) {
    case Command.Accel:
      return fx.min(fx.add(speed, fx.mul(profile.accelPerTick, pedal)), profile.vTop);
    case Command.Brake:
      return fx.max(fx.sub(speed, fx.mul(profile.brakePerTick, pedal)), fx.ZERO);
    case Command.Hold:
      return speed;
  }
}

/** Share of speed above the limit: (v − limit) / limit, or 0 within the limit. */
function excessOver(speed: Fx, limit: Fx | null): Fx {
  if (limit === null || speed <= limit) return fx.ZERO;
  return fx.div(fx.sub(speed, limit), limit);
}

/** Mutable position of the car while one tick is being resolved. */
interface Track {
  distance: Fx;
  lap: number;
  segment: number;
  sector: number;
  sectorStart: Fx;
  lapStart: Fx;
}

/**
 * Moves the car forward to `target` (may lie beyond the finish line), updating
 * segment, sector and lap and reporting every boundary crossed. `timeAt` gives
 * the moment, in ticks, the car reaches a given distance.
 */
function advance(
  pos: Track,
  target: Fx,
  lane: Lane,
  tick: number,
  timeAt: (distance: Fx) => Fx,
  events: SimEvent[] | undefined,
): void {
  const ends = segmentEnds(lane);
  for (;;) {
    const boundary = lane.sectors[pos.sector + 1] ?? lane.length;
    if (target < boundary) break;
    const time = timeAt(boundary);
    events?.push({
      type: 'sector',
      tick,
      lap: pos.lap + 1,
      sector: pos.sector,
      time: fx.sub(time, pos.sectorStart),
    });
    pos.sectorStart = time;
    if (boundary === lane.length) {
      pos.lap += 1;
      events?.push({ type: 'lap', tick, lap: pos.lap, time: fx.sub(time, pos.lapStart) });
      pos.lapStart = time;
      pos.sector = 0;
      pos.segment = 0;
      target = fx.sub(target, lane.length);
      timeAt = shiftBy(timeAt, lane.length);
    } else {
      pos.sector += 1;
    }
  }
  pos.distance = target;
  while (pos.segment < ends.length - 1 && target >= (ends[pos.segment] ?? lane.length)) {
    pos.segment += 1;
  }
}

/** The same clock for distances measured from the next lap's start. */
const shiftBy =
  (timeAt: (distance: Fx) => Fx, length: Fx) =>
  (distance: Fx): Fx =>
    timeAt(fx.add(distance, length));

export function step(
  state: CarState,
  command: Command,
  lane: Lane,
  profile: PhysicsProfile,
  events?: SimEvent[],
): CarState {
  const tick = state.tick + 1;

  if (state.pause > 0) {
    return {
      ...state,
      tick,
      speed: fx.ZERO,
      slip: fx.ZERO,
      pause: state.pause - 1,
      pedal: fx.ZERO,
      pedalCommand: Command.Hold,
    };
  }

  const pedal = nextPedal(state, command, profile);
  const pedalCommand = command;
  const speed = nextSpeed(state.speed, command, pedal, profile);
  const delta = fx.div(speed, TICKS);
  const pos: Track = {
    distance: state.distance,
    lap: state.lap,
    segment: state.segment,
    sector: state.sector,
    sectorStart: state.sectorStart,
    lapStart: state.lapStart,
  };

  // Crossing moments are interpolated inside the tick: (tick − 1) + covered / delta.
  const tickStart = fx.fromInt(state.tick);
  const from = state.distance;
  advance(
    pos,
    fx.add(from, delta),
    lane,
    tick,
    (distance) => fx.add(tickStart, fx.div(fx.sub(distance, from), delta)),
    events,
  );

  const limit = segmentLimits(lane, profile)[pos.segment];
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
    events?.push({ type: 'deslot', tick, distance: pos.distance, cause });
    if (cause === 'too-slow') {
      // Nowhere to stand inside the element: the capture sets the car down at its exit.
      const exit = segmentEnds(lane)[pos.segment] ?? lane.length;
      const now = fx.fromInt(tick);
      advance(pos, exit, lane, tick, () => now, events);
    }
    return {
      ...fromTrack(pos, tick),
      speed: fx.ZERO,
      grip: fx.ZERO,
      slip: fx.ZERO,
      pause: profile.deslotPauseTicks,
      pedal: fx.ZERO,
      pedalCommand: Command.Hold,
    };
  }

  const slip = fx.min(fx.div(excess, profile.edgeWidth), fx.ONE);
  return { ...fromTrack(pos, tick), speed, grip, slip, pause: 0, pedal, pedalCommand };
}

function fromTrack(pos: Track, tick: number) {
  return {
    tick,
    lap: pos.lap,
    distance: pos.distance,
    segment: pos.segment,
    sector: pos.sector,
    sectorStart: pos.sectorStart,
    lapStart: pos.lapStart,
  };
}
