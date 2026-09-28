import { Command, DEFAULT_PROFILE, fx } from '@limitlap/sim';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createControls, loadSettings, saveSettings } from './controls.ts';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('control settings', () => {
  test('default to the slider in the right hand', () => {
    expect(loadSettings()).toEqual({ scheme: 'slider', hand: 'right' });
  });

  test('are remembered', () => {
    saveSettings({ scheme: 'buttons', hand: 'left' });
    expect(loadSettings()).toEqual({ scheme: 'buttons', hand: 'left' });
  });

  test('broken or foreign values fall back to the defaults', () => {
    localStorage.setItem('limitlap:controls', '{"scheme":"wheel","hand":7}');
    expect(loadSettings()).toEqual({ scheme: 'slider', hand: 'right' });
    localStorage.setItem('limitlap:controls', 'not json');
    expect(loadSettings()).toEqual({ scheme: 'slider', hand: 'right' });
  });

  test('a storage that throws does not break the game', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSettings()).toEqual({ scheme: 'slider', hand: 'right' });
    expect(() => saveSettings({ scheme: 'buttons', hand: 'left' })).not.toThrow();
  });
});

describe('createControls', () => {
  const ctx = { speed: fx.ZERO, profile: DEFAULT_PROFILE };

  test('builds the chosen scheme on the chosen side', () => {
    saveSettings({ scheme: 'buttons', hand: 'left' });
    const root = document.createElement('div');
    const controls = createControls(root);
    const layer = root.querySelector('.controls');
    expect(layer?.classList.contains('hand-left')).toBe(true);
    expect(root.querySelector('.buttons')).not.toBeNull();
    expect(root.querySelector('.slider')).toBeNull();
    expect(controls.source.command(ctx)).toBe(Command.Hold);
    controls.dispose();
  });

  test('switching the scheme in the panel swaps the controls and saves the choice', () => {
    const root = document.createElement('div');
    const controls = createControls(root);
    expect(root.querySelector('.slider')).not.toBeNull();
    (root.querySelector('[data-scheme="buttons"]') as HTMLElement).click();
    expect(root.querySelector('.slider')).toBeNull();
    expect(root.querySelector('.buttons')).not.toBeNull();
    expect(loadSettings().scheme).toBe('buttons');
    (root.querySelector('[data-hand="left"]') as HTMLElement).click();
    expect(root.querySelector('.controls')?.classList.contains('hand-left')).toBe(true);
    controls.dispose();
  });
});
