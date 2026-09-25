// Kevin's week 2: the three men who picked all watched their team win, and Jim
// entered nothing. Every live pick busting settles the pot early and puts the
// field back in for the rest of the block -- which quietly handed Jim his seat
// back, so he was alive in week 3 and could pick again. He was not playing. A
// forfeit is a forfeit, and it holds for the block.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pin } from './clock.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const fin=(a,h,sp,as,hs,k)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:'post',awayScore:as,homeScore:hs,kickoff:k,espnId:'5'+a});
const pre=(a,h,sp,k)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:'pre',awayScore:null,homeScore:null,kickoff:k,espnId:'6'+a});
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{
    // week 1: everyone picked a team that lost, so everyone is safe
    1:{games:[fin('NO','TB',-7,10,24,'2026-09-13T17:00Z')],picks:{},
       lms:{az:'NO',kz:'NO',jv:'NO',hz:'NO'},dupPrefs:{},brown:{},brownStats:{}},
    // week 2: ARI WON, so all three who picked bust. Jim entered nothing.
    2:{games:[fin('ARI','LAC',-9,31,14,'2026-09-20T17:00Z')],picks:{},
       lms:{az:'ARI',kz:'ARI',hz:'ARI'},dupPrefs:{},brown:{},brownStats:{}},
    // week 3: not played yet
    3:{games:[pre('SF','LAR',-3,'2026-09-27T17:00Z')],picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}},
  },
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function asPlayer(who) {
  const c=await b.newContext({...devices['iPhone 13']});
  await c.route('**kevinzoss.com/nfl/**', async route=>{
    const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
    if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
    try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
  });
  await c.route('**nfl.kevinzoss.com**',r=>r.abort());
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
  await pin(c, Date.parse('2026-09-24T15:00:00Z'));   // Thursday of week 3
  await c.addInitScript(([s,me])=>{ localStorage.setItem('pickem:me',me); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed),who]);
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1100);
  return { c, p, errs };
}

const { c, p, errs } = await asPlayer('jv');
const sec = p.locator('.section', { hasText: 'Last man standing' }).first();
for (const r of await sec.locator('.lmsrow').all()) {
  const txt = (await r.innerText()).replace(/\s+/g,' ').trim();
  const off = await r.locator('.lmsrow__pick').isDisabled();
  console.log(`  ${txt.padEnd(42)} ${off ? 'CANNOT pick' : 'can pick'}`);
}
console.log('Jim can open the picker:', await sec.locator('[data-action="lms-open"]:not([disabled])').count() > 0 ? 'YES' : 'no');

await p.locator('[data-tab="standings"]:visible').first().click(); await p.waitForTimeout(600);
const head = await p.locator('.sheet--lms tr.round td').first().innerText();
console.log('block    :', head.replace(/\s+/g,' ').trim());
for (const row of await p.locator('.sheet--lms tbody tr:not(.round)').all())
  console.log('tracker  :', (await row.innerText()).replace(/\s+/g,' ').trim());
console.log('page errors:', errs.length ? errs[0] : 'none');
await c.close();

// And the three who actually played are back in and can pick week 3 -- the
// re-entry is real, it just does not extend to the man who was not there.
const two = await asPlayer('az');
const sec2 = two.p.locator('.section', { hasText: 'Last man standing' }).first();
console.log('Andrew can pick week 3:', await sec2.locator('[data-action="lms-open"]:not([disabled])').count() > 0 ? 'YES' : 'NO');
await two.c.close();
await b.close();
