/** Prints the lane balance of the prototype track: `pnpm balance`. */
import { DEFAULT_PROFILE, fx } from '@limitlap/sim';
import { balanceTable, laneBalance } from '../src/balance.ts';
import { compileTrack } from '../src/compile.ts';
import { PROTO_RING } from '../src/prototypes.ts';

const track = compileTrack(PROTO_RING);
for (const share of [0.9, 0.95, 1]) {
  console.log(`\n${PROTO_RING.key}, bot at ${share * 100} % of the limit\n`);
  console.log(balanceTable(laneBalance(track, DEFAULT_PROFILE, fx.fromFloat(share))));
}
