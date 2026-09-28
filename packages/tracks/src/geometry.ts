/**
 * 3D paths of the centre line and the lanes, for rendering and cameras only.
 * Coordinates follow Three.js: Y is up, the track lies in the XZ plane, the
 * start is at the origin heading along +X, and a left turn is
 * counter-clockwise seen from above. A loop is a vertical ring touching the
 * track at its lowest point, so it does not move the rest of the track.
 *
 * Distances along a lane are the simulation's distances: segment lengths come
 * from the same `segmentFor` the simulation lanes are compiled with.
 */

import { fx } from '@limitlap/sim';
import { segmentFor } from './compile.ts';
import { laneOffset, type SectionJson, type TrackSpec } from './schema.ts';

export type Vec3 = readonly [number, number, number];

export interface Pose {
  readonly position: Vec3;
  /** Unit tangent in the direction of travel. */
  readonly forward: Vec3;
  /** Unit normal of the track surface. */
  readonly up: Vec3;
  /** Unit vector to the left of the direction of travel, across the lanes. */
  readonly left: Vec3;
}

export interface LanePath {
  /** Lap length, metres; equals the compiled lane length. */
  readonly length: number;
  /** Pose at a distance from the start line; wraps around the lap. */
  readonly sample: (distance: number) => Pose;
}

export interface TrackGeometry {
  readonly centre: LanePath;
  readonly lanes: readonly LanePath[];
}

interface SectionStart {
  x: number;
  z: number;
  heading: number;
}

const DEG = Math.PI / 180;
const clean = (v: number) => v + 0; // turns −0 into 0
const vec = (x: number, y: number, z: number): Vec3 => [clean(x), clean(y), clean(z)];
const forwardOf = (heading: number) => ({ x: Math.cos(heading), z: -Math.sin(heading) });
const leftOf = (heading: number) => ({ x: -Math.sin(heading), z: -Math.cos(heading) });

function sectionStarts(sections: readonly SectionJson[]): SectionStart[] {
  const starts: SectionStart[] = [];
  let x = 0;
  let z = 0;
  let heading = 0;
  for (const section of sections) {
    starts.push({ x, z, heading });
    if (section.type === 'straight') {
      const d = forwardOf(heading);
      x += d.x * section.length;
      z += d.z * section.length;
    } else if (section.type === 'turn') {
      const end = turnPose(section, { x, z, heading }, 1);
      x = end.x;
      z = end.z;
      heading = end.heading;
    }
  }
  return starts;
}

function turnPose(
  section: Extract<SectionJson, { type: 'turn' }>,
  start: SectionStart,
  u: number,
): SectionStart {
  const sign = section.direction === 'left' ? 1 : -1;
  const l0 = leftOf(start.heading);
  const cx = start.x + sign * section.radius * l0.x;
  const cz = start.z + sign * section.radius * l0.z;
  const heading = start.heading + sign * section.angle * DEG * u;
  const l = leftOf(heading);
  return { x: cx - sign * section.radius * l.x, z: cz - sign * section.radius * l.z, heading };
}

/** Pose of a point at fraction `u` of a section, shifted `offset` metres to the left. */
function poseIn(section: SectionJson, start: SectionStart, u: number, offset: number): Pose {
  if (section.type === 'loop') {
    const d = forwardOf(start.heading);
    const l = leftOf(start.heading);
    const phi = 2 * Math.PI * u;
    const r = section.radius;
    const along = r * Math.sin(phi);
    return {
      position: vec(
        start.x + d.x * along + l.x * offset,
        r * (1 - Math.cos(phi)),
        start.z + d.z * along + l.z * offset,
      ),
      forward: vec(d.x * Math.cos(phi), Math.sin(phi), d.z * Math.cos(phi)),
      up: vec(-d.x * Math.sin(phi), Math.cos(phi), -d.z * Math.sin(phi)),
      left: vec(l.x, 0, l.z),
    };
  }

  const point =
    section.type === 'turn'
      ? turnPose(section, start, u)
      : {
          x: start.x + forwardOf(start.heading).x * section.length * u,
          z: start.z + forwardOf(start.heading).z * section.length * u,
          heading: start.heading,
        };
  const d = forwardOf(point.heading);
  const l = leftOf(point.heading);
  return {
    position: vec(point.x + l.x * offset, 0, point.z + l.z * offset),
    forward: vec(d.x, 0, d.z),
    up: vec(0, 1, 0),
    left: vec(l.x, 0, l.z),
  };
}

function createPath(track: TrackSpec, starts: SectionStart[], offset: number): LanePath {
  const lengths = track.sections.map((s) => fx.toNumber(segmentFor(s, offset).length));
  const begins: number[] = [];
  let total = 0;
  for (const length of lengths) {
    begins.push(total);
    total += length;
  }
  const length = fx.toNumber(
    track.sections.reduce((sum, s) => fx.add(sum, segmentFor(s, offset).length), fx.ZERO),
  );

  return {
    length,
    sample: (distance: number): Pose => {
      const s = ((distance % length) + length) % length;
      let low = 0;
      let high = begins.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if ((begins[mid] ?? 0) <= s) low = mid;
        else high = mid - 1;
      }
      const section = track.sections[low] as SectionJson;
      const start = starts[low] as SectionStart;
      const u = (s - (begins[low] ?? 0)) / (lengths[low] ?? 1);
      return poseIn(section, start, u, offset);
    },
  };
}

export function createTrackGeometry(track: TrackSpec): TrackGeometry {
  const starts = sectionStarts(track.sections);
  return {
    centre: createPath(track, starts, 0),
    lanes: Array.from({ length: track.lanes }, (_, lane) =>
      createPath(track, starts, laneOffset(track, lane)),
    ),
  };
}
