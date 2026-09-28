/**
 * Fixed-point numbers for the simulation.
 *
 * A value `x` is stored as the integer `x * FX_ONE` inside a regular JS number
 * and must stay a safe integer. Multiplication, division and square root go
 * through BigInt, so the result never depends on floating-point behaviour of
 * the engine. Results that would leave the safe range throw instead of
 * silently losing precision.
 */

export type Fx = number & { readonly __fx: unique symbol };

export const FX_SHIFT = 16;
export const FX_ONE = 1 << FX_SHIFT;

const ONE_BIG = BigInt(FX_ONE);

function checked(value: number): Fx {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`fixed-point overflow: ${value}`);
  }
  return value as Fx;
}

function fromBig(value: bigint): Fx {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`fixed-point overflow: ${value}`);
  }
  return Number(value) as Fx;
}

/** Floor of the square root of a non-negative bigint (Newton's method). */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

/** Rounds half away from zero without touching `Math`. */
function roundHalfAway(value: number): number {
  const magnitude = value < 0 ? -value : value;
  const shifted = magnitude + 0.5;
  const rounded = shifted - (shifted % 1);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

export const fx = {
  ZERO: 0 as Fx,
  ONE: FX_ONE as Fx,

  fromInt(n: number): Fx {
    if (!Number.isInteger(n)) throw new RangeError(`not an integer: ${n}`);
    return checked(n * FX_ONE);
  },

  /** `numerator / denominator` truncated toward zero; both must be integers. */
  fromRatio(numerator: number, denominator: number): Fx {
    if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
      throw new RangeError(`not integers: ${numerator}/${denominator}`);
    }
    if (denominator === 0) throw new RangeError('division by zero');
    return fromBig((BigInt(numerator) * ONE_BIG) / BigInt(denominator));
  },

  /**
   * Converts a decimal from configuration (profiles, tracks) to the nearest
   * representable value. Scaling by a power of two is exact for doubles, so
   * the result is the same in every engine.
   */
  fromFloat(x: number): Fx {
    if (!Number.isFinite(x)) throw new RangeError(`not finite: ${x}`);
    return checked(roundHalfAway(x * FX_ONE));
  },

  /** Integer part, truncated toward zero. */
  toInt(a: Fx): number {
    const whole = (a - (a % FX_ONE)) / FX_ONE;
    return whole === 0 ? 0 : whole;
  },

  /** For rendering and diagnostics only; never feed the result back into the simulation. */
  toNumber(a: Fx): number {
    return a / FX_ONE;
  },

  add(a: Fx, b: Fx): Fx {
    return checked(a + b);
  },

  sub(a: Fx, b: Fx): Fx {
    return checked(a - b);
  },

  /** Product truncated toward zero. */
  mul(a: Fx, b: Fx): Fx {
    return fromBig((BigInt(a) * BigInt(b)) / ONE_BIG);
  },

  /** Quotient truncated toward zero. */
  div(a: Fx, b: Fx): Fx {
    if (b === 0) throw new RangeError('division by zero');
    return fromBig((BigInt(a) * ONE_BIG) / BigInt(b));
  },

  /** Floor of the true square root. */
  sqrt(a: Fx): Fx {
    if (a < 0) throw new RangeError(`square root of a negative number: ${a}`);
    return fromBig(isqrt(BigInt(a) * ONE_BIG));
  },

  neg(a: Fx): Fx {
    return checked(0 - a);
  },

  abs(a: Fx): Fx {
    return a < 0 ? checked(0 - a) : a;
  },

  min(a: Fx, b: Fx): Fx {
    return a < b ? a : b;
  },

  max(a: Fx, b: Fx): Fx {
    return a > b ? a : b;
  },

  clamp(a: Fx, low: Fx, high: Fx): Fx {
    return a < low ? low : a > high ? high : a;
  },
} as const;
