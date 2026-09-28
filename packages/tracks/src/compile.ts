/**
 * Turns a track description into the one-dimensional lanes the simulation
 * drives on. Lengths use only IEEE-754 arithmetic (+, −, ×, ÷ and the π
 * constant), which every JS engine computes identically, and are then
 * converted to fixed point.
 */

import { fx, type CompiledTrack, type Fx, type Lane, type LaneSegment } from '@limitlap/sim';
import { laneOffset, type SectionJson, type TrackSpec } from './schema.ts';

const DEG = Math.PI / 180;

/** The lane segment a section becomes for a lane at `offset` from the centre line. */
export function segmentFor(section: SectionJson, offset: number): LaneSegment {
  switch (section.type) {
    case 'straight':
      return { kind: 'straight', length: fx.fromFloat(section.length) };
    case 'turn': {
      // Left of the centre line is inside a left turn and outside a right one.
      const radius =
        section.direction === 'left' ? section.radius - offset : section.radius + offset;
      return {
        kind: 'turn',
        length: fx.fromFloat(radius * section.angle * DEG),
        radius: fx.fromFloat(radius),
      };
    }
    case 'loop':
      return {
        kind: 'loop',
        length: fx.fromFloat(2 * Math.PI * section.radius),
        radius: fx.fromFloat(section.radius),
      };
  }
}

function compileLane(track: TrackSpec, index: number): Lane {
  const offset = laneOffset(track, index);
  const segments = track.sections.map((section) => segmentFor(section, offset));

  const starts: Fx[] = [];
  let length = fx.ZERO;
  for (const segment of segments) {
    starts.push(length);
    length = fx.add(length, segment.length);
  }
  const sectors = [fx.ZERO, ...track.sectors.map((section) => starts[section] ?? fx.ZERO)];
  return { length, segments, sectors };
}

export function compileTrack(track: TrackSpec): CompiledTrack {
  return {
    id: track.id,
    version: track.version,
    lanes: Array.from({ length: track.lanes }, (_, lane) => compileLane(track, lane)),
  };
}
