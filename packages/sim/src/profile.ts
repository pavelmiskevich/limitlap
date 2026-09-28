/**
 * Physics profiles: every tunable number of the simulation, with an id and a
 * version. A published version never changes; tuning creates a new version,
 * and every result is tied to the profile key it was driven with.
 */

import standard from '../profiles/standard-1.json' with { type: 'json' };
import { TICKS_PER_SECOND } from './constants.ts';
import { fx, type Fx } from './fixed.ts';

/** Profile as stored in JSON, in SI units and seconds. */
export interface ProfileJson {
  id: string;
  version: number;
  /** Acceleration under throttle, m/s². */
  accel: number;
  /** Deceleration under brake, m/s². */
  brake: number;
  /** Top speed, m/s. */
  vTop: number;
  /** Lateral acceleration the field can hold, m/s²: v_max = √(aHold · r). */
  aHold: number;
  /** Effective gravity in loops, m/s²: v_min = √(loopGravity · r). */
  loopGravity: number;
  edge: {
    /** Width of the edge zone as a fraction above the limit. */
    width: number;
    /** Grip meter fill per second at the full width of the zone. */
    fillRate: number;
    /** Grip meter drain per second below the limit. */
    drainRate: number;
  };
  /** Extra pause after a deslot, seconds. */
  deslotPause: number;
  /** How far back rewind may go, seconds. */
  rewindLimit: number;
  probabilisticDeslot: {
    enabled: boolean;
    /** Deslot chance per second at the full width of the edge zone. */
    chancePerSecond: number;
  };
}

/** Profile ready for the simulation: fixed point, per-tick values. */
export interface PhysicsProfile {
  readonly id: string;
  readonly version: number;
  /** `id@version`: the identity results and replays are tied to. */
  readonly key: string;
  readonly accelPerTick: Fx;
  readonly brakePerTick: Fx;
  readonly vTop: Fx;
  readonly aHold: Fx;
  readonly loopGravity: Fx;
  readonly edgeWidth: Fx;
  readonly edgeFillPerTick: Fx;
  readonly edgeDrainPerTick: Fx;
  readonly deslotPauseTicks: number;
  readonly rewindLimitTicks: number;
  readonly probabilisticDeslot: { readonly enabled: boolean; readonly chancePerTick: Fx };
  readonly source: ProfileJson;
}

export class ProfileError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`invalid physics profile:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'ProfileError';
    this.issues = issues;
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const SHAPE: Record<string, readonly string[]> = {
  '': [
    'id',
    'version',
    'accel',
    'brake',
    'vTop',
    'aHold',
    'loopGravity',
    'edge',
    'deslotPause',
    'rewindLimit',
    'probabilisticDeslot',
  ],
  edge: ['width', 'fillRate', 'drainRate'],
  probabilisticDeslot: ['enabled', 'chancePerSecond'],
};

function validate(json: unknown): string[] {
  if (!isObject(json)) return ['profile must be an object'];
  const issues: string[] = [];
  const edge = isObject(json.edge) ? json.edge : undefined;
  const deslot = isObject(json.probabilisticDeslot) ? json.probabilisticDeslot : undefined;

  if (typeof json.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(json.id)) {
    issues.push('id: use lowercase letters, digits and dashes');
  }
  if (!Number.isInteger(json.version) || (json.version as number) < 1) {
    issues.push('version: must be an integer ≥ 1');
  }

  const positive = (path: string, value: unknown) => {
    if (!isNumber(value) || value <= 0) issues.push(`${path}: must be a number > 0`);
  };
  const within = (path: string, value: unknown, low: number, high: number, openLow = false) => {
    const ok = isNumber(value) && (openLow ? value > low : value >= low) && value <= high;
    if (!ok) issues.push(`${path}: must be a number in ${openLow ? '(' : '['}${low}, ${high}]`);
  };

  positive('accel', json.accel);
  positive('brake', json.brake);
  positive('vTop', json.vTop);
  positive('aHold', json.aHold);
  positive('loopGravity', json.loopGravity);

  if (edge) {
    within('edge.width', edge.width, 0, 0.5, true);
    positive('edge.fillRate', edge.fillRate);
    within('edge.drainRate', edge.drainRate, 0, 100);
  } else {
    issues.push('edge: must be an object');
  }

  within('deslotPause', json.deslotPause, 0, 10);
  within('rewindLimit', json.rewindLimit, 0, 60);

  if (deslot) {
    if (typeof deslot.enabled !== 'boolean') {
      issues.push('probabilisticDeslot.enabled: must be true or false');
    }
    within('probabilisticDeslot.chancePerSecond', deslot.chancePerSecond, 0, 10);
  } else {
    issues.push('probabilisticDeslot: must be an object');
  }

  for (const [prefix, keys] of Object.entries(SHAPE)) {
    const node = prefix === '' ? json : json[prefix];
    if (!isObject(node)) continue;
    for (const key of Object.keys(node)) {
      if (!keys.includes(key)) issues.push(`${prefix ? `${prefix}.` : ''}${key}: unknown key`);
    }
  }

  return issues;
}

const TICKS = fx.fromInt(TICKS_PER_SECOND);
const perTick = (perSecond: number) => fx.div(fx.fromFloat(perSecond), TICKS);
const toTicks = (seconds: number) => fx.toInt(fx.mul(fx.fromFloat(seconds), TICKS));

/** Validates a profile and converts it for the simulation; throws `ProfileError`. */
export function parseProfile(json: unknown): PhysicsProfile {
  const issues = validate(json);
  if (issues.length > 0) throw new ProfileError(issues);
  const source = json as ProfileJson;

  return {
    id: source.id,
    version: source.version,
    key: `${source.id}@${source.version}`,
    accelPerTick: perTick(source.accel),
    brakePerTick: perTick(source.brake),
    vTop: fx.fromFloat(source.vTop),
    aHold: fx.fromFloat(source.aHold),
    loopGravity: fx.fromFloat(source.loopGravity),
    edgeWidth: fx.fromFloat(source.edge.width),
    edgeFillPerTick: perTick(source.edge.fillRate),
    edgeDrainPerTick: perTick(source.edge.drainRate),
    deslotPauseTicks: toTicks(source.deslotPause),
    rewindLimitTicks: toTicks(source.rewindLimit),
    probabilisticDeslot: {
      enabled: source.probabilisticDeslot.enabled,
      chancePerTick: perTick(source.probabilisticDeslot.chancePerSecond),
    },
    source,
  };
}

export const DEFAULT_PROFILE: PhysicsProfile = parseProfile(standard);
