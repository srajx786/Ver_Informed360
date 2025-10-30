// Serverless function: GET /api/markets
// Returns live quotes for BSE, NSE, Gold, Oil, and USD/INR.

let yfLoaded = null;
async function loadYF() {
  if (yfLoaded) return yfLoaded;
  try {
    const mod = await import("yahoo-finance2");
    yfLoaded = mod?.default || mod;
    return yfLoaded;
  } catch {
    return null;
  }
}

export default async function handler(_req, res) {
  try {
    const yf = await loadYF();
    const symbols = [
      { s: "^BSESN",   pretty: "BSE Sensex" },
      { s: "^NSEI",    pretty: "NSE Nifty" },
      { s: "GC=F",     pretty: "Gold" },
      { s: "CL=F",     pretty: "Crude Oil" },
      { s: "USDINR=X", pretty: "USD/INR" }
    ];

    // If the yahoo-finance lib didn't load (cold start or install issue), send placeholders
    if (!yf) {
      return res.status(200).json({
        updatedAt: Date.now(),
        quotes: symbols.map(x => ({
          symbol: x.s, pretty: x.pretty, price: null, change: null, changePercent: null
        }))
      });
    }

    const q = await yf.quote(symbols.map(x => x.s));
    const quotes = q.map((row, i) => ({
      symbol: row.symbol,
      pretty: symbols[i].pretty,
      price: row.regularMarketPrice,
      change: row.regularMarketChange,
      changePercent: row.regularMarketChangePercent
    }));

    res.status(200).json({ updatedAt: Date.now(), quotes });
  } catch (e) {
    // Never fail the page render—return an empty set
    res.status(200).json({ updatedAt: Date.now(), quotes: [] });
  }
}
