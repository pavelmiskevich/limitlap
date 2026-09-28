/**
 * Playtest statistics kept on the device: attempts, laps, deslots and play
 * time, per session. A visit is a session; a pause of more than five minutes
 * starts another one. The report covers the criteria of the prototype.
 */

import { formatLapTime } from '../hud/format.ts';

export interface LapRecord {
  track: string;
  lane: number;
  profile: string;
  /** Lap time, ticks. */
  time: number;
  /** Total play time when the lap was set, seconds, across all sessions. */
  at: number;
}

export interface SessionStats {
  startedAt: number;
  playSeconds: number;
  attempts: number;
  deslots: number;
  laps: LapRecord[];
}

export interface Stats {
  sessions: SessionStats[];
}

export const emptyStats = (): Stats => ({ sessions: [] });

const PAUSE_MS = 5 * 60_000;

export interface Tracker {
  readonly stats: Stats;
  /** A start or a restart; counted once the player actually drives. */
  startAttempt(): void;
  /** The player gave a command other than hold. */
  drove(): void;
  lap(lap: Omit<LapRecord, 'at'>): void;
  deslot(): void;
  /** Adds play time, seconds. */
  tick(seconds: number): void;
  /** The tab became visible again. */
  resume(): void;
}

export function createTracker(stored: Stats, now: () => number = Date.now): Tracker {
  const stats: Stats = { sessions: [...stored.sessions] };
  let total = stats.sessions.reduce((sum, s) => sum + s.playSeconds, 0);
  let lastActive = now();
  let pending = false;

  const open = () => {
    const session: SessionStats = {
      startedAt: now(),
      playSeconds: 0,
      attempts: 0,
      deslots: 0,
      laps: [],
    };
    stats.sessions.push(session);
    return session;
  };
  let current = open();

  return {
    stats,
    startAttempt() {
      pending = true;
    },
    drove() {
      lastActive = now();
      if (!pending) return;
      pending = false;
      current.attempts += 1;
    },
    lap(lap) {
      current.laps.push({ ...lap, at: total });
    },
    deslot() {
      current.deslots += 1;
    },
    tick(seconds) {
      current.playSeconds += seconds;
      total += seconds;
    },
    resume() {
      if (now() - lastActive > PAUSE_MS) current = open();
      lastActive = now();
    },
  };
}

export interface Summary {
  sessions: number;
  playMinutes: number;
  attempts: number;
  maxAttemptsInSession: number;
  firstSessionAttempts: number;
  laps: number;
  deslots: number;
  bestLap: number | null;
  /** Best lap for every ten minutes of play, by the minute the bucket starts. */
  bestByTenMinutes: { from: number; best: number }[];
}

export function summarize(stats: Stats): Summary {
  const sessions = stats.sessions.filter((s) => s.attempts > 0 || s.playSeconds > 0);
  const laps = sessions.flatMap((s) => s.laps);
  const buckets = new Map<number, number>();
  for (const lap of laps) {
    const from = Math.floor(lap.at / 600) * 10;
    buckets.set(from, Math.min(buckets.get(from) ?? Infinity, lap.time));
  }
  return {
    sessions: sessions.length,
    playMinutes: sessions.reduce((sum, s) => sum + s.playSeconds, 0) / 60,
    attempts: sessions.reduce((sum, s) => sum + s.attempts, 0),
    maxAttemptsInSession: Math.max(0, ...sessions.map((s) => s.attempts)),
    firstSessionAttempts: sessions[0]?.attempts ?? 0,
    laps: laps.length,
    deslots: sessions.reduce((sum, s) => sum + s.deslots, 0),
    bestLap: laps.length > 0 ? Math.min(...laps.map((l) => l.time)) : null,
    bestByTenMinutes: [...buckets]
      .sort(([a], [b]) => a - b)
      .map(([from, best]) => ({ from, best })),
  };
}

export function formatReport(stats: Stats): string {
  const s = summarize(stats);
  return [
    'LimitLap — отчёт плейтеста',
    '',
    `Сессий: ${s.sessions}, время игры: ${Math.round(s.playMinutes)} мин`,
    `Попыток всего: ${s.attempts}`,
    `Больше всего попыток за сессию: ${s.maxAttemptsInSession}`,
    `Попыток в первой сессии: ${s.firstSessionAttempts}`,
    `Кругов: ${s.laps}, срывов: ${s.deslots}`,
    `Лучший круг: ${s.bestLap === null ? '—' : formatLapTime(s.bestLap)}`,
    '',
    'Лучший круг по времени игры:',
    ...(s.bestByTenMinutes.length > 0
      ? s.bestByTenMinutes.map((b) => `${b.from}–${b.from + 10} мин: ${formatLapTime(b.best)}`)
      : ['—']),
  ].join('\n');
}

const KEY = 'limitlap:stats';

export function loadStats(): Stats {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof raw === 'object' && raw !== null && Array.isArray((raw as Stats).sessions)) {
      return raw as Stats;
    }
  } catch {
    // Fall through to empty statistics.
  }
  return emptyStats();
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // Storage full or blocked: statistics of this visit stay in memory.
  }
}
