import { runMatch } from './ai-tournament';
// Hard vs Normal, with Hard's decisionInterval forced to Normal's 20.
// 4 seeds x 2 sides = 8 games per condition.
async function m(ov:any,label:string){
 let aw=0,bw=0;
 for(const seed of [1000,1007,1014,1021]) for(const sw of [false,true]){
  const r=runMatch({seed,maxMinutes:30,players:[
   {id:'p1',difficulty:'hard',team:0,faction:'arcane',startIndex:sw?1:0,aiOverrides:ov},
   {id:'p2',difficulty:'normal',team:1,faction:'arcane',startIndex:sw?0:1}]});
  if(r.winnerTeam===0)aw++;else if(r.winnerTeam===1)bw++;
 }
 console.log(`${label}: hard ${aw} - ${bw} normal`);
}
await m({},'baseline');
await m({decisionInterval:20},'hard thinking at 20 ticks');
