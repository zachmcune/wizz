// SCAN THE SIM FOR POSITIONAL ORDER DEPENDENCE.
// For each system, run a mirror-symmetric state through it twice — once as-is, once with every entity reflected
// through the vertical axis AND the two players swapped — and compare the results. Any system whose output is not
// mirror-covariant is the source of the corner effect.
import { readFileSync } from 'node:fs';
const files = [
  'src/sim/systems/movement.ts','src/sim/systems/combat.ts','src/sim/systems/harvest.ts',
  'src/sim/systems/production.ts','src/sim/systems/visibility.ts','src/sim/systems/death.ts',
];
for (const f of files) {
  const src = readFileSync('/agent/repos/wizz/v2/' + f, 'utf8');
  const lines = src.split('\n');
  const hits: string[] = [];
  lines.forEach((l, i) => {
    if (/for \(let \w+ = 0; \w+ < .*\.count; \w+\+\+\)/.test(l)) hits.push(`  ${i + 1}: ${l.trim()}`);
  });
  if (hits.length) console.log(`${f} — slot-order loops:\n${hits.join('\n')}`);
}
