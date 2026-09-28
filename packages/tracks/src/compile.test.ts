import { fx, validateLane } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import { compileTrack } from './compile.ts';
import { parseTrack, type TrackJson } from './schema.ts';

const stadium = (direction: 'left' | 'right'): TrackJson => ({
  id: 'stadium',
  version: 2,
  lanes: 4,
  laneSpacing: 4,
  sections: [
    { type: 'straight', length: 400 },
    { type: 'turn', radius: 100, angle: 180, direction },
    { type: 'loop', radius: 10 },
    { type: 'straight', length: 400 },
    { type: 'turn', radius: 100, angle: 180, direction },
  ],
  sectors: [2, 4],
});

const compiled = compileTrack(parseTrack(stadium('left')));
const lengthOf = (lane: number) => fx.toNumber(compiled.lanes[lane]?.length ?? fx.ZERO);

describe('compileTrack', () => {
  test('keeps id and version and builds one lane per track lane', () => {
    expect(compiled.id).toBe('stadium');
    expect(compiled.version).toBe(2);
    expect(compiled.lanes).toHaveLength(4);
  });

  test('every compiled lane is valid for the simulation', () => {
    for (const lane of compiled.lanes) expect(validateLane(lane)).toEqual([]);
  });

  test('in left turns lane 0 is the inner lane', () => {
    const radii = compiled.lanes.map((lane) => {
      const turn = lane.segments[1];
      return turn?.kind === 'turn' ? fx.toNumber(turn.radius) : 0;
    });
    expect(radii).toEqual([94, 98, 102, 106]);
  });

  test('in right turns lane 0 is the outer lane', () => {
    const right = compileTrack(parseTrack(stadium('right')));
    const turn = right.lanes[0]?.segments[1];
    expect(turn?.kind === 'turn' ? fx.toNumber(turn.radius) : 0).toBe(106);
  });

  test('lane lengths differ exactly by the geometry of the turns', () => {
    // Two half turns: each lane further out adds π · 4 m per turn.
    const step = 2 * Math.PI * 4;
    for (let lane = 1; lane < 4; lane++) {
      expect(lengthOf(lane) - lengthOf(lane - 1)).toBeCloseTo(step, 3);
    }
  });

  test('a lane length is the sum of straights, arcs and the loop', () => {
    const expected = 800 + 2 * Math.PI * 94 + 2 * Math.PI * 10;
    expect(lengthOf(0)).toBeCloseTo(expected, 3);
  });

  test('a loop is the same for every lane', () => {
    const loops = compiled.lanes.map((lane) => lane.segments[2]);
    expect(new Set(loops.map((l) => l?.length)).size).toBe(1);
    expect(loops[0]).toEqual({
      kind: 'loop',
      length: fx.fromFloat(20 * Math.PI),
      radius: fx.fromInt(10),
    });
  });

  test('sectors start at the sections they name', () => {
    const lane = compiled.lanes[0];
    const starts = lane?.sectors.map((s) => fx.toNumber(s));
    expect(starts?.[0]).toBe(0);
    expect(starts?.[1]).toBeCloseTo(400 + Math.PI * 94, 3);
    expect(starts?.[2]).toBeCloseTo(800 + Math.PI * 94 + 20 * Math.PI, 3);
  });

  test('compiling twice gives identical lanes', () => {
    expect(compileTrack(parseTrack(stadium('left')))).toEqual(compiled);
  });
});
