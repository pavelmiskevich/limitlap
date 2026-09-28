import { DEFAULT_PROFILE } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { createDebugPanel, exportProfile } from './panel.ts';
import { PARAMETERS } from './tuning.ts';

describe('debug panel', () => {
  test('has a slider per parameter and reports changes', () => {
    const root = document.createElement('div');
    const changes: (number | null)[] = [];
    createDebugPanel(root, {
      values: DEFAULT_PROFILE.source,
      onChange: (profile) => changes.push(profile ? profile.aHold : null),
    });
    const sliders = root.querySelectorAll<HTMLInputElement>('input[type="range"]');
    expect(sliders).toHaveLength(PARAMETERS.length);

    const aHold = root.querySelector<HTMLInputElement>('input[data-path="aHold"]');
    if (!aHold) throw new Error('no slider');
    aHold.value = '44';
    aHold.dispatchEvent(new Event('input'));
    expect(root.querySelector('[data-value="aHold"]')?.textContent).toBe('44 м/с²');
    expect(changes).toEqual([]);
    aHold.dispatchEvent(new Event('change'));
    expect(changes).toEqual([44]);

    root.querySelector<HTMLElement>('[data-action="reset"]')?.click();
    expect(changes.at(-1)).toBeNull();
    expect(aHold.value).toBe(String(DEFAULT_PROFILE.source.aHold));
  });

  test('the export is the next version of the standard profile', () => {
    const exported = JSON.parse(exportProfile({ ...DEFAULT_PROFILE.source, aHold: 44 })) as Record<
      string,
      unknown
    >;
    expect(exported.id).toBe('standard');
    expect(exported.version).toBe(DEFAULT_PROFILE.version + 1);
    expect(exported.aHold).toBe(44);
  });
});
