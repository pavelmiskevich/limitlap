/**
 * Target-speed slider: the finger's height sets the speed to aim for, the
 * slider turns the difference into commands. A one-step band around the
 * target holds the speed, so commands do not jitter. No finger — hold.
 */

import { Command, fx, type Fx, type PhysicsProfile } from '@limitlap/sim';
import type { InputSource } from './input.ts';

/** 0 at the bottom of the slider, 1 at the top. */
export function positionToShare(clientY: number, rect: { top: number; height: number }): number {
  const share = 1 - (clientY - rect.top) / rect.height;
  return Math.min(1, Math.max(0, share));
}

export function sliderCommand(target: Fx, speed: Fx, profile: PhysicsProfile): Command {
  const diff = fx.sub(target, speed);
  if (diff >= profile.accelPerTick) return Command.Accel;
  if (fx.neg(diff) >= profile.brakePerTick) return Command.Brake;
  return Command.Hold;
}

export function createSlider(root: HTMLElement): InputSource {
  const track = document.createElement('div');
  track.className = 'slider';
  const fill = document.createElement('div');
  fill.className = 'slider-speed';
  const mark = document.createElement('div');
  mark.className = 'slider-target';
  track.append(fill, mark);
  root.append(track);

  let pointer: number | null = null;
  let share = 0;

  const move = (event: PointerEvent) => {
    share = positionToShare(event.clientY, track.getBoundingClientRect());
    mark.style.bottom = `${share * 100}%`;
  };
  const down = (event: PointerEvent) => {
    pointer = event.pointerId;
    track.setPointerCapture?.(event.pointerId);
    track.classList.add('active');
    move(event);
    event.preventDefault();
  };
  const moveIfOwn = (event: PointerEvent) => {
    if (event.pointerId === pointer) move(event);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    track.classList.remove('active');
  };

  track.addEventListener('pointerdown', down);
  track.addEventListener('pointermove', moveIfOwn);
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);

  return {
    command({ speed, profile }) {
      fill.style.height = `${(fx.toNumber(speed) / fx.toNumber(profile.vTop)) * 100}%`;
      if (pointer === null) return Command.Hold;
      return sliderCommand(fx.mul(profile.vTop, fx.fromFloat(share)), speed, profile);
    },
    dispose() {
      track.remove();
    },
  };
}
