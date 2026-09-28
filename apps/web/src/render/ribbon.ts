/**
 * Ribbons: strips of geometry that follow a track path, offset sideways.
 * The track surface, its glowing edges and the lane stripes are all ribbons.
 */

import type { LanePath } from '@limitlap/tracks';

/** Distances from 0 to `length` inclusive, no further apart than `step`. */
export function sampleDistances(length: number, step: number): number[] {
  const count = Math.max(1, Math.ceil(length / step));
  return Array.from({ length: count + 1 }, (_, i) => (i === count ? length : (i * length) / count));
}

/**
 * Two vertices per sample: `leftOffset` and `rightOffset` metres to the left
 * of the path (negative is to the right), lifted `lift` metres along the
 * surface normal.
 */
export function ribbonPositions(
  path: LanePath,
  distances: readonly number[],
  leftOffset: number,
  rightOffset: number,
  lift = 0,
): Float32Array {
  const out = new Float32Array(distances.length * 6);
  distances.forEach((distance, i) => {
    const { position: p, left: l, up: u } = path.sample(distance);
    for (let k = 0; k < 3; k++) {
      const base = (p[k] ?? 0) + (u[k] ?? 0) * lift;
      out[i * 6 + k] = base + (l[k] ?? 0) * leftOffset;
      out[i * 6 + 3 + k] = base + (l[k] ?? 0) * rightOffset;
    }
  });
  return out;
}

/** Triangle indices joining consecutive sample pairs into a strip. */
export function ribbonIndices(samples: number): Uint32Array {
  const out = new Uint32Array((samples - 1) * 6);
  for (let i = 0; i < samples - 1; i++) {
    const a = i * 2;
    out.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  return out;
}
