// Week 10, 2026. Nobody had the app open during the Browns game, so the board
// still had it as "not started" when the first person opened the app the next
// morning. Opening it pulled the new scores -- but the box score check ran
// first, against the OLD copy, saw a game that had not started, and stopped.
// Nothing went back once the scores landed, so brown of the week never
// settled. Same trap in the live-score poll. The game here is stored as "pre"
// with its kickoff long past; ESPN's scoreboard says it is final.
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
  weeks:{1:{games:[g('CLE','JAX',-6,'2026-09-13T17:00Z','pre')],
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

const AT=Date.parse('2026-09-14T11:20:00Z');   // 3:20 AM Pacific Monday
const ev={id:'401',date:'2026-09-13T17:00Z',status:{type:{state:'post',completed:true,shortDetail:'Final'}},
  competitions:[{date:'2026-09-13T17:00Z',competitors:[
    {homeAway:'home',score:'17',team:{abbreviation:'JAX'}},
    {homeAway:'away',score:'24',team:{abbreviation:'CLE'}}]}]};
let summaryCalls=0, boards=0;
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
  if (u.includes('summary')) { summaryCalls++; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(summary)}); }
  if (u.includes('scoreboard') && u.includes('week=1')) {
    // a little latency, as the real one has: the race is the box score check
    // running before this answer lands
    boards++; await new Promise(r=>setTimeout(r,300));
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[ev]})});
  }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c.route(/the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
// The board comes from the Sheet. This phone starts with nothing of its own --
// a fresh Home Screen app, or one last opened weeks ago -- so it has no slate
// to refresh on open, and the board's copy is the only one it knows.
await c.route('**script.google.com/**', route => route.request().method() === 'POST'
  ? route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,version:'chunked-1'})})
  : route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:seed,updatedAt:1,version:'chunked-1'})}));
await c.addInitScript(([s,t])=>{ localStorage.setItem('pickem:me','kz');
  const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },[JSON.stringify(seed),AT]);
const p=await c.newPage(); p.on('console',m=>{ if(m.text().startsWith('BROWNREAD')) console.log(m.text().replace(/https?:[^ )]*\//g,'')); }); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(3000);
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('pickem:2026')).weeks[1]);
console.log('scoreboard pulled      :', boards ? 'yes' : 'NO');
console.log('game now               :', st.games.map(x=>`${x.id} ${x.status} ${x.awayScore}-${x.homeScore}`).join(', '));
console.log('box score read         :', summaryCalls ? `yes (${summaryCalls})` : 'NO -- read before the scores landed, never again');
console.log('stored box score       :', Object.keys(st.brownStats||{}).length, 'players');
const sec = () => p.locator('.section', { hasText: 'Brown of the week' }).first();
const banner = sec().locator('.brownwon');
console.log('winner                 :', await banner.count() ? (await banner.innerText()).replace(/\s+/g,' ') : 'MISSING');
console.log('page errors:', errs.length ? errs[0] : 'none');
await b.close();
