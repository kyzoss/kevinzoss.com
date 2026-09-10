import fs from 'node:fs';
// Load Code.gs as plain script and exercise the merge directly.
const src = fs.readFileSync('/home/user/kevinzoss.com/nfl/sheet/Code.gs', 'utf8');
const box = {};
new Function('globalThis', src + '\nglobalThis.__m = mergeState_; globalThis.__v = SCRIPT_VERSION;')(box);
const merge = box.__m;
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`  FAIL ${name}\n    got  ${g}\n    want ${w}`); }
};
console.log('script version:', box.__v);

const wk = (picks, lms = {}, prefs = {}) => ({
  v:1, season:2026, players:[{id:'kz'},{id:'az'},{id:'jv'},{id:'hz'}],
  weeks:{1:{games:[{id:'A@B'},{id:'C@D'}], picks, lms, dupPrefs: prefs}},
  sideBet:{predictions:{},actual:null}, adjustments:[],
});

// the actual regression: Howard has six, a device that only knows about one saves
const stored = wk({ hz: {g1:'home',g2:'away',g3:'home',g4:'away',g5:'home',g6:'away'}, kz:{g1:'home'} });
const thin  = wk({ hz: {g7:'home'}, kz:{g1:'home',g2:'home'} });
eq("another player's picks are never narrowed",
   merge(stored, thin, 'kz').weeks[1].picks.hz,
   {g1:'home',g2:'away',g3:'home',g4:'away',g5:'home',g6:'away',g7:'home'});
eq("the saver's own picks are replaced, so an unpick works",
   merge(stored, wk({ kz:{g2:'away'} }), 'kz').weeks[1].picks.kz, {g2:'away'});
eq("and everyone else is untouched by that save",
   merge(stored, wk({ kz:{g2:'away'} }), 'kz').weeks[1].picks.hz,
   {g1:'home',g2:'away',g3:'home',g4:'away',g5:'home',g6:'away'});
eq("a save with no actor can only add",
   merge(stored, wk({ kz:{} }), '').weeks[1].picks.kz, {g1:'home'});
eq("a conflicting pick for someone else keeps the stored one",
   merge(stored, wk({ hz:{g1:'away'} }), 'kz').weeks[1].picks.hz.g1, 'home');
eq("your own conflicting pick wins",
   merge(stored, wk({ kz:{g1:'away'} }), 'kz').weeks[1].picks.kz.g1, 'away');
// LMS and dup lists are whole values, not per-game maps
const s2 = wk({}, { hz:'CLE', kz:'TB' }, { hz:['TB','IND'], kz:['IND'] });
eq("your own LMS change goes through", merge(s2, wk({}, { kz:'NYJ' }, {}), 'kz').weeks[1].lms.kz, 'NYJ');
eq("someone else's LMS is not cleared", merge(s2, wk({}, {}, {}), 'kz').weeks[1].lms.hz, 'CLE');
eq("someone else's dup ranking survives", merge(s2, wk({}, {}, { kz:['TB'] }), 'kz').weeks[1].dupPrefs.hz, ['TB','IND']);
eq("your own dup ranking is replaced", merge(s2, wk({}, {}, { kz:['TB'] }), 'kz').weeks[1].dupPrefs.kz, ['TB']);
// brown of the week is per-player data and gets the same protection
const s4 = wk({}, {}, {});
s4.weeks[1].brown = { hz: 'chubb', kz: 'flacco' };
s4.weeks[1].brownStats = { chubb: { rushTD: 1 } };
const thin4 = wk({}, {}, {});
thin4.weeks[1].brown = { kz: 'cooper' };
eq("your own brown pick can change",
   merge(s4, thin4, 'kz').weeks[1].brown.kz, 'cooper');
eq("someone else's brown pick survives a save that omits it",
   merge(s4, thin4, 'kz').weeks[1].brown.hz, 'chubb');
eq("nobody can overwrite another player's brown",
   merge(s4, (() => { const d = wk({}, {}, {}); d.weeks[1].brown = { hz: 'njoku' }; return d; })(), 'kz').weeks[1].brown.hz,
   'chubb');
eq("a blank save cannot erase the box score",
   Object.keys(merge(s4, wk({}, {}, {}), 'kz').weeks[1].brownStats), ['chubb']);
eq("the roster is not cleared by a device that lacks it",
   (() => { const st = wk({ kz: { g1: 'home' } }); st.brownsRoster = [{ id: '1' }];
            return merge(st, wk({}), 'kz').brownsRoster.length; })(), 1);

// a blank device still cannot touch the table-level values
const s3 = wk({ kz:{g1:'home'} }); s3.sideBet.actual = {w:5,l:12};
eq("a device with no player data cannot clear the record",
   merge(s3, wk({}), '').sideBet.actual, {w:5,l:12});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
