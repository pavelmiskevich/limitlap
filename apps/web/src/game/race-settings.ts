/** Which prototype track and lane to drive; remembered between visits. */

import { PROTO_RING, PROTO_RING_SOLO, type TrackSpec } from '@limitlap/tracks';

export const RACE_TRACKS: readonly TrackSpec[] = [PROTO_RING_SOLO, PROTO_RING];

export interface RaceSettings {
  track: string;
  lane: number;
}

const KEY = 'limitlap:race';
const DEFAULTS: RaceSettings = { track: PROTO_RING_SOLO.id, lane: 0 };

export const trackById = (id: string) => RACE_TRACKS.find((t) => t.id === id);

export function loadRaceSettings(): RaceSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
    const { track, lane } = raw as Record<string, unknown>;
    const spec = typeof track === 'string' ? trackById(track) : undefined;
    if (!spec) return { ...DEFAULTS };
    const valid =
      typeof lane === 'number' && Number.isInteger(lane) && lane >= 0 && lane < spec.lanes;
    return { track: spec.id, lane: valid ? lane : 0 };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveRaceSettings(settings: RaceSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered; the choice still applies now.
  }
}

/**
 * Rows for the settings panel: the track variant and the lane. `onChange`
 * fires with the new settings after they are saved.
 */
export function createRaceChoices(
  panel: HTMLElement,
  initial: RaceSettings,
  onChange: (settings: RaceSettings) => void,
): void {
  const settings = { ...initial };
  const trackRow = document.createElement('div');
  trackRow.className = 'choice';
  const laneRow = document.createElement('div');
  laneRow.className = 'choice';
  panel.append(trackRow, laneRow);

  const button = (
    text: string,
    selected: boolean,
    pick: () => void,
    data: Record<string, string>,
  ) => {
    const option = Object.assign(document.createElement('button'), {
      type: 'button',
      textContent: text,
    });
    Object.assign(option.dataset, data);
    option.classList.toggle('selected', selected);
    option.addEventListener('click', pick);
    return option;
  };

  const render = () => {
    const spec = trackById(settings.track) ?? RACE_TRACKS[0];
    trackRow.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: 'Трасса' }),
      ...RACE_TRACKS.map((track) =>
        button(
          `${track.lanes} ${track.lanes === 1 ? 'полоса' : 'полосы'}`,
          track.id === settings.track,
          () => pick({ track: track.id, lane: 0 }),
          { track: track.id },
        ),
      ),
    );
    laneRow.hidden = (spec?.lanes ?? 1) < 2;
    laneRow.replaceChildren(
      Object.assign(document.createElement('span'), { textContent: 'Полоса' }),
      ...Array.from({ length: spec?.lanes ?? 1 }, (_, lane) =>
        button(String(lane + 1), lane === settings.lane, () => pick({ ...settings, lane }), {
          lane: String(lane),
        }),
      ),
    );
  };

  const pick = (next: RaceSettings) => {
    if (next.track === settings.track && next.lane === settings.lane) return;
    Object.assign(settings, next);
    saveRaceSettings(settings);
    render();
    onChange({ ...settings });
  };
  render();
}
