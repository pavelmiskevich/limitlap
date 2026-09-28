import type { LanePath } from '@limitlap/tracks';

/**
 * Which way is the outside of the turn at `distance`, along the path's `left`
 * vector: −1 in a left turn, +1 in a right turn, 0 on a straight.
 */
export function outwardSign(path: LanePath, distance: number): -1 | 0 | 1 {
  const pose = path.sample(distance);
  const ahead = path.sample(distance + 2);
  const turn =
    pose.left[0] * ahead.forward[0] +
    pose.left[1] * ahead.forward[1] +
    pose.left[2] * ahead.forward[2];
  if (turn > 1e-4) return -1;
  if (turn < -1e-4) return 1;
  return 0;
}
