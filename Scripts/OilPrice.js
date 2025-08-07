// 油价获取脚本 - 100% 兼容 Quantumult X
const CITY = "上海"; // 默认城市
const DATA_KEY = "oilData"; // 数据存储键名

// 主函数
function main() {
  // 获取配置的城市
  const city = getConfiguredCity();
  
  // 获取油价数据
  fetchOilData(city).then(
    data => {
      // 保存数据
      saveData(data);
      
      // 成功通知
      $notify("油价数据已更新", `城市: ${city}`, createNotificationBody(data));
      $done();
    },
    error => {
      // 错误通知
      $notify("油价获取失败", error);
      console.log(`油价获取失败: ${error}`);
      $done();
    }
  );
}

// 获取配置的城市
function getConfiguredCity() {
  return $prefs.valueForKey("oilCity") || CITY;
}

// 获取油价数据
function fetchOilData(city) {
  return new Promise((resolve, reject) => {
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
    
    // 使用 Quantumult X 的 HTTP 请求
    $task.fetch({
      url: url,
      timeout: 10 // 10秒超时
    }).then(
      response => {
        try {
          const json = JSON.parse(response.body);
          let latestData = null;
          
          // 处理不同API响应格式
          if (json.result && json.result.length > 0) {
            latestData = json.result[0];
          } else if (json.data && json.data.length > 0) {
            latestData = json.data[0];
          } else if (Array.isArray(json) && json.length > 0) {
            latestData = json[0];
          } else {
            return reject("无有效数据");
          }
          
          // 提取油价
          const result = {
            city: city,
            timestamp: Date.now(),
            "92#": latestData.Gasoline92 || latestData.g92 || "N/A",
            "95#": latestData.Gasoline95 || latestData.g95 || "N/A",
            "98#": latestData.Gasoline98 || latestData.g98 || "N/A",
            "0#": latestData.Diesel0 || latestData.d0 || "N/A"
          };
          
          resolve(result);
        } catch (e) {
          reject("数据解析失败");
        }
      },
      reason => {
        reject(`网络请求失败: ${reason.error}`);
      }
    );
  });
}

// 保存数据到Quantumult X的持久化存储
function saveData(data) {
  $prefs.setValueForKey(JSON.stringify(data), DATA_KEY);
}

// 创建通知内容
function createNotificationBody(data) {
  return `92#: ${data["92#"]}元\n95#: ${data["95#"]}元\n98#: ${data["98#"]}元\n0#柴油: ${data["0#"]}元`;
}

// 执行主函数
main();
