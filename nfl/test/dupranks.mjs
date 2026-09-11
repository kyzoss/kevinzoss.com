import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const srv = http.createServer((q,r)=>{ let f=path.join('/home/user/kevinzoss.com/nfl',decodeURIComponent(q.url.split('?')[0]));
  if(f.endsWith('/'))f+='index.html';
  try{const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(f)]||'text/plain';
    r.writeHead(200,{'Content-Type':t}); r.end(fs.readFileSync(f));}catch{r.writeHead(404);r.end('no');}}).listen(0);
const base=`http://127.0.0.1:${srv.address().port}/`;
const g=(a,h,sp,k,as,hs)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:as==null?'pre':'post',awayScore:as??null,homeScore:hs??null,kickoff:k});
// Kevin's exact scenario: Andrew took TB, Kevin took IND, Jim has ranked nothing,
// Howard is provisionally on SF.
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  // TB is Andrew's dup and the dog won -- a DUP win. TEN is the favourite and
  // won -- an ordinary win. The two must not look the same.
  weeks:{1:{games:[g('TB','CIN',-6,'2026-09-13T17:00Z',30,3),g('IND','MIA',-7,'2026-09-13T17:00Z'),
                   g('SF','LAR',-5,'2026-09-13T17:00Z'),g('NYJ','TEN',-9,'2026-09-13T17:00Z',10,24)],
    picks:{}, lms:{}, dupPrefs:{ az:['TB'], kz:['IND','TB'], jv:[], hz:['SF','NYJ','IND','TB'] }}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};
const OPEN=Date.parse('2026-09-13T16:00:00Z');   // Sunday 9am PDT, picks open
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for (const [label, opts] of [['mobile', devices['iPhone 13']], ['desktop', {viewport:{width:1440,height:900}}]]) {
  const c=await b.newContext({...opts});
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com/,r=>r.abort());
  await c.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','hz'); localStorage.setItem('pickem:2026',s);
    const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(seed),OPEN]);
  const p=await c.newPage(); await p.goto(base); await p.waitForTimeout(900);
  console.log(`\n== ${label}`);
  for (const id of ['TB@CIN','IND@MIA','SF@LAR','NYJ@TEN']) {
    const row = p.locator(`[data-row="${id}"]`);
    const cells = await row.locator('.cell--pick').evaluateAll(els => els.map(e => ({
      face: e.innerText.trim(),
      rank: e.className.includes('cell--rank'),
      set: e.className.includes('cell--dupset'),
      d: getComputedStyle(e, '::after').content,
      border: getComputedStyle(e).borderColor,
      colour: getComputedStyle(e).color,
      win: e.className.includes('is-win'),
      title: e.title })));
    const dupCell = await row.locator('.cell--dup').innerText().catch(()=> '');
    console.log(`  ${id.padEnd(8)} = [${cells.map(c=>c.face+(c.set?'[D]':'')+(c.win?'(W)':'')).join(' ')}]`);
    for (const c of cells.filter(c=>c.win)) console.log(`             ${c.face}${c.set?' dup':'    '} win -> ${c.colour}`);
    for (const c of cells.filter(c=>c.set)) console.log(`             ${c.face} secured: ::after=${c.d} border=${c.border} colour=${c.colour}`);
    for (const c of cells.filter(c=>c.rank)) console.log(`             ${c.face} provisional -> ${c.title}`);
  }
  const chips = await p.locator('.dupchip').evaluateAll(els => els.map(e =>
    e.innerText.replace(/\s+/g,' ').trim()));
  console.log('  dup bar:', chips.join('  '));
  const h = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('  horizontal scroll:', h);
  await p.locator('.slate').scrollIntoViewIfNeeded();
  await p.locator('.section', { has: p.locator('.slate') }).screenshot({ path: `/home/user/kevinzoss.com/_dup-${label}.png` });
  await c.close();
}
await b.close(); srv.close();
