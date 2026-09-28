import { describe, expect, test } from 'vitest';
import { emptyStats } from './stats.ts';
import { createStatsView } from './stats-view.ts';

describe('stats view', () => {
  test('a panel button opens the report and closes it', () => {
    const root = document.createElement('div');
    const panel = document.createElement('div');
    createStatsView(root, panel, () => emptyStats());
    const overlay = root.querySelector<HTMLElement>('.stats');
    expect(overlay?.hidden).toBe(true);
    panel.querySelector<HTMLElement>('[data-action="stats"]')?.click();
    expect(overlay?.hidden).toBe(false);
    expect(overlay?.querySelector('pre')?.textContent).toMatch(/^LimitLap/);
    overlay?.querySelector<HTMLElement>('[data-action="close"]')?.click();
    expect(overlay?.hidden).toBe(true);
  });
});
