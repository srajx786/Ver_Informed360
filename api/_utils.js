// Shared helpers for API routes
import Parser from "rss-parser";
import vader from "vader-sentiment";
import fs from "fs";
import path from "path";

const FEEDS_PATH = path.join(process.cwd(), "rss-feeds.json");

export function allowOrigin(_req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "Informed360Bot/1.0 (+https://informed360)",
    "Accept": "application/rss+xml, application/xml;q=0.9,*/*;q=0.8"
  }
});

function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
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
  const tryFields = [item.enclosure?.url, item.media?.content?.url, item.image?.url];
  for (const url of tryFields) if (url && typeof url === "string") return url;
  if (typeof c === "string") {
    const m = c.match(/<img[^>]+src="([^"]+)"/i);
    if (m) return m[1];
  }
  return "https://placehold.co/800x450?text=Informed360";
}

export async function fetchAllArticles({ filterLabel = "all" } = {}) {
  const feeds = JSON.parse(fs.readFileSync(FEEDS_PATH, "utf-8"));
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
        const sentiment = scoreSentiment(title);
        const category = f.category || "general";
        const row = { title, link, image, publishedAt, source, sentiment, category };
        if (filterLabel === "all" || row.sentiment.label === filterLabel) {
          articles.push(row);
        }
      }
    } catch {
      // ignore a failing feed; keep going
    }
  }

  // Stable ordering
  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return articles;
}

export function aggregateTopics(articles = []) {
  const freq = new Map();
  const buckets = new Map();
  const sentSum = new Map();

  const addWord = (w, i, s) => {
    const key = w.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(i);
    const agg = sentSum.get(key) || { pos: 0, neu: 0, neg: 0 };
    agg.pos += s.posP; agg.neu += s.neuP; agg.neg += s.negP;
    sentSum.set(key, agg);
  };

  articles.forEach((a, i) => {
    const words = a.title.split(/[^A-Za-z0-9]+/g).filter(w => w.length > 3);
    words.slice(0, 8).forEach(w => addWord(w, i, a.sentiment));
  });

  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
  const topics = top.map(([word, count]) => {
    const idxs = buckets.get(word) || [];
    const srcs = new Set(idxs.map(i => articles[i].source));
    return {
      title: word.toUpperCase(),
      count,
      sources: srcs.size,
      sentiment: sentSum.get(word) || { pos: 0, neu: 0, neg: 0 },
      sample: idxs.slice(0, 3).map(i => articles[i])
    };
  });

  return topics;
}