/**
 * Live physics tuning for the prototype. A tuned profile gets the id
 * `tuned-<hash of its values>`, so every set of values keeps its own ghost.
 */

import { parseProfile, type ProfileJson } from '@limitlap/sim';

export interface Parameter {
  path: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  get(profile: ProfileJson): number;
}

const top =
  (key: 'accel' | 'brake' | 'vTop' | 'aHold' | 'loopGravity' | 'deslotPause' | 'rewindLimit') =>
  (p: ProfileJson) =>
    p[key];
const edge = (key: 'width' | 'fillRate' | 'drainRate') => (p: ProfileJson) => p.edge[key];

export const PARAMETERS: readonly Parameter[] = [
  { path: 'accel', label: 'Разгон', unit: 'м/с²', min: 5, max: 40, step: 0.5, get: top('accel') },
  {
    path: 'brake',
    label: 'Торможение',
    unit: 'м/с²',
    min: 5,
    max: 60,
    step: 0.5,
    get: top('brake'),
  },
  {
    path: 'vTop',
    label: 'Макс. скорость',
    unit: 'м/с',
    min: 40,
    max: 150,
    step: 1,
    get: top('vTop'),
  },
  {
    path: 'aHold',
    label: 'Удержание поля',
    unit: 'м/с²',
    min: 10,
    max: 80,
    step: 0.5,
    get: top('aHold'),
  },
  {
    path: 'loopGravity',
    label: 'Гравитация в петле',
    unit: 'м/с²',
    min: 5,
    max: 20,
    step: 0.1,
    get: top('loopGravity'),
  },
  {
    path: 'edge.width',
    label: 'Ширина зоны на грани',
    unit: '',
    min: 0.01,
    max: 0.2,
    step: 0.005,
    get: edge('width'),
  },
  {
    path: 'edge.fillRate',
    label: 'Заполнение шкалы',
    unit: '/с',
    min: 0.5,
    max: 10,
    step: 0.1,
    get: edge('fillRate'),
  },
  {
    path: 'edge.drainRate',
    label: 'Опустошение шкалы',
    unit: '/с',
    min: 0,
    max: 10,
    step: 0.1,
    get: edge('drainRate'),
  },
  {
    path: 'deslotPause',
    label: 'Пауза после срыва',
    unit: 'с',
    min: 0,
    max: 3,
    step: 0.1,
    get: top('deslotPause'),
  },
  {
    path: 'rewindLimit',
    label: 'Лимит перемотки',
    unit: 'с',
    min: 0,
    max: 30,
    step: 1,
    get: top('rewindLimit'),
  },
];

export function setParameter(profile: ProfileJson, path: string, value: number): ProfileJson {
  const next: ProfileJson = { ...profile, edge: { ...profile.edge } };
  const [head, tail] = path.split('.');
  if (head === 'edge' && tail) (next.edge as unknown as Record<string, number>)[tail] = value;
  else (next as unknown as Record<string, number>)[head ?? ''] = value;
  return next;
}

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function tunedProfile(values: ProfileJson): ProfileJson {
  // Only the physics counts: id and version are blanked before hashing.
  const physics = JSON.stringify({ ...values, id: '', version: 0 });
  return { ...values, id: `tuned-${hash(physics)}`, version: 1 };
}

const KEY = 'limitlap:tuning';

export function loadTuning(): ProfileJson | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw === null) return null;
    return parseProfile(raw).source;
  } catch {
    return null;
  }
}

export function saveTuning(profile: ProfileJson | null): void {
  try {
    if (profile === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Not kept: tuning still applies until the page reloads.
  }
}
