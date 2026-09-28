/** Fixed simulation rate: every result is measured in ticks of this clock. */
export const TICKS_PER_SECOND = 60;

export { fx, FX_ONE, FX_SHIFT, type Fx } from './fixed.ts';
export { validateLane, type CompiledTrack, type Lane, type LaneSegment } from './lane.ts';
