// After the Browns game is final: the week view must name the winner with their
// points, and the Browns page must list every eligible Brown and what they
// scored -- including the ones nobody picked, which is the whole point of it.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,k,st='pre',as=null,hs=null)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:st,awayScore:as,homeScore:hs,kickoff:k,espnId:'401'});
const roster=[{id:'1',name:'Deshaun Watson',short:'D. Watson',pos:'QB',number:'4'},
  {id:'2',name:'Quinshon Judkins',short:'Q. Judkins',pos:'RB',number:'10'},
  {id:'3',name:'KC Concepcion',short:'K. Concepcion',pos:'WR',number:'1'},
  {id:'4',name:'Harold Fannin Jr.',short:'H. Fannin Jr.',pos:'TE',number:'44'},
  {id:'5',name:'Andre Szmyt',short:'A. Szmyt',pos:'K',number:'25'},
  {id:'6',name:'Jerry Jeudy',short:'J. Jeudy',pos:'WR',number:'3'},
  {id:'7',name:'Dylan Sampson',short:'D. Sampson',pos:'RB',number:'22'}];
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  brownsRoster: roster,
  weeks:{1:{games:[g('CLE','JAX',-6,'2026-09-13T17:00Z','post',24,17),g('NO','TB',-7,'2026-09-13T17:00Z','post',10,20)],
    picks:{},lms:{},dupPrefs:{},
    brown:{kz:'2',az:'3',jv:'4',hz:'5'},
    // Judkins takes it at 23; Jeudy, picked by nobody, went off for more, which
    // is exactly the thing the Browns page has to show.
    brownStats:{'2':{rushYards:87,rushTD:1},'3':{recYards:50,receptions:4},'4':{recYards:31,receptions:3},
                '5':{pat:2,fg:1},'6':{recYards:120,receptions:9,recTD:1},'1':{passYards:249,completions:22,passTD:2}}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};
const AT=Date.parse('2026-09-13T22:00:00Z');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s);
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(seed),AT]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1200);

const sec = p.locator('.section', { hasText: 'Brown of the week' }).first();
console.log('state    :', (await sec.locator('.section__sub').innerText()).replace(/\s+/g,' ').slice(-40));
const banner = sec.locator('.brownwon');
console.log('winner   :', await banner.count() ? (await banner.innerText()).replace(/\s+/g,' ') : 'MISSING');

await p.getByRole('button',{name:'Browns'}).last().click(); await p.waitForTimeout(600);
const tbl = p.locator('.sheet--scores');
console.log('\nevery Brown:', await tbl.count() ? 'table present' : 'MISSING');
const rows = await tbl.locator('tbody tr').evaluateAll(els => els.map(e => {
  const td = e.querySelectorAll('td');
  return { who: td[0]?.innerText.split('\n')[0], line: td[1]?.innerText, pts: td[2]?.innerText,
           by: td[3]?.innerText.trim(), best: td[2]?.className.includes('best') };
}));
for (const r of rows)
  console.log(`   ${String(r.who).padEnd(18)} ${String(r.pts).padStart(3)}${r.best?'*':' '}  ${String(r.by||'-').padEnd(4)} ${r.line}`);
console.log('rows listed:', rows.length, 'of', roster.length, 'on the roster');
// nothing may spill its column on a phone
const wide = await p.evaluate(() => { const d=document.querySelector('.grid--tall');
  return d ? d.scrollWidth - d.clientWidth : -1; });
console.log('table h-overflow inside its own scroller:', wide > 0 ? `${wide}px (scrolls, fine)` : 'none');
console.log('page h-scroll:', await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1));
console.log('page errors:', errs.length ? errs[0] : 'none');

// A tie splits the pot, and the banner has to say so with both names on it.
const tied = JSON.parse(JSON.stringify(seed));
tied.weeks[1].brownStats['3'] = { rushYards: 87, rushTD: 1 };   // Concepcion matches Judkins
const c2=await b.newContext({...devices['iPhone 13']});
await c2.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c2.route('**nfl.kevinzoss.com**',r=>r.abort());
await c2.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c2.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s);
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(tied),AT]);
const p2=await c2.newPage(); await p2.goto('https://kevinzoss.com/nfl/'); await p2.waitForTimeout(1200);
const tie = p2.locator('.section', { hasText: 'Brown of the week' }).first().locator('.brownwon');
console.log('\ntied week:', await tie.count() ? (await tie.innerText()).replace(/\s+/g,' ') : 'MISSING');
await b.close();
