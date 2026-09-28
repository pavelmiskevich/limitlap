import { Scene } from 'three';
import { describe, expect, test } from 'vitest';
import { createDeslotFx } from './deslot-fx.ts';

const capture = {
  position: [50, 0, 0] as const,
  forward: [1, 0, 0] as const,
  up: [0, 1, 0] as const,
  left: [0, 0, -1] as const,
};

describe('deslot effect', () => {
  test('the image of the car flies off with its speed and fades away', () => {
    const scene = new Scene();
    const fx = createDeslotFx(scene, '#22e6ff');
    fx.trigger({ position: [0, 0.4, 0], velocity: [40, 0, 10], capture });
    expect(fx.debris.visible).toBe(true);
    fx.update(0.1);
    expect(fx.debris.position.x).toBeCloseTo(4, 5);
    expect(fx.debris.position.z).toBeCloseTo(1, 5);
    fx.update(1);
    expect(fx.debris.visible).toBe(false);
  });

  test('the car is hidden for a moment, then the capture ring appears', () => {
    const fx = createDeslotFx(new Scene(), '#22e6ff');
    fx.trigger({ position: [0, 0.4, 0], velocity: [40, 0, 0], capture });
    expect(fx.carHidden).toBe(true);
    expect(fx.ring.visible).toBe(false);
    fx.update(0.35);
    expect(fx.carHidden).toBe(false);
    expect(fx.ring.visible).toBe(true);
    expect(fx.ring.position.x).toBeCloseTo(50, 5);
    fx.update(1);
    expect(fx.ring.visible).toBe(false);
  });

  test('a falling car goes down', () => {
    const fx = createDeslotFx(new Scene(), '#22e6ff');
    fx.trigger({ position: [0, 20, 0], velocity: [5, 0, 0], capture });
    fx.update(0.3);
    expect(fx.debris.position.y).toBeLessThan(20);
  });
});
