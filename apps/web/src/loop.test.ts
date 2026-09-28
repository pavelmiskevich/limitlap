import { describe, expect, test } from 'vitest';
import { createFixedStep, STEP_MS } from './loop.ts';

function simulate(frameMs: number, durationMs: number) {
  const clock = createFixedStep();
  let steps = 0;
  const alphas: number[] = [];
  const frames = Math.round(durationMs / frameMs);
  for (let i = 0; i <= frames; i++) {
    const frame = clock.advance(i * frameMs);
    steps += frame.steps;
    alphas.push(frame.alpha);
  }
  return { steps, alphas };
}

describe('fixed-step clock', () => {
  test('one step is a sixtieth of a second', () => {
    expect(STEP_MS).toBeCloseTo(1000 / 60, 9);
  });

  test('the first frame only starts the clock', () => {
    expect(createFixedStep().advance(1234)).toEqual({ steps: 0, alpha: 0 });
  });

  test('the number of steps does not depend on the frame rate', () => {
    expect(simulate(1000 / 60, 1000).steps).toBe(60);
    expect(simulate(1000 / 120, 1000).steps).toBe(60);
    expect(simulate(1000 / 30, 1000).steps).toBe(60);
  });

  test('alpha is the share of the next step already elapsed', () => {
    const clock = createFixedStep();
    clock.advance(0);
    const first = clock.advance(STEP_MS * 1.25);
    expect(first.steps).toBe(1);
    expect(first.alpha).toBeCloseTo(0.25, 9);
    expect(clock.advance(STEP_MS * 1.75).alpha).toBeCloseTo(0.75, 9);
  });

  test('after a long pause at most maxSteps are run and the backlog is dropped', () => {
    const clock = createFixedStep({ maxSteps: 5 });
    clock.advance(0);
    expect(clock.advance(10_000).steps).toBe(5);
    expect(clock.advance(10_000 + STEP_MS).steps).toBe(1);
  });

  test('reset starts the clock again', () => {
    const clock = createFixedStep();
    clock.advance(0);
    clock.reset();
    expect(clock.advance(5000)).toEqual({ steps: 0, alpha: 0 });
  });
});
