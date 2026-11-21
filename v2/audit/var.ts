import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_UNIT, KIND_BUILDING } from '../src/sim/entity-store';
const reg=loadRegistry();
// Force each variant and measure how fast the AI reaches a real army.
for(const variant of [0,1,2]){
 const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
  {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
  {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
 const drv=new AiDriver(reg,services);
 stepSimulation(state,services,[],drv.hook);
 const b:any=drv.brain('p1')!;
 b.openingVariant=variant;
 let firstArmy=-1, firstCircle=-1;
 for(let i=0;i<20*60*10&&!state.ended;i++){
  stepSimulation(state,services,[],drv.hook);
  const per=b.perception(state);
  if(firstArmy<0&&per.myUnits.some(u=>u.weapon&&!reg.units.get(u.defId)?.isHarvester))firstArmy=state.tick/1200;
  if(firstCircle<0&&per.myBuildings.some(x=>x.defId==='summoning_circle'&&x.buildProgress===undefined))firstCircle=state.tick/1200;
 }
 console.log(`variant ${variant}: firstCircle=${firstCircle<0?'never':firstCircle.toFixed(1)+'m'} firstArmy=${firstArmy<0?'never':firstArmy.toFixed(1)+'m'}`);
}
