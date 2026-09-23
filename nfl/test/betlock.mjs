// The Browns record guesses close when the Browns first play, and closed means
// closed -- for the commissioner too. The override existed so a wrong guess
// could be fixed; the trouble is that the fix and the cheat are the same edit,
// and the man who can make it is the one running the pool.
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pin, WEEK1_MORNING } from './clock.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root='/home/user/kevinzoss.com/nfl';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const g=(a,h,sp,k,st='pre',as=null,hs=null)=>({id:`${a}@${h}`,away:a,home:h,spread:sp,status:st,awayScore:as,homeScore:hs,kickoff:k,espnId:'401'});
const board=(brownsGame)=>({v:1,season:2026,
  players:[{id:'az',name:'Andrew',short:'AZ',color:'#4CC9F0'},{id:'kz',name:'Kevin',short:'KZ',color:'#FF9F1C'},
           {id:'jv',name:'Jim',short:'JV',color:'#B388FF'},{id:'hz',name:'Howard',short:'HZ',color:'#A3E635'}],
  weeks:{1:{games:[g('NE','SEA',-3,'2026-09-10T00:20Z'), brownsGame],picks:{},lms:{},dupPrefs:{},brown:{},brownStats:{}}},
  sideBet:{predictions:{kz:{wins:5,losses:12,points:328},hz:{wins:3,losses:14,points:301}},actual:null},
  adjustments:[],updatedAt:1});

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
async function look(label, brownsGame, at) {
  const c=await b.newContext({...devices['iPhone 13']});
  await c.route('**kevinzoss.com/nfl/**', async route=>{
    const u=new URL(route.request().url()); let rel=u.pathname.replace(/^\/nfl\/?/,'')||'index.html';
    if (rel.endsWith('/')) rel+='index.html'; const f=path.join(root,rel);
    try{ await route.fulfill({status:200,contentType:T[path.extname(f)]||'text/plain',body:fs.readFileSync(f)});}catch{await route.fulfill({status:404,body:'no'});}
  });
  await c.route('**nfl.kevinzoss.com**',r=>r.abort());
  await c.route(/site\.api\.espn\.com|the-odds-api\.com|a\.espncdn\.com|script\.google\.com|fonts\.g/,r=>r.abort());
  await pin(c, at);
  // kz is the commissioner in config.js -- the whole point of the test
  await c.addInitScript(([s])=>{ localStorage.setItem('pickem:me','kz'); localStorage.setItem('pickem:2026',s); },[JSON.stringify(board(brownsGame))]);
  const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('https://kevinzoss.com/nfl/'); await p.waitForTimeout(900);
  await p.getByRole('button',{name:'Browns'}).last().click(); await p.waitForTimeout(500);

  const edits = await p.locator('[data-action="bet-edit"]').count();
  const note = (await p.locator('.actual__note').innerText()).replace(/\s+/g,' ').trim();
  const guesses = (await p.locator('.pred__big').allInnerTexts()).map(t=>t.split('\n')[0].trim()).join(' | ');
  console.log(`${label.padEnd(22)} edit buttons: ${edits}`);
  console.log(`${' '.repeat(22)} says: ${note.slice(0, 96)}`);
  console.log(`${' '.repeat(22)} guesses: ${guesses}`);

  // And as Howard, via the commissioner's "Pick as" -- the route that used to
  // let a guess be rewritten after the game.
  await p.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
  await p.waitForTimeout(300);
  await p.locator('[data-action="pick-as"]').first().click(); await p.waitForTimeout(300);
  await p.locator('[data-action="pick-as-set"][data-id="hz"]').click(); await p.waitForTimeout(400);
  await p.getByRole('button',{name:'Browns'}).last().click(); await p.waitForTimeout(500);
  console.log(`${' '.repeat(22)} picking as Howard, edit buttons: ${await p.locator('[data-action="bet-edit"]').count()}`);
  console.log(`${' '.repeat(22)} page errors: ${errs.length ? errs[0] : 'none'}`);
  await c.close();
}
const OPEN = g('CLE','BAL',-9,'2026-09-13T17:00Z');
const PLAYED = g('CLE','BAL',-9,'2026-09-13T17:00Z','post',13,41);
await look('before they play', OPEN, WEEK1_MORNING);
await look('after they played', PLAYED, Date.parse('2026-09-23T15:00:00Z'));
await b.close();
