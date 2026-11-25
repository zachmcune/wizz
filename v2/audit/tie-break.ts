// Corner 1 wins 12/12 with identical terrain. Is there an ORDER dependency in a symmetric predicate?
// Check every place the sim or AI breaks a tie on a raw numeric value that correlates with slot/id.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const files = execSync('rg -l "symmetricRank|bestScore|bestD|> best|>= best" /agent/repos/wizz/v2/src/sim /agent/repos/wizz/v2/src/ai').toString().trim().split('\n');
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (/>\s*best|>=\s*best|best\s*=\s*|<\s*best|<=\s*best/.test(l) && !/^\s*(\*|\/\/)/.test(l)) {
      console.log(`${f.replace('/agent/repos/wizz/v2/','')}:${i + 1}: ${l.trim()}`);
    }
  });
}
