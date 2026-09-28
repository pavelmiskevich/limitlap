import { fx } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { compileTrack } from './compile.ts';
import { createTrackGeometry, type Pose, type Vec3 } from './geometry.ts';
import { parseTrack, type TrackJson } from './schema.ts';

const json: TrackJson = {
  id: 'stadium',
  version: 1,
  lanes: 4,
  laneSpacing: 4,
  sections: [
    { type: 'straight', length: 200 },
    { type: 'turn', radius: 60, angle: 180, direction: 'left' },
    { type: 'loop', radius: 10 },
    { type: 'straight', length: 200 },
    { type: 'turn', radius: 60, angle: 180, direction: 'left' },
  ],
  sectors: [2],
};
const spec = parseTrack(json);
const compiled = compileTrack(spec);
const geometry = createTrackGeometry(spec);

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3) => Math.sqrt(dot(a, a));

function polylineLength(sample: (s: number) => Pose, length: number, step = 0.05): number {
  let total = 0;
  let previous = sample(0).position;
  for (let s = step; s < length; s += step) {
    const current = sample(s).position;
    total += norm(sub(current, previous));
    previous = current;
  }
  return total + norm(sub(sample(length).position, previous));
}

describe('track geometry', () => {
  test('the start is at the origin, heading along +X, upright', () => {
    const pose = geometry.centre.sample(0);
    expect(pose.position).toEqual([0, 0, 0]);
    expect(pose.forward).toEqual([1, 0, 0]);
    expect(pose.up).toEqual([0, 1, 0]);
  });

  test('lane 0 is to the left of the centre line', () => {
    const pose = geometry.lanes[0]?.sample(0);
    expect(pose?.position[2]).toBeCloseTo(-6, 9);
    expect(pose?.left[2]).toBeCloseTo(-1, 9);
  });

  test('each lane path is as long as the compiled lane, to the centimetre', () => {
    geometry.lanes.forEach((lane, index) => {
      const compiledLength = fx.toNumber(compiled.lanes[index]?.length ?? fx.ZERO);
      expect(lane.length).toBe(compiledLength);
      expect(Math.abs(polylineLength(lane.sample, lane.length) - compiledLength)).toBeLessThan(
        0.01,
      );
    });
  });

  test('a lap ends where it started', () => {
    for (const lane of geometry.lanes) {
      const gap = norm(sub(lane.sample(lane.length - 1e-9).position, lane.sample(0).position));
      expect(gap).toBeLessThan(0.05);
    }
  });

  test('in a left turn the inner lane keeps its radius around the turn centre', () => {
    const lane = geometry.lanes[0];
    const turnStart = 200;
    const centre: Vec3 = [200, 0, -60];
    for (const u of [0, 0.25, 0.5, 0.9]) {
      const s = turnStart + u * Math.PI * 54;
      expect(norm(sub(lane?.sample(s).position ?? [0, 0, 0], centre))).toBeCloseTo(54, 6);
    }
  });

  test('the loop climbs to twice its radius with the track upside down at the top', () => {
    const lane = geometry.centre;
    const loopStart = 200 + Math.PI * 60;
    const quarter = lane.sample(loopStart + (Math.PI * 20) / 4);
    const top = lane.sample(loopStart + (Math.PI * 20) / 2);
    // Lengths are quantised to 1/65536 m, so the check is to a tenth of a millimetre.
    expect(quarter.position[1]).toBeCloseTo(10, 4);
    expect(top.position[1]).toBeCloseTo(20, 4);
    expect(top.up[1]).toBeCloseTo(-1, 4);
  });

  test('the path is continuous: no jumps and no sudden flips of orientation', () => {
    for (const lane of [geometry.centre, ...geometry.lanes]) {
      const step = 0.1;
      let previous = lane.sample(0);
      for (let s = step; s < lane.length; s += step) {
        const current = lane.sample(s);
        expect(norm(sub(current.position, previous.position))).toBeLessThan(step * 1.01);
        expect(dot(current.forward, previous.forward)).toBeGreaterThan(0.99);
        expect(dot(current.up, previous.up)).toBeGreaterThan(0.99);
        previous = current;
      }
    }
  });

  test('forward, up and left form an orthonormal frame', () => {
    for (let s = 0; s < geometry.centre.length; s += 7.3) {
      const { forward, up, left } = geometry.centre.sample(s);
      expect(norm(forward)).toBeCloseTo(1, 9);
      expect(norm(up)).toBeCloseTo(1, 9);
      expect(dot(forward, up)).toBeCloseTo(0, 9);
      expect(dot(forward, left)).toBeCloseTo(0, 9);
      expect(dot(up, left)).toBeCloseTo(0, 9);
    }
  });

  test('distances wrap around the lap', () => {
    const lane = geometry.lanes[1];
    const length = lane?.length ?? 0;
    expect(lane?.sample(length + 5).position).toEqual(lane?.sample(5).position);
  });
});
