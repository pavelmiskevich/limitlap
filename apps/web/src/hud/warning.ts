/** Red edges of the screen as the grip meter fills: a warning before a deslot. */

export const WARN_FROM = 0.7;

/** 0…1 for the edge glow; pulses about three times a second near the limit. */
export function warningLevel(grip: number, seconds: number): number {
  if (grip < WARN_FROM) return 0;
  const depth = Math.min(1, (grip - WARN_FROM) / (1 - WARN_FROM));
  const pulse = 0.75 + 0.25 * Math.sin(seconds * Math.PI * 2 * 3);
  return Math.min(1, (0.25 + 0.75 * depth) * pulse);
}
