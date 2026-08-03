import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const url='file://'+process.cwd()+'/Revalida_Questoes.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[]; const ctx=await b.newContext({viewport:{width:1200,height:900}}); const p=await ctx.newPage();
p.on('pageerror',e=>errs.push('PE '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text());});
await p.goto(url,{waitUntil:'networkidle'});
await p.evaluate(()=>{ if(document.documentElement.getAttribute('data-theme')!=='dark') toggleTheme(); });
await p.evaluate(()=>{ cfg.n=8;cfg.incluirAnuladas=false;cfg.cronometro=true; startRun(); S.items.forEach((it,i)=>{const q=QUESTOES.find(x=>x.id===it.id);it.resp=i%2?q.gabarito:['A','B','C','D'].find(L=>L!==q.gabarito);}); finishRun(); });
await p.waitForTimeout(300);
await p.screenshot({path:'shot_result_dark.png', fullPage:true});
// header crop dark
await p.evaluate(()=>go('home'));
await p.waitForTimeout(200);
const hdr=await p.$('.appbar'); await hdr.screenshot({path:'shot_header_dark.png'});
console.log('errs',JSON.stringify(errs));
await b.close();
