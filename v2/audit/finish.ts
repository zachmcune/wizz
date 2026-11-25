// WHY CAN'T A SIDE WITH 19 ARMY VS 2 KILL THE BASE?
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
for(let t=0;t<26*60*20&&!state.ended;t++) stepSimulation(state,services,[],drv.hook);
// Snapshot at 26 min
for(const p of state.players){
  const mine=Array.from({length:st.count},(_,s)=>s).filter(s=>!st.dead[s]&&st.ownerId(st.ownerIndex[s]!)===p.id);
  const blds=mine.filter(s=>st.kind[s]===1);
  console.log(`\n${p.id} mana ${Math.round(p.mana)} buildings: ${blds.map(s=>`${st.extras[s]!.defId}(${Math.round(st.hp[s]!)})`).join(' ')}`);
  const units=mine.filter(s=>st.kind[s]===0);
  const army=units.filter(s=>{const u=reg.units.get(st.extras[s]!.defId);return !!u?.weapon&&!u.isHarvester;});
  console.log(`  army ${army.length}: ${army.slice(0,12).map(s=>`${st.extras[s]!.defId}@(${Math.round(st.posX[s]!)},${Math.round(st.posY[s]!)})`).join(' ')}`);
  // distance from p1 army centroid to p2 sanctum
}
const san=Array.from({length:st.count},(_,s)=>s).find(s=>!st.dead[s]&&st.kind[s]===1&&st.extras[s]!.defId==='sanctum'&&st.ownerId(st.ownerIndex[s]!)==='p2');
if(san!==undefined) console.log(`\np2 sanctum at (${st.posX[san]},${st.posY[san]}) hp ${Math.round(st.hp[san]!)}/${st.maxHp?.[san]??'?'}`);
// how many p2 defensive turrets
const turrets=Array.from({length:st.count},(_,s)=>s).filter(s=>!st.dead[s]&&st.kind[s]===1&&st.ownerId(st.ownerIndex[s]!)==='p2'&&(reg.buildings.get(st.extras[s]!.defId)?.weapon?.damage??0)>0);
console.log(`p2 armed buildings: ${turrets.map(s=>`${st.extras[s]!.defId}@(${Math.round(st.posX[s]!)},${Math.round(st.posY[s]!)})`).join(' ')}`);
