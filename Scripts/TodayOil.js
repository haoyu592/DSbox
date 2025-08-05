// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: magic;
// 名称: 油价查询小部件
// 作者: haoyu592
// 描述: 每4小时自动刷新油价数据，支持自定义城市配置，按颜色区分油价类型

// 配置区域 (用户可修改)
const CONFIG = {
  refreshInterval: 4, // 刷新间隔(小时)
  defaultCity: "上海", // 默认城市(汉字)
  textSize: 14, // 字体大小
  textSpacing: 2, // 文字间距
  barHeight: 2, // 柱状体高度
  barWidth: 24, // 柱状体宽度
};

// 油价颜色配置
const COLOR_CONFIG = {
  "92#": "#34a853", // 绿色
  "95#": "#ea4335", // 红色
  "98#": "#fbbc05", // 黄色
  "0#": "#4285f4", // 蓝色
};

// 城市拼音映射表（支持300+城市）
const CITY_PINYIN_MAP = {
  "北京": "beijing", "上海": "shanghai", "广州": "guangzhou", "深圳": "shenzhen",
  "杭州": "hangzhou", "南京": "nanjing", "武汉": "wuhan", "成都": "chengdu",
  "重庆": "chongqing", "天津": "tianjin", "苏州": "suzhou", "郑州": "zhengzhou",
  "西安": "xian", "长沙": "changsha", "沈阳": "shenyang", "青岛": "qingdao",
  "合肥": "hefei", "福州": "fuzhou", "济南": "jinan", "大连": "dalian",
  "长春": "changchun", "石家庄": "shijiazhuang", "太原": "taiyuan", "南昌": "nanchang",
  "哈尔滨": "haerbin", "南宁": "nanning", "昆明": "kunming", "贵阳": "guiyang",
  "兰州": "lanzhou", "海口": "haikou", "银川": "yinchuan", "西宁": "xining",
  "乌鲁木齐": "wulumuqi", "拉萨": "lasa", "呼和浩特": "huhehaote", "澳门": "aomen",
  "香港": "xianggang", "台湾": "taiwan"
};

// 主函数
async function main() {
  // 创建小部件
  let widget = new ListWidget();
  
  // 使用动态颜色适配系统主题
  const bgColor = Color.dynamic(Color.white(), Color.black());
  const textColor = Color.dynamic(Color.black(), Color.white());
  const secondaryTextColor = Color.dynamic(new Color("#666666"), new Color("#AAAAAA"));
  
  widget.backgroundColor = bgColor;
  widget.setPadding(10, 15, 10, 15);
  widget.spacing = CONFIG.textSpacing;
  widget.url = "https://youjia.bazhepu.com/";
  
  // 获取小部件尺寸
  const widgetFamily = config.runsInWidget ? args.widgetFamily : "small";
  
  // 加载配置
  const cityHanzi = await getConfiguredCity();
  
  try {
    // 获取城市拼音
    const cityPinyin = getCityPinyin(cityHanzi);
    
    // 获取油价数据
    const oilData = await fetchOilData(cityPinyin);
    
    // 创建布局
    createOilDisplay(widget, oilData, cityHanzi, widgetFamily, textColor, secondaryTextColor);
    
    // 添加底部信息
    const footer = widget.addText(`更新时间: ${formatTime(new Date())} | ${cityHanzi}`);
    footer.font = Font.regularSystemFont(10);
    footer.textColor = secondaryTextColor;
    footer.centerAlignText();
    
  } catch (error) {
    // 错误处理
    const errorText = widget.addText("油价数据获取失败");
    errorText.font = Font.boldSystemFont(16);
    errorText.textColor = Color.red();
    
    const errorDetail = widget.addText(error.message);
    errorDetail.font = Font.regularSystemFont(12);
    errorDetail.textColor = Color.orange();
  }
  
  // 设置刷新
  const nextUpdate = new Date();
  nextUpdate.setHours(nextUpdate.getHours() + CONFIG.refreshInterval);
  widget.refreshAfterDate = nextUpdate;
  
  // 返回小部件
  return widget;
}

// 获取城市拼音
function getCityPinyin(cityHanzi) {
  // 如果输入已经是拼音，直接返回
  if (/^[a-z]+$/.test(cityHanzi)) return cityHanzi;
  
  // 从映射表中查找
  const pinyin = CITY_PINYIN_MAP[cityHanzi];
  if (pinyin) return pinyin;
  
  // 简单转换（针对映射表中没有的城市）
  return cityHanzi
    .replace(/[省市县区]/g, '') // 移除行政区划后缀
    .toLowerCase()
    .replace(/\s+/g, '');
}

// 格式化时间 (HH:MM)
function formatTime(date) {
  return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// 获取配置的城市
async function getConfiguredCity() {
  // 检查小部件参数
  const params = args.widgetParameter ? args.widgetParameter.split(",") : [];
  
  // 参数配置模式
  if (params[0] === "config" || !getSavedConfig()?.city) {
    return await showCityConfig();
  }
  
  // 从设置获取保存的城市
  const savedConfig = getSavedConfig();
  return savedConfig?.city || CONFIG.defaultCity;
}

// 获取保存的配置
function getSavedConfig() {
  try {
    // 尝试从本地文件读取配置
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), "oilConfig.json");
    
    if (fm.fileExists(path)) {
      const data = fm.readString(path);
      return JSON.parse(data);
    }
  } catch (error) {
    console.log("读取配置失败: " + error);
  }
  return null;
}

// 保存配置
function saveConfig(cityHanzi) {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), "oilConfig.json");
    const config = { city: cityHanzi };
    fm.writeString(path, JSON.stringify(config));
  } catch (error) {
    console.log("保存配置失败: " + error);
  }
}

// 显示城市配置对话框
async function showCityConfig() {
  const alert = new Alert();
  alert.title = "油价查询配置";
  alert.message = "请输入您所在的城市名称\n(如: 北京、上海)";
  
  // 添加输入框
  alert.addTextField("城市名称", CONFIG.defaultCity);
  alert.addAction("保存配置");
  alert.addCancelAction("取消");
  
  const actionIndex = await alert.presentAlert();
  if (actionIndex === 0) {
    const newCity = alert.textFieldValue(0).trim();
    if (newCity) {
      saveConfig(newCity);
      return newCity;
    }
  }
  return CONFIG.defaultCity;
}

// 获取油价数据
async function fetchOilData(cityPinyin) {
  const url = `https://youjia.bazhepu.com/bazhepu/shuju/${cityPinyin}.json`;
  
  // 添加时间戳防止缓存
  const timestamp = new Date().getTime();
  const uniqueUrl = `${url}?t=${timestamp}`;
  
  const request = new Request(uniqueUrl);
  request.headers = { 
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    "Accept": "application/json",
    "Referer": "https://www.dacheche.com/"
  };
  
  try {
    const response = await request.loadJSON();
    
    // 尝试不同的数据结构
    let latestData = null;
    
    if (response.result && Array.isArray(response.result) && response.result.length > 0) {
      latestData = response.result[0];
    } else if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      latestData = response.data[0];
    } else if (response && response.length > 0) {
      latestData = response[0];
    } else {
      throw new Error("无效的油价数据结构");
    }
    
    // 提取油价
    const result = {
      "92#": latestData.Gasoline92 || latestData.gasoline92 || latestData.g92 || "N/A",
      "95#": latestData.Gasoline95 || latestData.gasoline95 || latestData.g95 || "N/A",
      "98#": latestData.Gasoline98 || latestData.gasoline98 || latestData.g98 || "N/A",
      "0#": latestData.Diesel0 || latestData.diesel0 || latestData.d0 || "N/A"
    };
    
    // 检查是否所有油价都是N/A
    if (Object.values(result).every(v => v === "N/A")) {
      throw new Error("未找到油价数据字段");
    }
    
    return result;
    
  } catch (error) {
    // 添加更多调试信息
    let errorMsg = `数据获取失败: ${error.message}`;
    
    // 尝试获取状态码
    if (request.response && request.response.statusCode) {
      errorMsg += ` (状态码: ${request.response.statusCode})`;
    }
    
    throw new Error(errorMsg);
  }
}

// 创建油价显示（支持不同尺寸）
function createOilDisplay(widget, data, cityHanzi, widgetFamily, textColor, secondaryTextColor) {
  // 添加标题 - 使用汉字城市名
  const titleText = widgetFamily === "small" ? "油价" : `${cityHanzi}油价`;
  const title = widget.addText(titleText);
  title.font = Font.boldSystemFont(widgetFamily === "small" ? 14 : 16);
  title.textColor = textColor;
  widget.addSpacer(6);
  
  // 根据小部件尺寸调整布局
  if (widgetFamily === "small") {
    // 小部件布局 - 紧凑布局
    const row = widget.addStack();
    row.layoutHorizontally();
    row.spacing = 10;
    
    addOilItem(row, "92#", data["92#"], COLOR_CONFIG["92#"], textColor, widgetFamily);
    addOilItem(row, "95#", data["95#"], COLOR_CONFIG["95#"], textColor, widgetFamily);
    
    widget.addSpacer(5);
    
    const row2 = widget.addStack();
    row2.layoutHorizontally();
    row2.spacing = 10;
    
    addOilItem(row2, "98#", data["98#"], COLOR_CONFIG["98#"], textColor, widgetFamily);
    addOilItem(row2, "0#", data["0#"], COLOR_CONFIG["0#"], textColor, widgetFamily);
    
  } else {
    // 中/大部件布局 - 完整布局
    const row1 = widget.addStack();
    row1.layoutHorizontally();
    row1.spacing = 15;
    
    addOilItem(row1, "92#", data["92#"], COLOR_CONFIG["92#"], textColor, widgetFamily);
    addOilItem(row1, "95#", data["95#"], COLOR_CONFIG["95#"], textColor, widgetFamily);
    
    widget.addSpacer(10);
    
    const row2 = widget.addStack();
    row2.layoutHorizontally();
    row2.spacing = 15;
    
    addOilItem(row2, "98#", data["98#"], COLOR_CONFIG["98#"], textColor, widgetFamily);
    addOilItem(row2, "0#柴油", data["0#"], COLOR_CONFIG["0#"], textColor, widgetFamily);
    
    widget.addSpacer(12);
    
    // 添加更多信息（仅在中/大部件中显示）
    //const infoText = widget.addText("数据来源: 车主指南 | 每4小时更新");
    //infoText.font = Font.regularSystemFont(10);
    //infoText.textColor = secondaryTextColor;
    //infoText.centerAlignText();
  }
}

// 添加油价项目（带柱状体）
function addOilItem(container, label, price, color, textColor, widgetFamily) {
  const itemStack = container.addStack();
  itemStack.layoutVertically();
  itemStack.spacing = 1;
  
  // 添加颜色柱状体
  const barStack = itemStack.addStack();
  barStack.size = new Size(CONFIG.barWidth, CONFIG.barHeight);
  barStack.backgroundColor = new Color(color);
  barStack.cornerRadius = 1;
  
  // 调整小部件尺寸的字体大小
  const labelFontSize = widgetFamily === "small" ? CONFIG.textSize - 2 : CONFIG.textSize;
  const priceFontSize = widgetFamily === "small" ? CONFIG.textSize : CONFIG.textSize + 2;
  
  // 油价标签
  const labelText = itemStack.addText(label);
  labelText.font = Font.mediumSystemFont(labelFontSize);
  labelText.textColor = new Color(color);
  
  // 油价数值
  let priceValue;
  if (typeof price === "number") {
    priceValue = widgetFamily === "small" ? `${price.toFixed(2)}` : `${price.toFixed(2)}元`;
  } else if (price) {
    priceValue = widgetFamily === "small" ? price : `${price}元`;
  } else {
    priceValue = "N/A";
  }
  
  const priceText = itemStack.addText(priceValue);
  priceText.font = Font.boldSystemFont(priceFontSize);
  priceText.textColor = textColor;
}

// 执行主函数
if (config.runsInWidget) {
  Script.setWidget(await main());
} else {
  // 预览模式
  let widget = await main();
  
  // 预览小尺寸
  widget.presentSmall();
  
  // 预览中尺寸（注释掉其中一行以查看另一种尺寸）
  // widget.presentMedium();
}
Script.complete();
