import {
  botCommand,
  createCar,
  DEFAULT_PROFILE as profile,
  fx,
  step,
  type Lane,
  type SimEvent,
} from '@limitlap/sim';
import { compileTrack, PROTO_RING } from '@limitlap/tracks';
import { describe, expect, test } from 'vitest';
import { decodeReplay, encodeReplay, stateChecksum } from './format.ts';
import { buildReplay, playReplay } from './play.ts';

const track = compileTrack(PROTO_RING);
const maybeLane = track.lanes[2];
if (!maybeLane) throw new Error('no lane');
const lane: Lane = maybeLane;

function liveDrive() {
  const commands: number[] = [];
  const events: SimEvent[] = [];
  let state = createCar();
  while (state.lap < 2) {
    const command = botCommand(state, lane, profile, fx.fromFloat(0.99));
    commands.push(command);
    state = step(state, command, lane, profile, events);
  }
  return { commands, events, state };
}

const header = {
  trackId: track.id,
  trackVersion: track.version,
  profileId: profile.id,
  profileVersion: profile.version,
  seed: 0,
  lane: 2,
  flags: 0,
};

describe('buildReplay and playReplay', () => {
  test('a replay stores the commands and the checksum of the final state', () => {
    const live = liveDrive();
    const replay = buildReplay(header, live.commands, live.state);
    expect(replay.commands).toHaveLength(live.commands.length);
    expect(replay.checksum).toBe(stateChecksum(live.state));
  });

  test('playing a replay gives the same events, time and final state as the live drive', () => {
    const live = liveDrive();
    const bytes = encodeReplay(buildReplay(header, live.commands, live.state));
    const played = playReplay(decodeReplay(bytes), lane, profile);
    expect(played.events).toEqual(live.events);
    expect(played.state).toEqual(live.state);
    expect(played.valid).toBe(true);
  });

  test('a replay whose commands were changed no longer matches its checksum', () => {
    const live = liveDrive();
    const replay = buildReplay(header, live.commands, live.state);
    replay.commands[100] = replay.commands[100] === 1 ? 2 : 1;
    expect(playReplay(replay, lane, profile).valid).toBe(false);
  });
});
