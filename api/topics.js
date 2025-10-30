// Serverless function: GET /api/topics
import { fetchAllArticles, aggregateTopics, allowOrigin } from "./_utils.js";

export default async function handler(req, res) {
  try {
    allowOrigin(req, res);
    const articles = await fetchAllArticles({ filterLabel: "all" });
    const topics = aggregateTopics(articles);
    res.status(200).json({ updatedAt: Date.now(), topics });
  } catch {
    res.status(200).json({ updatedAt: Date.now(), topics: [] });
  }
}