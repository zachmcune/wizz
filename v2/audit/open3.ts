import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';
const reg=loadRegistry();
for(const mode of ['AGGRESSIVE','STANDARD']){
 const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
  {id:'p1',controller:'ai',aiDifficulty:'hard',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
  {id:'p2',controller:'ai',aiDifficulty:'easy',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
 const drv=new AiDriver(reg,services);
 for(let i=0;i<20*60*30&&!state.ended;i++) stepSimulation(state,services,[],drv.hook);
 const p1b:string[]=[],p1u:string[]=[],p2b:string[]=[];
 for(let s=0;s<state.entities.count;s++){if(state.entities.dead[s])continue;
  const o=state.entities.ownerId(state.entities.ownerIndex[s]!);const d=state.entities.extras[s]!.defId;
  if(state.entities.kind[s]===KIND_BUILDING){if(o==='p1')p1b.push(d);else if(o==='p2')p2b.push(d);}
  if(state.entities.kind[s]===KIND_UNIT&&o==='p1')p1u.push(d);}
 console.log(`${mode}: ended=${state.ended} winner=${state.winnerTeam} ${(state.tick/1200).toFixed(1)}m`);
 console.log(`  hard bld(${p1b.length}): ${[...new Set(p1b)].join(',')}`);
 console.log(`  hard units: ${p1u.filter(u=>!u.includes('wisp')).length} army, ${p1u.filter(u=>u.includes('wisp')).length} wisp`);
 console.log(`  easy bld(${p2b.length}): ${[...new Set(p2b)].join(',')}`);
}
