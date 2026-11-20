import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1014,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'easy',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let m=1;m<=20;m++){
 for(let i=0;i<60*20;i++) stepSimulation(state,services,[],drv.hook);
 const b=drv.brain('p1')!;
 if(m>=10&&m<=16){const notes=drv.notes('p1') as string[];
  console.log(`min ${m}: atk=${b.state.attacking} wAge=${b.state.waveAge} passes=${b.state.passesWithoutProgress} lastWave=${b.state.lastWaveSize} | ${notes.filter(n=>n.includes('wave')||n.includes('re-tasking')).slice(-2).join(' // ')}`);}
}
