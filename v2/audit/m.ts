import { runMatch } from './ai-tournament';
for(const [a,b] of [['hard','normal'],['normal','easy'],['hard','easy']] as const){
 let aw=0,bw=0,un=0,mins:number[]=[];
 for(const seed of [1000,1007,1014,1021]) for(const sw of [false,true]){
  const r=runMatch({seed,maxMinutes:30,players:[
   {id:'p1',difficulty:a,team:0,faction:'arcane',startIndex:sw?1:0},
   {id:'p2',difficulty:b,team:1,faction:'arcane',startIndex:sw?0:1}]});
  if(r.winnerTeam===0)aw++;else if(r.winnerTeam===1)bw++;else un++;mins.push(r.minutes);
 }
 mins.sort((x,y)=>x-y);
 console.log(`${a} vs ${b}: ${aw}-${bw} (un ${un}) median ${mins[Math.floor(mins.length/2)]!.toFixed(1)}m`);
}
