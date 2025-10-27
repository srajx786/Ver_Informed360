// api/_utils.js
import Parser from "rss-parser";
import vader from "vader-sentiment";
import fs from "fs";
import path from "path";

const FEEDS_PATH = path.join(process.cwd(), "rss-feeds.json");

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Informed360Bot/1.0 (+https://informed360)",
    "Accept": "application/rss+xml, application/xml;q=0.9,*/*;q=0.8"
  }
});

export function allowOrigin(req, res) {
  const allowed = [
    "https://yourdomain.com",
    "https://news.yourdomain.com",
    "https://staging.yourdomain.com",
    "https://informed360.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173"
  ];
  const o = req.headers.origin;
  if (!o || allowed.includes(o)) res.setHeader("Access-Control-Allow-Origin", o || "*");
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const domainFromUrl = (u="") => { try { return new URL(u).hostname.replace(/^www\./,""); } catch { return ""; } };

export function loadFeeds() {
  try {
    const raw = fs.readFileSync(FEEDS_PATH, "utf-8");
    const json = JSON.parse(raw);
    return Array.isArray(json.feeds) ? json.feeds : [];
  } catch { return []; }
}

export function scoreSentiment(text="") {
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

export async function fetchAllArticles({ filterLabel = "all" } = {}) {
  const feeds = loadFeeds();
  const articles = [];
  for (const url of feeds) {
    try {
      await sleep(120);
      const feed = await parser.parseURL(url);
      const src = domainFromUrl(url);
      for (const item of (feed.items || [])) {
        const title = item.title || "";
        const link = item.link || item.guid || "";
        if (!title || !link) continue;
        const s = scoreSentiment(title + " " + (item.contentSnippet || ""));
        if (filterLabel !== "all" && s.label !== filterLabel) continue;
        articles.push({
          title,
          link,
          source: src || domainFromUrl(link) || "source",
          image: extractImage(item),
          publishedAt: new Date(item.isoDate || item.pubDate || Date.now()).toISOString(),
          sentiment: s,
          category: guessCategory(title)
        });
      }
    } catch {
      // ignore broken feed and continue
    }
  }
  const seen = new Set();
  const out = [];
  for (const a of articles) {
    const key = (a.link || "").split("?")[0];
    if (!seen.has(key)) { seen.add(key); out.push(a); }
  }
  out.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return out.slice(0, 80);
}

const CAT_RULES = [
  { name: "business", rx: /\b(stock|market|ipo|revenue|profit|loss|merger|acquisition|company|share|sector)\b/i },
  { name: "sports",   rx: /\b(cricket|football|ipl|t20|fifa|match|score|tournament)\b/i },
  { name: "tech",     rx: /\b(tech|ai|software|app|android|iphone|apple|google|microsoft|chip|semiconductor)\b/i },
  { name: "politics", rx: /\b(minister|election|policy|parliament|bill|government)\b/i },
  { name: "world",    rx: /\b(world|us|china|russia|global|international)\b/i },
];

function guessCategory(title="") {
  for (const r of CAT_RULES) if (r.rx.test(title)) return r.name;
  return "general";
}

export function aggregateTopics(articles = []) {
  const stop = new Set("the a an and or for with from to of in on at by as is are was were will would should could".split(" "));
  const freq = new Map();
  const buckets = new Map();
  const sentSum = new Map();

  articles.forEach((a, idx) => {
    const words = (a.title || "").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w && !stop.has(w) && w.length > 2);
    const seenLocal = new Set();
    words.forEach(w => {
      if (seenLocal.has(w)) return;
      seenLocal.add(w);
      freq.set(w, (freq.get(w) || 0) + 1);
      (buckets.get(w) || (buckets.set(w, []), buckets.get(w))).push(idx);
      const cur = sentSum.get(w) || { pos: 0, neu: 0, neg: 0 };
      sentSum.set(w, {
        pos: cur.pos + (a.sentiment?.pos || 0),
        neu: cur.neu + (a.sentiment?.neu || 0),
        neg: cur.neg + (a.sentiment?.neg || 0),
      });
    });
  });

  const top = [...freq.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 16);
  const topics = top.map(([word, count]) => {
    const idxs = buckets.get(word) || [];
    const srcs = new Set(idxs.map(i => articles[i].source));
    return {
      title: word.toUpperCase(),
      count,
      sources: srcs.size,
      sentiment: sentSum.get(word) || {pos:0,neu:0,neg:0},
      sample: idxs.slice(0,3).map(i => articles[i])
    };
  });
  return topics;
}
