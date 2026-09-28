/** A track has from one to this many lanes. */
export const MAX_LANES = 4;

export { compileTrack, segmentFor } from './compile.ts';
export {
  createTrackGeometry,
  type LanePath,
  type Pose,
  type TrackGeometry,
  type Vec3,
} from './geometry.ts';
export {
  laneOffset,
  MIN_LANE_RADIUS,
  parseTrack,
  TrackError,
  type SectionJson,
  type TrackJson,
  type TrackSpec,
} from './schema.ts';
