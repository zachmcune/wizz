import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { openingFor, stepSatisfied } from '../src/ai/build-order';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let i=0;i<1200*10;i++) stepSimulation(state,services,[],drv.hook);
const per=drv.brain('p1')!.perception(state);
const opening=(drv.brain('p1') as any).openingVariant;
const steps=openingFor('normal',opening);
const built=new Map<string,number>();
for(const b of per.myBuildings) if(b.buildProgress===undefined) built.set(b.defId,(built.get(b.defId)??0)+1);
console.log('variant',opening,'built:',JSON.stringify([...built]));
for(const s of steps){
 const sat=stepSatisfied(s,steps,built,(id)=>reg.buildings.get(id));
 const def=reg.buildings.get(s.defId);
 console.log(`  ${s.defId.padEnd(20)} @${s.notBeforeSeconds}s sat=${sat} cost=${def?.cost} requires=${JSON.stringify(def?.requires)} unlocked=${def?.requires.every(r=>per.unlockedTech.has(r)||r==='sanctum')}`);
}
console.log('unlockedTech:',[...per.unlockedTech].join(','));
