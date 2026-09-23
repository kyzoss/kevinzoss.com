#!/bin/bash
# One gate. Everything must pass before Jim touches it.
cd /home/user/kevinzoss.com
SP=/home/user/kevinzoss.com/nfl/test
# Parse checks need a copy with a .mjs extension. It goes to a temp dir, never
# into the repo: writing it under nfl/test/ left the tree dirty after every run.
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
fails=0
line() { printf "%-34s %s\n" "$1" "$2"; }

echo "── static"
if python3 $SP/audit.py | tail -2 | grep -q "0 failed"; then
  line "stamp + cache audit" "PASS ($(python3 $SP/audit.py | grep checks | tr -s ' ' | cut -d' ' -f2) checks)"
else line "stamp + cache audit" "FAIL"; fails=$((fails+1)); fi

for f in nfl/js/*.js; do
  cp "$f" "$TMP/$(basename $f).mjs"
  node --check "$TMP/$(basename $f).mjs" >/dev/null 2>&1 || { line "parse $(basename $f)" "FAIL"; fails=$((fails+1)); }
done
cp nfl/sheet/Code.gs $TMP/Code.js
node --check $TMP/Code.js >/dev/null 2>&1 && line "parse all js + Code.gs" "PASS" || { line "parse all js + Code.gs" "FAIL"; fails=$((fails+1)); }
for j in vercel.json nfl/vercel.json nfl/manifest.webmanifest nfl/version.json nfl/recover-week1.json; do
  python3 -c "import json;json.load(open('$j'))" 2>/dev/null || { line "valid json $j" "FAIL"; fails=$((fails+1)); }
done
line "all json valid" "PASS"

echo
echo "── logic"
for t in suite feeds sync-test owned browns-feed; do
  out=$(timeout 90 node $SP/$t.mjs 2>&1 | grep -E "passed" | tail -1)
  case "$out" in
    *"0 failed"*) line "$t" "PASS — $out" ;;
    *) line "$t" "FAIL — ${out:-no output}"; fails=$((fails+1)) ;;
  esac
done

echo
echo "── rendering, real browser"
out=$(timeout 115 node $SP/smoke.mjs 2>&1 | tail -2 | tr '\n' ' ')
case "$out" in *"no page errors"*) line "every tab, both layouts" "PASS — $out" ;;
  *) line "every tab, both layouts" "FAIL — $out"; fails=$((fails+1)) ;; esac

out=$(timeout 115 node $SP/platforms.mjs 2>&1 | tail -3 | tr '\n' ' ')
case "$out" in *'homescreen  sees -> {"NE@SEA":"home"}'*) line "desktop→mobile→homescreen sync" "PASS" ;;
  *) line "desktop→mobile→homescreen sync" "FAIL — $out"; fails=$((fails+1)) ;; esac

out=$(timeout 115 node $SP/cutoff.mjs 2>&1)
n=$(echo "$out" | grep -c "SNF: LOCKED | 10am kick: LOCKED | Thu: LOCKED")
o=$(echo "$out" | grep -c "SNF: open  | 10am kick: open  | Thu: LOCKED")
if [ "$n" = "2" ] && [ "$o" = "4" ]; then line "Sunday 10am cutoff, 2 zones" "PASS"
else line "Sunday 10am cutoff, 2 zones" "FAIL (locked=$n open=$o)"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/resume.mjs 2>&1 | tail -2 | tr '\n' ' ')
case "$out" in *"loads: 1"*"loads: 2"*) line "reloads only on a new build" "PASS" ;;
  *) line "reloads only on a new build" "FAIL — $out"; fails=$((fails+1)) ;; esac

out=$(timeout 115 node $SP/redirect.mjs 2>&1 | tail -4 | tr '\n' ' ')
case "$out" in *"MOVED"*"stayed put"*) line "origin move only if verified" "PASS" ;;
  *) line "origin move only if verified" "FAIL — $out"; fails=$((fails+1)) ;; esac

out=$(timeout 115 node $SP/brown.mjs 2>&1)
if echo "$out" | grep -q "KZ Quinshon Judkins 23 points" \
  && echo "$out" | grep -q "picker groups: RB WR TE K" \
  && ! echo "$out" | grep -q "D. Watson" \
  && echo "$out" | grep -q "Q. Judkins GREYED + disabled" \
  && echo "$out" | grep -q "page errors: none"; then
  line "brown of the week, end to end" "PASS"
else line "brown of the week, end to end" "FAIL — $(echo "$out" | tail -3 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 190 node $SP/selfupdate.mjs 2>&1)
if echo "$out" | grep -q "self-updates, and never mid-choice"; then
  line "self-updates while left open" "PASS"
else line "self-updates while left open" "FAIL — $(echo "$out" | tail -3 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/converge.mjs 2>&1)
if echo "$out" | grep -q "converged both ways, and an unpick still sticks"; then
  line "three devices converge" "PASS"
else line "three devices converge" "FAIL — $(echo "$out" | tail -4 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/brown-live.mjs 2>&1)
if echo "$out" | grep -q "live badge: shown" \
  && echo "$out" | grep -q "after the TD     : 7 points · live | 18 points · live" \
  && echo "$out" | grep -q "saves added: 0 (want 0)" \
  && echo "$out" | grep -q "winner banner    : not yet, correct" \
  && echo "$out" | grep -q "page errors: none"; then
  line "brown points live in-game" "PASS"
else line "brown points live in-game" "FAIL — $(echo "$out" | tail -3 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/brown-final.mjs 2>&1)
if echo "$out" | grep -q "winner   : WINNER KZ Kevin Quinshon Judkins · 23 pts \$4" \
  && echo "$out" | grep -q "tied week: SPLIT AZ Andrew KC Concepcion · 23 pts \$2 KZ Kevin Quinshon Judkins · 23 pts \$2" \
  && echo "$out" | grep -q "Jerry Jeudy         45" \
  && echo "$out" | grep -q "rows listed: 7 of 7" \
  && echo "$out" | grep -q "QB row says: QB · 4 · NOT IN THE POOL" \
  && echo "$out" | grep -q "a draftable row says: RB · 10" \
  && echo "$out" | grep -q "table h-overflow inside its own scroller: none" \
  && echo "$out" | grep -q "page errors: none"; then
  line "winner named, every Brown listed" "PASS"
else line "winner named, every Brown listed" "FAIL — $(echo "$out" | tail -4 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/brown-after.mjs 2>&1)
if echo "$out" | grep -q "summary pulled on open : yes" \
  && echo "$out" | grep -q "rows                   : 17 points | 23 points | 12 points | 10 points" \
  && echo "$out" | grep -q "winner                 : WINNER KZ Kevin Quinshon Judkins · 23 pts \$4" \
  && echo "$out" | grep -q "re-reads a settled game: 0 (want 0)" \
  && echo "$out" | grep -q "what it tells the commish: passing\[1\]{somethingNew,alsoNew}" \
  && echo "$out" | grep -q "page errors: none"; then
  line "box score read after the game" "PASS"
else line "box score read after the game" "FAIL — $(echo "$out" | tail -4 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/betlock.mjs 2>&1)
if echo "$out" | grep -q "before they play       edit buttons: 1" \
  && echo "$out" | grep -q "after they played      edit buttons: 0" \
  && echo "$out" | grep -qc "picking as Howard, edit buttons: 0" \
  && echo "$out" | grep -q "nobody can change one now, the commissioner included" \
  && [ "$(echo "$out" | grep -c 'picking as Howard, edit buttons: 1')" = "1" ] \
  && [ "$(echo "$out" | grep -c 'picking as Howard, edit buttons: 0')" = "1" ] \
  && ! echo "$out" | grep -q "page errors: [^n]"; then
  line "record guesses seal at kickoff" "PASS"
else line "record guesses seal at kickoff" "FAIL — $(echo "$out" | tail -4 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/coldstart.mjs 2>&1)
if echo "$out" | grep -q 'sheet reachable .*rows:2 .*my picks:2 .*sync:"Synced"' \
  && echo "$out" | grep -q 'sheet reachable .*reports owned-merge-2; this app expects empty-is-missing-1' \
  && echo "$out" | grep -q 'sheet, no version .*reports no version at all; this app expects empty-is-missing-1' \
  && echo "$out" | grep -q 'sheet unreachable .*Can.t reach the shared board' \
  && echo "$out" | grep -q 'sheet unreachable .*old-script alarm:"none"'; then
  line "cold start / Home Screen case" "PASS"
else line "cold start / Home Screen case" "FAIL — $(echo "$out" | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/linelock.mjs 2>&1)
if echo "$out" | grep -q "lines are frozen from Wednesday night"; then
  line "lines frozen Wednesday night" "PASS"
else line "lines frozen Wednesday night" "FAIL — $(echo "$out" | tail -4 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/restore-dups.mjs 2>&1)
if echo "$out" | grep -q "Andrew TB, Kevin IND, Jim and Howard untouched"; then
  line "restore fills a wiped ranking" "PASS"
else line "restore fills a wiped ranking" "FAIL — $(echo "$out" | tail -3 | tr '\n' ' ')"; fails=$((fails+1)); fi

out=$(timeout 115 node $SP/dupranks.mjs 2>&1)
# Every assigned dup reads as the team with a D, in its own colour -- including
# Howard's, which the old provisional rule left as a bare number because Jim
# had not ranked.
if echo "$out" | grep -q 'SF\[D\]' \
  && echo "$out" | grep -q 'SF secured: ::after="D"' \
  && echo "$out" | grep -q 'TB dup win -> rgb(255, 197, 61)' \
  && echo "$out" | grep -q 'TEN     win -> rgb(53, 208, 127)' \
  && echo "$out" | grep -q 'tile: HZ  *1  2nd  4/4 picked Dup #4 · SF' \
  && echo "$out" | grep -q 'tile: KZ  *0  3rd' \
  && echo "$out" | grep -q 'tile: JV  *0  3rd' \
  && echo "$out" | grep -q 'dup bar: AZ TB  KZ IND  JV none  HZ SF' \
  && echo "$out" | grep -q "kz  *Dup #2 · IND is yours." \
  && echo "$out" | grep -q "jv  *Dup #3 · You haven't ranked a dup yet" \
  && echo "$out" | grep -q "ranked a taken dog)  *Dup #3 · You ranked TB, but Andrew has it" \
  && ! echo "$out" | grep -q 'provisional'; then
  line "dup D + gold, wins green" "PASS"
else line "dup D + gold, wins green" "FAIL — $(echo "$out" | sed -n '3,8p' | tr '\n' ' ')"; fails=$((fails+1)); fi

echo
if [ $fails -eq 0 ]; then echo "ALL GREEN — safe for Jim"; else echo "$fails FAILURE(S)"; fi
exit $fails
