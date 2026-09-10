// While the Browns are playing, the week view's brown-of-week points must move
// on their own -- and must not write an identical payload to the shared board
// every minute, because every open phone polls.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const roster=[{id:'2',name:'Quinshon Judkins',short:'Q. Judkins',pos:'RB',number:'10'},
              {id:'3',name:'KC Concepcion',short:'K. Concepcion',pos:'WR',number:'1'}];
const live={id:'CLE@JAX',away:'CLE',home:'JAX',spread:-6,status:'in',awayScore:10,homeScore:7,
            kickoff:'2026-09-13T17:00Z',espnId:'401',clock:'Q2 3:20'};
const seed={v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  brownsRoster:roster,
  weeks:{1:{games:[live],picks:{},lms:{},dupPrefs:{},brown:{kz:'2',az:'3'},brownStats:{}}},
  sideBet:{predictions:{},actual:null},adjustments:[],updatedAt:1};

// the box score grows: one carry, then a touchdown
let stage = 0, boxCalls = 0, saves = 0;
const box = () => {
  const rush = stage === 0 ? ['5','20','0'] : ['12','64','1'];
  return { boxscore: { players: [ { team:{abbreviation:'CLE'}, statistics:[
    { name:'rushing', keys:['CAR','YDS','TD'], athletes:[{ athlete:{id:'2'}, stats: rush }] },
    { name:'receiving', keys:['REC','YDS','TD'], athletes:[{ athlete:{id:'3'}, stats:['2','18','0'] }] },
  ] } ] } };
};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const c=await b.newContext({...devices['iPhone 13']});
await c.route('**kevinzoss.com/nfl/**', async route=>{
  const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
  if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
  try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
});
await c.route('**nfl.kevinzoss.com**',r=>r.abort());
await c.route(/the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
await c.route('**site.api.espn.com/**', async route => {
  const u = route.request().url();
  if (u.includes('/summary')) { boxCalls++; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(box())}); }
  // the scoreboard: hand back the same live game so the slate does not change
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[]})});
});
await c.route('**script.google.com**', async route => {
  if (route.request().method() === 'POST') { saves++; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,version:'brown-1'})}); }
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:seed,updatedAt:1,version:'brown-1'})});
});
await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(seed)]);
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1800);

const sec = () => p.locator('.section', { hasText: 'Brown of the week' }).first();
const readRows = async () => (await sec().locator('.lmsrow__sub').allInnerTexts()).map(t=>t.trim());
console.log('header  :', (await sec().locator('.section__sub').innerText()).replace(/\s+/g,' ').slice(0,90));
console.log('live badge:', await sec().locator('.badge--live').count() ? 'shown' : 'MISSING');
console.log('after first pull :', (await readRows()).join(' | '));
const savesAfterFirst = saves;

// poll again with nothing changed: must not save
await p.evaluate(() => window.dispatchEvent(new Event('pageshow')));
await p.waitForTimeout(1500);
console.log('unchanged poll   :', (await readRows()).join(' | '), `| saves added: ${saves - savesAfterFirst} (want 0)`);

// now the touchdown lands
stage = 1;
await p.evaluate(() => window.dispatchEvent(new Event('pageshow')));
await p.waitForTimeout(1800);
console.log('after the TD     :', (await readRows()).join(' | '));
console.log('box score calls  :', boxCalls, '| page errors:', errs.length ? errs[0] : 'none');
await b.close();
