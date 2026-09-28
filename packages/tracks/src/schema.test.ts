import { describe, expect, test } from 'vitest';
import { parseTrack, TrackError, type TrackJson } from './schema.ts';

/** A 400 × 200 m stadium: two straights and two 180° turns. */
const stadium = (): TrackJson => ({
  id: 'stadium',
  version: 1,
  lanes: 2,
  laneSpacing: 4,
  sections: [
    { type: 'straight', length: 400 },
    { type: 'turn', radius: 100, angle: 180, direction: 'left' },
    { type: 'straight', length: 400 },
    { type: 'turn', radius: 100, angle: 180, direction: 'left' },
  ],
  sectors: [2],
});

function issuesOf(json: unknown): string[] {
  try {
    parseTrack(json);
    return [];
  } catch (error) {
    if (error instanceof TrackError) return error.issues;
    throw error;
  }
}

const withChange = (change: (t: Record<string, unknown>) => void) => {
  const track = stadium() as unknown as Record<string, unknown>;
  change(track);
  return track;
};

describe('parseTrack', () => {
  test('accepts a closed track', () => {
    expect(parseTrack(stadium()).key).toBe('stadium@1');
  });

  test('a loop keeps the ring closed', () => {
    const track = stadium();
    track.sections.splice(1, 0, { type: 'loop', radius: 10 });
    expect(issuesOf(track)).toEqual([]);
  });

  test('a ring that does not come back to the start is rejected', () => {
    const track = stadium();
    track.sections[2] = { type: 'straight', length: 390 };
    expect(issuesOf(track)).toEqual([
      'track does not close: the end is 10.00 m away from the start',
    ]);
  });

  test('a figure of eight from two full circles closes', () => {
    const track = stadium();
    track.sections = [
      { type: 'turn', radius: 50, angle: 360, direction: 'left' },
      { type: 'turn', radius: 50, angle: 360, direction: 'right' },
    ];
    track.sectors = [1];
    expect(issuesOf(track)).toEqual([]);
  });

  test('a ring that ends facing another direction is rejected', () => {
    const track = stadium();
    track.sections = [
      { type: 'turn', radius: 50, angle: 360, direction: 'left' },
      { type: 'turn', radius: 50, angle: 360, direction: 'right' },
      { type: 'turn', radius: 50, angle: 90, direction: 'left' },
    ];
    track.sectors = [1];
    expect(issuesOf(track)[0]).toMatch(/^track does not close/);
  });

  test('id and version are checked', () => {
    expect(issuesOf(withChange((t) => ((t.id = 'Big Ring'), (t.version = 0))))).toEqual([
      'id: use lowercase letters, digits and dashes',
      'version: must be an integer ≥ 1',
    ]);
  });

  test('lane count and spacing are limited', () => {
    expect(issuesOf(withChange((t) => ((t.lanes = 5), (t.laneSpacing = 0))))).toEqual([
      'lanes: must be an integer from 1 to 4',
      'laneSpacing: must be a number from 2 to 10',
    ]);
  });

  test('sections are validated one by one', () => {
    const track = withChange((t) => {
      t.sections = [
        { type: 'straight', length: -1 },
        { type: 'turn', radius: 100, angle: 400, direction: 'up' },
        { type: 'loop', radius: 0 },
        { type: 'ramp' },
      ];
      t.sectors = [];
    });
    expect(issuesOf(track)).toEqual([
      'section 0: length must be a number > 0',
      'section 1: angle must be a number in (0, 360]',
      'section 1: direction must be "left" or "right"',
      'section 2: radius must be a number > 0',
      'section 3: unknown section type "ramp"',
    ]);
  });

  test('the inner lane of a turn keeps a usable radius', () => {
    const track = stadium();
    track.lanes = 4;
    track.laneSpacing = 4;
    track.sections[1] = { type: 'turn', radius: 7, angle: 180, direction: 'left' };
    expect(issuesOf(track)).toContain('section 1: the inner lane radius 1 m is below 5 m');
  });

  test('sectors are ascending section indices after the first section', () => {
    expect(issuesOf(withChange((t) => (t.sectors = [0])))).toEqual([
      'sectors: must be ascending section indices from 1 to 3',
    ]);
    expect(issuesOf(withChange((t) => (t.sectors = [3, 2])))).toEqual([
      'sectors: must be ascending section indices from 1 to 3',
    ]);
  });

  test('unknown keys are reported', () => {
    expect(issuesOf(withChange((t) => (t.lane = 2)))).toEqual(['lane: unknown key']);
  });

  test('a section with an unknown key is reported', () => {
    const track = stadium();
    (track.sections[0] as Record<string, unknown>).radius = 5;
    expect(issuesOf(track)).toEqual(['section 0: unknown key "radius"']);
  });

  test('the error message lists every issue', () => {
    expect(() => parseTrack(withChange((t) => (t.lanes = 0)))).toThrow(
      'invalid track:\n- lanes: must be an integer from 1 to 4',
    );
  });
});
