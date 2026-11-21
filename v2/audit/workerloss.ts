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
const seen=new Set<number>();
for(let i=0;i<1200*9&&!state.ended;i++){
 const before=new Map<number,{o:string,x:number,y:number}>();
 for(let s=0;s<state.entities.count;s++){if(state.entities.dead[s]||state.entities.kind[s]!==KIND_UNIT)continue;if(!reg.units.get(state.entities.extras[s]!.defId)?.isHarvester)continue;
  before.set(state.entities.id[s]!,{o:state.entities.ownerId(state.entities.ownerIndex[s]!)!,x:state.entities.posX[s]!,y:state.entities.posY[s]!});}
 stepSimulation(state,services,[],drv.hook);
 for(const [id,info] of before){
  const slot=state.entities.slotOf(id as never);
  if(slot<0||state.entities.dead[slot]) if(!seen.has(id)){seen.add(id);
   console.log(`worker ${id} (${info.o}) died at min ${(state.tick/1200).toFixed(1)} pos=${Math.round(info.x)},${Math.round(info.y)}`);}
 }
}
