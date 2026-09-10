import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const srv = http.createServer((q, r) => {
  let f = path.join('/home/user/kevinzoss.com/nfl', decodeURIComponent(q.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  try { const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(f)]||'text/plain';
    r.writeHead(200,{'Content-Type':t}); r.end(fs.readFileSync(f)); } catch { r.writeHead(404); r.end('no'); }
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

const seed = {
  v:1, season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{1:{games:[
    {id:'NE@SEA',away:'NE',home:'SEA',spread:-3,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-14T00:20Z'}, // SNF, after cutoff
    {id:'TB@CIN',away:'TB',home:'CIN',spread:-3.5,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-13T17:00Z'}, // 10:00 PDT itself
    {id:'GB@DET',away:'GB',home:'DET',spread:-6,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-11T00:15Z'},  // Thursday
  ], picks:{}, lms:{}, dupPrefs:{}}},
  sideBet:{predictions:{},actual:null}, adjustments:[], updatedAt: 1,
};

async function at(label, isoUtc, tz) {
  const c = await b.newContext({ ...devices['iPhone 13'], timezoneId: tz });
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com/, r => r.abort());
  await c.addInitScript(([s, t]) => {
    localStorage.setItem('pickem:me','jv'); localStorage.setItem('pickem:2026', s);
    const R = Date; class D extends R { constructor(...a){ super(...(a.length?a:[t])); } static now(){ return t; } }
    window.Date = D;
  }, [JSON.stringify(seed), Date.parse(isoUtc)]);
  const p = await c.newPage();
  await p.goto(base); await p.waitForTimeout(800);
  const open = async (id) => (await p.locator(`[data-game="${id}"]:not([disabled])`).count()) > 0;
  console.log(label.padEnd(34), '| SNF:', await open('NE@SEA') ? 'open ' : 'LOCKED',
              '| 10am kick:', await open('TB@CIN') ? 'open ' : 'LOCKED',
              '| Thu:', await open('GB@DET') ? 'open ' : 'LOCKED');
  await c.close();
}
console.log('phone set to Los Angeles');
await at('Sat  Sep 12,  6:00pm PDT', '2026-09-13T01:00:00Z', 'America/Los_Angeles');
await at('Sun  Sep 13,  9:58am PDT', '2026-09-13T16:58:00Z', 'America/Los_Angeles');
await at('Sun  Sep 13, 10:01am PDT', '2026-09-13T17:01:00Z', 'America/Los_Angeles');
console.log('\nsame instants, phone set to New York -- must match exactly');
await at('Sat  Sep 12,  9:00pm EDT', '2026-09-13T01:00:00Z', 'America/New_York');
await at('Sun  Sep 13, 12:58pm EDT', '2026-09-13T16:58:00Z', 'America/New_York');
await at('Sun  Sep 13,  1:01pm EDT', '2026-09-13T17:01:00Z', 'America/New_York');
await b.close(); srv.close();
