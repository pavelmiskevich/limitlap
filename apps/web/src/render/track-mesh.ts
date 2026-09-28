/**
 * Minimal neon track: a dark surface, glowing edges and a coloured stripe
 * along each lane. Unlit materials — the glow is the colour itself.
 */

import { laneOffset, type TrackGeometry, type TrackSpec } from '@limitlap/tracks';
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type ColorRepresentation,
} from 'three';
import { ribbonIndices, ribbonPositions, sampleDistances } from './ribbon.ts';

export const LANE_COLORS = ['#22e6ff', '#ff3df2', '#ffe14a', '#4dff88'] as const;
const SURFACE = '#0b1024';
const EDGE = '#8fb4ff';
const STEP = 1;

function ribbonMesh(
  geometry: TrackGeometry,
  distances: number[],
  left: number,
  right: number,
  color: ColorRepresentation,
  lift: number,
): Mesh {
  const buffer = new BufferGeometry();
  buffer.setAttribute(
    'position',
    new BufferAttribute(ribbonPositions(geometry.centre, distances, left, right, lift), 3),
  );
  buffer.setIndex(new BufferAttribute(ribbonIndices(distances.length), 1));
  return new Mesh(buffer, new MeshBasicMaterial({ color, side: DoubleSide }));
}

export function createTrackMesh(spec: TrackSpec, geometry: TrackGeometry): Group {
  const group = new Group();
  const distances = sampleDistances(geometry.centre.length, STEP);
  const half = (spec.lanes * spec.laneSpacing) / 2 + 0.6;

  group.add(ribbonMesh(geometry, distances, half, -half, SURFACE, 0));
  group.add(ribbonMesh(geometry, distances, half, half - 0.3, EDGE, 0.02));
  group.add(ribbonMesh(geometry, distances, -half + 0.3, -half, EDGE, 0.02));

  for (let lane = 0; lane < spec.lanes; lane++) {
    const offset = laneOffset(spec, lane);
    const color = LANE_COLORS[lane % LANE_COLORS.length] ?? EDGE;
    group.add(ribbonMesh(geometry, distances, offset + 0.12, offset - 0.12, color, 0.03));
  }

  // Start/finish line: a white band across the whole track.
  group.add(ribbonMesh(geometry, [0, 0.4, 0.8], half, -half, '#ffffff', 0.04));
  return group;
}
