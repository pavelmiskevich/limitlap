/** Physics sliders for the prototype, shown with `?debug` in the address. */

import { DEFAULT_PROFILE, type ProfileJson } from '@limitlap/sim';
import { PARAMETERS, setParameter } from './tuning.ts';

export interface DebugPanelOptions {
  values: ProfileJson;
  /** New values when a slider is released, or `null` after a reset to the default profile. */
  onChange(values: ProfileJson | null): void;
}

/** JSON ready to be committed as the next version of the standard profile. */
export function exportProfile(values: ProfileJson): string {
  const next = { ...values, id: DEFAULT_PROFILE.id, version: DEFAULT_PROFILE.version + 1 };
  return `${JSON.stringify(next, null, 2)}\n`;
}

const format = (value: number, unit: string) =>
  `${Number(value.toFixed(3))}${unit ? ` ${unit}` : ''}`;

export function createDebugPanel(root: HTMLElement, options: DebugPanelOptions): void {
  let values = options.values;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'debug-toggle';
  toggle.textContent = 'Физика';
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.hidden = true;
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));

  const sliders = PARAMETERS.map((parameter) => {
    const row = document.createElement('label');
    row.className = 'debug-row';
    const name = Object.assign(document.createElement('span'), { textContent: parameter.label });
    const value = document.createElement('span');
    value.className = 'debug-value';
    value.dataset.value = parameter.path;
    const input = document.createElement('input');
    input.type = 'range';
    input.dataset.path = parameter.path;
    input.min = String(parameter.min);
    input.max = String(parameter.max);
    input.step = String(parameter.step);
    const show = () => {
      input.value = String(parameter.get(values));
      value.textContent = format(parameter.get(values), parameter.unit);
    };
    // The label follows the finger; the profile changes once the slider is released.
    input.addEventListener('input', () => {
      value.textContent = format(Number(input.value), parameter.unit);
    });
    input.addEventListener('change', () => {
      values = setParameter(values, parameter.path, Number(input.value));
      options.onChange(values);
    });
    show();
    row.append(name, value, input);
    panel.append(row);
    return show;
  });

  const actions = document.createElement('div');
  actions.className = 'debug-actions';
  const action = (id: string, text: string, run: () => void) => {
    const button = Object.assign(document.createElement('button'), {
      type: 'button',
      textContent: text,
    });
    button.dataset.action = id;
    button.addEventListener('click', run);
    actions.append(button);
  };
  action('reset', 'Сбросить', () => {
    values = DEFAULT_PROFILE.source;
    for (const show of sliders) show();
    options.onChange(null);
  });
  action('copy', 'Копировать JSON', () => {
    void navigator.clipboard?.writeText(exportProfile(values));
  });
  action('download', 'Скачать JSON', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([exportProfile(values)], { type: 'application/json' }),
    );
    link.download = `${DEFAULT_PROFILE.id}-${DEFAULT_PROFILE.version + 1}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  panel.append(actions);
  root.append(toggle, panel);
}
