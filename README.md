# 🌍 全球每日热点热力图

在 3D 旋转地球上看过去一周全球大事——支持 AI 摘要、科技/金融高亮、时间轴回放。

## 快速开始

### 1. 安装 Python 依赖

```bash
pip install -r scripts/requirements.txt
```

### 2. 拉取 GDELT 数据

```bash
python scripts/fetch_gdelt.py
# 可选：指定日期
python scripts/fetch_gdelt.py 20260701
```

输出到 `data/today.json` 和 `data/history/{YYYYMMDD}.json`。

### 3. 启动前端

```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .
```

打开 `http://localhost:8080`。

### 4. 运行 AI 摘要（可选）

```bash
export LLM_API_KEY=sk-xxx
export LLM_API_BASE=https://api.deepseek.com/v1  # 默认
export LLM_MODEL=deepseek-chat                    # 默认

python scripts/ai_summarize.py
```

为每条事件生成 ≤30 字中文摘要、领域标签、科技/金融高亮标记。

## 项目结构

```
global-hotspots/
├── index.html              # 主页面
├── css/style.css           # 赛博深空风样式
├── js/
│   ├── config.js           # 常量配置 (14类别/颜色/工具函数)
│   ├── globe.js            # Three.js 3D地球核心
│   ├── data-loader.js      # 数据加载器
│   ├── ui.js               # UI交互 (图例/详情卡/时间轴)
│   └── main.js             # 入口初始化
├── scripts/
│   ├── fetch_gdelt.py      # GDELT v2 数据拉取
│   ├── ai_summarize.py     # AI 摘要管线
│   └── requirements.txt    # Python 依赖
├── data/
│   ├── today.json          # 当日数据 (含示例)
│   └── history/            # 历史每日快照
└── lib/                    # 本地 JS 库 (待打包)
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 3D | Three.js 0.160 (ES module) |
| 数据源 | GDELT Project v2 |
| AI 摘要 | DeepSeek / GPT-4o-mini / Kimi |
| 后端脚本 | Python 3.12+ (pandas, asyncio, openai) |

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `LLM_API_KEY` | 大模型 API Key | (必填) |
| `LLM_API_BASE` | API endpoint | `https://api.deepseek.com/v1` |
| `LLM_MODEL` | 模型名称 | `deepseek-chat` |
| `AI_CONCURRENT` | 并发数 | `10` |

## 性能目标

- 首屏加载 < 3s
- 同时渲染 ≤500 光点
- AI 摘要缓存命中率 ≥ 70%
- 每 60s 自动刷新

## License

个人项目，仅供学习使用。
