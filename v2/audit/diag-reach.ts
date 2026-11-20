import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT, UNIT_STATE_NAMES } from '../src/sim/entity-store';
const reg=loadRegistry();
const seed=Number(process.argv[2]??1014);
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'easy',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let i=0;i<20*60*20;i++) stepSimulation(state,services,[],drv.hook);
const enemyB:number[]=[]; let myUnits:number[]=[];
for(let s=0;s<state.entities.count;s++){ if(state.entities.dead[s])continue;
  const o=state.entities.ownerId(state.entities.ownerIndex[s]!);
  if(state.entities.kind[s]===KIND_BUILDING&&o==='p2')enemyB.push(s);
  if(state.entities.kind[s]===KIND_UNIT&&o==='p1')myUnits.push(s);}
console.log('p1 units',myUnits.length,'p2 buildings',enemyB.length);
const byState:Record<string,number>={};
for(const s of myUnits){const st=UNIT_STATE_NAMES[state.entities.state[s]!]!;byState[st]=(byState[st]??0)+1;}
console.log('states',byState);
// distance to nearest enemy building
let minD=Infinity,nearest=-1;
for(const s of myUnits){for(const b of enemyB){const d=Math.hypot(state.entities.posX[s]!-state.entities.posX[b]!,state.entities.posY[s]!-state.entities.posY[b]!);if(d<minD){minD=d;nearest=s;}}}
console.log('closest p1 unit to p2 building:',Math.round(minD),'unit',state.entities.id[nearest]);
const s=nearest;
console.log('that unit state',UNIT_STATE_NAMES[state.entities.state[s]!],'orders',JSON.stringify(state.entities.extras[s]!.orders).slice(0,200));
console.log('stance',state.entities.stance[s],'weapon?',reg.units.get(state.entities.extras[s]!.defId)?.weapon?JSON.stringify(reg.units.get(state.entities.extras[s]!.defId)!.weapon).slice(0,150):'NONE');
// is enemy building visible?
import {isVisibleTo} from '../src/sim/fog';
console.log('nearest enemy bld visible to p1?',isVisibleTo(state,'p1',enemyB[0]!,services.nav));
console.log('bld hp',state.entities.hp[enemyB[0]!],'/',state.entities.maxHp[enemyB[0]!]);
