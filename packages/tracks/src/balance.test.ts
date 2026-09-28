import { DEFAULT_PROFILE, fx } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { balanceTable, laneBalance } from './balance.ts';
import { compileTrack } from './compile.ts';
import { PROTO_RING } from './prototypes.ts';

const ring = compileTrack(PROTO_RING);

describe('laneBalance', () => {
  test('drives every lane with the same bot and reports length and lap time', () => {
    const rows = laneBalance(ring, DEFAULT_PROFILE, fx.fromFloat(0.95));
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 2, 3]);
    for (const row of rows) {
      expect(row.lapSeconds).toBeGreaterThan(10);
      expect(row.deslots).toBe(0);
    }
    expect(rows[3]?.lengthMeters).toBeGreaterThan(rows[0]?.lengthMeters ?? Infinity);
  });

  test('the table names lanes, lengths, lap times and the gap to the fastest', () => {
    const table = balanceTable(laneBalance(ring, DEFAULT_PROFILE, fx.fromFloat(0.95)));
    expect(table).toMatch(/^lane\s+length\s+lap\s+gap/);
    expect(table.split('\n')).toHaveLength(5);
  });
});

describe('prototype ring balance', () => {
  test.each([0.9, 0.95, 1])('at %s of the limit no lane is more than 1 %% slower', (share) => {
    const rows = laneBalance(ring, DEFAULT_PROFILE, fx.fromFloat(share));
    const times = rows.map((r) => r.lapSeconds);
    const spread = (Math.max(...times) - Math.min(...times)) / Math.min(...times);
    expect(spread, `\n${balanceTable(rows)}`).toBeLessThan(0.01);
  });
});
