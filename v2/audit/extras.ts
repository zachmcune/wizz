import { runMatch } from './ai-tournament';
const seeds=[1000,1007,1014,1021,1028,1035];
async function m(ov:any,label:string){
 let aw=0,bw=0;
 for(const seed of seeds) for(const sw of [false,true]){
  const r=runMatch({seed,maxMinutes:30,players:[
   {id:'p1',difficulty:'hard',team:0,faction:'arcane',startIndex:sw?1:0,aiOverrides:ov},
   {id:'p2',difficulty:'normal',team:1,faction:'arcane',startIndex:sw?0:1}]});
  if(r.winnerTeam===0)aw++;else if(r.winnerTeam===1)bw++;
 }
 console.log(`${label}: hard ${aw}-${bw} (of 12)`);
}
await m({},'baseline (identical)');
await m({kiting:true},'+kiting');
await m({usesSuperweapon:true},'+superweapon');
await m({harass:true},'+harass');
await m({targetProduction:3},'+3rd producer');
