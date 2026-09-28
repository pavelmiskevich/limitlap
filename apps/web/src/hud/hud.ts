/**
 * HUD at the top of the screen, where the chase camera only shows sky:
 * lap time, best lap, live gap to the ghost, grip meter, speed, deslots.
 */

import { formatDelta, formatLapTime, formatSpeed } from './format.ts';

export interface HudModel {
  /** Current lap time, ticks. */
  lapTime: number;
  /** Best lap, ticks, or `null` before the first lap. */
  best: number | null;
  /** Gap to the ghost at the same point of the lap, ticks; `null` without a ghost. */
  delta: number | null;
  /** m/s. */
  speed: number;
  /** Grip meter, 0…1. */
  grip: number;
  deslots: number;
}

export interface Hud {
  update(model: HudModel): void;
}

export function createHud(root: HTMLElement, { onRestart }: { onRestart: () => void }): Hud {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <button type="button" class="restart" aria-label="Заново">↻</button>
    <div class="hud-top">
      <div class="lap-time">0:00.000</div>
      <div class="hud-row"><span class="label">лучший</span><span class="best">—</span><span class="delta"></span></div>
      <div class="grip"><div class="grip-fill"></div></div>
    </div>
    <div class="hud-bottom">
      <span class="speed">0</span><span class="unit">км/ч</span>
      <span class="deslots-label">срывы</span><span class="deslots">0</span>
    </div>`;
  root.append(hud);

  const get = <T extends HTMLElement>(selector: string) => hud.querySelector(selector) as T;
  const lapTime = get('.lap-time');
  const best = get('.best');
  const delta = get('.delta');
  const gripFill = get('.grip-fill');
  const speed = get('.speed');
  const deslots = get('.deslots');
  get('.restart').addEventListener('click', onRestart);

  return {
    update(model) {
      lapTime.textContent = formatLapTime(model.lapTime);
      best.textContent = model.best === null ? '—' : formatLapTime(model.best);
      delta.textContent = model.delta === null ? '' : formatDelta(model.delta);
      delta.classList.toggle('slower', model.delta !== null && model.delta > 0);
      delta.classList.toggle('faster', model.delta !== null && model.delta < 0);
      gripFill.style.width = `${Math.round(Math.min(1, Math.max(0, model.grip)) * 100)}%`;
      speed.textContent = formatSpeed(model.speed);
      deslots.textContent = String(model.deslots);
    },
  };
}
