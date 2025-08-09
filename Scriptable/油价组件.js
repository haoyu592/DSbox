// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// 名称：油价小组件（优化版）
// 作者：haoyu592
// 更新时间：2025-08-09
// 描述：显示当地92#/95#/98#/0#柴油实时油价，必须配置省份

// 配置说明：首次使用必须在Scriptable App内运行并配置省份

const DEFAULTS = {
  province: null, // 必须配置省份
  iconUrl: "https://raw.githubusercontent.com/haoyu592/DSbox/main/Old/Sinopec1.png"
};

// 主函数
async function main() {
  const widget = new ListWidget();
  const now = new Date(); // 获取当前时间
  
  try {
    // 获取配置
    const config = await getConfig();
    if (!config || !config.province) {
      throw new Error("请先配置省份");
    }
    
    const provinceId = cityToId(config.province);
    if (!provinceId) {
      throw new Error(`无效省份: ${config.province}`);
    }
    
    // 设置背景和颜色主题
    setupAppearance(widget); // 确保调用设置外观
    
    // 获取油价数据
    const oilData = await fetchOilPrice(provinceId);
    
    // 添加标题行
    const titleStack = widget.addStack();
    titleStack.centerAlignContent();
    const titleText = titleStack.addText(`今日油价 · ${config.province}`);
    titleText.font = Font.boldSystemFont(18);
    titleText.textColor = getTextColor(); // 使用主题文字颜色
    widget.addSpacer(8); // 标题和内容之间的间距
    
    // 构建内容区域
    const contentStack = widget.addStack();
    contentStack.spacing = 8;
    
    // 左侧油价网格 - 增加权重，占用更多空间
    const gridStack = contentStack.addStack();
    gridStack.layoutVertically();
    gridStack.size = new Size(0, 0); // 自动调整大小
    addOilGrid(gridStack, oilData);
    
    // 右侧图标区域 - 减少宽度
    const rightStack = contentStack.addStack();
    rightStack.layoutVertically();
    rightStack.size = new Size(120, 0); // 缩小宽度为120
    
    // 中石化Logo
    await addLogo(rightStack);
    
    // 添加更新时间到左侧底部
    widget.addSpacer(); // 添加弹性空间将内容推到顶部
    const footerStack = widget.addStack();
    footerStack.centerAlignContent();
    
    // 格式化更新时间 HH:mm
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const updateText = footerStack.addText(`更新: ${timeString}`);
    updateText.font = Font.footnote();
    updateText.textColor = Color.dynamic(Color.gray(), Color.lightGray());
    
   } catch (error) {
     //错误处理
     const errorStack = widget.addStack();
    errorStack.layoutVertically();
    errorStack.addSpacer();
    
    const errorText = errorStack.addText(error.message);
    errorText.font = Font.mediumSystemFont(14);
    errorText.textColor = Color.red();
    errorText.centerAlignText();
    
    if (error.message.includes("配置")) {
      const setupText = errorStack.addText("在App内运行配置");
      setupText.font = Font.footnote();
      setupText.textColor = Color.blue();
      setupText.centerAlignText();
    }
    
    errorStack.addSpacer();
  }
  
  // 设置刷新频率（每4小时）- 使用小时单位变量
  const refreshHours = 4;
  widget.refreshAfterDate = new Date(now.getTime() + refreshHours * 60 * 60 * 1000);
  
  Script.setWidget(widget);
  Script.complete();
  return widget;
}

// 获取主题文字颜色
function getTextColor() {
  return Color.dynamic(Color.black(), Color.white()); // 使用动态颜色
}

// 获取配置（必须配置省份）
async function getConfig() {
  // 1. 尝试获取小组件参数
  if (args.widgetParameter) {
    return { province: args.widgetParameter };
  }
  
  // 2. 尝试从本地存储获取
  const localConfig = await loadConfig();
  if (localConfig && localConfig.province) {
    return localConfig;
  }
  
  // 3. 都没有则返回null（强制配置）
  return null;
}

// 从本地存储加载配置
async function loadConfig() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "oilWidgetConfig.json");
  
  if (fm.fileExists(path)) {
    try {
      const data = fm.readString(path);
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// 保存配置到本地存储
async function saveConfig(province) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "oilWidgetConfig.json");
  const config = { province };
  fm.writeString(path, JSON.stringify(config));
}

// 省份名称转ID
function cityToId(provinceName) {
  const provinceMap = {
    "北京": "11", "天津": "12", "河北": "13", "山西": "14", "内蒙古": "15",
    "辽宁": "21", "吉林": "22", "黑龙江": "23", "上海": "31", "江苏": "32",
    "浙江": "33", "安徽": "34", "福建": "35", "江西": "36", "山东": "37",
    "河南": "41", "湖北": "42", "湖南": "43", "广东": "44", "广西": "45",
    "海南": "46", "重庆": "50", "四川": "51", "贵州": "52", "云南": "53",
    "西藏": "54", "陕西": "61", "甘肃": "62", "青海": "63", "宁夏": "64",
    "新疆": "65"
  };
  
  // 支持简写
  const normalizedProvince = provinceName.replace(/[省市自治区]/g, "");
  return provinceMap[normalizedProvince] || provinceMap[provinceName];
}

// 设置外观 - 修复深色模式问题
function setupAppearance(widget) {
  // 使用动态颜色设置背景
  widget.backgroundColor = Color.dynamic(
    new Color("#FFFFFF"), // 浅色模式背景
    new Color("#000000")  // 深色模式背景
  );
}

// 添加油价网格
function addOilGrid(parentStack, oilData) {
  const colors = {
    "92#": "#34a853",
    "95#": "#ea4335",
    "98#": "#fbbc05",
    "0#": "#4285f4"
  };
  
  // 第一行（92# 和 95#）
  const row1 = parentStack.addStack(2);
  addOilItem(row1, "92#", findOilPrice(oilData, "92"), colors["92#"]);
  addOilItem(row1, "95#", findOilPrice(oilData, "95"), colors["95#"]);
  
  // 第二行（98# 和 0#）- 增加间距
  parentStack.addSpacer(4);
  const row2 = parentStack.addStack();
  addOilItem(row2, "98#", findOilPrice(oilData, "98"), colors["98#"]);
  addOilItem(row2, "0#", findOilPrice(oilData, "0"), colors["0#"]);
}

// 智能查找油价 - 增强版
function findOilPrice(oilData, oilType) {
  // 油价数据在provinceData中
  const provinceData = oilData.provinceData || {};
  
  // 尝试多种可能的字段名称
  const fieldPatterns = {
    "92": ["GAS_92", "GAS_92_STATUS", "GAS92", "GAS92_STATUS", "92#", "92", "ninetyTwo", "92汽油", "92号"],
    "95": ["GAS_95", "GAS_95_STATUS", "GAS95", "GAS95_STATUS", "95#", "95", "ninetyFive", "95汽油", "95号"],
    "98": ["AIPAO_GAS_98", "AIPAO_GAS_98_STATUS", "GAS_98", "GAS98_STATUS", "98#", "98", "ninetyEight", "98汽油", "98号"],
    "0": ["CHECHAI_0", "CHECHAI_0_STATUS", "CHE0", "DIESEL_0", "0#", "0", "zero", "柴油", "柴油0号"]
  };
  
  const patterns = fieldPatterns[oilType] || [];
  
  // 优先尝试精确匹配
  for (const field of patterns) {
    if (provinceData[field] !== undefined && provinceData[field] !== null) {
      const value = extractValue(provinceData[field]);
      if (value) return value;
    }
  }
  
  // 深度搜索所有字段（不区分大小写）
  const searchTerm = oilType === "0" ? "柴油" : `${oilType}汽油`;
  const lowerSearchTerm = searchTerm.toLowerCase();
  
  for (const key in provinceData) {
    const lowerKey = key.toLowerCase();
    
    // 检查键名是否包含油号关键词
    if (lowerKey.includes(lowerSearchTerm)) {
      const value = extractValue(provinceData[key]);
      if (value) return value;
    }
    
    // 检查键值是否包含油号关键词
    if (typeof provinceData[key] === 'string') {
      const lowerValue = provinceData[key].toLowerCase();
      if (lowerValue.includes(lowerSearchTerm)) {
        const value = extractValue(provinceData[key]);
        if (value) return value;
      }
    }
  }
  
  // 作为最后手段，尝试提取任何看起来像油价的值
  for (const key in provinceData) {
    const value = extractValue(provinceData[key]);
    if (value && /^\d+\.\d{2}$/.test(value)) {
      return value;
    }
  }
  
  return null;
}

// 从值中提取价格 - 增强版
function extractValue(value) {
  // 递归处理嵌套结构
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = extractValue(item);
      if (result) return result;
    }
    return null;
  }
  
  if (typeof value === 'object' && value !== null) {
    // 优先检查常见字段
    if (value.price !== undefined) return extractValue(value.price);
    if (value.value !== undefined) return extractValue(value.value);
    if (value.oilPrice !== undefined) return extractValue(value.oilPrice);
    
    // 递归检查所有属性
    for (const key in value) {
      const result = extractValue(value[key]);
      if (result) return result;
    }
    return null;
  }
  
  // 处理字符串和数字
  if (typeof value === 'string' || typeof value === 'number') {
    // 提取浮点数价格
    const match = String(value).match(/\d{1,3}\.\d{2}/);
    if (match) return match[0];
    
    // 提取整数价格
    const intMatch = String(value).match(/\d{1,3}(?=\D*$)/);
    if (intMatch) return intMatch[0];
  }
  
  return null;
}

// 添加单个油价项目 - 优化显示空间（添加方块符号）
function addOilItem(parentStack, label, price, colorHex) {
  const itemStack = parentStack.addStack();
  itemStack.layoutVertically();
  itemStack.setPadding(5, 10, 5, 10); // 减少左右内边距
  
  // 创建标签堆栈（包含方块符号和文本）
  const labelStack = itemStack.addStack();
  labelStack.centerAlignContent();
  
  // 添加方块符号（使用油品颜色）
  const block = labelStack.addText("█"); // 方块符号
  block.font = Font.systemFont(18);
  block.textColor = new Color(colorHex);
  block.minimumScaleFactor = 0.5; // 允许缩放
  
  // 添加间距
  labelStack.addSpacer(4);
  
  // 添加标签文本
  const labelText = labelStack.addText(label);
  labelText.font = Font.boldSystemFont(16);
  labelText.textColor = new Color(colorHex);
  labelText.minimumScaleFactor = 0.5;
  
  // 添加价格
  let displayPrice = price ? `${price}元`: "N/A";
  const priceText = itemStack.addText(displayPrice);
  
  // 根据价格长度动态调整字体大小
  if (displayPrice.length > 6) {
    priceText.font = Font.boldSystemFont(20);
  } else {
    priceText.font = Font.boldSystemFont(24);
  }
  
  priceText.textColor = getTextColor(); // 使用主题文字颜色
  priceText.minimumScaleFactor = 0.5; // 允许文本缩小
  
  parentStack.addSpacer();
}

  
// 添加Logo - 优化大小
async function addLogo(parentStack) {
  try {
    const req = new Request(DEFAULTS.iconUrl);
    const img = await req.loadImage();
    const imgElem = parentStack.addImage(img);
    imgElem.imageSize = new Size(100, 100); // Logo
    imgElem.cornerRadius = 8;

  } catch (e) {
    const fallback = parentStack.addText("中石化");
    fallback.font = Font.boldSystemFont(10); // 缩小回退文本
    fallback.textColor = Color.red();
    parentStack.addSpacer(4);
  }

}

// 获取油价API - 修复版（从provinceData提取）
async function fetchOilPrice(provinceId) {
  const url = "https://cx.sinopecsales.com/yjkqiantai/data/switchProvince";
  const req = new Request(url);
  
  req.method = "POST";
  req.headers = {
    "Content-Type": "application/json;charset=UTF-8",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "Referer": "https://cx.sinopecsales.com/web/customer/oilPrice.html"
  };
  req.body = JSON.stringify({ provinceId });
  
  try {
    const resp = await req.loadJSON();
    
    if (!resp || !resp.data) {
      throw new Error("API返回数据无效");
    }
    
    // 记录API响应用于调试
    if (config.runsInApp) {
      console.log("完整API响应:");
      console.log(JSON.stringify(resp, null, 2));
      
      if (resp.data.provinceData) {
        console.log("省份油价数据 (provinceData):");
        console.log(JSON.stringify(resp.data.provinceData, null, 2));
        
        // 记录油价提取结果
        console.log("提取的油价:");
        console.log(`92#: ${findOilPrice(resp.data, "92")}`);
        console.log(`95#: ${findOilPrice(resp.data, "95")}`);
        console.log(`98#: ${findOilPrice(resp.data, "98")}`);
        console.log(`0#: ${findOilPrice(resp.data, "0")}`);
      }
    }
    
    return resp.data;
  } catch (error) {
    console.error(`油价请求失败: ${error}`);
    throw new Error("网络请求失败，请稍后重试");
  }
}

// 配置省份
async function configureProvince() {
  const alert = new Alert();
  alert.title = "设置油价省份";
  alert.message = "请输入省份名称（如：上海）";
  
  alert.addTextField("省份名称", "");
  alert.addAction("确定");
  alert.addCancelAction("取消");
  
  const response = await alert.presentAlert();
  if (response === 0) { // 确定按钮
    const province = alert.textFieldValue(0).trim();
    if (!province) {
      const errorAlert = new Alert();
      errorAlert.title = "输入无效";
      errorAlert.message = "省份名称不能为空";
      await errorAlert.presentAlert();
      return;
    }
    
    const provinceId = cityToId(province);
    if (!provinceId) {
      const errorAlert = new Alert();
      errorAlert.title = "省份不支持";
      errorAlert.message = `未找到省份: ${province}`;
      await errorAlert.presentAlert();
      return;
    }
    
    await saveConfig(province);
    
    // 测试获取油价
    try {
      const oilData = await fetchOilPrice(provinceId);
      const successAlert = new Alert();
      successAlert.title = "设置成功";
      successAlert.message = `已设置为: ${province}\n油价获取成功!`;
      await successAlert.presentAlert();
      
      // 显示预览
      const widget = new ListWidget();
      setupAppearance(widget);
      addOilGrid(widget, oilData);
      await widget.presentMedium();
    } catch (error) {
      const errorAlert = new Alert();
      errorAlert.title = "油价获取失败";
      errorAlert.message = `省份: ${province}\n错误: ${error.message}`;
      await errorAlert.presentAlert();
    }
  }
}

// 执行主函数或配置
if (config.runsInApp) {
  // 在App内运行时显示配置选项
  const alert = new Alert();
  alert.title = "油价小组件";
  alert.message = "请选择操作";
  alert.addAction("查看油价");
  alert.addAction("配置省份");
  alert.addCancelAction("取消");
  
  const response = await alert.presentAlert();
  if (response === 0) { // 查看油价
    const widget = await main();
    await widget.presentMedium();
  } else if (response === 1) { // 配置省份
    await configureProvince();
  }
} else {
  // 在小组件中直接运行
  await main();
}
