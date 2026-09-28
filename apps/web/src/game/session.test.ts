import { Command, DEFAULT_PROFILE, fx } from '@limitlap/sim';
import { compileTrack, PROTO_RING } from '@limitlap/tracks';
import { describe, expect, test } from 'vitest';
import { createSession } from './session.ts';

const track = compileTrack(PROTO_RING);
const make = () => createSession({ track, lane: 1, profile: DEFAULT_PROFILE });

describe('session', () => {
  test('starts standing on the line of the chosen lane', () => {
    const session = make();
    expect(session.state.distance).toBe(0);
    expect(session.lane).toBe(track.lanes[1]);
  });

  test('update runs one simulation step and records the command', () => {
    const session = make();
    session.update(Command.Accel);
    session.update(Command.Hold);
    expect(session.state.tick).toBe(2);
    expect(session.state.speed).toBe(DEFAULT_PROFILE.accelPerTick);
    expect(Array.from(session.commands)).toEqual([Command.Accel, Command.Hold]);
  });

  test('events of the last step are exposed and then replaced', () => {
    const session = make();
    session.state = { ...session.state, speed: fx.fromInt(200), segment: 0 };
    let deslots = 0;
    for (let i = 0; i < 600 && deslots === 0; i++) {
      session.update(Command.Hold);
      deslots += session.lastEvents.filter((e) => e.type === 'deslot').length;
    }
    expect(deslots).toBe(1);
    session.update(Command.Hold);
    expect(session.lastEvents.filter((e) => e.type === 'deslot')).toEqual([]);
  });

  test('renderDistance interpolates between the last two steps', () => {
    const session = make();
    session.state = { ...session.state, speed: fx.fromInt(30) };
    session.update(Command.Hold);
    session.update(Command.Hold);
    expect(session.renderDistance(0)).toBeCloseTo(0.5, 6);
    expect(session.renderDistance(0.5)).toBeCloseTo(0.75, 6);
    expect(session.renderDistance(1)).toBeCloseTo(1, 6);
  });

  test('renderDistance keeps moving forward across the finish line', () => {
    const session = make();
    const length = fx.toNumber(session.lane.length);
    session.state = {
      ...session.state,
      distance: fx.sub(session.lane.length, fx.fromFloat(0.25)),
      speed: fx.fromInt(30),
    };
    session.update(Command.Hold);
    expect(session.state.distance).toBe(fx.fromFloat(0.25));
    expect(session.renderDistance(0.5)).toBeCloseTo(length, 6);
  });

  test('reset puts the car back on the line and clears the recording', () => {
    const session = make();
    session.update(Command.Accel);
    session.reset();
    expect(session.state.tick).toBe(0);
    expect(session.commands).toHaveLength(0);
    expect(session.renderDistance(0.7)).toBe(0);
  });
});
