import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

let served = null;   // what version.json currently reports
const srv = http.createServer((q, r) => {
  const url = q.url.split('?')[0];
  if (url === '/version.json') {
    r.writeHead(200, {'Content-Type':'application/json'});
    return r.end(JSON.stringify({ v: served }));
  }
  let f = path.join('/home/user/kevinzoss.com/nfl', decodeURIComponent(url));
  if (f.endsWith('/')) f += 'index.html';
  try { const t = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(f)]||'text/plain';
    r.writeHead(200,{'Content-Type':t}); r.end(fs.readFileSync(f)); } catch { r.writeHead(404); r.end('no'); }
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}/`;
served = JSON.parse(fs.readFileSync('/home/user/kevinzoss.com/nfl/version.json')).v;
console.log('running build:', served);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const c = await b.newContext({ ...devices['iPhone 13'] });
await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com/, r => r.abort());
await c.addInitScript(() => localStorage.setItem('pickem:me','kz'));
const p = await c.newPage();
let loads = 0; p.on('framenavigated', f => { if (!f.parentFrame()) loads++; });

await p.goto(base); await p.waitForTimeout(800);
console.log('initial page loads:', loads);

// background and reopen with no new build -- must NOT reload
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(1200);
console.log('reopen, same build      -> loads:', loads, '(want 1: stayed put)');

// ship a new build, then reopen -- must reload
served = 'deadbeef';

await p.waitForTimeout(10500);   // clear the 10s anti-thrash window
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.waitForTimeout(4000);
console.log('reopen, newer build     -> loads:', loads, '(want 2: reloaded itself)');
await b.close(); srv.close();
