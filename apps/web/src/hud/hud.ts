/**
 * HUD at the top of the screen, where the chase camera only shows sky:
 * lap time, best lap, live gap to the ghost, grip meter, speed, deslots.
 */

import type { DeslotCause } from '@limitlap/sim';
import { formatDelta, formatLapTime, formatSpeed } from './format.ts';
import { warningLevel } from './warning.ts';

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
  /** A deslot happened since the last frame, with its cause. */
  deslot: DeslotCause | null;
}

export interface Hud {
  /** `dt` — seconds since the last frame, for the banner and the screen edges. */
  update(model: HudModel, dt?: number): void;
}

const CAUSES: Record<DeslotCause, string> = {
  'over-limit': 'слишком быстро',
  grip: 'шкала сцепления заполнилась',
  'too-slow': 'мало скорости в петле',
};
const BANNER = 1.2;
const HIT = 0.4;

export function createHud(root: HTMLElement, { onRestart }: { onRestart: () => void }): Hud {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="vignette"></div>
    <div class="deslot-banner" hidden><div class="deslot-title">СРЫВ</div><div class="deslot-cause"></div></div>
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
  const vignette = get('.vignette');
  const banner = get('.deslot-banner');
  const cause = get('.deslot-cause');
  get('.restart').addEventListener('click', onRestart);

  let clock = 0;
  let bannerLeft = 0;
  let hitLeft = 0;

  return {
    update(model, dt = 0) {
      clock += dt;
      bannerLeft = Math.max(0, bannerLeft - dt);
      hitLeft = Math.max(0, hitLeft - dt);
      if (model.deslot) {
        cause.textContent = CAUSES[model.deslot];
        bannerLeft = BANNER;
        hitLeft = HIT;
      }
      banner.hidden = bannerLeft <= 0;
      const edges = Math.max(warningLevel(model.grip, clock), hitLeft / HIT);
      vignette.style.opacity = String(Math.round(edges * 1000) / 1000);

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
