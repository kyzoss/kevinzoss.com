// Restore has to fill a ranking that was wiped, without touching one somebody
// already has. Kevin's and Andrew's were erased off the board; Jim's and
// Howard's were not.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const bk=JSON.parse(fs.readFileSync(root+'/recover-week1.json','utf8'));
const seed={v:1,season:2026,players:bk.players,
  weeks:{1:{games:bk.weeks['1'].games, picks:{}, lms:{}, brown:{}, brownStats:{},
    dupPrefs:{ jv:['ARI'], hz:['WSH'] }}},           // the two that survived
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:Date.now()};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed)]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1000);
const chips = async () => (await p.locator('.dupchip').allInnerTexts()).map(t=>t.replace(/\s+/g,' ').trim()).join('  ');
console.log('before restore:', await chips());
await p.locator('[data-tab="settings"]:visible').first().click(); await p.waitForTimeout(300);
await p.getByRole('button',{name:'Restore picks from backup'}).click(); await p.waitForTimeout(1500);
console.log('toast         :', (await p.locator('.toast').last().innerText()).replace(/\s+/g,' '));
await p.locator('[data-tab="week"]:visible').first().click(); await p.waitForTimeout(600);
console.log('after restore :', await chips());
const marked = await p.locator('.cell--dupset').count();
console.log('cells marked D:', marked, '| page errors:', errs.length ? errs[0] : 'none');
const txt = await chips();
const ok = txt.includes('AZ TB') && txt.includes('KZ IND') && txt.includes('JV ARI') && txt.includes('HZ WSH') && marked >= 4 && !errs.length;
console.log(ok ? '\nAndrew TB, Kevin IND, Jim and Howard untouched' : '\nFAILED');
await b.close();
process.exit(ok ? 0 : 1);
