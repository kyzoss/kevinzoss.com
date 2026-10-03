# Mesa (family games)

Mesa means table, short for sobremesa: the time a family lingers at the
table after a meal. The app
started as Pictionary and is now a hub of screen-light family games:
Pictionary, Napkin Pictionary, Charades, Quiz Quest, Story Spinner and I Spy
Bingo. Its home is games.kevinzoss.com; pictionary.kevinzoss.com serves the same
app (Vercel project `pictionary`, this folder). Each needs a Cloudflare
CNAME to cname.vercel-dns.com, DNS only.

Pass-the-phone Pictionary for kids 4 to 10 (and the grown-ups playing with
them). The phone is the board: put it on the table, the artist draws with a
finger, everyone shouts guesses. Static app, no build step, works offline once
loaded (service worker), installable from Share > Add to Home Screen.

Live at https://pictionary.kevinzoss.com (Vercel project `pictionary`, root
directory `pictionary/`, same pattern as `nfl/`). DNS: Cloudflare CNAME
`pictionary` -> `cname.vercel-dns.com`, DNS only (grey cloud).

## What's in it

- **Per-player ages** (4-5, 6-7, 8-10, grown-up). Each drawer gets words and a
  timer sized to them, so a mixed family shares one game.
- **Picture cards.** Every word has an emoji so pre-readers can play; 🔈 reads
  it quietly. Pick one of two cards, two swaps per turn.
- **17 categories**, ~450 words, levelled 1-3 (`js/words.js`).
- **Timer** (slow / normal / speedy / none) with a racing-animal bar, ticking
  last 10 seconds, and hints (letter blanks, then the first letter).
- **Board tools:** 10 colours + rainbow, 3 sizes, paint bucket, eraser, undo
  (clear is undoable too), palm-safe single-finger drawing, rotation-safe.
- **Star Race** (guesser and artist each get a star) or **Team Family**
  (fill the rainbow together; family record kept). Everyone gets an award at
  the end, so nobody leaves in tears.
- **Time-lapse replay** of each drawing at the reveal, and an **Art Show**
  gallery (last 40 drawings, on the device) with save/share.
- **Character Studio** (`js/characters.js`): build a character from parts
  (shape, colour, pattern, eyes, mouth, top, arms, extra), name it, use it as
  a player avatar, stamp it in Free Draw next to emoji stickers, and play the
  **Character Adventures** category: your character starts on the page and
  you draw what it's doing.
- Keeps the screen awake, resumes a game after an accidental refresh, sound
  and speech can be muted.

All data lives in the browser's localStorage. Nothing is sent anywhere.

When changing JS/CSS, bump the `?v=` query in `index.html` and `VERSION` (plus
the list) in `sw.js` so installed copies pick up the new files.
