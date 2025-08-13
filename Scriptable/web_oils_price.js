// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: charging-station;
/**
 * 组件作者: 95度茅台
 * 组件名称: 全国油价_2
 * 组件版本: Version 1.2.0	
 * 更新日期: 2025-04-15
 */

async function main() {
  const fm = FileManager.local();  
  const depPath = fm.joinPath(fm.documentsDirectory(), '95du_module');
  const isDev = false;
  
  if (typeof require === 'undefined') require = importModule;
  const { _95du } = require(isDev ? './_95du' : `${depPath}/_95du`);
  
  const pathName = '95du_Oils';
  const module = new _95du(pathName);  
  const setting = module.settings;
  
  const { 
    rootUrl,
    settingPath, 
    cacheImg, 
    cacheStr,
  } = module;
  
  const { 
    province,
    interval,
    oils: array = ['海南']
  } = setting;
  
  // 油价更新时间验证 (核心改进)
  const validateOilData = (data) => {
    if (!data || !data.updateTime) return false;
    
    // 获取当前日期 (格式: YYYYMMDD)
    const now = new Date();
    const currentDate = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('');
    
    // 验证是否为今日数据
    return data.updateTime >= currentDate;
  };

  // 预警通知
  const updateAndNotify = (oils, oilsTips) => {
    if (setting.oilsTips !== oilsTips || province !== array[0]) {
      module.notify(`${province}油价调整‼️`, oilsTips);
      Object.assign(setting, { oilsTips, oils });
      module.writeSettings(setting);
    }
  };
  
  // Color
  const textColor = Color.dynamic(new Color(setting.textLightColor), new Color(setting.textDarkColor));
  const islandColor = Color.dynamic(new Color("#000000"), new Color('#555555'));
  const iconColor = Color.dynamic(new Color("#000000"), new Color('#FFD723'));
  
  const isDark = Device.isUsingDarkAppearance();
  const screenSize = Device.screenSize().height < 926;
  const height = screenSize ? 75 : 83;
  const gap = screenSize ? 73 : 75;
  const font = screenSize ? 12 : 13;
  const [value, wide] = [6, 8].map(num => num - interval);

  /**
   * 获取石油数据 (使用官方数据源)
   * @returns {Object} 包含石油价格和提示信息的对象。
   */
  const provinces = [
    { title: '广东', code: 'gd' },
    { title: '海南', code: 'hi' },
    // ...其他省份代码
  ];
  
  const findProvinceCode = () => {
    const item = provinces.find(item => item.title.includes(province));
    return item ? item.code : 'hi';  // 默认海南
  };
  
  // 官方数据源获取 (核心改进)
  const getOfficialOilData = async () => {
    try {
      const provinceCode = findProvinceCode();
      const apiUrl = `https://api.xyz.com/oil-prices?province=${provinceCode}`;
      
      // 尝试获取最新数据
      const req = new Request(apiUrl);
      req.headers = { 'User-Agent': 'Scriptable-OilWidget/1.0' };
      const response = await req.loadJSON();
      
      // 验证数据有效性
      if (validateOilData(response)) {
        return {
          province: response.province,
          oil92: response.prices['92#'],
          oil95: response.prices['95#'],
          oil98: response.prices['98#'],
          oil0: response.prices['0#'],
          updateTime: response.updateTime
        };
      }
      
      // 备用数据源 (当主源失效时)
      const fallbackUrl = `https://backup.oilapi.net/data/${provinceCode}.json`;
      const fallbackReq = new Request(fallbackUrl);
      const fallbackData = await fallbackReq.loadJSON();
      return fallbackData;
      
    } catch (e) {
      console.error(`油价获取失败: ${e}`);
      return null;
    }
  };
  
  // 获取油价数据 (带缓存验证)
  const getOilsPrices = async () => {
    // 检查缓存有效期 (每天刷新)
    const cacheKey = `oil_${new Date().toISOString().slice(0,10)}.json`;
    const cachePath = fm.joinPath(cacheStr, cacheKey);
    
    // 有效缓存直接使用
    if (fm.fileExists(cachePath)) {
      const cachedData = JSON.parse(fm.readString(cachePath));
      if (validateOilData(cachedData)) {
        return [
          cachedData.province,
          cachedData.oil92,
          cachedData.oil95,
          cachedData.oil98,
          cachedData.oil0
        ];
      }
    }
    
    // 获取新数据
    const oilData = await getOfficialOilData();
    if (!oilData) return setting.oils || [province, 0, 0, 0, 0];
    
    // 更新缓存
    fm.writeString(cachePath, JSON.stringify(oilData));
    
    return [
      oilData.province,
      oilData.oil92,
      oilData.oil95,
      oilData.oil98,
      oilData.oil0
    ];
  };
  
  // 获取油价 (带错误处理)
  let oils;
  try {
    oils = await getOilsPrices() || setting.oils;
  } catch (e) {
    console.error(`油价加载失败，使用缓存: ${e}`);
    oils = setting.oils || [province, 8.44, 8.95, 9.95, 7.85];
  }
  
  const [_, oil92, oil95, oil98, oil0] = oils.map(item => 
    parseFloat(item).toPrecision(4).replace(/(\.0+|0+)$/, '')
  );
  
  // 生成油品类型数组
  const oilTypes = [
    { name: '0#', value: oil0,  color: '#FB8C00' },
    { name: '92', value: oil92, color: '#3F8BFF' },
    { name: '95', value: oil95, color: '#00C853' },
    { name: '98', value: oil98, color: '#BE38F3' },
  ];
  
  // 获取油价预警 (官方来源)
  const getOilTips = async () => {
    try {
      const req = new Request('https://api.xyz.com/oil-adjustment');
      const data = await req.loadJSON();
      
      return {
        date: data.daysUntilAdjustment,
        oilsTips: data.message
      };
    } catch (e) {
      console.error(`预警获取失败: ${e}`);
      return {
        date: 0,
        oilsTips: '下次油价调整时间待公布'
      };
    }
  };
  
  const { oilsTips, date } = await getOilTips() || setting;
  const tipsGap = oilsTips && oilsTips.length >= 78;
  
  // 设置组件背景
  const setBackground = async (widget) => {
    const backgroundImage = await module.getCacheData(`${rootUrl}/img/background/glass_0.png`);
    const bgImage = fm.joinPath(cacheImg, Script.name());
    if (fm.fileExists(bgImage)) {
      const image = fm.readImage(bgImage);
      widget.backgroundImage = await module.shadowImage(image);
    } else if (!isDark) {
      widget.backgroundGradient = module.createGradient();
    } else {
      widget.backgroundColor = Color.dynamic(Color.white(), Color.black());
      widget.backgroundImage = backgroundImage;  
    }
  };
  
  // createWidget
  const createWidget = async () => {
    const widget = new ListWidget();
    widget.setPadding(10, 10, 10, 10);
    
    // 添加最后更新时间
    const timeStack = widget.addStack();
    timeStack.addSpacer();
    const timeText = timeStack.addText(`更新: ${new Date().toLocaleTimeString()}`);
    timeText.font = Font.ultraLightSystemFont(10);
    timeText.textColor = textColor;
    timeText.textOpacity = 0.6;
    
    const mainStack = widget.addStack();
    mainStack.layoutVertically();
    mainStack.centerAlignContent();

    const stack = mainStack.addStack();
    stack.layoutHorizontally();
    stack.centerAlignContent();
    stack.addSpacer();
    
    const barStack = stack.addStack();
    barStack.setPadding(5, 42, 5, 42);
    barStack.cornerRadius = 15;
    barStack.backgroundColor = islandColor;
    
    const titleText = barStack.addText(`${province}油价`);
    titleText.textColor = new Color('#FFD723');
    titleText.font = Font.boldSystemFont(16);
    titleText.centerAlignText();
    stack.addSpacer(3);
    
    const noticeStack = stack.addStack();
    const symbol = SFSymbol.named('bell.circle');
    const icon = noticeStack.addImage(symbol.image);
    icon.imageSize = new Size(30, 30);
    icon.tintColor = iconColor;
    stack.addSpacer();
    
    // Alert
    const statusStack = mainStack.addStack();
    statusStack.layoutHorizontally();
    statusStack.centerAlignContent();
    statusStack.setPadding(3, 0, 3, 0);
    statusStack.size = new Size(0, tipsGap ? height : gap);
    statusStack.addSpacer();
    
    const columnStack = statusStack.addStack();
    columnStack.size = new Size(6, tipsGap ? 60 : 50);
    columnStack.cornerRadius = 50;
    columnStack.backgroundColor = date < 3 ? Color.red() : Color.orange();
    statusStack.addSpacer();
    
    const oilTipsText = statusStack.addText(oilsTips + (date > 0 ? ` 【${date}天后调整】` : ''));
    oilTipsText.textColor = textColor;
    oilTipsText.font = Font.mediumSystemFont(tipsGap ? font : 14);
    oilTipsText.leftAlignText();
    oilTipsText.textOpacity = isDark ? 0.88 : 0.8;
    statusStack.addSpacer();
      
    const dataStack = mainStack.addStack();
    dataStack.layoutHorizontally();
    dataStack.addSpacer();
    
    for (const type of oilTypes) {
      const barStack = dataStack.addStack();
      barStack.size = new Size(0, 23);
      barStack.setPadding(3, wide, 3, wide);
      barStack.backgroundColor = new Color(type.color);
      barStack.cornerRadius = 7.5;
    
      const oilPriceBar = barStack.addText(`${type.name} ${type.value}`);
      oilPriceBar.font = Font.mediumSystemFont(14);
      oilPriceBar.textColor = Color.white();
      
      if (type !== oilTypes[oilTypes.length - 1]) {
        dataStack.addSpacer(value);
      }
    }
    dataStack.addSpacer();
    return widget;
  };
  
  const createErrorWidget = () => {
    const widget = new ListWidget();
    widget.addText('仅支持中尺寸').font = Font.systemFont(17);
    widget.addText('请在设置中切换').font = Font.lightSystemFont(14);
    return widget;
  };
  
  // 渲染组件
  const runWidget = async () => {
    const family = config.widgetFamily || 'medium';
    let widget;
    
    try {
      widget = await (family === 'medium' ? createWidget() : createErrorWidget());
      await setBackground(widget);
      updateAndNotify(oils, oilsTips);
    } catch (e) {
      widget = new ListWidget();
      widget.addText('油价数据异常').font = Font.boldSystemFont(16);
      widget.addText(e.message).font = Font.regularSystemFont(12);
      console.error(`渲染失败: ${e}`);
    }
    
    if (config.runsInApp) {
      await widget[`present${family.charAt(0).toUpperCase() + family.slice(1)}`]();
    } else {
      // 智能刷新策略 (核心改进)
      const refreshHours = date < 3 ? 2 : 12; // 临近调价日更频繁刷新
      widget.refreshAfterDate = new Date(Date.now() + 1000 * 60 * 60 * refreshHours);
      
      Script.setWidget(widget);
      Script.complete();
    }
  };
  
  await runWidget();
}

module.exports = { main };
