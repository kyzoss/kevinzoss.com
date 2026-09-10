// Nobody in the pool should ever be told to hard-refresh. An app left sitting
// open must notice a new build on its own -- and must not do it while somebody
// is mid-choice in a modal.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
let served = JSON.parse(fs.readFileSync(root+'/version.json')).v;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url());
  if (u.pathname.endsWith('/version.json'))
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({v:served})});
  let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html';
  const f=path.join(root,rel);
  try {
    let body = fs.readFileSync(f);
    // a 30-second check, so the test does not sit here for ten minutes
    if (rel === 'config.js') body = Buffer.from(String(body).replace('buildCheckMinutes: 10', 'buildCheckMinutes: 0.5'));
    await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body});
  } catch { await route.fulfill({status:404,body:'no'}); }
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c.addInitScript(()=>localStorage.setItem('pickem:me','kz'));
const p=await c.newPage();
let navs=0; p.on('framenavigated', f=>{ if(!f.parentFrame()) navs++; });
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1200);
console.log('running build     :', served, '| loads:', navs);

// a new build ships while the app just sits there, untouched
served = 'newbuild';
await p.waitForTimeout(45000);
console.log('left open 45s     : loads:', navs, navs >= 2 ? '-> RELOADED itself' : '-> did not notice');
const reloadedOnItsOwn = navs >= 2;

// and it must not interrupt someone in a modal
served = 'thirdbuild';
await p.waitForTimeout(11000);
await p.getByRole('button',{name:'Setup'}).last().click(); await p.waitForTimeout(300);
await p.getByRole('button',{name:'Switch player'}).click(); await p.waitForTimeout(300);
const modalUp = await p.locator('.modal').count() > 0;
const before = navs;
await p.waitForTimeout(45000);
console.log('modal open 45s    : loads +', navs - before, (navs - before) === 0 ? '-> left alone' : '-> INTERRUPTED');
console.log('modal was open    :', modalUp);
await b.close();
const ok = reloadedOnItsOwn && modalUp && navs === before;
console.log(ok ? '\nself-updates, and never mid-choice' : '\nFAILED');
process.exit(ok ? 0 : 1);
