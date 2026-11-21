import { AGGRESSIVE_OPENING, STANDARD_OPENING } from '../src/ai/build-order';
const show=(name:string,steps:readonly any[])=>{
 console.log(`\n${name} (${steps.length} steps):`);
 for(const s of steps) console.log(`  ${String(s.notBeforeSeconds).padStart(4)}s  ${s.defId}`);
};
show('AGGRESSIVE',AGGRESSIVE_OPENING);
show('STANDARD',STANDARD_OPENING);
