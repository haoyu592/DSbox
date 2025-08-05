// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: magic;
// 名称: 油价查询小部件
// 作者:haoyu592
// 描述: 每4小时自动刷新油价数据，支持自定义城市配置，按颜色区分油价类型

// 配置区域 (用户可修改)
const CONFIG = {
  refreshInterval: 4, // 刷新间隔(小时)
  defaultCity: "上海", // 默认城市(汉字)
  textSize: 16, // 字体大小
  textSpacing: 2, // 文字间距
  sinopecLogoUrl: "https://raw.githubusercontent.com/haoyu592/DSbox/main/Old/Sinopec1.png" // 中石化LOGO URL
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
  
  // 系统主题适配
  const bgColor = Color.dynamic(Color.white(), Color.black());
  const textColor = Color.dynamic(Color.black(), Color.white());
  
  widget.backgroundColor = bgColor;
  widget.setPadding(10, 15, 10, 12); // 调整为适合中号小组件的内边距
  widget.spacing = CONFIG.textSpacing;
  widget.url = "scriptable:///";
  
  // 加载配置
  const cityHanzi = await getConfiguredCity();
  
  try {
    // 获取城市拼音
    const cityPinyin = getCityPinyin(cityHanzi);
    
    // 获取油价数据
    const oilData = await fetchOilData(cityPinyin);
    
    // 创建布局
    await createOilDisplay(widget, oilData, cityHanzi, textColor);
    
  } catch (error) {
    // 发生错误时不显示任何内容
    console.error("油价数据获取失败: " + error.message);
    return widget; // 返回空的小部件
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

// 获取配置的城市
async function getConfiguredCity() {
  // 检查小部件参数
  const params = args.widgetParameter ? args.widgetParameter.split(",") : [];
  
  // 参数配置模式
  if (params[0] === "config") {
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
  alert.message = "请输入城市名称 (如: 北京)";
  alert.addTextField("城市", CONFIG.defaultCity);
  alert.addAction("保存");
  alert.addCancelAction("取消");
  
  const actionIndex = await alert.presentAlert();
  if (actionIndex === 0) {
    const newCity = alert.textFieldValue(0).trim();
    saveConfig(newCity);
    return newCity;
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
}

// 创建油价显示 - 针对中号小组件优化
async function createOilDisplay(widget, data, cityHanzi, textColor) {
  // 创建顶部标题栏
  const headerStack = widget.addStack();
  headerStack.layoutHorizontally();
  
  // 标题左侧间距
  headerStack.addSpacer(4);
  
  const title = headerStack.addText(`今日油价 · ${cityHanzi}`);
  title.font = Font.boldSystemFont(18); // 减小字体大小以适应中号小组件
  title.textColor = textColor;
  
  headerStack.addSpacer(); // 填充剩余空间
  
  // 标题与油价网格的距离
  widget.addSpacer(10); // 减小间距以适应中号小组件
  
  // 创建主容器：油价网格 + 图标
  const mainContainer = widget.addStack();
  mainContainer.layoutHorizontally();
  
  // 创建油价网格（两列）
  const grid = mainContainer.addStack();
  grid.layoutHorizontally();
  grid.spacing = 18; // 减小列间距
  
  // 左侧价格列
  const leftCol = grid.addStack();
  leftCol.layoutVertically();
  leftCol.spacing = 15; // 减小行间距
  
  addOilItem(leftCol, "92#", data["92#"], COLOR_CONFIG["92#"], textColor);
  addOilItem(leftCol, "95#", data["95#"], COLOR_CONFIG["95#"], textColor);
  
  // 右侧价格列
  const rightCol = grid.addStack();
  rightCol.layoutVertically();
  rightCol.spacing = 15; // 减小行间距
  
  addOilItem(rightCol, "98#", data["98#"], COLOR_CONFIG["98#"], textColor);
  addOilItem(rightCol, "0#柴油", data["0#"], COLOR_CONFIG["0#"], textColor);
  
  // 添加弹性空间使图标靠右
  mainContainer.addSpacer(40); // 减小间距
  
  // 右侧图标容器（垂直居中显示）
  const iconContainer = mainContainer.addStack();
  iconContainer.layoutVertically();
  iconContainer.centerAlignContent();
  
  // 添加中石化图标 - 调整为80px以适应中号小组件
  try {
    const request = new Request(CONFIG.sinopecLogoUrl);
    const logo = await request.loadImage();
    const logoImage = iconContainer.addImage(logo);
    logoImage.imageSize = new Size(95, 95); // 调整为80px
  } catch (e) {
    const sinopecText = iconContainer.addText("中石化");
    sinopecText.font = Font.mediumSystemFont(14);
    sinopecText.textColor = Color.red();
  }
  
  // 添加弹性空间确保内容居中
  widget.addSpacer();
}

// 添加油价项目 - 针对中号小组件优化
function addOilItem(container, label, price, color, textColor) {
  const itemStack = container.addStack();
  itemStack.layoutHorizontally();
  itemStack.spacing = 4; // 减小内部间距
  
  // 油价类型标识
  const typeIndicator = itemStack.addStack();
  typeIndicator.size = new Size(5, 26); // 减小尺寸
  typeIndicator.backgroundColor = new Color(color);
  
  // 油价信息
  const infoStack = itemStack.addStack();
  infoStack.layoutVertically();
  
  const labelText = infoStack.addText(label);
  labelText.font = Font.mediumSystemFont(CONFIG.textSize - 1); // 减小字体
  labelText.textColor = new Color(color);
  
  // 油价数值
  let priceValue;
  if (typeof price === "number") {
    priceValue = `${price.toFixed(2)}元`;
  } else if (price) {
    priceValue = `${price}元`;
  } else {
    priceValue = "N/A";
  }
  
  const priceText = infoStack.addText(priceValue);
  priceText.font = Font.boldSystemFont(CONFIG.textSize + 1); // 减小字体
  priceText.textColor = textColor;
}

// 执行主函数
Script.setWidget(await main());
Script.complete();
