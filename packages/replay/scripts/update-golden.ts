/**
 * Regenerates golden replays. Run only when a change of the simulation
 * results is intended: `pnpm golden:update`.
 */
import { writeFileSync } from 'node:fs';
import { generateCases } from '../src/golden.ts';

const cases = generateCases();
const target = new URL('../golden/cases.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(cases, null, 2)}\n`);
for (const c of cases) {
  console.log(
    `${c.name}: ${c.expected.laps.length} laps, ${c.expected.deslots} deslots, ${c.replay.length / 2} bytes`,
  );
}
