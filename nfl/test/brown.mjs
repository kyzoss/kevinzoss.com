import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,k,st='pre')=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:st,awayScore:null,homeScore:null,kickoff:k,espnId:'401'});
const roster=[{id:'1',name:'Deshaun Watson',short:'Watson',pos:'QB',number:'4'},
  {id:'2',name:'Nick Chubb',short:'Chubb',pos:'RB',number:'24'},
  {id:'3',name:'Amari Cooper',short:'Cooper',pos:'WR',number:'2'},
  {id:'4',name:'David Njoku',short:'Njoku',pos:'TE',number:'85'},
  {id:'5',name:'Dustin Hopkins',short:'Hopkins',pos:'K',number:'7'}];
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  brownsRoster: roster,
  weeks:{1:{games:[g('CLE','JAX',-6,'2026-09-13T17:00Z'),g('NO','TB',-7,'2026-09-13T17:00Z')],
    picks:{},lms:{},dupPrefs:{},
    brown:{kz:'2',az:'3'}, brownStats:{'2':{rushYards:87,rushTD:1},'3':{recYards:50,receptions:4}}},
    2:{games:[g('CLE','PIT',-3,'2026-09-20T17:00Z'),g('NO','TB',-7,'2026-09-20T17:00Z')],
       picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};
const AT=Date.parse('2026-09-13T16:00:00Z');
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
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1000);
const sec = await p.locator('.section', { hasText: 'Brown of the week' }).first();
console.log('section on the week view:', await sec.count() ? 'yes' : 'NO');
console.log('  ', (await sec.locator('.section__sub').innerText()).replace(/\s+/g,' ').slice(0,150));
for (const r of await sec.locator('.lmsrow').all())
  console.log('   row:', (await r.innerText()).replace(/\s+/g,' ').trim().slice(0,60));
await sec.locator('[data-action="brown-open"]:not([disabled])').first().click();
await p.waitForTimeout(400);
console.log('\npicker groups:', (await p.locator('.depth h5').allInnerTexts()).join(' '));
console.log('tiles        :', (await p.locator('.teamtile b').allInnerTexts()).join(' '));
console.log('selected     :', (await p.locator('.teamtile--on b').allInnerTexts()).join(' ') || 'none');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.getByRole('button',{name:'Browns'}).last().click(); await p.waitForTimeout(500);
const hist = p.locator('.section', { hasText: 'Brown of the week' }).last();
console.log('\nBrowns page money row:', (await hist.locator('.pred__big').first().innerText()).replace(/\s+/g,' '));
console.log('history table       :', (await hist.locator('tbody tr').first().innerText()).replace(/\s+/g,' '));
console.log('\npage errors:', errs.length ? errs[0] : 'none');

// week 2, same round: Chubb was used and scored in week 1, so he must be spent
await p.locator('[data-tab="week"]:visible').first().click(); await p.waitForTimeout(300);
await p.locator('[data-action="week"][data-week="2"]').first().click(); await p.waitForTimeout(500);
const sec2 = p.locator('.section', { hasText: 'Brown of the week' }).first();
await sec2.locator('[data-action="brown-open"]:not([disabled])').first().click();
await p.waitForTimeout(400);
const tiles = await p.locator('.teamtile').evaluateAll(els => els.map(e => ({
  who: e.querySelector('b')?.innerText, spent: e.className.includes('teamtile--spent'), off: e.disabled })));
console.log('\nweek 2, same round:');
for (const t of tiles) console.log(`   ${String(t.who).padEnd(9)} ${t.spent ? 'GREYED + disabled' : 'available'}${t.spent !== t.off ? '  << mismatch' : ''}`);
const spentTxt = await p.locator('.mute', { hasText: 'Spent this round' }).first().innerText().catch(()=> 'none');
console.log('   note:', spentTxt.replace(/\s+/g,' '));
await b.close();
