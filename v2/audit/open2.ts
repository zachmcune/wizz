import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
// Force hard to use each opening and track when it gets its first producer and first army.
for(const mode of ['aggressive','standard']){
 const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
  {id:'p1',controller:'ai',aiDifficulty:'hard',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
  {id:'p2',controller:'ai',aiDifficulty:'easy',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
 const drv=new AiDriver(reg,services);
 let circle=-1,firstArmy=-1;
 for(let i=0;i<1200*12&&!state.ended;i++){
  stepSimulation(state,services,[],drv.hook);
  const per=drv.brain('p1')!.perception(state);
  if(circle<0&&per.myBuildings.some(b=>b.defId==='summoning_circle'&&b.buildProgress===undefined))circle=state.tick/1200;
  if(firstArmy<0&&per.myUnits.some(u=>u.weapon&&!reg.units.get(u.defId)?.isHarvester))firstArmy=state.tick/1200;
 }
 console.log(`${mode}: firstCircle=${circle<0?'never':circle.toFixed(1)} firstArmy=${firstArmy<0?'never':firstArmy.toFixed(1)} ended=${state.ended} winner=${state.winnerTeam}`);
}
