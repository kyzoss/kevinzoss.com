// The case nobody was watching: everyone opens the app on Monday, after every
// game is final. Score polling has stopped -- it only runs while a game is live
// -- so nothing was pulling the box score at all, and Brown of the week sat
// blank all week with nothing saying why. Opening the app must read it.
//
// The payload below is in ESPN's REAL shape: `keys` carries machine names and
// `labels` the display strings. The parser used to match machine names against
// display strings, so a real box score scored every Brown zero.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,k,st='pre',as=null,hs=null)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:st,awayScore:as,homeScore:hs,kickoff:k,espnId:'401'});
const roster=[{id:'1',name:'Deshaun Watson',short:'D. Watson',pos:'QB',number:'4'},
  {id:'2',name:'Quinshon Judkins',short:'Q. Judkins',pos:'RB',number:'10'},
  {id:'3',name:'KC Concepcion',short:'K. Concepcion',pos:'WR',number:'1'},
  {id:'4',name:'Harold Fannin Jr.',short:'H. Fannin Jr.',pos:'TE',number:'44'},
  {id:'5',name:'Andre Szmyt',short:'A. Szmyt',pos:'K',number:'25'}];
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  brownsRoster: roster,
  weeks:{1:{games:[g('CLE','JAX',-6,'2026-09-13T17:00Z','post',24,17)],
    picks:{},lms:{},dupPrefs:{},brown:{kz:'2',az:'3',jv:'4',hz:'5'},brownStats:{}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};

// ESPN's real summary shape: machine names in keys, display labels in labels.
const summary={boxscore:{players:[{team:{abbreviation:'CLE'},statistics:[
  {name:'passing',keys:['completions/passingAttempts','passingYards','yardsPerPassAttempt','passingTouchdowns','interceptions'],
   labels:['C/ATT','YDS','AVG','TD','INT'],athletes:[{athlete:{id:'1'},stats:['22/34','249','7.3','2','1']}]},
  {name:'rushing',keys:['rushingAttempts','rushingYards','yardsPerRushAttempt','rushingTouchdowns','longRushing'],
   labels:['CAR','YDS','AVG','TD','LONG'],athletes:[{athlete:{id:'2'},stats:['18','87','4.8','1','24']}]},
  {name:'receiving',keys:['receptions','receivingYards','yardsPerReception','receivingTouchdowns','longReception'],
   labels:['REC','YDS','AVG','TD','LONG'],athletes:[{athlete:{id:'3'},stats:['4','50','12.5','0','19']},
                                                    {athlete:{id:'4'},stats:['3','31','10.3','0','14']}]},
  {name:'kicking',keys:['fieldGoalsMade/fieldGoalAttempts','fieldGoalPct','longFieldGoalMade','extraPointsMade/extraPointAttempts','totalKickingPoints'],
   labels:['FG','PCT','LONG','XP','PTS'],athletes:[{athlete:{id:'5'},stats:['1/2','50.0','41','2/2','5']}]},
]}]}};

const AT=Date.parse('2026-09-14T15:00:00Z');   // Monday morning, nothing live
let summaryCalls=0, broken=false;
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
  if (u.includes('summary')) {
    summaryCalls++;
    // `broken` serves a payload whose columns we cannot read, to prove the app
    // says so instead of showing an empty table forever.
    const body = broken ? {boxscore:{players:[{team:{abbreviation:'CLE'},statistics:[
      {name:'passing',keys:['somethingNew','alsoNew'],athletes:[{athlete:{id:'1'},stats:['1','2']}]}]}]}} : summary;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s);
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(seed),AT]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(2000);

const sec = () => p.locator('.section', { hasText: 'Brown of the week' }).first();
console.log('summary pulled on open :', summaryCalls ? `yes (${summaryCalls})` : 'NO — nothing read it');
console.log('rows                   :', (await sec().locator('.lmsrow__sub').allInnerTexts()).map(t=>t.trim().replace(/\s+/g,' ')).join(' | '));
const banner = sec().locator('.brownwon');
console.log('winner                 :', await banner.count() ? (await banner.innerText()).replace(/\s+/g,' ') : 'MISSING');
const calls = summaryCalls;
// a second render must not re-read a game that is over and already scored
await p.locator('[data-tab="browns"]:visible').first().click(); await p.waitForTimeout(300);
await p.locator('[data-tab="week"]:visible').first().click(); await p.waitForTimeout(800);
console.log('re-reads a settled game:', summaryCalls - calls, '(want 0)');

// Now the feed changes shape under us: it must say so, not show a quiet blank.
broken = true;
const c2=await b.newContext({...devices['iPhone 13']});
await c2.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c2.route('**nfl.kevinzoss.com**',r=>r.abort());
await c2.route('**site.api.espn.com/**', async route=>{
  const u=route.request().url();
  if (u.includes('summary')) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({boxscore:{players:[
    {team:{abbreviation:'CLE'},statistics:[{name:'passing',keys:['somethingNew','alsoNew'],athletes:[{athlete:{id:'1'},stats:['1','2']}]}]}]}})});
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c2.route(/the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
await c2.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s);
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(seed),AT]);
const p2=await c2.newPage(); await p2.goto('https://kevinzoss.com/nfl/'); await p2.waitForTimeout(2000);
const sub = await p2.locator('.section', { hasText: 'Brown of the week' }).first().locator('.section__sub').innerText();
console.log('\nunreadable feed        :', sub.replace(/\s+/g,' ').slice(-70));
const diag = await p2.locator('.section', { hasText: 'Brown of the week' }).first().locator('.commish code').innerText().catch(()=> 'none');
console.log('what it tells the commish:', diag);
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
