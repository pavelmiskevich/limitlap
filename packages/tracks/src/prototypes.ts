/** Tracks used by the prototype. Parsing at import time fails loudly on a broken file. */

import ring from '../tracks/proto-ring.json' with { type: 'json' };
import ringSolo from '../tracks/proto-ring-solo.json' with { type: 'json' };
import { parseTrack, type TrackSpec } from './schema.ts';

/** Four lanes: for checking the balance between lane length and speed. */
export const PROTO_RING: TrackSpec = parseTrack(ring);

/** The same layout with a single lane. */
export const PROTO_RING_SOLO: TrackSpec = parseTrack(ringSolo);
