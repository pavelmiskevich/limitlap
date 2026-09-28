/**
 * Lane balance: the same bot drives every lane, and the lap times show
 * whether the longer outer lanes are paid back by their faster turns.
 */

import {
  botCommand,
  createCar,
  fx,
  step,
  TICKS_PER_SECOND,
  type CompiledTrack,
  type Fx,
  type PhysicsProfile,
  type SimEvent,
} from '@limitlap/sim';

export interface LaneBalanceRow {
  lane: number;
  lengthMeters: number;
  /** Second lap, so the standing start does not count. */
  lapSeconds: number;
  deslots: number;
}

export function laneBalance(
  track: CompiledTrack,
  profile: PhysicsProfile,
  share: Fx,
): LaneBalanceRow[] {
  return track.lanes.map((lane, index) => {
    const events: SimEvent[] = [];
    let state = createCar();
    const limit = TICKS_PER_SECOND * 600;
    while (state.lap < 2 && state.tick < limit) {
      state = step(state, botCommand(state, lane, profile, share), lane, profile, events);
    }
    const laps = events.filter((e) => e.type === 'lap');
    const second = laps[1] ?? laps[0];
    return {
      lane: index,
      lengthMeters: fx.toNumber(lane.length),
      lapSeconds: second ? fx.toNumber(second.time) / TICKS_PER_SECOND : Infinity,
      deslots: events.filter((e) => e.type === 'deslot').length,
    };
  });
}

export function balanceTable(rows: readonly LaneBalanceRow[]): string {
  const best = Math.min(...rows.map((r) => r.lapSeconds));
  const lines = rows.map((r) =>
    [
      String(r.lane).padEnd(6),
      `${r.lengthMeters.toFixed(1)} m`.padEnd(10),
      `${r.lapSeconds.toFixed(3)} s`.padEnd(10),
      `+${(r.lapSeconds - best).toFixed(3)} s`.padEnd(10),
      r.deslots > 0 ? `${r.deslots} deslots` : '',
    ]
      .join('')
      .trimEnd(),
  );
  return ['lane  length    lap       gap', ...lines].join('\n');
}
