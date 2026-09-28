/**
 * Speed limits of each lane segment for a given profile. They depend only on
 * the lane and the profile, so the square roots are taken once, not per tick.
 */

import { fx, type Fx } from './fixed.ts';
import type { Lane, LaneSegment } from './lane.ts';
import type { PhysicsProfile } from './profile.ts';

export interface SegmentLimit {
  /** Highest speed the field holds, m/s; `null` means only `vTop` applies. */
  readonly max: Fx | null;
}

function limitOf(segment: LaneSegment, profile: PhysicsProfile): SegmentLimit {
  switch (segment.kind) {
    case 'turn':
      return { max: fx.sqrt(fx.mul(profile.aHold, segment.radius)) };
    case 'straight':
    case 'loop':
      return { max: null };
  }
}

// Keyed by object identity: a profile tuned live keeps its key but not its values.
const cache = new WeakMap<Lane, WeakMap<PhysicsProfile, readonly SegmentLimit[]>>();

export function segmentLimits(lane: Lane, profile: PhysicsProfile): readonly SegmentLimit[] {
  let byProfile = cache.get(lane);
  if (!byProfile) cache.set(lane, (byProfile = new WeakMap()));
  let limits = byProfile.get(profile);
  if (!limits) {
    limits = lane.segments.map((segment) => limitOf(segment, profile));
    byProfile.set(profile, limits);
  }
  return limits;
}
