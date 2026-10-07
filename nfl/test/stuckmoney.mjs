// Kevin's Money tab: weeks 1 and 4 read "open" and nobody's money had moved.
// Nothing settles until every game in a week is final -- not the weekly pot,
// not LMS, not the end-of-block split -- and the only sign of it was the word
// "open" in a table. The tab has to name the week, name the game holding it,
// and offer to finish it. A week still being played is not stuck.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pin } from './clock.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const fin=(a,h,as,hs,k)=>({id:`${a}@${h}`,away:a,home:h,spread:-3,status:'post',awayScore:as,homeScore:hs,kickoff:k,espnId:'9'+a});
const stuck=(a,h,k)=>({id:`${a}@${h}`,away:a,home:h,spread:-3,status:'in',awayScore:14,homeScore:13,kickoff:k,espnId:'9'+a});
const soon=(a,h,k)=>({id:`${a}@${h}`,away:a,home:h,spread:-3,status:'pre',awayScore:null,homeScore:null,kickoff:k,espnId:'9'+a});
const P=[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
         {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}];
// week 1: Howard wins it outright, but one game never went final
const seed={v:1,season:2026,players:P,weeks:{
  1:{games:[fin('NO','TB',10,24,'2026-09-13T17:00Z'), stuck('ARI','LAC','2026-09-13T20:05Z')],
     picks:{hz:{'NO@TB':'home','ARI@LAC':'home'}, kz:{'NO@TB':'away'}, az:{'NO@TB':'away'}, jv:{'NO@TB':'away'}},
     lms:{},dupPrefs:{},brown:{},brownStats:{}},
  4:{games:[stuck('SF','LAR','2026-10-04T17:00Z')],picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}},
  // week 5 is being played right now: one final, one yet to kick off. Not stuck.
  5:{games:[fin('NE','SEA',10,20,'2026-10-11T17:00Z'), soon('KC','DEN','2026-10-12T20:05Z')],
     picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}},
}, sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};

let pulls=[];
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
  const m = u.match(/week=(\d+)/);
  if (u.includes('scoreboard') && m) {
    pulls.push(Number(m[1]));
    // ESPN now has week 1's missing game as a final: LAC won.
    if (m[1] === '1') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[
      {id:'9ARI',date:'2026-09-13T20:05Z',status:{type:{state:'post',completed:true,shortDetail:'Final'}},
       competitions:[{date:'2026-09-13T20:05Z',competitors:[
         {homeAway:'home',score:'31',team:{abbreviation:'LAC'}},{homeAway:'away',score:'14',team:{abbreviation:'ARI'}}]}]}]})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await pin(c, Date.parse('2026-10-12T16:00:00Z'));   // during week 5
await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed)]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(900);
await p.locator('[data-tab="money"]:visible').first().click(); await p.waitForTimeout(600);

console.log('headline :', (await p.locator('.alarm b').first().innerText()).trim());
for (const r of await p.locator('.stuck__row').all())
  console.log('   row   :', (await r.innerText()).replace(/\s+/g,' ').trim());
const weeklyTbl = () => p.locator('.sheet--weekly tbody tr');
const weekly = await weeklyTbl().evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g,' ').trim()));
console.log('weekly   :', weekly.join('  |  '));

// Finish week 1 from the Money tab and watch it settle.
pulls = [];
await p.locator('[data-action="chase"][data-week="1"]').click();
await p.waitForTimeout(2200);
console.log('\nchased   :', pulls.join(',') || 'nothing');
await p.locator('[data-tab="money"]:visible').first().click(); await p.waitForTimeout(600);
const after = await weeklyTbl().evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g,' ').trim()));
console.log('weekly   :', after.join('  |  '));
console.log('still stuck:', (await p.locator('.stuck__row').allInnerTexts()).map(t=>t.split('\n')[0]).join(', ') || 'none');

// The tab has to show where every dollar came from, not just the weekly pot.
// A tile reading $2 with nothing on the page to explain it is a fair question.
const src = await p.locator('.sheet--src tbody tr').evaluateAll(els => els.map(e =>
  [...e.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g,' ').trim()).join(' | ')));
console.log('');
for (const r of src) console.log('source   :', r);
const foot = await p.locator('.sheet--src tfoot tr').evaluateAll(els => els.map(e =>
  [...e.querySelectorAll('td')].map(td => td.innerText.trim()).join(' | ')));
for (const r of foot) console.log('total    :', r);
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
