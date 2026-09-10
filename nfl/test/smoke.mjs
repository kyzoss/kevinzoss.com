// Render every tab, as every player, on a board where nothing is empty --
// picks, LMS teams, dup rankings, Browns guesses, finals, live and unplayed
// games. The ReferenceError that reached production lived in a branch that
// only runs when a player HAS an LMS pick, and every earlier fixture had none.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,as,hs,st,k)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,awayScore:as,homeScore:hs,status:st,kickoff:k,clock:st==='in'?'Q3 4:12':''});
const games=[
  g('NE','SEA',-3,17,20,'post','2026-09-10T00:20Z'),   // final
  g('TB','CIN',-6,24,24,'post','2026-09-13T17:00Z'),   // final, tied
  g('SF','LAR',-5,10,7,'in','2026-09-13T17:00Z'),      // live
  g('IND','MIA',-7,null,null,'pre','2026-09-13T20:05Z'),
  g('NYJ','TEN',-9,null,null,'pre','2026-09-14T00:20Z'),
];
const all=Object.fromEntries(games.map((x,i)=>[x.id, i%2?'away':'home']));
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{
    1:{games, picks:{az:all,kz:all,jv:{'NE@SEA':'home'},hz:all},
       lms:{az:'CLE',kz:'NYJ',hz:'IND'},                       // jv deliberately has none
       dupPrefs:{az:['TB'],kz:['IND','TB'],jv:[],hz:['SF','NYJ','IND','TB']}},
    2:{games:[], picks:{}, lms:{}, dupPrefs:{}},               // an untouched week
  },
  sideBet:{predictions:{kz:{wins:5,losses:12,points:328},az:{wins:9,losses:8,points:401}},actual:null},
  adjustments:[{id:'a1',player:'jv',amount:-2,week:1,note:'coin toss',at:1}],
  updatedAt:1};
const AT=Date.parse('2026-09-13T16:00:00Z');  // Sunday 9am PDT: picks still open
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let problems=0, checks=0;
for (const who of ['az','jv']) {   // az has an LMS pick, jv has none
  for (const [dev,opts] of [['mobile',devices['iPhone 13']],['desktop',{viewport:{width:1440,height:900}}]]) {
    const c=await b.newContext({...opts});
    await c.route('**kevinzoss.com/nfl/**', async route=>{
      const u=new URL(route.request().url());
      let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
      if (rel.endsWith('/')) rel+='index.html';
      const f=path.join(root,rel);
      try { await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)}); }
      catch { await route.fulfill({status:404,body:'no'}); }
    });
    await c.route('**nfl.kevinzoss.com**',r=>r.abort());
    await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|google\.com/,r=>r.abort());
    await c.addInitScript(([s,me,t])=>{ localStorage.setItem('pickem:me',me); localStorage.setItem('pickem:2026',s);
      const R=Date; class D extends R{constructor(...a){super(...(a.length?a:[t]));} static now(){return t;}} window.Date=D; },
      [JSON.stringify(seed),who,AT]);
    const p=await c.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('https://kevinzoss.com/nfl/',{waitUntil:'load'}); await p.waitForTimeout(800);
    const boot = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').trim());
    if (boot.includes('could not start')) {
      console.log(`  FAIL ${who}/${dev}: ${boot.slice(0,180)}`);
      problems++; await c.close(); continue;
    }
    // The desktop tabs are role="tab" in the header; the bottom nav is hidden
    // there. Target the data attribute and take whichever copy is visible.
    for (const tab of ['week','standings','money','browns','settings']) {
      const btn = p.locator(`[data-tab="${tab}"]:visible`).first();
      try { await btn.click({timeout:4000}); } catch { errs.push(`${tab}: no such tab`); continue; }
      await p.waitForTimeout(200); checks++;
      if (await p.evaluate(()=>document.body.innerText.includes('could not start'))) errs.push(`${tab}: died`);
    }
    // and the LMS picker modal, which is its own render path
    await p.keyboard.press('Escape'); await p.waitForTimeout(150);
    try {
      await p.locator('[data-tab="week"]:visible').first().click({timeout:3000});
      await p.waitForTimeout(250);
      const open=p.locator('[data-action="lms-open"]:not([disabled])').first();
      if (await open.count()) { await open.click({timeout:3000}); await p.waitForTimeout(300); checks++; }
    } catch { /* the modal choreography is not what this test measures */ }
    if (errs.length) { problems++; console.log(`  FAIL ${who}/${dev}:`, [...new Set(errs)].slice(0,2).join(' | ')); }
    await c.close();
  }
}
console.log(`\n${checks} renders across 2 players x 2 layouts x 5 tabs + the LMS modal`);
console.log(problems ? `${problems} context(s) threw` : 'no page errors anywhere');
process.exit(problems?1:0);
