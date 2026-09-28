/**
 * Track format: sections along the centre line, a lane count and the spacing
 * between lanes. Lane 0 is the leftmost lane in the direction of travel.
 */

export type SectionJson =
  | { type: 'straight'; length: number }
  | { type: 'turn'; radius: number; angle: number; direction: 'left' | 'right' }
  | { type: 'loop'; radius: number };

export interface TrackJson {
  id: string;
  version: number;
  /** From 1 to 4. */
  lanes: number;
  /** Distance between neighbouring lane centres, metres. */
  laneSpacing: number;
  sections: SectionJson[];
  /** Indices of the sections where sectors 1, 2, … start; sector 0 starts at section 0. */
  sectors: number[];
}

export interface TrackSpec extends TrackJson {
  /** `id@version`. */
  readonly key: string;
}

export class TrackError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`invalid track:\n${issues.map((issue) => `- ${issue}`).join('\n')}`);
    this.name = 'TrackError';
    this.issues = issues;
  }
}

/** Turns tighter than this on the innermost lane are not drivable. */
export const MIN_LANE_RADIUS = 5;

/** Offset of a lane from the centre line, metres; positive is to the left. */
export function laneOffset(track: Pick<TrackJson, 'lanes' | 'laneSpacing'>, lane: number): number {
  return ((track.lanes - 1) / 2 - lane) * track.laneSpacing;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const TOP_KEYS = ['id', 'version', 'lanes', 'laneSpacing', 'sections', 'sectors'];
const SECTION_KEYS: Record<string, string[]> = {
  straight: ['type', 'length'],
  turn: ['type', 'radius', 'angle', 'direction'],
  loop: ['type', 'radius'],
};

const CLOSE_DISTANCE = 0.05;
const CLOSE_ANGLE = 1e-6;

function checkSection(section: unknown, index: number, maxOffset: number): string[] {
  const at = `section ${index}`;
  if (!isObject(section)) return [`${at}: must be an object`];
  const keys = SECTION_KEYS[section.type as string];
  if (!keys) return [`${at}: unknown section type "${String(section.type)}"`];

  const issues: string[] = [];
  const positive = (key: string) => {
    if (!isNumber(section[key]) || (section[key]) <= 0) {
      issues.push(`${at}: ${key} must be a number > 0`);
    }
  };
  if (section.type === 'straight') positive('length');
  if (section.type === 'loop') positive('radius');
  if (section.type === 'turn') {
    positive('radius');
    const angle = section.angle;
    if (!isNumber(angle) || angle <= 0 || angle > 360) {
      issues.push(`${at}: angle must be a number in (0, 360]`);
    }
    if (section.direction !== 'left' && section.direction !== 'right') {
      issues.push(`${at}: direction must be "left" or "right"`);
    }
    const radius = section.radius;
    if (isNumber(radius) && radius > 0 && radius - maxOffset < MIN_LANE_RADIUS) {
      issues.push(
        `${at}: the inner lane radius ${radius - maxOffset} m is below ${MIN_LANE_RADIUS} m`,
      );
    }
  }
  for (const key of Object.keys(section)) {
    if (!keys.includes(key)) issues.push(`${at}: unknown key "${key}"`);
  }
  return issues;
}

/** Where the centre line ends up after all sections; loops do not move it. */
function endOf(sections: SectionJson[]): { x: number; y: number; heading: number } {
  let x = 0;
  let y = 0;
  let heading = 0;
  for (const section of sections) {
    if (section.type === 'straight') {
      x += section.length * Math.cos(heading);
      y += section.length * Math.sin(heading);
    } else if (section.type === 'turn') {
      const sign = section.direction === 'left' ? 1 : -1;
      const turn = (sign * section.angle * Math.PI) / 180;
      // Chord of the arc: length 2r·sin(|θ|/2), direction heading + θ/2.
      const chord = 2 * section.radius * Math.sin(Math.abs(turn) / 2);
      x += chord * Math.cos(heading + turn / 2);
      y += chord * Math.sin(heading + turn / 2);
      heading += turn;
    }
  }
  return { x, y, heading };
}

function validate(json: unknown): string[] {
  if (!isObject(json)) return ['track must be an object'];
  const issues: string[] = [];

  if (typeof json.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(json.id)) {
    issues.push('id: use lowercase letters, digits and dashes');
  }
  if (!Number.isInteger(json.version) || (json.version as number) < 1) {
    issues.push('version: must be an integer ≥ 1');
  }
  const lanesOk =
    Number.isInteger(json.lanes) && (json.lanes as number) >= 1 && (json.lanes as number) <= 4;
  if (!lanesOk) issues.push('lanes: must be an integer from 1 to 4');
  const spacingOk = isNumber(json.laneSpacing) && json.laneSpacing >= 2 && json.laneSpacing <= 10;
  if (!spacingOk) issues.push('laneSpacing: must be a number from 2 to 10');

  const sections = Array.isArray(json.sections) ? (json.sections as unknown[]) : null;
  if (!sections || sections.length === 0) {
    issues.push('sections: must be a non-empty list');
  } else {
    const maxOffset =
      lanesOk && spacingOk
        ? laneOffset({ lanes: json.lanes as number, laneSpacing: json.laneSpacing as number }, 0)
        : 0;
    const sectionIssues = sections.flatMap((s, i) => checkSection(s, i, maxOffset));
    issues.push(...sectionIssues);

    const sectors = json.sectors;
    const sectorsOk =
      Array.isArray(sectors) &&
      sectors.every(
        (s, i) =>
          Number.isInteger(s) &&
          (s as number) >= 1 &&
          (s as number) < sections.length &&
          (i === 0 || (s as number) > (sectors[i - 1] as number)),
      );
    if (!sectorsOk) {
      issues.push(`sectors: must be ascending section indices from 1 to ${sections.length - 1}`);
    }

    if (sectionIssues.length === 0) {
      const end = endOf(sections as SectionJson[]);
      const gap = Math.hypot(end.x, end.y);
      const turns = end.heading / (2 * Math.PI);
      if (gap > CLOSE_DISTANCE) {
        issues.push(`track does not close: the end is ${gap.toFixed(2)} m away from the start`);
      } else if (Math.abs(turns - Math.round(turns)) > CLOSE_ANGLE) {
        const off = ((turns - Math.round(turns)) * 360).toFixed(1);
        issues.push(`track does not close: it ends turned by ${off}° from the start`);
      }
    }
  }

  for (const key of Object.keys(json)) {
    if (!TOP_KEYS.includes(key)) issues.push(`${key}: unknown key`);
  }
  return issues;
}

/** Validates a track description; throws `TrackError` with every issue found. */
export function parseTrack(json: unknown): TrackSpec {
  const issues = validate(json);
  if (issues.length > 0) throw new TrackError(issues);
  const track = json as TrackJson;
  return { ...track, key: `${track.id}@${track.version}` };
}
