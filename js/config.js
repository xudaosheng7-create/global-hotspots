/**
 * 全局常量配置
 * 14 类事件类别、颜色、科技/金融高亮判定
 *
 * 注意：使用 window.X 而非 const，确保 ES module（globe.js / main.js）可访问
 */

// ── 类别映射 ────────────────────────────────────────
window.CATEGORIES = {
  "01": { name: "言辞声明", color: "#4FC3F7" },
  "02": { name: "合作互利", color: "#66BB6A" },
  "03": { name: "冲突攻击", color: "#EF5350" },
  "04": { name: "抗议示威", color: "#FFA726" },
  "05": { name: "物质援助", color: "#AB47BC" },
  "06": { name: "灾害事故", color: "#FFCA28" },
  "07": { name: "认知情感", color: "#EC407A" },
  "08": { name: "社会议题", color: "#26A69A" },
  "09": { name: "经济议题", color: "#FFEE58" },
  "10": { name: "司法事件", color: "#8D6E63" },
  "11": { name: "媒体事件", color: "#78909C" },
  "12": { name: "集体行动", color: "#9CCC65" },
  "13": { name: "意外/其他", color: "#B0BEC5" },
  "14": { name: "人事任免", color: "#BA68C8" },
};

// ── 科技/金融高亮颜色 ────────────────────────────────
window.HIGHLIGHT_TECH_COLOR = "#FFD700";
window.HIGHLIGHT_FINANCE_COLOR = "#FFB300";

// ── 科技/金融关键词 ──────────────────────────────────
window.TECH_KEYWORDS = [
  "AI", "人工智能", "机器学习", "量子", "芯片", "半导体",
  "模型", "云计算", "新能源", "互联网", "平台", "区块链",
  "加密", "大模型", "GPT", "LLM", "ChatGPT", "智能手机",
  "应用", "软件", "硬件", "数据", "算法", "机器人",
  "无人机", "卫星", "航天", "火箭", "SpaceX", "特斯拉",
  "苹果", "谷歌", "微软", "亚马逊", "Meta", "英伟达",
];

window.FINANCE_KEYWORDS = [
  "融资", "IPO", "财报", "央行", "利率", "估值",
  "风投", "并购", "收购", "股市", "股票", "债券",
  "基金", "外汇", "通胀", "GDP", "经济", "美元",
  "人民币", "欧元", "加息", "降息", "衰退", "贸易",
  "关税", "制裁", "华尔街", "美联储", "ECB",
];

// ── 渲染参数 ─────────────────────────────────────────
window.GLOBE_RADIUS = 5;
window.POINT_BASE_SIZE = 0.06;
window.POINT_MAX_SIZE = 0.15;
window.TECH_FINANCE_SCALE = 1.8;
window.MAX_POINTS = 500;
window.AUTO_ROTATE_SPEED = 0.15;
window.AUTO_REFRESH_INTERVAL = 60000;
window.CAMERA_FAR = 100;
window.CAMERA_NEAR = 0.1;

// ── 国家代码 → 中文名 ──────────────────────────────
window.COUNTRY_ZH = {
  "US": "美国", "GB": "英国", "CN": "中国", "JP": "日本",
  "KR": "韩国", "KP": "朝鲜", "FR": "法国", "DE": "德国",
  "IT": "意大利", "ES": "西班牙", "PT": "葡萄牙", "NL": "荷兰",
  "BE": "比利时", "CH": "瑞士", "AT": "奥地利", "SE": "瑞典",
  "NO": "挪威", "DK": "丹麦", "FI": "芬兰", "IS": "冰岛",
  "IE": "爱尔兰", "PL": "波兰", "CZ": "捷克", "SK": "斯洛伐克",
  "HU": "匈牙利", "RO": "罗马尼亚", "BG": "保加利亚", "GR": "希腊",
  "UA": "乌克兰", "BY": "白俄罗斯", "RU": "俄罗斯",
  "CA": "加拿大", "MX": "墨西哥", "BR": "巴西", "AR": "阿根廷",
  "CL": "智利", "CO": "哥伦比亚", "PE": "秘鲁", "VE": "委内瑞拉",
  "CU": "古巴", "IN": "印度", "PK": "巴基斯坦", "BD": "孟加拉",
  "AU": "澳大利亚", "NZ": "新西兰",
  "ZA": "南非", "EG": "埃及", "NG": "尼日利亚", "KE": "肯尼亚",
  "ET": "埃塞俄比亚", "TZ": "坦桑尼亚", "GH": "加纳",
  "SA": "沙特阿拉伯", "AE": "阿联酋", "QA": "卡塔尔", "KW": "科威特",
  "IR": "伊朗", "IQ": "伊拉克", "IL": "以色列", "JO": "约旦",
  "LB": "黎巴嫩", "SY": "叙利亚", "YE": "也门", "OM": "阿曼",
  "TR": "土耳其", "ID": "印度尼西亚", "MY": "马来西亚",
  "SG": "新加坡", "TH": "泰国", "VN": "越南", "PH": "菲律宾",
  "MM": "缅甸", "KH": "柬埔寨", "LA": "老挝",
  "TW": "中国台湾", "HK": "中国香港", "MO": "中国澳门",
  "AF": "阿富汗", "UZ": "乌兹别克斯坦", "KZ": "哈萨克斯坦",
  "MN": "蒙古", "NP": "尼泊尔", "LK": "斯里兰卡",
  "LY": "利比亚", "TN": "突尼斯", "MA": "摩洛哥", "DZ": "阿尔及利亚",
  "SD": "苏丹", "SS": "南苏丹", "SO": "索马里", "CD": "刚果(金)",
  "AO": "安哥拉", "MZ": "莫桑比克", "ZW": "津巴布韦",
  "RS": "塞尔维亚", "HR": "克罗地亚", "SI": "斯洛文尼亚",
  "BA": "波黑", "AL": "阿尔巴尼亚", "MK": "北马其顿",
  "LT": "立陶宛", "LV": "拉脱维亚", "EE": "爱沙尼亚",
  "GE": "格鲁吉亚", "AM": "亚美尼亚", "AZ": "阿塞拜疆",
  "PS": "巴勒斯坦", "CY": "塞浦路斯", "MT": "马耳他",
  "LU": "卢森堡", "MC": "摩纳哥", "LI": "列支敦士登",
  "SF": "南非",   // GDELT uses SF for South Africa
  "AFR": "非洲", "USA": "美国",
};

// 根据 location 字段提取中文国家名
window.getCountryZH = function (location, countryCode) {
  // 先查 country code
  if (countryCode && window.COUNTRY_ZH[countryCode]) {
    return window.COUNTRY_ZH[countryCode];
  }
  // 从 location 末尾提取国家名
  if (location) {
    const parts = location.split(", ");
    const last = parts[parts.length - 1];
    // 常见英文国家名映射
    const EN_MAP = {
      "United States": "美国", "United Kingdom": "英国", "China": "中国",
      "Japan": "日本", "South Korea": "韩国", "France": "法国",
      "Germany": "德国", "Russia": "俄罗斯", "India": "印度",
      "Brazil": "巴西", "Canada": "加拿大", "Australia": "澳大利亚",
      "Italy": "意大利", "Spain": "西班牙", "Netherlands": "荷兰",
      "Switzerland": "瑞士", "Sweden": "瑞典", "Norway": "挪威",
      "Poland": "波兰", "Turkey": "土耳其", "Indonesia": "印度尼西亚",
      "Mexico": "墨西哥", "Argentina": "阿根廷", "South Africa": "南非",
      "Saudi Arabia": "沙特阿拉伯", "United Arab Emirates": "阿联酋",
      "Nigeria": "尼日利亚", "Egypt": "埃及", "Kenya": "肯尼亚",
      "Israel": "以色列", "Iran": "伊朗", "Iraq": "伊拉克",
      "Pakistan": "巴基斯坦", "Bangladesh": "孟加拉",
      "Vietnam": "越南", "Thailand": "泰国", "Philippines": "菲律宾",
      "Malaysia": "马来西亚", "Singapore": "新加坡",
      "Ukraine": "乌克兰", "Belgium": "比利时", "Austria": "奥地利",
      "Denmark": "丹麦", "Finland": "芬兰", "Greece": "希腊",
      "Portugal": "葡萄牙", "Ireland": "爱尔兰", "New Zealand": "新西兰",
      "Chile": "智利", "Colombia": "哥伦比亚", "Peru": "秘鲁",
      "Venezuela": "委内瑞拉", "Cuba": "古巴",
      "Ethiopia": "埃塞俄比亚", "Ghana": "加纳", "Tanzania": "坦桑尼亚",
      "Qatar": "卡塔尔", "Kuwait": "科威特", "Oman": "阿曼",
      "Jordan": "约旦", "Lebanon": "黎巴嫩", "Syria": "叙利亚",
      "Myanmar": "缅甸", "Cambodia": "柬埔寨",
      "Serbia": "塞尔维亚", "Croatia": "克罗地亚",
      "Hungary": "匈牙利", "Romania": "罗马尼亚", "Bulgaria": "保加利亚",
      "Taiwan": "中国台湾", "Hong Kong": "中国香港",
    };
    if (EN_MAP[last]) return EN_MAP[last];
  }
  return "";
};

// ── 数据源 URL ───────────────────────────────────────
window.DATA_URL = "data/today.json";
window.HISTORY_URL = (dateStr) => `data/history/${dateStr}.json`;

// ── 科技/金融判定（前端快速版，正式判定由 AI pipeline 做）──
window.isHighlightEvent = function (event) {
  if (event.highlight === "tech") return "tech";
  if (event.highlight === "finance") return "finance";

  // 兜底：检查 tags
  if (event.tags && event.tags.length > 0) {
    const tagsLower = event.tags.map(t => t.toLowerCase());
    if (tagsLower.some(t => window.TECH_KEYWORDS.some(k => t.includes(k.toLowerCase())))) return "tech";
    if (tagsLower.some(t => window.FINANCE_KEYWORDS.some(k => t.includes(k.toLowerCase())))) return "finance";
  }

  // 兜底：category 经济议题
  if (event.category_code === "09") return "finance";

  return "general";
};

// ── 经纬度 → 3D 坐标 ─────────────────────────────────
window.latLonToVec3 = function (lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
};
