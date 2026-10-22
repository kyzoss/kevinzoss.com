// Kevin's board, week 7. Round 2 began in week 5; in week 6 only Andrew's team
// lost, so he is the last man standing and should have the pot. But Monday
// night's game finished after everyone went to bed, so the board still has it
// "in progress" -- and results only ever got chased for the week on screen,
// which by Thursday is week 7. So week 6 never settled, nobody was knocked
// out, and the tracker said four still standing.
//
// Opening the app has to chase week 6 on its own, settle it, pay Andrew as the
// last man standing, and start round 3 in week 7 with everybody back in.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pin } from './clock.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
// fin(away, home, awayScore, homeScore): a final
const fin=(a,h,as,hs,k='2026-10-11T17:00Z')=>({id:`${a}@${h}`,away:a,home:h,spread:-3,status:'post',awayScore:as,homeScore:hs,kickoff:k,espnId:`${a}${h}`});
const P=[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
         {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}];
const wk=(games,lms)=>({games,picks:{},lms,dupPrefs:{},brown:{},brownStats:{}});
const seed={v:1,season:2026,players:P,sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1,weeks:{
  // round 1: Andrew and Kevin outlast Jim and Howard and split $16
  1:wk([fin('A1','Z1',10,30), fin('B1','Y1',10,30)], {az:'A1',kz:'A1',jv:'B1',hz:'B1'}),
  2:wk([fin('A2','Z2',10,30), fin('B2','Y2',30,10)], {az:'A2',kz:'A2',jv:'B2',hz:'B2'}),
  3:wk([fin('A3','Z3',10,30)], {az:'A3',kz:'A3'}),
  4:wk([fin('A4','Z4',10,30)], {az:'A4',kz:'A4'}),
  // round 2, the screenshot. Week 5: everyone's team lost.
  5:wk([fin('ARI','X5',10,30), fin('MIA','Y5',10,30)], {az:'ARI',kz:'MIA',jv:'ARI',hz:'MIA'}),
  // Week 6: ARI and NO won, so Kevin, Jim and Howard bust. Andrew's LAC game is
  // Monday night -- and the board still has it in progress.
  6:wk([fin('ARI','SEA',30,10), fin('NO','TB',31,10),
        {id:'LAC@KC',away:'LAC',home:'KC',spread:-3,status:'in',awayScore:10,homeScore:7,kickoff:'2026-10-20T00:15Z',espnId:'LACKC'}],
       {az:'LAC',kz:'ARI',jv:'NO',hz:'ARI'}),
  7:wk([{id:'NYG@DAL',away:'NYG',home:'DAL',spread:-3,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-10-25T17:00Z',espnId:'NYGDAL'}],
       {az:'NYG'}),
}};
// What ESPN has now for week 6: LAC lost on Monday night.
const ev=(a,h,as,hs)=>({id:`${a}${h}`,date:'2026-10-20T00:15Z',status:{type:{state:'post',completed:true,shortDetail:'Final'}},
  competitions:[{date:'2026-10-20T00:15Z',competitors:[{homeAway:'home',score:String(hs),team:{abbreviation:h}},{homeAway:'away',score:String(as),team:{abbreviation:a}}]}]});
const WEEK6={events:[ev('ARI','SEA',30,10), ev('NO','TB',31,10), ev('LAC','KC',13,27)]};

let pulled=[];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route('**site.api.espn.com/**', async route=>{
  const m=route.request().url().match(/week=(\d+)/);
  if (m) pulled.push(Number(m[1]));
  const body = m && m[1]==='6' ? WEEK6 : {events:[]};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
});
await c.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await pin(c, Date.parse('2026-10-22T16:00:00Z'));      // Thursday of week 7
await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed)]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(2500);

// Nobody navigated to week 6. It still has to have been chased.
console.log('week on screen      :', await p.locator('[data-action="week"][aria-current="true"], .wk--on').first().innerText().catch(()=> '7'));
console.log('week 6 chased       :', pulled.includes(6) ? 'yes' : 'NO');
const g6 = await p.evaluate(() => JSON.parse(localStorage.getItem('pickem:2026')).weeks[6].games.map(g => `${g.id} ${g.status}`));
console.log('week 6 now          :', g6.join(' | '));

await p.locator('[data-tab="standings"]:visible').first().click(); await p.waitForTimeout(700);
for (const h of await p.locator('.sheet--lms tr.round td').allInnerTexts())
  console.log('block               :', h.replace(/\s+/g,' ').trim());
for (const r of await p.locator('.sheet--lms tbody tr:not(.round)').allInnerTexts())
  if (/^\s*[567]/.test(r)) console.log('tracker             :', r.replace(/\s+/g,' ').trim());

// Kevin is back in for round 3 and can pick week 7.
await p.locator('[data-tab="week"]:visible').first().click(); await p.waitForTimeout(600);
const lms = p.locator('.section', { hasText: 'Last man standing' }).first();
console.log('week 7 header       :', (await lms.locator('.section__sub').innerText()).replace(/\s+/g,' ').trim());
console.log('Kevin can pick wk 7 :', await lms.locator('[data-action="lms-open"]:not([disabled])').count() ? 'yes' : 'NO');

await p.locator('[data-tab="money"]:visible').first().click(); await p.waitForTimeout(600);
const row = await p.locator('.sheet--src tbody tr').evaluateAll(els => els.map(e =>
  [...e.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g,' ').trim()).join(' | ')).find(t => t.startsWith('Last man')));
console.log('money, LMS row      :', row);
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
