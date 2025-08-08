const API_URL = "https://cx.sinopecsales.com/yjkqiantai/data/switchProvince"

// 从BoxJS获取省份ID（使用订阅中的方法）
const provinceId = $prefs.valueForKey("oil_province_id") || "31"

// 保存数据到BoxJS
const saveData = data => {
  const priceData = {
    province: $prefs.valueForKey("oil_province") || "上海",
    GAS_92: data.provinceData.GAS_92 || data.provinceData.GAS_92_STATUS,
    GAS_95: data.provinceData.GAS_95 || data.provinceData.GAS_95_STATUS,
    AIPAO_GAS_98: data.provinceData.AIPAO_GAS_98 || data.provinceData.AIPAO_GAS_98_STATUS,
    CHECHAI_0: data.provinceData.CHECHAI_0 || data.provinceData.CHECHAI_0_STATUS,
    timestamp: new Date().getTime()
  }
  
  $prefs.setValueForKey(JSON.stringify(priceData), "oil_price_data")
}

// 主函数
async function fetchOilPrice() {
  const request = {
    url: API_URL,
    headers: {"Content-Type": "application/json;charset=UTF-8"},
    body: JSON.stringify({provinceId})
  }
  
  try {
    const resp = await $task.fetch({method: "POST", ...request})
    const data = JSON.parse(resp.body)
    
    if (data && data.provinceData) {
      saveData(data)
      $notify("油价更新成功", "", `${$prefs.valueForKey("oil_province")}油价已刷新`)
    }
  } catch (error) {
    $notify("油价更新失败", "", error)
  }
}

// 执行任务
fetchOilPrice()
$done()
