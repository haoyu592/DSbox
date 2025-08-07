// 油价获取脚本 - 兼容Quantumult X
const CITY = "上海"; // 默认城市
const SAVE_PATH = "oilData.json"; // 数据保存路径

// 主函数
async function main() {
  try {
    // 获取配置的城市
    const city = await getConfiguredCity();
    
    // 获取油价数据
    const data = await fetchOilData(city);
    
    // 保存数据
    saveData(data);
    
    // 成功通知
    $notify("油价数据已更新", `城市: ${city}`, createNotificationBody(data));
  } catch (err) {
    // 错误通知
    $notify("油价获取失败", err.message || err);
    console.log(`油价获取失败: ${err}`);
  }
}

// 获取配置的城市
function getConfiguredCity() {
  return new Promise((resolve) => {
    // 尝试从Quantumult X配置读取
    const qxCity = $prefs.valueForKey("oilCity");
    if (qxCity) return resolve(qxCity);
    
    // 尝试从本地文件读取
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), "oilCity.txt");
    if (fm.fileExists(path)) {
      return resolve(fm.readString(path));
    }
    
    // 使用默认城市
    resolve(CITY);
  });
}

// 获取油价数据
async function fetchOilData(city) {
  // 城市拼音映射表
  const cityMap = {
    "北京": "beijing", "上海": "shanghai", "天津": "tianjin", "重庆": "chongqing",
    "河北": "hebei", "山西": "shanxi", "辽宁": "liaoning", "吉林": "jilin",
    "黑龙江": "heilongjiang", "江苏": "jiangsu", "浙江": "zhejiang", "安徽": "anhui",
    "福建": "fujian", "江西": "jiangxi", "山东": "shandong", "河南": "henan",
    "湖北": "hubei", "湖南": "hunan", "广东": "guangdong", "海南": "hainan",
    "四川": "sichuan", "贵州": "guizhou", "云南": "yunnan", "陕西": "shanxi1",
    "甘肃": "gansu", "青海": "qinghai", "台湾": "taiwan", "内蒙古": "neimenggu",
    "广西": "guangxi", "西藏": "xizang", "宁夏": "ningxia", "新疆": "xinjiang",
    "香港": "xianggang", "澳门": "aomen"
  };
  
  const pinyin = cityMap[city] || city.replace(/[省市县区]/g, '').toLowerCase();
  const url = `https://youjia.bazhepu.com/bazhepu/shuju/${pinyin}.json?t=${Date.now()}`;
  
  return new Promise((resolve, reject) => {
    $task.fetch({ url }).then(
      response => {
        try {
          const json = JSON.parse(response.body);
          let latestData = null;
          
          if (json.result && json.result.length > 0) {
            latestData = json.result[0];
          } else if (json.data && json.data.length > 0) {
            latestData = json.data[0];
          } else if (json && json.length > 0) {
            latestData = json[0];
          } else {
            return reject(new Error("无有效数据"));
          }
          
          resolve({
            city,
            timestamp: Date.now(),
            "92#": latestData.Gasoline92 || latestData.g92 || "N/A",
            "95#": latestData.Gasoline95 || latestData.g95 || "N/A",
            "98#": latestData.Gasoline98 || latestData.g98 || "N/A",
            "0#": latestData.Diesel0 || latestData.d0 || "N/A"
          });
        } catch (e) {
          reject(new Error("数据解析失败"));
        }
      },
      reason => reject(new Error(`网络请求失败: ${reason.error}`))
    );
  });
}

// 保存数据到本地
function saveData(data) {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), SAVE_PATH);
  fm.writeString(path, JSON.stringify(data));
}

// 创建通知内容
function createNotificationBody(data) {
  return `92#: ${data["92#"]}元\n95#: ${data["95#"]}元\n98#: ${data["98#"]}元\n0#柴油: ${data["0#"]}元`;
}

// 执行主函数
main().finally(() => $done());
