import type { Fx } from './fixed.ts';
import type { SimEvent } from './car.ts';

/** Fastest lap among the events, in ticks, or `null` if no lap was completed. */
export function bestLap(events: readonly SimEvent[]): Fx | null {
  let best: Fx | null = null;
  for (const event of events) {
    if (event.type === 'lap' && (best === null || event.time < best)) best = event.time;
  }
  return best;
}
