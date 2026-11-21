import { runMatch } from './ai-tournament';
const levers=['harass','kiting','usesSuperweapon','focusFire','retreatHurtUnits','counters','buildsDefenses','scouts'] as const;
const seeds=[1000,1007,1014,1021];
async function measure(off:string|null){
 let aw=0,bw=0;
 for(const seed of seeds) for(const sw of [false,true]){
  const r=runMatch({seed,maxMinutes:30,players:[
   {id:'p1',difficulty:'hard',team:0,faction:'arcane',startIndex:sw?1:0,aiOverrides:off?{[off]:false}:{}},
   {id:'p2',difficulty:'easy',team:1,faction:'arcane',startIndex:sw?0:1}]});
  if(r.winnerTeam===0)aw++;else if(r.winnerTeam===1)bw++;
 }
 return `${aw}-${bw}`;
}
console.log('hard baseline vs easy:',await measure(null));
for(const l of levers) console.log(`hard WITHOUT ${l}:`.padEnd(34),await measure(l));
