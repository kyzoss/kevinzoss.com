// From the end of Wednesday the lines do not move -- including for a game that
// still has no number. A line appearing late is how the dup pool changed
// underneath a draft that had already happened.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const PLAYERS=[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
               {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}];
// One game already lined, one with no line at all.
const seed={v:1,season:2026,players:PLAYERS,
  weeks:{1:{games:[
    {id:'SF@LAR',away:'SF',home:'LAR',spread:-3.5,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-13T17:00Z',espnId:'1'},
    {id:'DAL@NYG',away:'DAL',home:'NYG',spread:null,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-13T17:00Z',espnId:'2'}],
    picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};
// ESPN now offers a line on the second game, and a different one on the first
const espn = { events: [
  { id:'1', date:'2026-09-13T17:00Z', competitions:[{ id:'1', competitors:[
      {homeAway:'home', team:{abbreviation:'LAR'}, score:'0', records:[{summary:'0-0'}]},
      {homeAway:'away', team:{abbreviation:'SF'},  score:'0', records:[{summary:'0-0'}]}],
      odds:[{ details:'LAR -9.5', homeTeamOdds:{favorite:true} }], status:{type:{state:'pre'}} }] },
  { id:'2', date:'2026-09-13T17:00Z', competitions:[{ id:'2', competitors:[
      {homeAway:'home', team:{abbreviation:'NYG'}, score:'0', records:[{summary:'0-0'}]},
      {homeAway:'away', team:{abbreviation:'DAL'}, score:'0', records:[{summary:'0-0'}]}],
      odds:[{ details:'NYG -7', homeTeamOdds:{favorite:true} }], status:{type:{state:'pre'}} }] },
]};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function run(label, whenISO) {
  const c=await b.newContext({...devices['iPhone 13']});
  await c.route('**kevinzoss.com/nfl/**', async route=>{
    const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
    if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
    try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
  });
  await c.route('**nfl.kevinzoss.com**',r=>r.abort());
  await c.route('**site.api.espn.com/**', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(espn)}));
  await c.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
  await c.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s);
    const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },
    [JSON.stringify(seed), Date.parse(whenISO)]);
  const p=await c.newPage(); await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(900);
  await p.getByRole('button',{name:/Refresh scores|Pull slate/}).click();
  await p.waitForTimeout(1800);
  const spreads = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('pickem:2026'));
    return Object.fromEntries((d.weeks[1].games||[]).map(g => [g.id, g.spread]));
  });
  console.log(`${label.padEnd(34)} SF@LAR ${String(spreads['SF@LAR']).padEnd(6)} DAL@NYG ${spreads['DAL@NYG']}`);
  await c.close();
  return spreads;
}
// week 1 locks Wed 2026-09-09 at 23:59 Pacific = 2026-09-10T06:59Z
const before = await run('Wed morning, before the lock', '2026-09-09T16:00:00Z');
const after  = await run('Thu morning, after it',        '2026-09-10T15:00:00Z');
await b.close();
const ok = after['SF@LAR'] === -3.5 && after['DAL@NYG'] === null;
console.log();
console.log('before the lock a line can still be set:', before['DAL@NYG'] !== null);
console.log('after it, an existing line is untouched          :', after['SF@LAR'] === -3.5);
console.log('after it, a game with no line stays without one  :', after['DAL@NYG'] === null);
console.log(ok ? '\nlines are frozen from Wednesday night' : '\nFAILED');
process.exit(ok ? 0 : 1);
