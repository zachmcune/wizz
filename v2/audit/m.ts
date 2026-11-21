import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
export function run(seed:number,d1:string,d2:string,s1:number,s2:number){
 const {state,services}=initMatch(reg,{mapId:'duel_glade',seed,oneSuperweaponPerPlayer:false,players:[
  {id:'p1',controller:'ai',aiDifficulty:d1,team:0,color:'#4f9dff',factionId:'arcane',startIndex:s1},
  {id:'p2',controller:'ai',aiDifficulty:d2,team:1,color:'#ff5d5d',factionId:'arcane',startIndex:s2}]} as never);
 const drv=new AiDriver(reg,services);
 for(let i=0;i<20*60*25&&!state.ended;i++) stepSimulation(state,services,[],drv.hook);
 return {w:state.winnerTeam,min:state.tick/1200};
}
for(const [a,b] of [['hard','normal'],['normal','easy'],['hard','easy']] as const){
 let aw=0,bw=0,un=0;
 for(const s of [1000,1007,1014,1021,1028,1035]) for(const [s1,s2] of [[0,1],[1,0]]){
  const r=run(s,a,b,s1,s2); if(r.w===0)aw++;else if(r.w===1)bw++;else un++;
 }
 console.log(`${a} ${aw}-${bw} ${b} (unfinished ${un})`);
}
