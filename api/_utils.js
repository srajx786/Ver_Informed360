// api/_utils.js
import Parser from "rss-parser";
import vader from "vader-sentiment";
import feedsConfig from "../rss-feeds.json" assert { type: "json" };

export function allowOrigin(req, res) {
  // Loosened to avoid accidental blocks; tighten later if you want.
  const o = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", o || "*");
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Informed360Bot/1.0 (+https://informed360.news)",
    "Accept": "application/rss+xml, application/xml;q=0.9,*/*;q=0.8"
  }
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const domainFromUrl = (u="") => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } };
const clean = s => String(s || "").replace(/\s+/g, " ").trim();

function scoreSentiment(text="") {
  const s = vader.SentimentIntensityAnalyzer.polarity_scores(text);
  const posP = Math.round((s.pos || 0) * 100);
  const negP = Math.round((s.neg || 0) * 100);
  const neuP = Math.max(0, 100 - posP - negP);
  const label = s.compound >= 0.05 ? "positive" : (s.compound <= -0.05 ? "negative" : "neutral");
  return { ...s, posP, negP, neuP, label };
}

function extractImage(item = {}) {
  const c = item.content || item["content:encoded"];
  const tryFields = [item.enclosure?.url, item.media?.content?.url, item.image?.url];
  for (const url of tryFields) if (url && typeof url === "string") return url;
  if (typeof c === "string") {
    const m = c.match(/<img[^>]+src="([^"]+)"/i);
    if (m) return m[1];
  }
  return "https://placehold.co/800x450?text=Informed360";
}

export function loadFeeds() {
  // Your rss-feeds.json structure: { feeds:[...], experimental:[...], ... }
  return Array.isArray(feedsConfig.feeds) ? feedsConfig.feeds : [];
}

const CAT_RULES = [
  { name: "business", rx: /\b(stock|market|ipo|revenue|profit|loss|merger|acquisition|company|share|sector)\b/i },
  { name: "sports",   rx: /\b(cricket|football|ipl|t20|fifa|match|score|tournament)\b/i },
  { name: "tech",     rx: /\b(tech|ai|software|app|android|iphone|apple|google|microsoft|chip|semiconductor)\b/i },
  { name: "politics", rx: /\b(minister|election|policy|parliament|bill|government)\b/i },
  { name: "world",    rx: /\b(world|us|china|russia|global|international)\b/i }
];
function guessCategory(title="") {
  for (const r of CAT_RULES) if (r.rx.test(title)) return r.name;
  return "general";
}

export async function fetchAllArticles({ filterLabel = "all" } = {}) {
  const feeds = loadFeeds();
  const articles = [];

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of (feed.items || []).slice(0, 15)) {
        const title = clean(item.title);
        const link = item.link || "";
        const image = extractImage(item);
        const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
        const source = domainFromUrl(url) || (feed.title || "Source");
        const s = scoreSentiment(title);
        const row = {
          title, link, image, publishedAt, source,
          sentiment: s,
          category: guessCategory(title)
        };
        if (filterLabel === "all" || row.sentiment.label === filterLabel) {
          articles.push(row);
        }
      }
      // tiny jitter to be polite to hosts
      await sleep(30);
    } catch {
      // ignore broken feed and continue
    }
  }

  // de-dup by URL (without querystrings)
  const seen = new Set(); const out = [];
  for (const a of articles) {
    const key = (a.link || "").split("?")[0];
    if (!seen.has(key)) { seen.add(key); out.push(a); }
  }
  out.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return out.slice(0, 80);
}

export function aggregateTopics(articles = []) {
  const freq = new Map(); const buckets = new Map(); const sentSum = new Map();

  articles.forEach((a, i) => {
    const words = a.title.split(/[^A-Za-z0-9]+/g).filter(w => w.length > 3).slice(0, 8);
    words.forEach(w => {
      const key = w.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 1);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i);
      const agg = sentSum.get(key) || { pos:0, neu:0, neg:0 };
      sentSum.set(key, { pos: agg.pos + a.sentiment.posP, neu: agg.neu + a.sentiment.neuP, neg: agg.neg + a.sentiment.negP });
    });
  });

  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 16);
  return top.map(([word, count]) => {
    const idxs = buckets.get(word) || [];
    const srcs = new Set(idxs.map(i => articles[i].source));
    return {
      title: word.toUpperCase(),
      count,
      sources: srcs.size,
      sentiment: sentSum.get(word) || {pos:0, neu:0, neg:0},
      sample: idxs.slice(0,3).map(i => articles[i])
    };
  });
}
