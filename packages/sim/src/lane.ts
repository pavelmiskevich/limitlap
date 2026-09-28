/**
 * What the simulation knows about a lane: a one-dimensional line split into
 * segments. 3D geometry lives in `@limitlap/tracks` and never reaches here.
 * All distances are metres in fixed point.
 */

import { fx, type Fx } from './fixed.ts';

export type LaneSegment =
  | { readonly kind: 'straight'; readonly length: Fx }
  /** Horizontal turn: the speed limit grows with the radius. */
  | { readonly kind: 'turn'; readonly length: Fx; readonly radius: Fx }
  /** Vertical loop: needs a minimum speed at the top. */
  | { readonly kind: 'loop'; readonly length: Fx; readonly radius: Fx };

export interface Lane {
  /** Full lap length; the start/finish line is at distance 0. */
  readonly length: Fx;
  readonly segments: readonly LaneSegment[];
  /** Distance at which each sector starts; the first sector starts at 0. */
  readonly sectors: readonly Fx[];
}

export interface CompiledTrack {
  readonly id: string;
  readonly version: number;
  readonly lanes: readonly Lane[];
}

const ends = new WeakMap<Lane, readonly Fx[]>();

/** Distance at which each segment ends, computed once per lane. */
export function segmentEnds(lane: Lane): readonly Fx[] {
  let result = ends.get(lane);
  if (!result) {
    let total = fx.ZERO;
    result = lane.segments.map((segment) => (total = fx.add(total, segment.length)));
    ends.set(lane, result);
  }
  return result;
}

const meters = (value: Fx) => `${fx.toNumber(value)} m`;

/** Returns a list of problems; an empty list means the lane is usable. */
export function validateLane(lane: Lane): string[] {
  const issues: string[] = [];

  if (lane.segments.length === 0) issues.push('lane has no segments');

  let total = fx.ZERO;
  lane.segments.forEach((segment, index) => {
    if (segment.length <= 0) issues.push(`segment ${index}: length must be positive`);
    if ((segment.kind === 'turn' || segment.kind === 'loop') && segment.radius <= 0) {
      issues.push(`segment ${index}: radius must be positive`);
    }
    total = fx.add(total, segment.length);
  });
  if (total !== lane.length) {
    issues.push(`segments add up to ${meters(total)}, lane length is ${meters(lane.length)}`);
  }

  if (lane.sectors[0] !== fx.ZERO) issues.push('sectors must start at 0');
  lane.sectors.forEach((start, index) => {
    const previous = lane.sectors[index - 1];
    if (previous !== undefined && start <= previous) {
      issues.push(`sector ${index} does not come after sector ${index - 1}`);
    }
    if (start >= lane.length) issues.push(`sector ${index} lies outside the lane`);
  });

  return issues;
}
