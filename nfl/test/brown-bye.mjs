// The Browns' bye (week 11, 2026). The picker used to take a brown of the week
// for a week the Browns were not playing: four picks went in that could never
// score. On a bye every row must read "Bye week", none can be tapped, and the
// section must say why. A pick made before this change must not show.
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
  weeks:{2:{games:[g('CLE','PIT',-3,'2026-09-20T17:00Z','pre')],picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}},
    1:{games:[g('NYJ','BUF',-6,'2026-09-13T17:00Z','pre'),g('KC','DEN',-3,'2026-09-13T20:25Z','pre')],
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

const AT=Date.parse('2026-09-12T18:00:00Z');   // Saturday, before any kickoff
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route('**site.api.espn.com/**', route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})}));
await c.route(/the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
await c.route('**script.google.com/**', route => route.request().method() === 'POST'
  ? route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,version:'chunked-1'})})
  : route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:seed,updatedAt:1,version:'chunked-1'})}));
await c.addInitScript(([t])=>{ localStorage.setItem('pickem:me','kz');
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[AT]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(2500);
const sec = () => p.locator('.section', { hasText: 'Brown of the week' }).first();
const subs = (await sec().locator('.lmsrow__sub').allInnerTexts()).map(t=>t.trim());
console.log('rows        :', subs.join(' | '));
console.log('tappable    :', await sec().locator('.lmsrow__pick:not([disabled])').count());
console.log('names shown :', (await sec().locator('.lmsrow__team').allInnerTexts()).join(' | '));
console.log('says        :', (await sec().locator('.section__sub').innerText()).replace(/\s+/g,' ').split('. ').slice(-1)[0]);
// an old tab can still fire the action; the app must refuse it
await p.evaluate(() => { const b=document.querySelector('[data-action="brown-open"]'); b.disabled=false; b.click(); });
await p.waitForTimeout(400);
console.log('picker opens:', await p.locator('dialog[open], .modal--open, .modal:visible').count() ? 'YES' : 'no', '|', (await p.locator('.toast').allInnerTexts()).join(' '));
console.log('bye header  :', (await sec().locator('.section__title').innerText()).replace(/\s+/g,' '));
// the week after: the bye's money rides on it
await p.evaluate(() => { const t=document.querySelector('.toasts'); if (t) t.remove(); });
await p.evaluate(() => document.querySelector('[data-action="week"][data-week="2"]')?.click());
await p.waitForTimeout(800);
console.log('next header :', (await sec().locator('.section__title').innerText()).replace(/\s+/g,' '));
console.log('next says   :', (await sec().locator('.section__sub').innerText()).replace(/\s+/g,' ').split('resets. ')[1]);
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
