import { TICKS_PER_SECOND } from '@limitlap/sim';

/** `m:ss.mmm` from simulation ticks. */
export function formatLapTime(ticks: number): string {
  const ms = Math.round((ticks / TICKS_PER_SECOND) * 1000);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** Gap to the ghost: `+0.231` slower, `−0.150` faster (a real minus sign). */
export function formatDelta(ticks: number): string {
  const ms = Math.round((ticks / TICKS_PER_SECOND) * 1000);
  const text = (Math.abs(ms) / 1000).toFixed(3);
  if (ms > 0) return `+${text}`;
  if (ms < 0) return `−${text}`;
  return text;
}

/** Whole km/h from m/s. */
export function formatSpeed(metresPerSecond: number): string {
  return String(Math.round(metresPerSecond * 3.6));
}
