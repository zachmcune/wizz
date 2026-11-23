import { loadRegistry } from '../src/data/loader';
import { initMatch } from '../src/sim/factory';
import { stepSimulation } from '../src/sim/step';
import { AiDriver } from '../src/ai/driver';
const reg=loadRegistry();
const {state,services}=initMatch(reg,{mapId:'duel_glade',seed:1000,oneSuperweaponPerPlayer:false,players:[
 {id:'p1',controller:'ai',aiDifficulty:'normal',team:0,color:'#4f9dff',factionId:'arcane',startIndex:0},
 {id:'p2',controller:'ai',aiDifficulty:'normal',team:1,color:'#ff5d5d',factionId:'arcane',startIndex:1}]} as never);
const st=state.entities;
const drv=new AiDriver(reg,services);
const notes:Record<string,Set<string>>={p1:new Set(),p2:new Set()};
const drv2=new AiDriver(reg,services,{onDecision:(p,_t,n)=>{for(const x of n)notes[p]!.add(x.replace(/\d+/g,'#'));}});
void drv;
for(let t=0;t<30*60*20&&!state.ended;t++){
  stepSimulation(state,services,[],drv2.hook);
  if(t%(300*20)===0){
    const cell=state.players.map(p=>{
      const mine=Array.from({length:st.count},(_,s)=>s).filter(s=>!st.dead[s]&&st.ownerId(st.ownerIndex[s]!)===p.id);
      const army=mine.filter(s=>st.kind[s]===0&&(()=>{const u=reg.units.get(st.extras[s]!.defId);return !!u?.weapon&&!u.isHarvester;})()).length;
      return `${p.id}: mana ${Math.round(p.mana)} bld ${mine.filter(s=>st.kind[s]===1).length} army ${army}`;
    });
    console.log(`t=${(t/1200).toFixed(0)}m ${cell.join(' | ')}`);
  }
}
console.log(`end ${state.ended} winner ${state.winnerTeam} at ${(state.tick/1200).toFixed(1)}m`);
console.log('p1 notes:',[...notes.p1!].slice(-12).join(' || '));
console.log('p2 notes:',[...notes.p2!].slice(-12).join(' || '));
