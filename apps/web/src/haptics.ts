/** Phone vibration where the browser supports it (Android); silently nothing elsewhere. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not allowed or not supported.
  }
}
