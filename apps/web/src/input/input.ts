/**
 * Input sources turn player actions into one simulation command per tick.
 * Every scheme — keyboard, buttons, slider — ends up as Hold / Accel / Brake,
 * so the physics is the same whichever the player uses.
 */

import { Command, type Fx, type PhysicsProfile } from '@limitlap/sim';

export interface InputContext {
  /** Current speed, for sources that steer towards a target speed. */
  speed: Fx;
  profile: PhysicsProfile;
}

export interface InputSource {
  command(ctx: InputContext): Command;
  dispose(): void;
}

/** Several sources at once: brake if any brakes, else throttle if any does. */
export function combine(sources: readonly InputSource[]): InputSource {
  return {
    command(ctx) {
      let result: Command = Command.Hold;
      for (const source of sources) {
        const command = source.command(ctx);
        if (command === Command.Brake) return Command.Brake;
        if (command === Command.Accel) result = Command.Accel;
      }
      return result;
    },
    dispose() {
      for (const source of sources) source.dispose();
    },
  };
}
