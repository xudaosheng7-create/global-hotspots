/**
 * 主入口 — 全球每日热点热力图
 * 初始化流程：加载数据 → 渲染地球 → 绑定UI
 */

import { initGlobe, renderEventPoints, setCategoryVisible, disposeGlobe } from "./globe.js";
import { loadTodayEvents, loadHistoryEvents, getStats } from "./data-loader.js";
import {
  initLegend, updateLegendCounts, updateStats,
  showDetailCard, hideDetailCard, initDetailClose,
  initTimeline, showLoading, hideHint, updateAutoRefreshStatus,
} from "./ui.js";

const { AUTO_REFRESH_INTERVAL, CATEGORIES } = window;

// ── 状态 ──
let currentEvents = [];
let currentDays = 7;
let refreshTimer = null;
let refreshActive = true;

// ── 入口 ──
async function main() {
  const canvas = document.getElementById("globe-canvas");
  if (!canvas) {
    console.error("找不到 #globe-canvas 元素");
    return;
  }

  // 1. 初始化 3D 地球
  initGlobe(canvas);

  // 2. 绑定全局回调（给 globe.js 的 click/hover 用）
  window._onGlobePointClick = onPointClick;
  window._onCategoryToggle = onCategoryToggle;
  window._onViewChange = onViewChange;

  // 3. 初始化 UI 组件
  initDetailClose();
  initTimeline({ onRangeChange, onJumpToday });

  // 4. 加载数据
  await loadAndRender();

  // 5. 启动自动刷新
  startAutoRefresh();

  // 6. 隐藏提示
  hideHint();
}

// ── 日期显示 ────────────────────────────────────────
function updateDateLabel(events) {
  const dates = [...new Set(events.map(e => e._date).filter(Boolean))];
  const latest = dates.sort().pop() || "";
  const el = document.getElementById("preset-today");
  if (el && latest) {
    el.textContent = formatDate(latest);
  }
  console.log("updateDateLabel: events=" + events.length + " dates=" + dates.length + " latest=" + latest + " el=" + !!el);
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return "";
  const m = parseInt(dateStr.substring(4, 6), 10);
  const d = parseInt(dateStr.substring(6, 8), 10);
  return m + "月" + d + "日";
}

// ── 数据加载 & 渲染 ──────────────────────────────────
async function loadAndRender() {
  showLoading(true);

  try {
    let events;
    if (currentDays === 1) {
      events = await loadTodayEvents();
    } else {
      events = await loadHistoryEvents(currentDays);
    }

    currentEvents = events;

    // 更新按钮为实际日期
    updateDateLabel(events);

    // 更新统计
    const stats = getStats(events);
    updateStats(stats.total, stats.dates, stats.techCount, stats.financeCount);
    initLegend(stats.byCategory);

    // 渲染光点
    renderEventPoints(events);
  } catch (err) {
    console.error("❌ 数据加载失败:", err);
    alert("数据加载失败，请检查 data/today.json 是否存在。\n运行: python scripts/fetch_gdelt.py");
  } finally {
    showLoading(false);
  }
}

// ── 事件回调 ──
function onPointClick(eventData) {
  showDetailCard(eventData);
}

function onCategoryToggle(categoryCode, visible) {
  setCategoryVisible(categoryCode, visible);
}

// ── 视角变化 → 更新摘要面板 ───────────────────────────
function onViewChange({ lat, lon, events }) {
  const panel = document.getElementById("view-summary");
  const list = document.getElementById("view-events");
  const label = document.getElementById("view-label");
  if (!panel || !list) return;

  if (events.length === 0) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  label.textContent = `当前视角 (${lat}, ${lon}) — ${events.length} 事件`;

  list.innerHTML = events.slice(0, 5).map(e => {
    const countryZH = window.getCountryZH?.(e.location, e.country) || "";
    const city = e.location?.split(",")[0]?.trim() || "未知";
    const label = countryZH ? `${countryZH} ${city}` : city;
    return `<li data-id="${e.id}" title="点击查看详情">
      <span class="v-cat" style="background:${e.color || '#4FC3F7'}"></span>
      ${label}
      <span class="v-imp">🔥${e.importance.toFixed(0)}</span>
    </li>`;
  }).join("");

  // 点击摘要条目 → 打开详情
  list.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", () => {
      const evt = events.find(e => e.id === li.dataset.id);
      if (evt) showDetailCard(evt);
    });
  });
}

// ── 时间轴 ──
async function onRangeChange(days) {
  currentDays = days;
  await loadAndRender();
}

function onJumpToday() {
  currentDays = 1;
  document.querySelectorAll(".preset").forEach(b => b.classList.remove("active"));
  const todayBtn = document.querySelector('.preset[data-range="1"]');
  if (todayBtn) todayBtn.classList.add("active");
  refreshActive = true;
  updateAutoRefreshStatus(true);
  startAutoRefresh();
  loadAndRender();
}

// ── 自动刷新 ──
function startAutoRefresh() {
  stopAutoRefresh();
  if (!refreshActive) return;

  refreshTimer = setInterval(async () => {
    if (!refreshActive) return;
    console.log("🔄 自动刷新…");
    try {
      const events = await loadTodayEvents();
      currentEvents = events;
      const stats = getStats(events);
      updateStats(stats.total, 1, stats.techCount, stats.financeCount);
      updateLegendCounts(stats.byCategory);
      renderEventPoints(events);
    } catch (err) {
      console.warn("自动刷新失败:", err);
    }
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ── 启动 ──
main().catch(err => {
  console.error("启动失败:", err);
  showLoading(false);
});
