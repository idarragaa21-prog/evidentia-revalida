import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const url = 'file://'+process.cwd()+'/Revalida_Questoes.html';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs=[];
const ctx = await b.newContext({ viewport:{width:1200,height:900} });
const p = await ctx.newPage();
p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text()); });
p.on('pageerror', e=>errs.push('PAGEERROR: '+e.message));
await p.goto(url,{waitUntil:'networkidle'});
await p.waitForTimeout(400);

// storage availability
const storeOk = await p.evaluate(()=>store.ok);

// screenshot home desktop
await p.screenshot({path:'shot_home_desktop.png', fullPage:true});

// FUNCTIONAL: all correct
const t1 = await p.evaluate(()=>{
  cfg.modo="aleatorio"; cfg.n=50; cfg.embaralhar=true; cfg.incluirAnuladas=true; cfg.cronometro=false;
  startRun();
  let expTot=0,expAc=0,anul=0;
  S.items.forEach(it=>{const q=QUESTOES.find(x=>x.id===it.id); if(q.anulada){anul++;it.resp=null;return;} it.resp=q.gabarito;expTot++;expAc++;});
  const r=scoreRun();
  return {expTot,expAc,anul, ac:r.ac,tot:r.tot,er:r.er,br:r.br,anulR:r.anul,pct:r.pct};
});
// FUNCTIONAL: all wrong
const t2 = await p.evaluate(()=>{
  S.items.forEach(it=>{const q=QUESTOES.find(x=>x.id===it.id); if(q.anulada){it.resp=null;return;} it.resp=["A","B","C","D"].find(L=>L!==q.gabarito);});
  const r=scoreRun(); return {ac:r.ac,er:r.er,br:r.br,tot:r.tot,pct:r.pct};
});
// FUNCTIONAL: half blank
const t3 = await p.evaluate(()=>{
  let i=0; S.items.forEach(it=>{const q=QUESTOES.find(x=>x.id===it.id); if(q.anulada){it.resp=null;return;} it.resp=(i++%2===0)?q.gabarito:null;});
  const r=scoreRun(); return {ac:r.ac,br:r.br,er:r.er,tot:r.tot};
});
// DOM mapping check: render a quiz question and verify displayed A maps to order[0]
const t4 = await p.evaluate(()=>{
  cfg.embaralhar=true; startRun(); render('quiz');
  const it=S.items[0]; const q=QUESTOES.find(x=>x.id===it.id);
  const firstAlt=document.querySelector('.alts .alt');
  const txt=firstAlt.querySelector('.txt').textContent;
  const onclick=firstAlt.getAttribute('onclick');
  return { expectText:q.alternativas[it.order[0]], gotText:txt, onclick, expectOrig:it.order[0] };
});
// screenshot quiz + result
await p.evaluate(()=>{ cfg.n=8;cfg.cronometro=true;cfg.incluirAnuladas=false; startRun(); render('quiz'); });
await p.waitForTimeout(200);
await p.screenshot({path:'shot_quiz_desktop.png', fullPage:true});
await p.evaluate(()=>{ S.items.forEach((it,i)=>{const q=QUESTOES.find(x=>x.id===it.id); it.resp=i%3===0?q.gabarito:(["A","B","C","D"].find(L=>L!==q.gabarito)); }); finishRun(); });
await p.waitForTimeout(300);
await p.screenshot({path:'shot_result_desktop.png', fullPage:true});
await p.evaluate(()=>{ go('review','todas'); });
await p.waitForTimeout(200);
await p.screenshot({path:'shot_review_desktop.png', fullPage:true});

// dark mode + mobile
const pm = await ctx.newPage();
pm.on('pageerror', e=>errs.push('PAGEERROR(m): '+e.message));
await pm.setViewportSize({width:390,height:844});
await pm.goto(url,{waitUntil:'networkidle'});
await pm.evaluate(()=>toggleTheme());
await pm.waitForTimeout(300);
await pm.screenshot({path:'shot_home_mobile_dark.png', fullPage:true});

console.log(JSON.stringify({storeOk, errs, t1, t2, t3, t4}, null, 2));
await b.close();
