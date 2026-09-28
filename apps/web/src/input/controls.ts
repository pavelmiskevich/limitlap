/**
 * On-screen controls: the chosen scheme (slider or two buttons) on the side
 * of the chosen hand, plus a small settings panel. The choice is remembered.
 */

import { createButtons } from './buttons.ts';
import type { InputSource } from './input.ts';
import { createSlider } from './slider.ts';

export type Scheme = 'slider' | 'buttons';
export type Hand = 'right' | 'left';
export interface ControlSettings {
  scheme: Scheme;
  hand: Hand;
}

const KEY = 'limitlap:controls';
const DEFAULTS: ControlSettings = { scheme: 'slider', hand: 'right' };

export function loadSettings(): ControlSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
    const { scheme, hand } = raw as Record<string, unknown>;
    return {
      scheme: scheme === 'buttons' || scheme === 'slider' ? scheme : DEFAULTS.scheme,
      hand: hand === 'left' || hand === 'right' ? hand : DEFAULTS.hand,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: ControlSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}

export interface Controls {
  /** Current on-screen scheme; stays valid when the scheme changes. */
  readonly source: InputSource;
  dispose(): void;
}

export function createControls(root: HTMLElement): Controls {
  const settings = loadSettings();
  const layer = document.createElement('div');
  root.append(layer);

  const make = () => (settings.scheme === 'slider' ? createSlider(layer) : createButtons(layer));
  let current = make();
  layer.className = `controls hand-${settings.hand}`;
  const build = () => {
    current.dispose();
    layer.className = `controls hand-${settings.hand}`;
    current = make();
  };

  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'gear';
  gear.setAttribute('aria-label', 'Настройки управления');
  gear.textContent = '⚙';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;

  const choice = (label: string, options: [string, string][], attr: 'scheme' | 'hand') => {
    const row = document.createElement('div');
    row.className = 'choice';
    row.append(Object.assign(document.createElement('span'), { textContent: label }));
    for (const [value, text] of options) {
      const option = document.createElement('button');
      option.type = 'button';
      option.dataset[attr] = value;
      option.textContent = text;
      option.addEventListener('click', () => {
        if (attr === 'scheme') settings.scheme = value as Scheme;
        else settings.hand = value as Hand;
        saveSettings(settings);
        build();
        mark();
      });
      row.append(option);
    }
    return row;
  };
  panel.append(
    choice(
      'Управление',
      [
        ['slider', 'Слайдер'],
        ['buttons', 'Кнопки'],
      ],
      'scheme',
    ),
    choice(
      'Рука',
      [
        ['right', 'Правая'],
        ['left', 'Левая'],
      ],
      'hand',
    ),
  );
  const mark = () => {
    for (const option of panel.querySelectorAll<HTMLElement>('button')) {
      const selected =
        option.dataset.scheme === settings.scheme || option.dataset.hand === settings.hand;
      option.classList.toggle('selected', selected);
    }
  };
  mark();
  gear.addEventListener('click', () => (panel.hidden = !panel.hidden));
  root.append(gear, panel);

  return {
    source: {
      command: (ctx) => current.command(ctx),
      dispose: () => current.dispose(),
    },
    dispose() {
      current.dispose();
      layer.remove();
      gear.remove();
      panel.remove();
    },
  };
}
