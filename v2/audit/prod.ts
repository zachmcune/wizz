import { runMatch } from './ai-tournament';
// Does MORE PRODUCTION decide matches? Force hard to build a 2nd producer earlier via targetProduction.
for(const [a,b] of [['hard','normal']] as const){
 for(const t of [2,3,4]){
  let aw=0,bw=0;
  for(const seed of [1000,1007,1014,1021]) for(const sw of [false,true]){
   const r=runMatch({seed,maxMinutes:30,players:[
    {id:'p1',difficulty:a,team:0,faction:'arcane',startIndex:sw?1:0,aiOverrides:{}} as any,
    {id:'p2',difficulty:b,team:1,faction:'arcane',startIndex:sw?0:1}]});
   if(r.winnerTeam===0)aw++;else if(r.winnerTeam===1)bw++;
  }
  console.log(`${a}(t=${t}) vs ${b}: ${aw}-${bw}`);
 }
}
