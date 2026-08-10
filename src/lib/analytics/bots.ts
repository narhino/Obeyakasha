/**
 * Telling automated traffic from people (A21).
 *
 * WHY THIS EXISTS: the analytics dashboard reported 63,000 "unique visitors" in
 * two days against ~66,000 views — roughly one view each, a median of nine
 * seconds, and almost no referrers. People don't browse like that; automation
 * does. The numbers weren't wrong so much as meaningless, and a dashboard she
 * can't trust is worse than no dashboard, because she'd make decisions on it.
 *
 * A view is only recorded when something POSTs `/api/track`, which anything can
 * do — it needs no browser and no JavaScript. So the filter has to happen here.
 *
 * This is deliberately about HONEST MEASUREMENT, not defence. It does not stop
 * anyone: a crawler that presents a normal browser user-agent still gets a page,
 * and should. Blocking belongs at Cloudflare, where the traffic actually is.
 */

/** Substrings that appear in self-identifying crawlers and tools. */
const CRAWLER_TOKENS = [
  "bot",
  "crawler",
  "spider",
  "scrap",
  "curl/",
  "wget",
  "python-requests",
  "python-urllib",
  "httpx",
  "aiohttp",
  "axios/",
  "go-http-client",
  "java/",
  "okhttp",
  "libwww",
  "postmanruntime",
  "insomnia",
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  "lighthouse",
  "pingdom",
  "uptimerobot",
  "gtmetrix",
  "ahrefs",
  "semrush",
  "mj12",
  "dotbot",
  "petalbot",
  "bytespider",
  "gptbot",
  "ccbot",
  "claudebot",
  "perplexitybot",
  "amazonbot",
  "applebot",
  "facebookexternalhit",
  "slurp",
  "duckduckgo",
  "yandex",
  "baiduspider",
  "archive.org_bot",
  "feedfetcher",
  "preview",
];

/**
 * Whether this user-agent should be left out of her numbers.
 *
 * Errs toward EXCLUDING when the agent is absent or implausible: a real browser
 * always sends a long, structured user-agent, so a missing or two-word one is
 * not a person whose visit she should be counting.
 */
export function looksAutomated(ua: string | null): boolean {
  if (!ua) return true;
  const s = ua.trim().toLowerCase();
  if (s.length < 20) return true;
  // Every real browser UA starts with a Mozilla/5.0 token; almost nothing else
  // bothers. Not proof on its own, which is why the token list runs too.
  if (!s.startsWith("mozilla/")) return true;
  return CRAWLER_TOKENS.some((t) => s.includes(t));
}
