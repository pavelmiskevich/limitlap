import { afterEach, describe, expect, test, vi } from 'vitest';
import { loadRaceSettings, RACE_TRACKS, saveRaceSettings } from './race-settings.ts';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('race settings', () => {
  test('offer the single-lane and the four-lane prototype ring', () => {
    expect(RACE_TRACKS.map((t) => [t.id, t.lanes])).toEqual([
      ['proto-ring-solo', 1],
      ['proto-ring', 4],
    ]);
  });

  test('default to the single-lane ring', () => {
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring-solo', lane: 0 });
  });

  test('are remembered', () => {
    saveRaceSettings({ track: 'proto-ring', lane: 3 });
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring', lane: 3 });
  });

  test('a lane the track does not have falls back to lane 0', () => {
    saveRaceSettings({ track: 'proto-ring-solo', lane: 2 });
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring-solo', lane: 0 });
  });

  test('an unknown track or broken storage gives the default', () => {
    localStorage.setItem('limitlap:race', '{"track":"monza","lane":1}');
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring-solo', lane: 0 });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring-solo', lane: 0 });
  });
});

describe('race choices', () => {
  test('switching to four lanes shows lane buttons; picking a lane reports it', async () => {
    const { createRaceChoices } = await import('./race-settings.ts');
    const panel = document.createElement('div');
    const seen: string[] = [];
    createRaceChoices(panel, { track: 'proto-ring-solo', lane: 0 }, (s) =>
      seen.push(`${s.track}:${s.lane}`),
    );
    const laneRow = () => panel.querySelectorAll<HTMLElement>('[data-lane]');
    expect(laneRow()).toHaveLength(1);

    panel.querySelector<HTMLElement>('[data-track="proto-ring"]')?.click();
    expect(laneRow()).toHaveLength(4);
    panel.querySelector<HTMLElement>('[data-lane="2"]')?.click();
    expect(seen).toEqual(['proto-ring:0', 'proto-ring:2']);
    expect(loadRaceSettings()).toEqual({ track: 'proto-ring', lane: 2 });
  });
});
