// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-gray; icon-glyph: magic;
//
//  oil_widget.js
//  
//
//  Created by KW on 2025/8/8.
//
// 配置参数
const REFRESH_INTERVAL = 4 * 60 * 60 * 1000 // 4小时
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
  const rawData = Keychain.get("oil_price_data")
  return rawData ? JSON.parse(rawData) : null
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
  
  // 左侧油价网格
  const gridStack = mainStack.addStack()
  gridStack.layoutVertically()
  gridStack.spacing = 10
  
  // 第一行：92# 和 95#
  const row1 = gridStack.addStack()
  row1.layoutHorizontally()
  row1.spacing = 10
  addOilItem(row1, "92#", data?.GAS_92 || "--", OIL_COLORS.GAS_92, textColor)
  addOilItem(row1, "95#", data?.GAS_95 || "--", OIL_COLORS.GAS_95, textColor)
  
  // 第二行：98# 和 0#
  const row2 = gridStack.addStack()
  row2.layoutHorizontally()
  row2.spacing = 10
  addOilItem(row2, "98#", data?.AIPAO_GAS_98 || "--", OIL_COLORS.AIPAO_GAS_98, textColor)
  addOilItem(row2, "0#", data?.CHECHAI_0 || "--", OIL_COLORS.CHECHAI_0, textColor)
  
  // 右侧图标
  const iconStack = mainStack.addStack()
  iconStack.size = new Size(100, 100)
  const image = await loadImage(ICON_URL)
  const imgElement = iconStack.addImage(image)
  imgElement.centerAlignImage()
  
  // 省份信息
  if (data?.province) {
    const footer = widget.addText(`${data.province}油价`)
    footer.font = Font.systemFont(12)
    footer.textColor = textColor
    footer.centerAlignText()
  }
  
  // 设置刷新
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_INTERVAL)
  
  return widget
}

// 添加油品项目
function addOilItem(stack, name, price, color, textColor) {
  const item = stack.addStack()
  item.layoutVertically()
  item.setPadding(8, 8, 8, 8)
  item.cornerRadius = 8
  item.backgroundColor = new Color(color)
  
  const nameText = item.addText(name)
  nameText.font = Font.boldSystemFont(14)
  nameText.textColor = textColor
  
  const priceText = item.addText(price)
  priceText.font = Font.boldSystemFont(18)
  priceText.textColor = textColor
}

// 加载远程图片
async function loadImage(url) {
  const req = new Request(url)
  return await req.loadImage()
}

// 主执行
const widget = await createWidget()
Script.setWidget(widget)
Script.complete()
