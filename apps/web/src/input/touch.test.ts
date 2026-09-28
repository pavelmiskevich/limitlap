import { Command, DEFAULT_PROFILE as profile, fx } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { createButtons } from './buttons.ts';
import { createSlider, positionToShare, sliderCommand } from './slider.ts';

const ctx = { speed: fx.ZERO, profile };

describe('positionToShare', () => {
  const rect = { top: 100, height: 400 };

  test('the bottom of the slider is zero, the top is full speed', () => {
    expect(positionToShare(500, rect)).toBe(0);
    expect(positionToShare(100, rect)).toBe(1);
    expect(positionToShare(300, rect)).toBeCloseTo(0.5, 9);
  });

  test('positions beyond the slider are clamped', () => {
    expect(positionToShare(900, rect)).toBe(0);
    expect(positionToShare(-50, rect)).toBe(1);
  });
});

describe('sliderCommand', () => {
  const target = fx.fromInt(40);

  test('accelerates towards a higher target', () => {
    expect(sliderCommand(target, fx.fromInt(30), profile)).toBe(Command.Accel);
  });

  test('brakes towards a lower target', () => {
    expect(sliderCommand(target, fx.fromInt(50), profile)).toBe(Command.Brake);
  });

  test('holds inside a one-step band around the target, so commands do not jitter', () => {
    expect(sliderCommand(target, target, profile)).toBe(Command.Hold);
    expect(
      sliderCommand(target, fx.sub(target, fx.div(profile.accelPerTick, fx.fromInt(2))), profile),
    ).toBe(Command.Hold);
    expect(
      sliderCommand(target, fx.add(target, fx.div(profile.brakePerTick, fx.fromInt(2))), profile),
    ).toBe(Command.Hold);
  });

  test('driving with the slider settles on the target without oscillating', () => {
    let speed = fx.ZERO;
    const seen: Command[] = [];
    for (let i = 0; i < 600; i++) {
      const command = sliderCommand(target, speed, profile);
      seen.push(command);
      if (command === Command.Accel) speed = fx.add(speed, profile.accelPerTick);
      if (command === Command.Brake) speed = fx.sub(speed, profile.brakePerTick);
    }
    expect(fx.toNumber(fx.abs(fx.sub(speed, target)))).toBeLessThan(0.5);
    expect(seen.slice(-100).every((c) => c === Command.Hold)).toBe(true);
  });
});

function pointer(type: string, element: Element, init: PointerEventInit = {}) {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }));
}

describe('slider element', () => {
  test('without a finger the speed is held', () => {
    const root = document.createElement('div');
    const slider = createSlider(root);
    expect(slider.command(ctx)).toBe(Command.Hold);
    slider.dispose();
  });

  test('a finger at the top asks for full speed; lifting it holds', () => {
    const root = document.createElement('div');
    const slider = createSlider(root);
    const track = root.querySelector('.slider') as HTMLElement;
    track.getBoundingClientRect = () => ({ top: 0, height: 400 }) as DOMRect;
    pointer('pointerdown', track, { clientY: 0 });
    expect(slider.command(ctx)).toBe(Command.Accel);
    pointer('pointerup', track, { clientY: 0 });
    expect(slider.command(ctx)).toBe(Command.Hold);
    slider.dispose();
    expect(root.querySelector('.slider')).toBeNull();
  });
});

describe('buttons', () => {
  test('gas accelerates, brake brakes, both brake', () => {
    const root = document.createElement('div');
    const buttons = createButtons(root);
    const gas = root.querySelector('[data-action="gas"]') as HTMLElement;
    const brake = root.querySelector('[data-action="brake"]') as HTMLElement;
    pointer('pointerdown', gas, { pointerId: 1 });
    expect(buttons.command(ctx)).toBe(Command.Accel);
    pointer('pointerdown', brake, { pointerId: 2 });
    expect(buttons.command(ctx)).toBe(Command.Brake);
    pointer('pointerup', brake, { pointerId: 2 });
    pointer('pointercancel', gas, { pointerId: 1 });
    expect(buttons.command(ctx)).toBe(Command.Hold);
    buttons.dispose();
    expect(root.children).toHaveLength(0);
  });
});
