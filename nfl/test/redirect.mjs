import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const mine = JSON.parse(fs.readFileSync(root+'/version.json')).v;
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

async function run(label, canonBehaviour, startPath) {
  const c=await b.newContext({viewport:{width:1440,height:900}});
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com/,r=>r.abort());
  // the ORIGIN we start on: kevinzoss.com-alike, over https
  await c.route('**origin.test**', async route => {
    const u=new URL(route.request().url());
    let rel = u.pathname.replace(/^\/nfl\//,'/').replace(/\/$/,'/index.html');
    let f = path.join(root, rel);
    try {
      let body = fs.readFileSync(f);
      if (rel.endsWith('index.html')) body = Buffer.from(String(body).replace('"nfl.kevinzoss.com"','"canon.test"'));
      await route.fulfill({status:200, contentType:TYPES[path.extname(f)]||'text/plain', body});
    } catch { await route.fulfill({status:404, body:'no'}); }
  });
  // the CANONICAL host, in one of three deploy states
  await c.route('**canon.test**', async route => {
    const u=new URL(route.request().url());
    if (!u.pathname.endsWith('version.json'))
      return route.fulfill({status:200,contentType:'text/html',body:'<h1>canonical</h1>'});
    if (canonBehaviour==='404') return route.fulfill({status:404, body:'no'});
    const v = canonBehaviour==='stale' ? 'c0504c60' : mine;
    return route.fulfill({status:200, contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({v})});
  });
  await c.addInitScript(()=>localStorage.setItem('pickem:me','kz'));
  const p=await c.newPage();
  await p.goto('https://origin.test'+startPath); await p.waitForTimeout(2500);
  const u=new URL(p.url());
  console.log(`${label.padEnd(30)} from ${startPath.padEnd(6)} -> ${u.hostname==='canon.test'?'MOVED to canonical '+u.pathname:'stayed put'}`);
  await c.close();
}
console.log('our build:', mine, '\n');
await run('canonical serves this build','current','/');
await run('canonical serves this build','current','/nfl/');
await run('canonical deploy is STALE','stale','/nfl/');
await run('canonical 404s (today)','404','/nfl/');
await b.close();
