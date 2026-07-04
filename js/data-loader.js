/**
 * 数据加载器
 * 异步拉取今日事件 + 历史快照，合并去重
 */

const { DATA_URL, HISTORY_URL, isHighlightEvent } = window;

// ── 加载单个 JSON ────────────────────────────────────
async function loadJSON(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn(`⚠ 数据加载失败: ${url} — ${err.message}`);
    return null;
  }
}

// ── 加载今天的数据 ───────────────────────────────────
export async function loadTodayEvents() {
  const data = await loadJSON(DATA_URL);
  if (!data || !data.events) return [];

  // 注入 _visible 和 _date 字段
  const date = data.date || "";
  data.events.forEach(e => { e._visible = true; e._date = date; });
  return data.events;
}

// ── 生成过去 N 天的日期列表 ──────────────────────────
function getPastDays(days) {
  const result = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    result.push(`${yyyy}${mm}${dd}`);
  }
  return result;
}

// ── 加载多日历史 ─────────────────────────────────────
export async function loadHistoryEvents(days = 7) {
  const dateList = getPastDays(days);
  const promises = dateList.map(dateStr => loadJSON(HISTORY_URL(dateStr)));
  const results = await Promise.all(promises);

  const allEvents = [];
  const seen = new Set();

  for (let i = 0; i < results.length; i++) {
    const data = results[i];
    if (!data || !data.events) continue;
    const evtDate = data.date || dateList[i];
    for (const event of data.events) {
      // 按 id 去重
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      event._visible = true;
      event._date = evtDate;
      allEvents.push(event);
    }
  }

  return allEvents;
}

// ── 获取统计信息 ─────────────────────────────────────
export function getStats(events) {
  const total = events.length;
  const dates = new Set(events.map(e => e._date).filter(Boolean));
  const byCategory = {};

  for (const evt of events) {
    const cat = evt.category;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }

  const techCount = events.filter(e => isHighlightEvent(e) === "tech").length;
  const financeCount = events.filter(e => isHighlightEvent(e) === "finance").length;

  return { total, dates: dates.size, byCategory, techCount, financeCount };
}
