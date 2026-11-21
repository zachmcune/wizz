import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
import { KIND_BUILDING, KIND_UNIT } from '../src/sim/entity-store';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const drv=new AiDriver(reg,services);
for(let m=2;m<=24;m+=2){
 for(let i=0;i<2400&&!state.ended;i++) stepSimulation(state,services,[],drv.hook);
 const o:string[]=[];
 for(const pid of ['p1','p2']){
  let a=0,w=0,b=0,d=0;
  for(let s=0;s<state.entities.count;s++){if(state.entities.dead[s])continue;if(state.entities.ownerId(state.entities.ownerIndex[s]!)!==pid)continue;
   if(state.entities.kind[s]===KIND_UNIT){const u=reg.units.get(state.entities.extras[s]!.defId)!;if(u.isHarvester)w++;else if(u.weapon)a++;}
   else if(state.entities.kind[s]===KIND_BUILDING){b++;const bd=reg.buildings.get(state.entities.extras[s]!.defId)!;if(bd.menuCategory==='defenses')d++;}}
  o.push(`${pid}[a${a} w${w} b${b} d${d} m${Math.round(state.players.find(p=>p.id===pid)!.mana)}]`);
 }
 console.log(`${m}m ${o.join(' ')}`);
 if(state.ended){console.log('ENDED',state.winnerTeam);break;}
}
