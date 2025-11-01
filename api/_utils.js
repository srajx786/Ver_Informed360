// Shared helpers for API routes — no fs, import the feeds JSON so Vercel bundles it
import Parser from "rss-parser";
import vader from "vader-sentiment";
import feeds from "../rss-feeds.json" assert { type: "json" }; // <-- bundled automatically

export function allowOrigin(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Informed360Bot/1.0 (+https://informed360.news)",
    "Accept": "application/rss+xml, application/xml;q=0.9,*/*;q=0.8"
  }
});

function clean(s = "") {
  return String(s).replace(/\s+/g, " ").trim();
}

function scoreSentiment(text = "") {
  const s = vader.SentimentIntensityAnalyzer.polarity_scores(text || "");
  const posP = Math.max(0, Math.round(s.pos * 100));
  const negP = Math.max(0, Math.round(s.neg * 100));
  const neuP = Math.max(0, Math.round(s.neu * 100));
  const label = posP > negP ? "positive" : (negP > posP ? "negative" : "neutral");
  return { ...s, posP, negP, neuP, label };
}

function extractImage(item = {}) {
  const c = item.content || item["content:encoded"];
  const tries = [item.enclosure?.url, item.media?.content?.url, item.image?.url];
  for (const u of tries) if (u && typeof u === "string") return u;
  if (typeof c === "string") {
    const m = c.match(/<img[^>]+src="([^"]+)"/i);
    if (m) return m[1];
  }
  return "https://placehold.co/800x450?text=Informed360";
}

export async function fetchAllArticles({ filterLabel = "all" } = {}) {
  const articles = [];

  for (const f of feeds) {
    try {
      const feed = await parser.parseURL(f.url);
      for (const item of feed.items.slice(0, 15)) {
        const title = clean(item.title || "");
        const link = item.link || "";
        const image = extractImage(item);
        const publishedAt = item.isoDate || item.pubDate || new Date().toISOString();
        const source = f.name || feed.title || "Source";
        const category = f.category || "general";
        const sentiment = scoreSentiment(title);
        const row = { title, link, image, publishedAt, source, sentiment, category };
        if (filterLabel === "all" || row.sentiment.label === filterLabel) articles.push(row);
      }
    } catch {
      // skip failing feed
    }
  }

  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return articles;
}

export function aggregateTopics(articles = []) {
  const freq = new Map();
  const bucket = new Map();
  const sent = new Map();

  articles.forEach((a, idx) => {
    const words = a.title.split(/[^A-Za-z0-9]+/g).filter(w => w.length > 3).slice(0, 8);
    words.forEach(w => {
      const key = w.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 1);
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key).push(idx);
      const agg = sent.get(key) || { pos: 0, neu: 0, neg: 0 };
      sent.set(key, { pos: agg.pos + a.sentiment.posP, neu: agg.neu + a.sentiment.neuP, neg: agg.neg + a.sentiment.negP });
    });
  });

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([word, count]) => {
      const idxs = bucket.get(word) || [];
      const srcs = new Set(idxs.map(i => articles[i].source));
      return {
        title: word.toUpperCase(),
        count,
        sources: srcs.size,
        sentiment: sent.get(word) || { pos: 0, neu: 0, neg: 0 },
        sample: idxs.slice(0, 3).map(i => articles[i])
      };
    });
}