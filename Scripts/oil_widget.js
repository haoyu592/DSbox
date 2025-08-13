// 配置参数
const ICON_URL = "https://raw.githubusercontent.com/haoyu592/DSbox/main/Old/Sinopec1.png"

// 油品颜色配置
const OIL_COLORS = {
  "GAS_92": "#34a853",
  "GAS_95": "#ea4335",
  "AIPAO_GAS_98": "#fbbc05",
  "CHECHAI_0": "#4285f4"
}

// 从BoxJS获取数据
function getOilData() {
  const rawData = $prefs.valueForKey("oil_price_data")
  return rawData ? JSON.parse(rawData) : null
}

function getProvince() {
  return $prefs.valueForKey("oil_province") || "上海"
}

// 获取刷新频率
function getRefreshInterval() {
  const hours = $prefs.valueForKey("refresh_interval") || 4
  return hours * 60 * 60 * 1000
}

// 创建小组件
async function createWidget() {
  const widget = new ListWidget()
  const data = getOilData()
  const isDarkMode = Device.isUsingDarkAppearance()
  
  // 设置背景
  widget.backgroundColor = isDarkMode ? new Color("#000000") : new Color("#ffffff")
  const textColor = isDarkMode ? new Color("#ffffff") : new Color("#000000")
  
  // 主容器
  const mainStack = widget.addStack()
  mainStack.layoutHorizontally()
  mainStack.spacing = 8
  mainStack.size = new Size(0, 0)
  
  // 左侧油价网格 (占70%宽度)
  const leftStack = mainStack.addStack()
  leftStack.layoutVertically()
  leftStack.size = new Size(0, 0)
  leftStack.setPadding(5, 5, 5, 5)
  
  // 第一行：92# 和 95#
  const row1 = leftStack.addStack()
  row1.layoutHorizontally()
  row1.spacing = 10
  addOilItem(row1, "92#", data?.GAS_92 || "--", OIL_COLORS.GAS_92, textColor)
  addOilItem(row1, "95#", data?.GAS_95 || "--", OIL_COLORS.GAS_95, textColor)
  
  // 第二行：98# 和 0#
  const row2 = leftStack.addStack()
  row2.layoutHorizontally()
  row2.spacing = 10
  addOilItem(row2, "98#", data?.AIPAO_GAS_98 || "--", OIL_COLORS.AIPAO_GAS_98, textColor)
  addOilItem(row2, "0#", data?.CHECHAI_0 || "--", OIL_COLORS.CHECHAI_0, textColor)
  
  // 右侧图标 (占30%宽度)
  const rightStack = mainStack.addStack()
  rightStack.layoutVertically()
  rightStack.addSpacer()
  
  const image = await loadImage(ICON_URL)
  const imgElement = rightStack.addImage(image)
  imgElement.imageSize = new Size(70, 70)
  imgElement.centerAlignImage()
  
  rightStack.addSpacer()
  
  // 省份信息
  const footer = widget.addText(`${getProvince()}油价`)
  footer.font = Font.systemFont(12)
  footer.textColor = textColor
  footer.centerAlignText()
  
  // 设置刷新
  widget.refreshAfterDate = new Date(Date.now() + getRefreshInterval())
  
  return widget
}

// 添加油品项目
function addOilItem(stack, name, price, color, textColor) {
  const item = stack.addStack()
  item.layoutVertically()
  item.size = new Size(70, 70)
  item.setPadding(5, 5, 5, 5)
  item.cornerRadius = 10
  item.backgroundColor = new Color(color)
  
  const nameText = item.addText(name)
  nameText.font = Font.boldSystemFont(14)
  nameText.textColor = textColor
  nameText.centerAlignText()
  
  const priceText = item.addText(price)
  priceText.font = Font.boldSystemFont(18)
  priceText.textColor = textColor
  priceText.centerAlignText()
}

// 加载远程图片
async function loadImage(url) {
  try {
    const req = new Request(url)
    return await req.loadImage()
  } catch (e) {
    // 返回空图像作为后备
    return new Image()
  }
}

// 主执行
const widget = await createWidget()
Script.setWidget(widget)
Script.complete()
