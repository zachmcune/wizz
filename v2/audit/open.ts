import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let m=1;m<=5;m++){
 for(let i=0;i<1200&&!state.ended;i++) stepSimulation(state,services,[],drv.hook);
 for(const pid of ['p1','p2']){
  const per=drv.brain(pid)!.perception(state);
  console.log(`${m}m ${pid}: mana=${String(Math.round(per.mana)).padStart(4)} bld=${per.myBuildings.map(b=>b.defId.slice(0,9)).join(' ')}`);
 }
}
console.log('v1:',JSON.stringify(drv.brain('p1')!.openingVariant),'v2:',JSON.stringify(drv.brain('p2')!.openingVariant));
