import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const url='file://'+process.cwd()+'/Revalida_Questoes.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[];
// desktop: modo especialidade con seleccionar todas
const ctx=await b.newContext({viewport:{width:1200,height:900}});
const p=await ctx.newPage();
p.on('pageerror',e=>errs.push('PE '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text());});
await p.goto(url,{waitUntil:'networkidle'});
await p.evaluate(()=>{ setModo('especialidade'); allAreas(false); toggleArea('Clínica Médica'); toggleArea('Pediatria'); setN(30); });
await p.waitForTimeout(200);
await p.screenshot({path:'shot_home_especialidade.png', fullPage:true});
// quiz: responder 1 (in-place) modo prova y ver selección
await p.evaluate(()=>{ setModo('aleatorio'); cfg.n=6; cfg.feedback=false; cfg.autoAvancar=false; startRun(); render('quiz'); });
await p.waitForTimeout(150);
await p.evaluate(()=>answer(curItem().order[2])); // selecciona C-visual
await p.waitForTimeout(150);
await p.screenshot({path:'shot_quiz_selected.png', fullPage:true});
// modo estudo: feedback
await p.evaluate(()=>{ cfg.feedback=true; cfg.n=4; startRun(); render('quiz'); const it=curItem(),q=QUESTOES.find(x=>x.id===it.id); answer(q.gabarito); });
await p.waitForTimeout(150);
await p.screenshot({path:'shot_quiz_estudo.png', fullPage:true});
// mobile light home
const pm=await ctx.newPage(); pm.on('pageerror',e=>errs.push('PEm '+e.message));
await pm.setViewportSize({width:390,height:844});
await pm.goto(url,{waitUntil:'networkidle'});
await pm.waitForTimeout(200);
await pm.screenshot({path:'shot_home_mobile_light.png', fullPage:true});
console.log('errs',JSON.stringify(errs));
await b.close();
