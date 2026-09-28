import { profileByKey } from '@limitlap/sim';
import { describe, expect, test } from 'vitest';
import cases from '../golden/cases.json' with { type: 'json' };
import { decodeReplay } from './format.ts';
import { buildLane, fromHex, LANES, playCommands, summarize, type GoldenCase } from './golden.ts';

const golden = cases as GoldenCase[];

describe('golden replays', () => {
  test('there are golden cases with laps and deslots', () => {
    expect(golden.length).toBeGreaterThanOrEqual(6);
    expect(golden.some((c) => c.expected.deslots > 0)).toBe(true);
    expect(golden.every((c) => c.expected.laps.length > 0)).toBe(true);
  });

  test.each(golden.map((c) => [c.name, c] as const))('%s replays to the frozen result', (_, c) => {
    const replay = decodeReplay(fromHex(c.replay));
    const profile = profileByKey(`${replay.header.profileId}@${replay.header.profileVersion}`);
    expect(profile, 'the profile of the replay is no longer published').toBeDefined();
    if (!profile) return;

    const lane = buildLane(LANES[c.lane] ?? { segments: [], sectors: [] });
    const result = summarize(playCommands(replay.commands, lane, profile));

    expect(result, 'simulation result changed: regenerate only if intended').toEqual(c.expected);
    expect(result.checksum).toBe(replay.checksum);
  });
});
