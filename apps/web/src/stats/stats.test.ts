import { describe, expect, test } from 'vitest';
import { createTracker, emptyStats, formatReport, summarize, type Stats } from './stats.ts';

const lap = { track: 'proto-ring-solo@1', lane: 0, profile: 'standard@1' };

function play(tracker: ReturnType<typeof createTracker>, seconds: number) {
  for (let i = 0; i < seconds; i++) tracker.tick(1);
}

describe('tracker', () => {
  test('an attempt counts only once the player drives', () => {
    const tracker = createTracker(emptyStats(), () => 0);
    tracker.startAttempt();
    tracker.startAttempt();
    expect(tracker.stats.sessions[0]?.attempts).toBe(0);
    tracker.drove();
    tracker.drove();
    expect(tracker.stats.sessions[0]?.attempts).toBe(1);
    tracker.startAttempt();
    tracker.drove();
    expect(tracker.stats.sessions[0]?.attempts).toBe(2);
  });

  test('laps and deslots are recorded with the play time they happened at', () => {
    const tracker = createTracker(emptyStats(), () => 0);
    tracker.startAttempt();
    tracker.drove();
    play(tracker, 30);
    tracker.deslot();
    tracker.lap({ ...lap, time: 1500 });
    const session = tracker.stats.sessions[0];
    expect(session?.deslots).toBe(1);
    expect(session?.laps).toEqual([{ ...lap, time: 1500, at: 30 }]);
    expect(session?.playSeconds).toBe(30);
  });

  test('a long pause starts a new session', () => {
    let now = 0;
    const tracker = createTracker(emptyStats(), () => now);
    tracker.startAttempt();
    tracker.drove();
    now = 6 * 60_000;
    tracker.resume();
    expect(tracker.stats.sessions).toHaveLength(2);
    now += 60_000;
    tracker.resume();
    expect(tracker.stats.sessions).toHaveLength(2);
  });

  test('continues the stored statistics', () => {
    const stored: Stats = {
      sessions: [{ startedAt: 0, playSeconds: 120, attempts: 5, deslots: 2, laps: [] }],
    };
    const tracker = createTracker(stored, () => 0);
    expect(tracker.stats.sessions).toHaveLength(2);
    play(tracker, 10);
    expect(summarize(tracker.stats).playMinutes).toBeCloseTo(130 / 60, 6);
  });
});

describe('summary', () => {
  const stats: Stats = {
    sessions: [
      {
        startedAt: 0,
        playSeconds: 1500,
        attempts: 14,
        deslots: 9,
        laps: [
          { ...lap, time: 1500, at: 100 },
          { ...lap, time: 1400, at: 500 },
          { ...lap, time: 1380, at: 700 },
        ],
      },
      {
        startedAt: 10_000_000,
        playSeconds: 900,
        attempts: 22,
        deslots: 4,
        laps: [{ ...lap, time: 1350, at: 2100 }],
      },
    ],
  };

  test('covers the playtest criteria', () => {
    const s = summarize(stats);
    expect(s.sessions).toBe(2);
    expect(s.attempts).toBe(36);
    expect(s.maxAttemptsInSession).toBe(22);
    expect(s.firstSessionAttempts).toBe(14);
    expect(s.laps).toBe(4);
    expect(s.bestLap).toBe(1350);
    expect(s.playMinutes).toBe(40);
  });

  test('gives the best lap for every ten minutes of play', () => {
    expect(summarize(stats).bestByTenMinutes).toEqual([
      { from: 0, best: 1400 },
      { from: 10, best: 1380 },
      { from: 30, best: 1350 },
    ]);
  });

  test('the report is plain text ready to paste', () => {
    const report = formatReport(stats);
    expect(report).toContain('Попыток всего: 36');
    expect(report).toContain('Больше всего попыток за сессию: 22');
    expect(report).toContain('30–40 мин: 0:22.500');
    expect(report).toMatch(/^LimitLap/);
  });
});
