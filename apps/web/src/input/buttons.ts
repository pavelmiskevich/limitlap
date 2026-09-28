/** Two touch buttons, gas and brake; several fingers at once are fine. */

import { Command } from '@limitlap/sim';
import type { InputSource } from './input.ts';

export function createButtons(root: HTMLElement): InputSource {
  const wrap = document.createElement('div');
  wrap.className = 'buttons';
  const make = (action: 'gas' | 'brake', label: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pedal ${action}`;
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    wrap.append(button);
    return button;
  };
  const brake = make('brake', 'Тормоз');
  const gas = make('gas', 'Газ');
  root.append(wrap);

  const held = { gas: new Set<number>(), brake: new Set<number>() };
  for (const [button, pointers] of [
    [gas, held.gas],
    [brake, held.brake],
  ] as const) {
    button.addEventListener('pointerdown', (event) => {
      pointers.add(event.pointerId);
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('active');
      event.preventDefault();
    });
    const release = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) button.classList.remove('active');
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }

  return {
    command() {
      if (held.brake.size > 0) return Command.Brake;
      return held.gas.size > 0 ? Command.Accel : Command.Hold;
    },
    dispose() {
      wrap.remove();
    },
  };
}
