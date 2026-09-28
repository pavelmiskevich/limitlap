import { createTrackGeometry, PROTO_RING } from '@limitlap/tracks';
import { describe, expect, test } from 'vitest';
import { chaseTarget } from './chase.ts';

const lane = createTrackGeometry(PROTO_RING).lanes[1];
if (!lane) throw new Error('no lane');
const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  (a[0] ?? 0) - (b[0] ?? 0),
  (a[1] ?? 0) - (b[1] ?? 0),
  (a[2] ?? 0) - (b[2] ?? 0),
];
const len = (a: readonly number[]) => Math.hypot(...a);

describe('chaseTarget', () => {
  test('sits behind and above the car and looks ahead along the lane', () => {
    const car = lane.sample(50);
    const target = chaseTarget(lane, 50);
    const back = sub(car.position, target.position);
    const along = back[0] * car.forward[0] + back[1] * car.forward[1] + back[2] * car.forward[2];
    expect(along).toBeGreaterThan(5);
    expect(target.position[1] - car.position[1]).toBeGreaterThan(2);
    expect(len(sub(target.lookAt, lane.sample(70).position))).toBeLessThan(1);
  });

  test('tilts with the track inside the loop', () => {
    // The loop starts after the first straight, the 90 m turn, the second straight and the hairpin.
    let loopTop = 0;
    for (let s = 0; s < lane.length; s += 0.5) {
      if (lane.sample(s).up[1] < -0.99) {
        loopTop = s;
        break;
      }
    }
    expect(loopTop).toBeGreaterThan(0);
    expect(chaseTarget(lane, loopTop).up[1]).toBeLessThan(0);
  });

  test('moves smoothly: small steps of the car give small steps of the camera', () => {
    for (let s = 0; s < lane.length; s += 0.25) {
      const a = chaseTarget(lane, s);
      const b = chaseTarget(lane, s + 0.25);
      expect(len(sub(a.position, b.position))).toBeLessThan(1);
    }
  });
});
