/**
 * Chase camera: behind and above the car, looking ahead along the lane so a
 * turn is visible before the car reaches it. Tilts with the track in loops.
 */

import type { LanePath, Vec3 } from '@limitlap/tracks';

export interface CameraTarget {
  position: Vec3;
  lookAt: Vec3;
  up: Vec3;
}

const BACK = 8;
const HEIGHT = 3.5;
const AHEAD = 20;

export function chaseTarget(lane: LanePath, distance: number): CameraTarget {
  const car = lane.sample(distance);
  const behind = lane.sample(distance - BACK);
  return {
    position: [
      behind.position[0] + behind.up[0] * HEIGHT,
      behind.position[1] + behind.up[1] * HEIGHT,
      behind.position[2] + behind.up[2] * HEIGHT,
    ],
    lookAt: lane.sample(distance + AHEAD).position,
    up: car.up,
  };
}
