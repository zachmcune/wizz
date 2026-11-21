import { chromium } from 'playwright';
const OUT='docs/proof/phase-5/ai';
const b=await chromium.launch();
for(const [name,viewport,touch] of [
 ['phone',{width:844,height:390},true],
 ['chromebook',{width:1366,height:768},false],
]){
 const ctx=await b.newContext({viewport,hasTouch:touch,deviceScaleFactor:2,isMobile:touch});
 const p=await ctx.newPage();
 await p.goto('http://127.0.0.1:5343/index.html?speed=14',{waitUntil:'load'});
 await p.waitForSelector('[data-testid="game-canvas-host"] canvas',{timeout:60000});
 await p.waitForTimeout(60000);
 const st=await p.evaluate(()=>[...document.querySelectorAll('.hud-stats')].map(e=>e.textContent).join('|'));
 await p.screenshot({path:`${OUT}/match-${name}.png`});
 console.log(`${name}: ${st.replace(/\n/g,' ').slice(0,110)}`);
 await ctx.close();
}
await b.close();
