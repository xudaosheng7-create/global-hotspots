/**
 * UI 交互模块
 * 图例面板、详情卡、时间轴、统计更新
 */

const { CATEGORIES, isHighlightEvent } = window;

// ── 初始化图例 ───────────────────────────────────────
export function initLegend(categories) {
  const list = document.getElementById("legend-list");
  if (!list) return;

  list.innerHTML = "";

  for (const [code, info] of Object.entries(CATEGORIES)) {
    const count = categories[info.name] || 0;
    const li = document.createElement("li");
    li.dataset.code = code;
    li.innerHTML = `
      <span class="legend-dot" style="background:${info.color}"></span>
      <span>${info.name}</span>
      <span class="legend-count">${count}</span>
    `;

    li.addEventListener("click", () => {
      const isHidden = li.classList.toggle("hidden");
      window._onCategoryToggle?.(code, !isHidden);
    });

    list.appendChild(li);
  }
}

// ── 更新图例计数 ─────────────────────────────────────
export function updateLegendCounts(categories) {
  const items = document.querySelectorAll("#legend-list li");
  items.forEach(li => {
    const code = li.dataset.code;
    const info = CATEGORIES[code];
    if (info && categories[info.name] !== undefined) {
      const countEl = li.querySelector(".legend-count");
      if (countEl) countEl.textContent = categories[info.name];
    }
  });
}

// ── 更新顶部统计 ─────────────────────────────────────
export function updateStats(total, days, techCount, financeCount) {
  const el = document.getElementById("stats");
  if (!el) return;

  let text = `${total.toLocaleString()} 事件 · ${days} 天`;
  if (techCount > 0) text += ` · 🟡 科技 ${techCount}`;
  if (financeCount > 0) text += ` · 🟡 金融 ${financeCount}`;
  el.textContent = text;
}

// ── 打开详情卡 ───────────────────────────────────────
export function showDetailCard(event) {
  const card = document.getElementById("detail-card");
  if (!card) return;

  // Tags
  const tagsEl = document.getElementById("detail-tags");
  tagsEl.innerHTML = "";
  const hl = isHighlightEvent(event);
  if (hl === "tech") {
    tagsEl.innerHTML += '<span class="tag tech">🤖 AI/科技</span>';
  } else if (hl === "finance") {
    tagsEl.innerHTML += '<span class="tag finance">💰 财经</span>';
  }
  if (event.tags && event.tags.length > 0) {
    event.tags.forEach(t => {
      if (!["tech", "finance"].includes(hl) || !["AI", "科技", "财经"].includes(t)) {
        tagsEl.innerHTML += `<span class="tag">${t}</span>`;
      }
    });
  }

  // Category badge
  const catEl = document.getElementById("detail-category");
  catEl.textContent = event.category || "";
  catEl.style.background = `${event.color}22`;
  catEl.style.color = event.color;

  // Location (中英对照)
  const countryZH = window.getCountryZH?.(event.location, event.country) || "";
  const locText = countryZH
    ? `📍 ${countryZH} · ${event.location || "未知地点"}`
    : `📍 ${event.location || "未知地点"}`;
  document.getElementById("detail-location").textContent = locText;

  // AI Summary
  const summaryP = document.querySelector("#detail-summary p");
  summaryP.textContent = event.summary || event.category || "暂无摘要";

  // Meta
  document.getElementById("detail-importance").textContent =
    `🔥 热度 ${event.importance.toFixed(1)}`;
  document.getElementById("detail-tone").textContent =
    `😐 情感 ${event.tone > 0 ? "+" : ""}${event.tone.toFixed(2)}`;

  // Source link
  const linkEl = document.getElementById("detail-link");
  if (event.source_url && event.source_url !== "") {
    linkEl.href = event.source_url;
    linkEl.style.display = "block";
  } else {
    linkEl.style.display = "none";
  }

  // Show
  card.classList.remove("hidden");
}

// ── 关闭详情卡 ───────────────────────────────────────
export function hideDetailCard() {
  document.getElementById("detail-card")?.classList.add("hidden");
}

// ── 初始化详情卡关闭按钮 ──────────────────────────────
export function initDetailClose() {
  document.getElementById("detail-close")?.addEventListener("click", hideDetailCard);

  // 点击地球空白处关闭
  document.getElementById("globe-canvas")?.addEventListener("click", (e) => {
    // 如果点击的不是光点，延迟关闭（让光点的 click 先触发）
    setTimeout(() => {
      // 由 globe.js 的 onClick 管理
    }, 100);
  });
}

// ── 时间轴初始化 ─────────────────────────────────────
export function initTimeline({ onRangeChange, onJumpToday }) {
  const presets = document.querySelectorAll(".preset");
  presets.forEach(btn => {
    btn.addEventListener("click", () => {
      presets.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const days = parseInt(btn.dataset.range);
      onRangeChange?.(days);
    });
  });

  document.getElementById("btn-jump-today")?.addEventListener("click", () => {
    onJumpToday?.();
  });
}

// ── 显示/隐藏加载遮罩 ────────────────────────────────
export function showLoading(show) {
  const el = document.getElementById("loading");
  if (el) el.classList.toggle("hidden", !show);
}

// ── 隐藏操作提示 ─────────────────────────────────────
export function hideHint() {
  const hint = document.getElementById("hint");
  if (hint) {
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 800);
    }, 8000);
  }
}

// ── 自动刷新状态更新 ──────────────────────────────────
export function updateAutoRefreshStatus(active) {
  const el = document.getElementById("auto-refresh-status");
  if (el) {
    el.textContent = active ? "自动刷新: 60s" : "自动刷新: 已暂停";
    el.style.color = active ? "" : "#EF5350";
  }
}
