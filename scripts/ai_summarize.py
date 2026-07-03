"""
AI 摘要生成管线
对 GDELT 事件调用大模型 API，生成：
- ≤30 字中文摘要
- 领域标签 (tags)
- 科技/金融高亮标记 (highlight)

默认使用 OpenAI 兼容接口（支持 DeepSeek、Kimi、GPT-4o-mini 等），
通过环境变量配置 API key 和 endpoint。
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

# ── 配置 ──────────────────────────────────────────────

# 从环境变量读取，不硬编码 key
API_KEY = os.getenv("LLM_API_KEY", "")
API_BASE = os.getenv("LLM_API_BASE", "https://api.deepseek.com/v1")
MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

# 路径
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TODAY_PATH = DATA_DIR / "today.json"
CACHE_DIR = DATA_DIR / ".ai_cache"
CACHE_TTL = 60 * 60 * 24 * 7  # 7 天

# 并发控制
MAX_CONCURRENT = int(os.getenv("AI_CONCURRENT", "10"))
RETRY_COUNT = 3

# ── 科技/金融关键词 ──────────────────────────────────
TECH_KEYWORDS = [
    "AI", "人工智能", "机器学习", "量子", "芯片", "半导体",
    "模型", "大模型", "GPT", "LLM", "云计算", "新能源",
    "互联网", "平台", "区块链", "加密", "应用", "软件",
    "硬件", "算法", "机器人", "无人机", "卫星", "航天",
    "火箭", "智能手机", "数据", "自动驾驶",
]
FINANCE_KEYWORDS = [
    "融资", "IPO", "财报", "央行", "利率", "估值", "风投",
    "并购", "收购", "股市", "股票", "债券", "基金", "外汇",
    "通胀", "GDP", "经济", "美元", "人民币", "加息",
    "降息", "衰退", "贸易", "关税", "制裁", "华尔街",
    "美联储", "ECB", "投资",
]

# ── Prompt 模板 ───────────────────────────────────────
SYSTEM_PROMPT = """你是一个全球新闻分析师。为每条新闻生成极短中文摘要（≤30字），并标记领域标签。

**核心规则**：
1. 摘要 40~100 字，包含**发生了什么事 + 涉及谁 + 在哪里 + 为什么重要**，给读者一个完整的事件画面
2. **输出中文**，即使原文是英文/法文/俄文/阿拉伯文
3. 识别领域标签（最多3个），从以下列表选：AI、区块链、芯片、半导体、新能源、云计算、互联网、加密货币、财经、融资、IPO、并购、货币政策、贸易、能源、航天、司法、外交、军事、抗议、灾害、其他
4. 判定是否涉及科技或金融领域（tech / finance / general）

**输出 JSON 格式**（只输出 JSON，不要其他文字）：
{"summary": "北爱尔兰首府贝尔法斯特警方召开新闻发布会，通报一起涉及多地的刑事案件最新调查进展，引发当地社区广泛关注。", "tags": ["司法"], "highlight": "general"}"""

USER_PROMPT_TEMPLATE = """请分析以下新闻事件：

事件类别：{category}
地点：{location}
相关方：{actor1} / {actor2}
来源链接：{url}

请输出 JSON。"""


# ── 核心逻辑 ──────────────────────────────────────────

def get_cache_key(event: dict) -> str:
    """生成缓存键：event_id + url 的 SHA256"""
    raw = f"{event['id']}|{event.get('source_url', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_cached(cache_key: str) -> dict | None:
    """读取缓存，过期返回 None"""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if not cache_file.exists():
        return None
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            cached = json.load(f)
        if time.time() - cached.get("ts", 0) < CACHE_TTL:
            return cached.get("result")
    except (json.JSONDecodeError, KeyError):
        pass
    return None


def set_cache(cache_key: str, result: dict) -> None:
    """写入缓存"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{cache_key}.json"
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump({"ts": time.time(), "result": result}, f, ensure_ascii=False)


def determine_highlight(tags: list[str], event: dict) -> str:
    """根据 tags + GDELT 类别判定科技/金融高亮"""
    tags_lower = [t.lower() for t in tags]

    for kw in TECH_KEYWORDS:
        if any(kw.lower() in t for t in tags_lower):
            return "tech"

    for kw in FINANCE_KEYWORDS:
        if any(kw.lower() in t for t in tags_lower):
            return "finance"

    # 兜底：经济议题 → finance
    if event.get("category_code") == "09":
        return "finance"

    return "general"


async def summarize_one(
    client: AsyncOpenAI,
    event: dict,
    semaphore: asyncio.Semaphore,
) -> dict:
    """对单条事件生成 AI 摘要（含缓存）"""

    # 检查缓存
    cache_key = get_cache_key(event)
    cached = get_cached(cache_key)
    if cached:
        cached["_from_cache"] = True
        return cached

    # 并发控制
    async with semaphore:
        for attempt in range(RETRY_COUNT):
            try:
                prompt = USER_PROMPT_TEMPLATE.format(
                    category=event.get("category", ""),
                    location=event.get("location", ""),
                    actor1="N/A",
                    actor2="N/A",
                    url=event.get("source_url", ""),
                )

                response = await client.chat.completions.create(
                    model=MODEL,
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=200,
                    response_format={"type": "json_object"},
                )

                raw = response.choices[0].message.content
                result = json.loads(raw)

                # 确保字段存在
                result.setdefault("summary", "")
                result.setdefault("tags", [])
                result.setdefault("highlight", "general")

                # 覆盖 highlight（用本地关键词兜底）
                if result["highlight"] == "general":
                    result["highlight"] = determine_highlight(result["tags"], event)

                # 写入缓存
                set_cache(cache_key, result)
                result["_from_cache"] = False
                return result

            except Exception as exc:
                print(f"  ⚠ 重试 {attempt + 1}/{RETRY_COUNT}: {exc}", file=sys.stderr)
                if attempt < RETRY_COUNT - 1:
                    await asyncio.sleep(2 ** attempt)

    # 所有重试失败 → 回退
    print(f"  ❌ 失败，回退: {event['id']}", file=sys.stderr)
    return {
        "summary": "",
        "tags": [event.get("category", "")],
        "highlight": determine_highlight([], event),
        "_fallback": True,
    }


async def summarize_all(events: list[dict], client: AsyncOpenAI) -> list[dict]:
    """并发处理全部事件"""
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    tasks = [summarize_one(client, e, semaphore) for e in events]
    return await asyncio.gather(*tasks)


def apply_ai_results(events: list[dict], results: list[dict]) -> list[dict]:
    """将 AI 结果写回事件"""
    for event, result in zip(events, results):
        event["summary"] = result.get("summary", "")
        event["tags"] = result.get("tags", [])
        event["highlight"] = result.get("highlight", "general")
        event["ai_processed"] = True

    # 统计
    cached = sum(1 for r in results if r.get("_from_cache"))
    fallback = sum(1 for r in results if r.get("_fallback"))
    fresh = len(results) - cached - fallback
    print(f"  ✅ 新生成: {fresh} | 💾 缓存命中: {cached} | ⚠ 降级: {fallback}")
    return events


def save_events(events: list[dict], path: Path) -> None:
    """保存更新后的事件列表"""
    # 读原始文件保留结构
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {"date": "", "total": 0, "generated_at": "", "events": []}

    data["events"] = events
    data["total"] = len(events)
    data["generated_at"] = datetime.now(timezone.utc).isoformat()

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"💾 保存 → {path}")


# ── 入口 ──────────────────────────────────────────────

async def main():
    if not API_KEY:
        print("❌ 请设置环境变量 LLM_API_KEY")
        print("   export LLM_API_KEY=sk-xxx")
        print("   export LLM_API_BASE=https://api.deepseek.com/v1  # 可选")
        print("   export LLM_MODEL=deepseek-chat                    # 可选")
        sys.exit(1)

    # 加载数据
    if not TODAY_PATH.exists():
        print(f"❌ 找不到数据文件: {TODAY_PATH}")
        print("   请先运行: python scripts/fetch_gdelt.py")
        sys.exit(1)

    with open(TODAY_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    events = data.get("events", [])
    if not events:
        print("⚠ 事件列表为空，退出。")
        return

    # 筛选未处理的事件
    unprocessed = [e for e in events if not e.get("ai_processed")]
    print(f"📊 总事件: {len(events)} | 待处理: {len(unprocessed)} | 已处理: {len(events) - len(unprocessed)}")

    if not unprocessed:
        print("✅ 所有事件已处理，无需重新生成。")
        return

    # 初始化客户端
    client = AsyncOpenAI(api_key=API_KEY, base_url=API_BASE)
    print(f"🤖 模型: {MODEL} | 并发: {MAX_CONCURRENT} | 条数: {len(unprocessed)}")

    # 并发处理
    t0 = time.time()
    results = await summarize_all(unprocessed, client)
    elapsed = time.time() - t0
    print(f"⏱ 耗时: {elapsed:.1f}s ({len(unprocessed) / max(elapsed, 0.1):.0f} 条/s)")

    # 应用结果
    all_events = events.copy()
    for i, e in enumerate(all_events):
        if not e.get("ai_processed"):
            idx = unprocessed.index(e) if e in unprocessed else -1
            if idx >= 0 and idx < len(results):
                e["summary"] = results[idx].get("summary", "")
                e["tags"] = results[idx].get("tags", [])
                e["highlight"] = results[idx].get("highlight", "general")
                e["ai_processed"] = True

    # 保存
    save_events(all_events, TODAY_PATH)

    # 同步更新 history 副本（如果存在）
    date_str = data.get("date", "")
    if date_str:
        history_path = DATA_DIR / "history" / f"{date_str}.json"
        if history_path.exists():
            save_events(all_events, history_path)

    # 采样展示
    print(f"\n🏁 完成！抽样展示：")
    for e in all_events[:5]:
        print(f"  [{e['highlight']:8}] {e['summary'][:35]:35} | {e.get('location', '')[:20]}")


if __name__ == "__main__":
    asyncio.run(main())
