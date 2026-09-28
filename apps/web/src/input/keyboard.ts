/** Keyboard: ↑ / W throttle, ↓ / S / Space brake, R restart. */

import { Command } from '@limitlap/sim';
import type { InputSource } from './input.ts';

const THROTTLE = new Set(['ArrowUp', 'KeyW']);
const BRAKE = new Set(['ArrowDown', 'KeyS', 'Space']);
const RESTART = 'KeyR';

export interface KeyboardOptions {
  onRestart?: () => void;
}

export function createKeyboard(target: EventTarget, options: KeyboardOptions = {}): InputSource {
  const pressed = new Set<string>();

  const down = (event: Event) => {
    const { code, repeat } = event as KeyboardEvent;
    if (code === RESTART) {
      if (!repeat) options.onRestart?.();
      return;
    }
    if (THROTTLE.has(code) || BRAKE.has(code)) {
      pressed.add(code);
      event.preventDefault();
    }
  };
  const up = (event: Event) => pressed.delete((event as KeyboardEvent).code);
  const releaseAll = () => pressed.clear();

  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', releaseAll);

  return {
    command() {
      let throttle = false;
      for (const code of pressed) {
        if (BRAKE.has(code)) return Command.Brake;
        if (THROTTLE.has(code)) throttle = true;
      }
      return throttle ? Command.Accel : Command.Hold;
    },
    dispose() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', releaseAll);
      pressed.clear();
    },
  };
}
