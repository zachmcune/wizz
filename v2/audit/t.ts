import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT } from '../src/sim/entity-store';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
const marks:Record<string,string>={};
for(let i=0;i<20*60*25&&!state.ended;i++){
 stepSimulation(state,services,[],drv.hook);
 for(const pid of ['p1','p2']){
  let a=0,w=0;
  for(let s=0;s<state.entities.count;s++){if(state.entities.dead[s]||state.entities.kind[s]!==KIND_UNIT)continue;if(state.entities.ownerId(state.entities.ownerIndex[s]!)!==pid)continue;const d=reg.units.get(state.entities.extras[s]!.defId)!;if(d.isHarvester)w++;else if(d.weapon)a++;}
  for(const n of [10,20,30]) if(a>=n&&!marks[`${pid}${n}`]) marks[`${pid}${n}`]=(state.tick/1200).toFixed(1)+'m';
 }
}
for(const n of [10,20,30]) console.log(`reach ${n}: p1 ${marks['p1'+n]??'never'} p2 ${marks['p2'+n]??'never'}`);
console.log('ended',state.ended,'at',(state.tick/1200).toFixed(1),'min');
