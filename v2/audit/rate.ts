import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let m=1;m<=20;m++){
 for(let i=0;i<1200&&!state.ended;i++) stepSimulation(state,services,[],drv.hook);
 const per=drv.brain('p1')!.perception(state);
 const produced=drv.commandCount('p1');
 if(m%4===0)console.log(`min ${m}: cmds=${produced} army=${per.myUnits.filter(u=>u.weapon&&!reg.units.get(u.defId)?.isHarvester).length} mana=${Math.round(per.mana)} harv=${per.myUnits.filter(u=>reg.units.get(u.defId)?.isHarvester).length} bld=${per.myBuildings.length}`);
}
