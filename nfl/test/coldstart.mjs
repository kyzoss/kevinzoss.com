// The Home Screen case: a brand-new storage partition, nothing local at all.
// Does the board arrive, and if the read fails does the screen say so?
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,k)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:'pre',awayScore:null,homeScore:null,kickoff:k});
const board={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{1:{games:[g('NO','TB',-7,'2026-09-13T17:00Z'),g('ARI','LAC',-9.5,'2026-09-13T20:05Z')],
    picks:{kz:{'NO@TB':'home','ARI@LAC':'away'},az:{'NO@TB':'away'}},lms:{kz:'NYJ'},dupPrefs:{kz:['ARI']}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:Date.now()};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function cold(label, sheet) {
  const c=await b.newContext({...devices['iPhone 13']});   // a fresh partition
  await c.route('**kevinzoss.com/nfl/**', async route=>{
    const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
    if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
    try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
  });
  await c.route('**nfl.kevinzoss.com**',r=>r.abort());
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
  await c.route('**script.google.com**', async route => {
    if (sheet === 'down') return route.abort();
    if (sheet === 'error') return route.fulfill({status:500, body:'boom'});
    return route.fulfill({status:200, contentType:'application/json',
      body: JSON.stringify({state:board, updatedAt:board.updatedAt, version:'owned-merge-2'})});
  });
  // NOTHING in storage: no player chosen, no board. Exactly a new install.
  const p=await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1200);
  // give connect() its three attempts and backoff
  // pick who you are, like a first run
  const gate = p.locator('[data-action="me"][data-id="kz"]');
  if (await gate.count()) { await gate.click(); await p.waitForTimeout(6000); }
  const rows = await p.locator('[data-row]').count();
  const mine = await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('pickem:2026')||'{}')?.weeks?.[1]?.picks?.kz||{}).length);
  const empty = (await p.evaluate(()=>document.querySelector('.empty h3')?.innerText || '')).trim();
  const sync = (await p.locator('.sync').first().innerText().catch(()=> '?')).trim();
  console.log(`${label.padEnd(22)} rows:${String(rows).padEnd(3)} my picks:${String(mine).padEnd(3)} sync:"${sync}"  empty says:"${empty}"  errors:${errs.length||'none'}`);
  await c.close();
}
await cold('sheet reachable', 'ok');
await cold('sheet unreachable', 'down');
await cold('sheet 500s', 'error');
await b.close();
