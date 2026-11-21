import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_RESOURCE_NODE, KIND_UNIT } from '../src/sim/entity-store';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let i=0;i<1200*12;i++) stepSimulation(state,services,[],drv.hook);
const per=drv.brain('p1')!.perception(state);
const harv=per.myUnits.filter(u=>reg.units.get(u.defId)?.isHarvester);
console.log('p1 harvesters:',harv.map(h=>`${h.id}:${h.activity}:carry${Math.round(h.carry??0)}/node${h.harvestNodeId??'-'}`).join(' '));
let nodes=0;for(let s=0;s<state.entities.count;s++){if(!state.entities.dead[s]&&state.entities.kind[s]===KIND_RESOURCE_NODE)nodes++;}
console.log('live nodes',nodes);
console.log('p1 bld:',per.myBuildings.map(b=>b.defId).join(','));
console.log('p1 notes:',(drv.notes('p1') as string[]).slice(-5));
