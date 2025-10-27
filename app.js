// ===== Basic state + helpers =====
const state = {
  articles: [],
  topics: [],
  quotes: []
};

const API = ""; // same-origin on Vercel: "", so /api/... works

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "accept": "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

function fmtDate(d=new Date()) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

// ====== STARTUP ======
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("briefingDate").textContent = fmtDate(new Date());

  // Load everything now
  loadAll();

  // Refresh cadence
  setInterval(loadMarkets, 5 * 60 * 1000);   // markets every 5m
  setInterval(loadNewsAndTopics, 5 * 60 * 1000); // news/topics every 5m
});

// ====== Markets ======
async function loadMarkets() {
  try {
    const data = await fetchJSON(`${API}/api/markets`);
    state.quotes = data.quotes || [];
    renderMarkets();
  } catch (e) {
    // mute
  }
}

function renderMarkets() {
  const box = document.getElementById("marketTicker");
  if (!box) return;
  box.innerHTML = "";

  const mk = (label, price, chgPct) => {
    const up = Number(chgPct || 0) >= 0;
    const pct = (chgPct == null) ? "—" : `${(chgPct*100 ? chgPct : chgPct).toFixed ? chgPct.toFixed(2) : Number(chgPct).toFixed(2)}%`;
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span class="name">${label}</span>
      <span class="price">${price ?? "—"}</span>
      <span class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${pct}</span>
    `;
    return chip;
  };

  const wanted = {
    "BSE Sensex": null,
    "NSE Nifty": null,
    "Gold": null
  };

  (state.quotes || []).forEach(q => { wanted[q.pretty] = q; });

  const order = ["BSE Sensex","NSE Nifty","Gold"];
  order.forEach(name => {
    const q = wanted[name] || {};
    box.appendChild(mk(name, q.price, q.changePercent));
  });
}

// ====== News + Topics ======
async function loadNewsAndTopics() {
  try {
    const [news, topics] = await Promise.all([
      fetchJSON(`${API}/api/news`),
      fetchJSON(`${API}/api/topics`)
    ]);
    state.articles = news.articles || [];
    state.topics = topics.topics || [];
    renderNationMood();
    renderNews();
    renderTopics();
  } catch (e) {
    // mute
  }
}

// ====== Nation's Mood pill ======
function renderNationMood() {
  const box = document.getElementById("nationMood");
  if (!box) return;

  const arts = Array.isArray(state.articles) ? state.articles : [];
  if (!arts.length) { box.innerHTML = ""; return; }

  let pos = 0, neu = 0, neg = 0;
  for (const a of arts) {
    const lbl = a?.sentiment?.label || "neutral";
    if (lbl === "positive") pos++;
    else if (lbl === "negative") neg++;
    else neu++;
  }
  const total = Math.max(1, arts.length);
  const pP = Math.round((pos/total)*100);
  const nP = Math.round((neu/total)*100);
  const gP = Math.round((neg/total)*100);

  box.innerHTML = `
    <div class="mood-pill-inner">
      <span class="mood-title">Nation’s Mood —</span>
      <span class="mchip pos">Positive ${pP}%</span>
      <span class="mchip neu">Neutral ${nP}%</span>
      <span class="mchip neg">Negative ${gP}%</span>
    </div>
  `;
}

// ====== News cards ======
function renderNews() {
  const list = document.getElementById("newsList");
  if (!list) return;
  list.innerHTML = "";

  const items = state.articles.slice(0, 12);
  for (const a of items) {
    const div = document.createElement("article");
    div.className = "card";
    div.innerHTML = `
      <img src="${a.image || "https://placehold.co/800x450?text=Informed360"}" alt="">
      <div class="meta">
        <div class="src">${a.source || ""}</div>
        <h4 class="title"><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></h4>
      </div>
    `;
    list.appendChild(div);
  }
}

// ====== Topics rail ======
function renderTopics() {
  const box = document.getElementById("topicsList");
  if (!box) return;
  box.innerHTML = "";

  const items = (state.topics || []).slice(0, 10);
  for (const t of items) {
    const el = document.createElement("div");
    el.className = "topic";
    const pos = (t.sentiment?.pos ?? 0).toFixed ? t.sentiment.pos.toFixed(2) : t.sentiment.pos;
    const neg = (t.sentiment?.neg ?? 0).toFixed ? t.sentiment.neg.toFixed(2) : t.sentiment.neg;
    const neu = (t.sentiment?.neu ?? 0).toFixed ? t.sentiment.neu.toFixed(2) : t.sentiment.neu;
    el.innerHTML = `
      <div class="tline">${t.title}</div>
      <div class="tsub">${t.count} articles • ${t.sources} sources</div>
    `;
    box.appendChild(el);
  }
}

// ====== Weather placeholder (optional) ======
function renderWeather() {
  const card = document.getElementById("weatherCard");
  if (!card) return;
  // Simple placeholder (replace with real API if you have one)
  card.innerHTML = `
    <div style="font-weight:800;margin-bottom:6px;">Your area</div>
    <div style="font-size:28px;font-weight:800;">21°C</div>
  `;
}

// ====== Combined loader ======
async function loadAll() {
  renderWeather();
  await Promise.all([loadMarkets(), loadNewsAndTopics()]);
}
