import { describe, expect, test } from 'vitest';
import { createHud } from './hud.ts';

describe('HUD', () => {
  const root = document.createElement('div');
  let restarts = 0;
  const hud = createHud(root, { onRestart: () => restarts++ });
  const text = (selector: string) => root.querySelector(selector)?.textContent;

  test('shows lap time, best lap, speed and deslots', () => {
    hud.update({
      lapTime: 60 * 21.5,
      best: 60 * 20.918,
      delta: null,
      speed: 50,
      grip: 0,
      deslots: 2,
    });
    expect(text('.lap-time')).toBe('0:21.500');
    expect(text('.best')).toBe('0:20.918');
    expect(text('.speed')).toBe('180');
    expect(text('.deslots')).toBe('2');
  });

  test('colours the gap to the ghost', () => {
    hud.update({ lapTime: 0, best: null, delta: 60 * 0.2, speed: 0, grip: 0, deslots: 0 });
    const delta = root.querySelector('.delta');
    expect(delta?.textContent).toBe('+0.200');
    expect(delta?.classList.contains('slower')).toBe(true);
    hud.update({ lapTime: 0, best: null, delta: -6, speed: 0, grip: 0, deslots: 0 });
    expect(delta?.classList.contains('faster')).toBe(true);
    hud.update({ lapTime: 0, best: null, delta: null, speed: 0, grip: 0, deslots: 0 });
    expect(delta?.textContent).toBe('');
    expect(text('.best')).toBe('—');
  });

  test('fills the grip meter', () => {
    hud.update({ lapTime: 0, best: null, delta: null, speed: 0, grip: 0.75, deslots: 0 });
    expect((root.querySelector('.grip-fill') as HTMLElement).style.width).toBe('75%');
  });

  test('the restart button asks for a restart', () => {
    (root.querySelector('.restart') as HTMLElement).click();
    expect(restarts).toBe(1);
  });
});
