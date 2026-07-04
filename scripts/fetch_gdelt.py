"""
GDELT v2 每日数据拉取脚本
从 GDELT Project 下载全球事件 15 分钟文件，合并为每日 JSON。

GDELT v2 每 15 分钟生成一份 export CSV（每天最多 96 份），
本脚本并发下载全天的文件并合并去重。

GDELT v2 export 实际是 61 列（非官方文档的 58 列），
本脚本按列位置索引而非列名，避免错位问题。
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pandas as pd
import requests

# ── 配置 ──────────────────────────────────────────────

BASE_URL = "http://data.gdeltproject.org/gdeltv2/{ts}.export.CSV.zip"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HISTORY_DIR = DATA_DIR / "history"

MAX_WORKERS = 12    # 并发下载
MAX_EVENTS = 400    # 单日最多保留
MAX_RETRIES = 2     # 单文件网络重试
MAX_DAY_FALLBACK = 4  # 日期回溯天数

# GDELT v2 列位置 (0-based) — 实际 61 列，比官方 schema 偏移 +1~+3
COL = {
    "id": 0,
    "date_added": 1,
    "event_root_code": 28,   # 官方 26，实际 28
    "event_code": 29,         # 官方 27，实际 29
    "goldstein": 30,          # 官方 29，实际 30
    "num_articles": 33,       # 官方 32，实际 33
    "avg_tone": 34,           # 官方 33，实际 34
    "geo_country": 53,        # 官方 52，实际 53
    "lat": 56,                # 官方 55，实际 56
    "lon": 57,                # 官方 56，实际 57
    "location": 52,           # 官方 51，实际 52
    "source_url": 60,         # ✓
}

CATEGORY = {
    "01": "言辞声明", "02": "合作互利", "03": "冲突攻击",
    "04": "抗议示威", "05": "物质援助", "06": "灾害事故",
    "07": "认知情感", "08": "社会议题", "09": "经济议题",
    "10": "司法事件", "11": "媒体事件", "12": "集体行动",
    "13": "意外/其他", "14": "人事任免",
}

COLORS = {
    "01": "#4FC3F7", "02": "#66BB6A", "03": "#EF5350",
    "04": "#FFA726", "05": "#AB47BC", "06": "#FFCA28",
    "07": "#EC407A", "08": "#26A69A", "09": "#FFEE58",
    "10": "#8D6E63", "11": "#78909C", "12": "#9CCC65",
    "13": "#B0BEC5", "14": "#BA68C8",
}

# GDELT 使用 FIPS 10-4 国家代码，转为 ISO 3166-1 alpha-2
FIPS_TO_ISO = {
    "CH": "CN", "SZ": "CH", "US": "US", "UK": "GB", "JA": "JP",
    "KS": "KR", "KN": "KP", "FR": "FR", "GM": "DE", "IT": "IT",
    "SP": "ES", "PO": "PT", "NL": "NL", "BE": "BE", "SW": "SE",
    "NO": "NO", "DA": "DK", "FI": "FI", "IC": "IS", "EI": "IE",
    "PL": "PL", "EZ": "CZ", "LO": "SK", "HU": "HU", "RO": "RO",
    "BU": "BG", "GR": "GR", "UP": "UA", "BO": "BY", "RS": "RU",
    "CA": "CA", "MX": "MX", "BR": "BR", "AR": "AR",
    "CI": "CL", "CO": "CO", "PE": "PE", "VE": "VE", "CU": "CU",
    "IN": "IN", "PK": "PK", "BG": "BD", "AS": "AU", "NZ": "NZ",
    "SF": "ZA", "EG": "EG", "NI": "NG", "KE": "KE",
    "ET": "ET", "TZ": "TZ", "GH": "GH", "SU": "SD", "OD": "SS",
    "SA": "SA", "AE": "AE", "QA": "QA", "KU": "KW",
    "IR": "IR", "IZ": "IQ", "IS": "IL", "JO": "JO",
    "LE": "LB", "SY": "SY", "YM": "YE", "MU": "OM",
    "TU": "TR", "ID": "ID", "MY": "MY", "SN": "SG",
    "TH": "TH", "VM": "VN", "RP": "PH", "BM": "MM", "CB": "KH",
    "TW": "TW", "HK": "HK", "MC": "MO",
    "AF": "AF", "UZ": "UZ", "KZ": "KZ", "MG": "MN",
    "NP": "NP", "CE": "LK", "LY": "LY", "TS": "TN",
    "MO": "MA", "AG": "DZ", "SO": "SO", "CG": "CD",
    "AO": "AO", "MZ": "MZ", "ZI": "ZW",
    "RI": "RS", "HR": "HR", "SI": "SI", "BK": "BA",
    "AL": "AL", "MK": "MK", "LH": "LT", "LG": "LV",
    "EN": "EE", "GG": "GE", "AM": "AM", "AJ": "AZ",
    "WE": "PS", "CY": "CY", "MT": "MT", "LU": "LU",
    "MN": "MC", "LS": "LI", "NO": "NO", "AU": "AT",
    "LA": "LA", "AQ": "AS", "GQ": "GU",
}

def _fips_to_iso(fips_code: str) -> str:
    """将 FIPS 代码转为 ISO 代码，不识别的原样返回"""
    return FIPS_TO_ISO.get(fips_code, fips_code)


# ── 工具 ──────────────────────────────────────────────

def get_today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def _offset_date(date_str: str, days: int) -> str:
    dt = datetime.strptime(date_str, "%Y%m%d") + timedelta(days=days)
    return dt.strftime("%Y%m%d")


def _gen_timestamps(date_str: str) -> list[str]:
    """生成一天所有 15 分钟间隔时间戳 (YYYYMMDDHHMMSS)"""
    stamps = []
    for h in range(24):
        for m in (0, 15, 30, 45):
            stamps.append(f"{date_str}{h:02d}{m:02d}00")
    return stamps


def _safe_str(row: pd.Series, col: int) -> str:
    val = row.iloc[col]
    return str(val).strip() if pd.notna(val) else ""


def _safe_float(row: pd.Series, col: int) -> float:
    val = row.iloc[col]
    if pd.isna(val) or str(val).strip() == "":
        return 0.0
    try:
        return float(val)
    except ValueError:
        return 0.0


# ── 下载单个文件 ──────────────────────────────────────

def _download_one(ts: str) -> list[dict]:
    """下载一个 15 分钟 CSV，返回事件列表（失败返回空列表）"""
    url = BASE_URL.format(ts=ts)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 404:
                return []  # 该时段尚无数据，正常情况
            resp.raise_for_status()

            with ZipFile(BytesIO(resp.content)) as zf:
                csv_name = zf.namelist()[0]
                with zf.open(csv_name) as f:
                    df = pd.read_csv(f, sep="\t", header=None, dtype=str, low_memory=False)

            events = []
            for _, row in df.iterrows():
                try:
                    lat = _safe_float(row, COL["lat"])
                    lon = _safe_float(row, COL["lon"])
                    if lat == 0.0 and lon == 0.0:
                        continue
                    root = _safe_str(row, COL["event_root_code"])
                    events.append({
                        "id": _safe_str(row, COL["id"]),
                        "lat": round(lat, 4),
                        "lon": round(lon, 4),
                        "category": CATEGORY.get(root, "意外/其他"),
                        "category_code": root,
                        "color": COLORS.get(root, "#B0BEC5"),
                        "location": _safe_str(row, COL["location"]),
                        "country": _fips_to_iso(_safe_str(row, COL["geo_country"])),
                        "source_url": _safe_str(row, COL["source_url"]),
                        "importance": round(_safe_float(row, COL["num_articles"]), 1),
                        "goldstein": round(_safe_float(row, COL["goldstein"]), 2),
                        "tone": round(_safe_float(row, COL["avg_tone"]), 2),
                        "date_added": _safe_str(row, COL["date_added"]),
                        "summary": "", "tags": [], "highlight": "general", "ai_processed": False,
                    })
                except (ValueError, IndexError):
                    continue
            return events

        except Exception as exc:
            if attempt == MAX_RETRIES:
                print(f"  [WARN] {ts} -> {exc}", file=sys.stderr)
                return []
    return []


# ── 主流程 ────────────────────────────────────────────

def fetch_gdelt_daily(date_str: str | None = None) -> tuple[list[dict], str]:
    """拉取全天事件，自动回溯 4 天"""
    if date_str is None:
        date_str = get_today_str()

    for offset in range(MAX_DAY_FALLBACK):
        try_date = _offset_date(date_str, -offset)
        print(f"\n[TRY] Date: {try_date}")

        timestamps = _gen_timestamps(try_date)
        print(f"  Downloading {len(timestamps)} files ({MAX_WORKERS} concurrent)...")

        all_events: list[dict] = []
        seen: set[str] = set()
        downloaded = 0

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            futures = {pool.submit(_download_one, ts): ts for ts in timestamps}
            for fut in as_completed(futures):
                downloaded += 1
                if downloaded % 16 == 0:
                    print(f"    [{downloaded}/{len(timestamps)}] ...")
                for evt in fut.result():
                    if evt["id"] not in seen:
                        seen.add(evt["id"])
                        all_events.append(evt)

        # 过滤掉中国大陆事件
        all_events = [e for e in all_events if e["country"] != "CN"]

        print(f"  [OK] {downloaded}/{len(timestamps)} complete -> {len(all_events):,} unique events (CN filtered)")

        if len(all_events) >= 50:
            all_events.sort(key=lambda x: x["importance"], reverse=True)
            return all_events[:MAX_EVENTS], try_date

        print(f"  [SKIP] Too few events ({len(all_events)}), trying previous day...")

    print("❌ 连续 4 天数据均不足，退出。")
    sys.exit(1)


# ── 保存 ──────────────────────────────────────────────

def save_events(events: list[dict], date_str: str | None = None) -> None:
    if date_str is None:
        date_str = get_today_str()

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    output = {
        "date": date_str,
        "total": len(events),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "events": events,
    }

    for path in (DATA_DIR / "today.json", HISTORY_DIR / f"{date_str}.json"):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[SAVE] {len(events)} events -> {DATA_DIR / 'today.json'}")
    print(f"[ARCHIVE] -> {HISTORY_DIR / f'{date_str}.json'}")


# ── 入口 ──────────────────────────────────────────────

if __name__ == "__main__":
    date_arg = sys.argv[1] if len(sys.argv) > 1 else None
    msg = f"GDELT v2 data fetch — {date_arg or 'auto (today -> fallback)'}"
    print(msg)
    events, actual_date = fetch_gdelt_daily(date_arg)
    save_events(events, actual_date)
    print(f"[DONE] {len(events)} events ready (date: {actual_date}).")
