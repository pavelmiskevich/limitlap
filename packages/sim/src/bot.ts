/**
 * Bot driving policy: keep a given share of the speed limit and brake early
 * enough for every limit ahead. Used by balance tests and, later, by bots.
 */

import { Command, type CarState } from './car.ts';
import { TICKS_PER_SECOND } from './constants.ts';
import { fx, type Fx } from './fixed.ts';
import { segmentEnds, type Lane } from './lane.ts';
import { segmentLimits } from './limits.ts';
import type { PhysicsProfile } from './profile.ts';

const TICKS = fx.fromInt(TICKS_PER_SECOND);
const TWO = fx.fromInt(2);

/** Highest speed from which the car can still slow down to `limit` over `distance`. */
function approachSpeed(limit: Fx, distance: Fx, brake: Fx): Fx {
  return fx.sqrt(fx.add(fx.mul(limit, limit), fx.mul(fx.mul(TWO, brake), distance)));
}

/** Speed the bot wants right now: `share` of every limit, reachable with the brakes. */
export function botTargetSpeed(
  state: CarState,
  lane: Lane,
  profile: PhysicsProfile,
  share: Fx,
): Fx {
  const limits = segmentLimits(lane, profile);
  const ends = segmentEnds(lane);
  const count = lane.segments.length;
  const brake = fx.mul(profile.brakePerTick, TICKS);
  const horizon = fx.div(fx.mul(profile.vTop, profile.vTop), fx.mul(TWO, brake));

  let target = profile.vTop;
  const current = limits[state.segment]?.max;
  if (current != null) target = fx.min(target, fx.mul(current, share));

  // A ramped brake reaches full force only after the ramp: on average half of it is lost.
  const rampTicks = fx.div(fx.ONE, profile.pedalStepPerTick);
  const lag = fx.div(fx.mul(state.speed, rampTicks), fx.mul(TWO, TICKS));
  let ahead = fx.sub(ends[state.segment] ?? lane.length, state.distance);
  for (let k = 1; k < count && ahead <= horizon; k++) {
    const index = (state.segment + k) % count;
    const limit = limits[index]?.max;
    if (limit != null) {
      const room = fx.max(fx.sub(ahead, lag), fx.ZERO);
      target = fx.min(target, approachSpeed(fx.mul(limit, share), room, brake));
    }
    ahead = fx.add(ahead, lane.segments[index]?.length ?? fx.ZERO);
  }
  return target;
}

export function botCommand(
  state: CarState,
  lane: Lane,
  profile: PhysicsProfile,
  share: Fx,
): Command {
  const target = botTargetSpeed(state, lane, profile, share);
  if (state.speed > target) return Command.Brake;
  if (fx.add(state.speed, profile.accelPerTick) <= target) return Command.Accel;
  return Command.Hold;
}
