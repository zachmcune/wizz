// The match reaches an IDENTICAL end state on every seed. What is it stuck on?
import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const st=state.entities;
const lastNotes:Record<string,string[]>={p1:[],p2:[]};
const drv=new AiDriver(reg,services,{onDecision:(p,t,n)=>{if(t>28*60*20){lastNotes[p]=n.slice(0,6);}}});
for(let t=0;t<30*60*20&&!state.ended;t++) stepSimulation(state,services,[],drv.hook);
console.log('FINAL STATE');
for(const p of state.players){
  const mine=Array.from({length:st.count},(_,s)=>s).filter(s=>!st.dead[s]&&st.ownerId(st.ownerIndex[s]!)===p.id);
  console.log(`\n${p.id} mana ${Math.round(p.mana)} defeat=${p.defeated}`);
  console.log(`  buildings: ${mine.filter(s=>st.kind[s]===1).map(s=>`${st.extras[s]!.defId}@(${Math.round(st.posX[s]!)},${Math.round(st.posY[s]!)})hp${Math.round(st.hp[s]!)}`).join(' ')}`);
  const units=mine.filter(s=>st.kind[s]===0);
  console.log(`  units(${units.length}): ${[...new Set(units.map(s=>st.extras[s]!.defId))].join(',')}`);
  console.log(`  last notes: ${lastNotes[p.id]?.join(' | ')}`);
}
// nodes left
const nodes=Array.from({length:st.count},(_,s)=>s).filter(s=>!st.dead[s]&&st.kind[s]===3);
console.log(`\nresource nodes alive: ${nodes.length}, total amount ${nodes.reduce((a,s)=>a+st.amount[s]!,0)}`);
