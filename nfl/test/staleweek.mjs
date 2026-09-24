// A week that never finished on the board.
//
// Score polling only runs while a game is live. If nobody had the app open at
// the minute a game went final, that game stays "in" for good -- and a week
// that never completes never settles: the pot does not pay, and LMS cannot
// knock anybody out, including the man who forgot to pick. Opening the week
// has to be enough to finish it.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pin } from './clock.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};

// Week 2's slate as the board has it: one game stuck live since Sunday.
const stuck=[
  {id:'NO@TB',away:'NO',home:'TB',spread:-7,status:'post',awayScore:10,homeScore:24,kickoff:'2026-09-20T17:00Z',espnId:'501'},
  {id:'ARI@LAC',away:'ARI',home:'LAC',spread:-9.5,status:'in',awayScore:14,homeScore:13,kickoff:'2026-09-20T20:05Z',espnId:'502'},
];
// Kevin, Andrew and Howard picked a team to lose. Jim entered nothing.
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{2:{games:stuck,picks:{},lms:{kz:'NO',az:'ARI',hz:'NO'},dupPrefs:{},brown:{},brownStats:{}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};

// What ESPN says now: both final. ARI lost, so Andrew is safe; NO lost too.
const ev=(id,away,home,as,hs)=>({id,date:'2026-09-20T17:00Z',status:{type:{state:'post',completed:true,shortDetail:'Final'}},
  competitions:[{date:'2026-09-20T17:00Z',competitors:[
    {homeAway:'home',score:String(hs),team:{abbreviation:home}},
    {homeAway:'away',score:String(as),team:{abbreviation:away}}]}]});
const FINALS={events:[ev('501','NO','TB',10,24), ev('502','ARI','LAC',14,31)]};

let boards=0;
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route('**site.api.espn.com/**', async route=>{
  const u=route.request().url();
  if (u.includes('scoreboard') && u.includes('week=2')) { boards++; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(FINALS)}); }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
// Thursday of week 3: week 2 is history and nobody is polling it any more.
await pin(c, Date.parse('2026-09-24T15:00:00Z'));
await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed)]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(900);

const read = async () => {
  const sec = p.locator('.section', { hasText: 'Last man standing' }).first();
  return (await sec.locator('.lmsrow').evaluateAll(els => els.map(e =>
    e.innerText.replace(/\s+/g,' ').trim()))).join('  |  ');
};
await p.locator('[data-action="week"][data-week="2"]').first().click();
await p.waitForTimeout(2200);
console.log(`week 2 scoreboard pulls: ${boards}${boards ? '' : '  << nothing chased the stuck game'}`);
const games = await p.evaluate(() => JSON.parse(localStorage.getItem('pickem:2026')).weeks[2].games.map(g => `${g.id} ${g.status} ${g.awayScore}-${g.homeScore}`));
console.log('slate now :', games.join(' | '));
console.log('lms now   :', await read());
const tracker = await p.evaluate(() => {
  const el = [...document.querySelectorAll('.lmsrow')].find(e => e.innerText.includes('Jim'));
  return el ? el.innerText.replace(/\s+/g,' ').trim() : 'no Jim row';
});
console.log('Jim       :', tracker);

// And the tracker has to agree: a no-pick is an elimination, so Jim is out for
// the rest of the block, not merely blank for the week.
await p.locator('[data-tab="standings"]:visible').first().click();
await p.waitForTimeout(600);
const cells = await p.locator('.sheet--lms tbody tr').evaluateAll(els => els.map(e => {
  const td = [...e.querySelectorAll('td')];
  return td.map(x => `${x.innerText.replace(/\s+/g,' ').trim() || '-'}${x.className.includes('lmst--knocked') ? '[X]' : ''}`).join(' | ');
}));
for (const row of cells) console.log('tracker  :', row);
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
