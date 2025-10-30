// Serverless function: GET /api/news
import { fetchAllArticles, allowOrigin } from "./_utils.js";

export default async function handler(req, res) {
  try {
    allowOrigin(req, res);
    const sentiment = (req.query?.sentiment || req.query?.filter || "all").toLowerCase();
    const filterLabel = ["positive", "neutral", "negative"].includes(sentiment) ? sentiment : "all";
    const articles = await fetchAllArticles({ filterLabel });
    res.status(200).json({ updatedAt: Date.now(), articles });
  } catch {
    res.status(200).json({ updatedAt: Date.now(), articles: [] });
  }
}