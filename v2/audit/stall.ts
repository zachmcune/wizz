import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let i=0;i<1200*12;i++) stepSimulation(state,services,[],drv.hook);
const notes=drv.notes('p1') as string[];
const kinds:Record<string,number>={};
for(const n of notes){const k=n.split(/[ (]/)[0]!;kinds[k]=(kinds[k]??0)+1;}
console.log('note kinds:',JSON.stringify(kinds));
console.log('last 10:',notes.slice(-10));
