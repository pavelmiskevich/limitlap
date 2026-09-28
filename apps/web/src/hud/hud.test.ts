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
      deslot: null,
    });
    expect(text('.lap-time')).toBe('0:21.500');
    expect(text('.best')).toBe('0:20.918');
    expect(text('.speed')).toBe('180');
    expect(text('.deslots')).toBe('2');
  });

  test('colours the gap to the ghost', () => {
    hud.update({
      lapTime: 0,
      best: null,
      delta: 60 * 0.2,
      speed: 0,
      grip: 0,
      deslots: 0,
      deslot: null,
    });
    const delta = root.querySelector('.delta');
    expect(delta?.textContent).toBe('+0.200');
    expect(delta?.classList.contains('slower')).toBe(true);
    hud.update({ lapTime: 0, best: null, delta: -6, speed: 0, grip: 0, deslots: 0, deslot: null });
    expect(delta?.classList.contains('faster')).toBe(true);
    hud.update({
      lapTime: 0,
      best: null,
      delta: null,
      speed: 0,
      grip: 0,
      deslots: 0,
      deslot: null,
    });
    expect(delta?.textContent).toBe('');
    expect(text('.best')).toBe('—');
  });

  test('fills the grip meter', () => {
    hud.update({
      lapTime: 0,
      best: null,
      delta: null,
      speed: 0,
      grip: 0.75,
      deslots: 0,
      deslot: null,
    });
    expect((root.querySelector('.grip-fill') as HTMLElement).style.width).toBe('75%');
  });

  test('the restart button asks for a restart', () => {
    (root.querySelector('.restart') as HTMLElement).click();
    expect(restarts).toBe(1);
  });
});

describe('deslot feedback', () => {
  const quiet = {
    lapTime: 0,
    best: null,
    delta: null,
    speed: 0,
    grip: 0,
    deslots: 0,
    deslot: null,
  };

  test('a deslot shows a banner with its cause for about a second', () => {
    const root = document.createElement('div');
    const hud = createHud(root, { onRestart() {} });
    const banner = root.querySelector<HTMLElement>('.deslot-banner');
    expect(banner?.hidden).toBe(true);
    hud.update({ ...quiet, deslot: 'over-limit' }, 0);
    expect(banner?.hidden).toBe(false);
    expect(root.querySelector('.deslot-cause')?.textContent).toBe('слишком быстро');
    hud.update(quiet, 0.5);
    expect(banner?.hidden).toBe(false);
    hud.update(quiet, 0.8);
    expect(banner?.hidden).toBe(true);
  });

  test('every cause has its own words', () => {
    const root = document.createElement('div');
    const hud = createHud(root, { onRestart() {} });
    const cause = () => root.querySelector('.deslot-cause')?.textContent;
    hud.update({ ...quiet, deslot: 'grip' }, 0);
    expect(cause()).toBe('шкала сцепления заполнилась');
    hud.update({ ...quiet, deslot: 'too-slow' }, 0);
    expect(cause()).toBe('мало скорости в петле');
  });

  test('the screen edges glow near the limit and flash on a deslot', () => {
    const root = document.createElement('div');
    const hud = createHud(root, { onRestart() {} });
    const edges = () => Number(root.querySelector<HTMLElement>('.vignette')?.style.opacity);
    hud.update(quiet, 0.016);
    expect(edges()).toBe(0);
    hud.update({ ...quiet, grip: 0.9 }, 0.016);
    expect(edges()).toBeGreaterThan(0);
    hud.update({ ...quiet, deslot: 'grip' }, 0.016);
    expect(edges()).toBeGreaterThan(0.9);
    hud.update(quiet, 0.5);
    expect(edges()).toBe(0);
  });
});
