import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

// A stand-in for the Apps Script: one shared board all three clients talk to.
let board = null, saves = 0;
const app = http.createServer((q, r) => {
  if (q.url.startsWith('/exec')) {
    if (q.method === 'POST') {
      let body = ''; q.on('data', c => body += c);
      return q.on('end', () => {
        const doc = JSON.parse(body); saves++;
        // mirrors mergeState_: never let a document without picks clear one
        const has = (d) => Object.values(d?.weeks || {}).some(w => Object.values(w.picks || {}).some(p => Object.keys(p||{}).length));
        if (!board || has(doc.state)) board = doc.state;
        r.writeHead(200, {'Content-Type':'application/json'});
        r.end(JSON.stringify({ ok: true, version: 'straight-up-1' }));
      });
    }
    r.writeHead(200, {'Content-Type':'application/json'});
    return r.end(JSON.stringify({ state: board, updatedAt: board?.updatedAt || 0, version: 'straight-up-1' }));
  }
  let f = path.join('/home/user/kevinzoss.com/nfl', decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  try { const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(f)] || 'text/plain';
    r.writeHead(200,{'Content-Type':t}); r.end(fs.readFileSync(f)); } catch { r.writeHead(404); r.end('no'); }
}).listen(0);
const port = app.address().port;
const base = `http://127.0.0.1:${port}/`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const games = [
  {id:'NE@SEA',away:'NE',home:'SEA',spread:-3,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-14T00:20Z'},
  {id:'TB@CIN',away:'TB',home:'CIN',spread:-3.5,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-13T17:00Z'},
];
board = { v:1, season:2026, weeks:{1:{games, picks:{}, lms:{}, dupPrefs:{}}},
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  sideBet:{predictions:{},actual:null}, adjustments:[], updatedAt: Date.now() };

// Sunday 9:00 Pacific -- before the 10:00 cutoff, so picks are open.
const OPEN = Date.parse('2026-09-13T16:00:00Z');
async function client(label, opts, clock) {
  const c = await b.newContext({ ...opts });
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com/, r => r.abort());
  // forward the app's real sync calls to the stand-in board, reads AND writes
  await c.route('**script.google.com**', async (route) => {
    const req = route.request();
    const res = await fetch(base + 'exec' + (new URL(req.url()).search || ''), {
      method: req.method(), headers: { 'Content-Type': 'text/plain' },
      body: req.method() === 'POST' ? req.postData() : undefined,
    });
    await route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  });
  await c.addInitScript(([t]) => {
    localStorage.setItem('pickem:me','kz');
    const R = Date; const F = t;               // freeze the clock
    class D extends R { constructor(...a){ super(...(a.length?a:[F])); } static now(){ return F; } }
    window.Date = D;
  }, [clock]);
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(base); await p.waitForTimeout(900);
  return { c, p, errs, label };
}
const wide = await client('desktop',   { viewport:{width:1440,height:900} }, OPEN);
const phone = await client('mobile',   { ...devices['iPhone 13'] }, OPEN);
const stand = await client('homescreen', { ...devices['iPhone 13'], isMobile:true }, OPEN);
await stand.p.emulateMedia({ media:'screen' });

for (const { label, p, errs } of [wide, phone, stand]) {
  const sub = await p.locator('.section__sub').nth(1).innerText().catch(()=> '');
  const canTap = await p.locator('[data-game="NE@SEA"]:not([disabled])').count();
  const hScroll = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(label.padEnd(11), '| pickable cells:', canTap, '| h-scroll:', hScroll, '| errors:', errs.length ? errs[0] : 'none');
  console.log(' '.repeat(12), '|', sub.replace(/\s+/g,' ').slice(0, 96));
}

// desktop picks; do the others see it?
await wide.p.locator('[data-game="NE@SEA"][data-side="home"]').click();
await wide.p.waitForTimeout(1200);
console.log('\ndesktop picked SEA. board now has:', JSON.stringify(board.weeks[1].picks));
for (const { label, p } of [phone, stand]) {
  await p.reload(); await p.waitForTimeout(1000);
  const mine = await p.evaluate(() => JSON.parse(localStorage.getItem('pickem:2026'))?.weeks?.[1]?.picks?.kz || {});
  console.log(label.padEnd(11), 'sees ->', JSON.stringify(mine));
}
await b.close(); app.close();
