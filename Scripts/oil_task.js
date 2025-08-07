// 油价定时获取.js
// 从BoxJS读取配置，获取油价数据并存储

const API_BASE = "https://www.dacheche.com/youjia/api/"
const STORAGE_KEY = "oil_data"
const CONFIG_KEY = "oil_config"

// 省份拼音映射
const PROVINCE_MAP = {
  "beijing": "北京", "shanghai": "上海", "tianjin": "天津", "chongqing": "重庆",
  "guangdong": "广东", "jiangsu": "江苏", "zhejiang": "浙江", "shandong": "山东",
  "sichuan": "四川", "hubei": "湖北", "hunan": "湖南", "hebei": "河北", "henan": "河南"
};

// 从BoxJS获取配置
function getBoxJSConfig() {
  return new Promise((resolve) => {
    $prefs.getValueForKey(CONFIG_KEY, (config) => {
      try {
        resolve(config ? JSON.parse(config) : null);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// 获取油价数据
async function fetchOilData(province) {
  const url = `${API_BASE}oilPrice?province=${encodeURIComponent(province)}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
    "Accept": "application/json"
  };
  
  const response = await $task.fetch({ url, headers });
  if (!response) throw new Error("API请求失败");
  
  const data = JSON.parse(response.body);
  if (!data || !data.data) throw new Error("无效的油价数据");
  
  return {
    province: PROVINCE_MAP[province] || province,
    updateTime: new Date().toLocaleString(),
    data: {
      "92#": data.data.gasoline92 || "N/A",
      "95#": data.data.gasoline95 || "N/A",
      "98#": data.data.gasoline98 || "N/A",
      "0#": data.data.diesel0 || "N/A"
    }
  };
}

// 保存数据到BoxJS
function saveToBoxJS(data) {
  $done({
    [STORAGE_KEY]: JSON.stringify(data)
  });
}

// 主函数
async function main() {
  try {
    // 获取配置
    const config = await getBoxJSConfig();
    if (!config || !config.oil_province) {
      throw new Error("未找到省份配置");
    }
    
    // 获取油价数据
    const oilData = await fetchOilData(config.oil_province);
    
    // 保存数据
    saveToBoxJS(oilData);
    
    console.log(`油价数据已更新: ${oilData.updateTime}`);
  } catch (error) {
    console.error(`油价获取失败: ${error.message}`);
    $done();
  }
}

main();
