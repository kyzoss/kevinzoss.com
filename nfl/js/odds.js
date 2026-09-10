// Point spreads from The Odds API (the-odds-api.com). One request per pull, so the
// commissioner's free quota (500/month) lasts the season with room to spare.
import { abbrFromFull } from "./teams.js?v=f4adc5f9";

const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";

/**
 * Returns [{ home, away, commence, spread (home-relative), book }] for every game
 * the API currently lists (upcoming games; usually the next ~10 days).
 */
export async function fetchSpreads(apiKey, preferredBooks = []) {
  if (!apiKey) throw new Error("No Odds API key in config.js");
  const url = `${BASE}/?apiKey=${encodeURIComponent(apiKey)}&regions=us&markets=spreads&oddsFormat=american&dateFormat=iso`;
  const res = await fetch(url);
  if (res.status === 401) throw new Error("Odds API rejected the key");
  if (res.status === 429) throw new Error("Odds API quota exhausted for this month");
  if (!res.ok) throw new Error(`Odds API responded ${res.status}`);
  const remaining = res.headers.get("x-requests-remaining");
  const data = await res.json();
  const games = (Array.isArray(data) ? data : []).map((g) => normalise(g, preferredBooks)).filter(Boolean);
  return { games, remaining: remaining != null ? Number(remaining) : null };
}

function normalise(g, preferredBooks) {
  const home = abbrFromFull(g.home_team);
  const away = abbrFromFull(g.away_team);
  if (!home || !away) return null;
  const books = g.bookmakers || [];
  const ordered = [
    ...preferredBooks.map((k) => books.find((b) => b.key === k)).filter(Boolean),
    ...books.filter((b) => !preferredBooks.includes(b.key)),
  ];
  for (const b of ordered) {
    const market = (b.markets || []).find((m) => m.key === "spreads");
    const homeOut = market?.outcomes?.find((o) => abbrFromFull(o.name) === home);
    if (homeOut && typeof homeOut.point === "number") {
      return { home, away, commence: g.commence_time, spread: homeOut.point, book: b.title || b.key };
    }
  }
  return { home, away, commence: g.commence_time, spread: null, book: null };
}
