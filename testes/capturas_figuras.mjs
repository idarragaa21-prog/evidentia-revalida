import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const url='file://'+process.cwd()+'/Revalida_Questoes.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[]; const ctx=await b.newContext({viewport:{width:1200,height:1000}});
const p=await ctx.newPage();
p.on('pageerror',e=>errs.push('PE '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CE '+m.text());});
await p.goto(url,{waitUntil:'networkidle'});
// questão com figura
await p.evaluate(()=>{
  const q=QUESTOES.find(x=>x.figura && x.edicao==='2024/1');
  S={items:[{id:q.id,order:["A","B","C","D"],resp:null,flag:false}],idx:0,startTs:Date.now(),elapsed:0,
     cfg:{cronometro:false,feedback:false,embaralhar:false,autoAvancar:false,modo:'aleatorio',areas:[],edicoes:[]},finished:false};
  render('quiz');
});
await p.waitForTimeout(400);
await p.screenshot({path:'shot_fig.png', fullPage:true});
// questão com tabela (2024/2 Q66) em revisão
await p.evaluate(()=>{
  const q=QUESTOES.find(x=>x.edicao==='2024/2' && x.numero===66);
  S={items:[{id:q.id,order:["A","B","C","D"],resp:"A",flag:false}],idx:0,startTs:Date.now(),elapsed:0,
     cfg:{cronometro:false,feedback:false,embaralhar:false,modo:'aleatorio',areas:[],edicoes:[]},finished:true};
  go('review','todas');
});
await p.waitForTimeout(300);
await p.evaluate(()=>document.querySelectorAll('details.just').forEach(d=>d.open=true));
await p.waitForTimeout(200);
await p.screenshot({path:'shot_tabela.png', fullPage:true});
console.log('errs',JSON.stringify(errs));
await b.close();
