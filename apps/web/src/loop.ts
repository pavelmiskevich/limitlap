/**
 * Fixed-step clock: the simulation advances in 1/60 s steps whatever the
 * display refresh rate; rendering interpolates between the last two steps.
 */

import { TICKS_PER_SECOND } from '@limitlap/sim';

export const STEP_MS = 1000 / TICKS_PER_SECOND;

export interface Frame {
  /** Simulation steps to run before drawing this frame. */
  steps: number;
  /** Share of the next step already elapsed, 0…1, for interpolation. */
  alpha: number;
}

export interface FixedStep {
  advance(now: number): Frame;
  reset(): void;
}

/** `maxSteps` bounds the catch-up after a stall so a slow frame cannot snowball. */
export function createFixedStep({ maxSteps = 8 } = {}): FixedStep {
  let last: number | null = null;
  let backlog = 0;

  return {
    advance(now) {
      if (last === null) {
        last = now;
        return { steps: 0, alpha: 0 };
      }
      backlog += now - last;
      last = now;
      let steps = 0;
      // A small epsilon keeps accumulated rounding from dropping a step.
      while (backlog >= STEP_MS - 1e-9 && steps < maxSteps) {
        backlog -= STEP_MS;
        steps += 1;
      }
      if (steps === maxSteps && backlog >= STEP_MS) backlog = 0;
      return { steps, alpha: Math.min(Math.max(backlog / STEP_MS, 0), 1) };
    },
    reset() {
      last = null;
      backlog = 0;
    },
  };
}
