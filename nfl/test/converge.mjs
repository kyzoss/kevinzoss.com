// Three devices, one board, and the failure the pool actually hit: the website
// showed every pick, one Home Screen app was missing Jim's, and Andrew's device
// showed none of his own.
//
// The cause was that the server merges add-only, so what it STORES is fuller
// than what a device SENT -- and it stored that under the sender's own
// timestamp without returning it. The sender kept its thin copy, every later
// read saw an equal timestamp, and nothing ever adopted. This asserts that all
// three converge, both against a server that returns the merge and against one
// that does not.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:'pre',awayScore:null,homeScore:null,kickoff:'2026-09-13T17:00Z'});
const GAMES=[g('NO','TB',-7),g('ARI','LAC',-9.5),g('WSH','PHI',-5.5)];
const PLAYERS=[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
               {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}];
const doc = (picks, at) => ({ v:1, season:2026, players:PLAYERS,
  weeks:{1:{games:GAMES, picks, lms:{}, dupPrefs:{}, brown:{}, brownStats:{}}},
  sideBet:{predictions:{},actual:null}, adjustments:[], updatedAt:at });

const ALL = { kz:{'NO@TB':'home','ARI@LAC':'away','WSH@PHI':'home'},
              az:{'NO@TB':'away','ARI@LAC':'away'},
              jv:{'WSH@PHI':'away'} };

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});

async function run(label, mergeBack) {
  // the board: add-only per player, exactly like the Apps Script
  let board = doc(JSON.parse(JSON.stringify(ALL)), 5000);
  const merge = (incoming, owner) => {
    const out = JSON.parse(JSON.stringify(board));
    const w = out.weeks[1], inW = incoming.weeks?.[1] || {};
    for (const [pid, by] of Object.entries(inW.picks || {})) {
      if (pid === owner) { w.picks[pid] = by; continue; }
      w.picks[pid] = w.picks[pid] || {};
      for (const [gid, side] of Object.entries(by || {})) if (w.picks[pid][gid] == null) w.picks[pid][gid] = side;
    }
    out.updatedAt = incoming.updatedAt;
    board = out;
    return out;
  };

  // Andrew's device is the broken one: a thin local copy holding only his own
  // picks, with a timestamp NEWER than the board.
  const thin = doc({ az: { 'NO@TB':'away' } }, 9000);
  const seeds = { az: thin, kz: board, jv: doc({ jv: ALL.jv }, 4000) };
  const seen = {};

  for (const who of ['az','kz','jv']) {
    const c=await b.newContext({...devices['iPhone 13']});
    await c.route('**kevinzoss.com/nfl/**', async route=>{
      const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
      if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
      try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
    });
    await c.route('**nfl.kevinzoss.com**',r=>r.abort());
    await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
    await c.route('**script.google.com**', async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData());
        const merged = merge(body.state, String(body.actor || ''));
        const reply = { ok:true, updatedAt: merged.updatedAt, version:'merge-back-1' };
        if (mergeBack) reply.state = merged;          // the fix
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reply)});
      }
      return route.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ state: board, updatedAt: board.updatedAt, version:'merge-back-1' })});
    });
    await c.addInitScript(([s,me])=>{ localStorage.setItem('pickem:me',me); localStorage.setItem('pickem:2026',s); },
      [JSON.stringify(seeds[who]), who]);
    const p=await c.newPage(); await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(2200);
    seen[who] = await p.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('pickem:2026'));
      const picks = d.weeks?.[1]?.picks || {};
      return Object.fromEntries(Object.entries(picks).map(([k,v]) => [k, Object.keys(v||{}).length]));
    });
    await c.close();
  }
  // Nobody touched anything on any of these devices, so nothing may be lost --
  // including Andrew's own two picks, which his stale device used to erase by
  // pushing a thinner copy of himself.
  const want = { kz:3, az:2, jv:1 };
  const fmt = (o) => ['kz','az','jv'].map(k => `${k}:${o[k] ?? 0}`).join(' ');
  const ok = ['az','kz','jv'].every((w) => ['kz','az','jv'].every((k) => (seen[w][k] ?? 0) === want[k]));
  console.log(`${label}`);
  for (const w of ['az','kz','jv']) console.log(`   ${w}'s device sees  ${fmt(seen[w])}`);
  console.log(`   board holds       ${fmt(Object.fromEntries(Object.entries(board.weeks[1].picks).map(([k,v])=>[k,Object.keys(v).length])))}`);
  console.log(`   all three agree with the board: ${ok ? 'YES' : 'NO'}\n`);
  return ok;
}

// And the other half: a device that has actually been touched IS authoritative
// about its own player, or nobody could ever undo a pick.
async function unpick() {
  let board = doc(JSON.parse(JSON.stringify(ALL)), 5000);
  const c=await b.newContext({...devices['iPhone 13']});
  await c.route('**kevinzoss.com/nfl/**', async route=>{
    const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
    if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
    try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
  });
  await c.route('**nfl.kevinzoss.com**',r=>r.abort());
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|fonts\.g/,r=>r.abort());
  await c.route('**script.google.com**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData()), owner = String(body.actor || '');
      const out = JSON.parse(JSON.stringify(board)), w = out.weeks[1], inW = body.state.weeks?.[1] || {};
      for (const [pid, by] of Object.entries(inW.picks || {})) {
        if (pid === owner) { w.picks[pid] = by; continue; }
        w.picks[pid] = w.picks[pid] || {};
        for (const [gid, side] of Object.entries(by || {})) if (w.picks[pid][gid] == null) w.picks[pid][gid] = side;
      }
      out.updatedAt = body.state.updatedAt; board = out;
      return route.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify({ ok:true, updatedAt: out.updatedAt, state: out, version:'merge-back-1' })});
    }
    return route.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ state: board, updatedAt: board.updatedAt, version:'merge-back-1' })});
  });
  await c.addInitScript(([s,me])=>{ localStorage.setItem('pickem:me',me); localStorage.setItem('pickem:2026',s); },
    [JSON.stringify(doc(JSON.parse(JSON.stringify(ALL)), 5000)), 'kz']);
  const p=await c.newPage(); await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(1400);
  const before = Object.keys(board.weeks[1].picks.kz).length;
  // tap Kevin's own existing pick to clear it
  await p.locator('[data-game="NO@TB"][data-side="home"]').click();
  await p.waitForTimeout(1600);
  const after = Object.keys(board.weeks[1].picks.kz).length;
  const others = Object.keys(board.weeks[1].picks.az).length;
  console.log('an intentional unpick:');
  console.log(`   Kevin's picks on the board  ${before} -> ${after} (want 2)`);
  console.log(`   Andrew's untouched          ${others} (want 2)`);
  await c.close();
  return after === 2 && others === 2;
}

const withFix = await run('server returns the merge (merge-back-1):', true);
const without = await run('server does NOT return it (old deploy):', false);
const undo = await unpick();
await b.close();
const ok = withFix && without && undo;
console.log(ok ? '\nconverged both ways, and an unpick still sticks' : '\nFAILED');
process.exit(ok ? 0 : 1);
