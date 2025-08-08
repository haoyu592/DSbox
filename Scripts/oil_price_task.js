//
//  oil_price_task.js
//
//  Created by KW on 2025/8/8.
//

const API_URL = "https://cx.sinopecsales.com/yjkqiantai/data/switchProvince"
const PROVINCE_MAP = {
    "北京": 11, "天津": 12, "河北": 13, "山西": 14, "内蒙古": 15,
    "辽宁": 21, "吉林": 22, "黑龙江": 23, "上海": 31, "江苏": 32,
    "浙江": 33, "安徽": 34, "福建": 35, "江西": 36, "山东": 37,
    "河南": 41, "湖北": 42, "湖南": 43, "广东": 44, "广西": 45,
    "海南": 46, "重庆": 50, "四川": 51, "贵州": 52, "云南": 53,
    "西藏": 54, "陕西": 61, "甘肃": 62, "青海": 63, "宁夏": 64, "新疆": 65
}

// 从BoxJS获取省份配置
const getProvince = () => $prefs.valueForKey("oil_province") || "北京"
const saveData = data => $prefs.setValueForKey(JSON.stringify(data), "oil_price_data")

// 主函数
async function fetchOilPrice() {
    const province = getProvince()
    const provinceId = PROVINCE_MAP[province] || 11
    
    const request = {
        url: API_URL,
        headers: {"Content-Type": "application/json;charset=UTF-8"},
        body: JSON.stringify({provinceId: provinceId.toString()})
    }
    
    try {
        const resp = await $task.fetch({method: "POST", ...request})
        const data = JSON.parse(resp.body)
        
        if (data && data.provinceData) {
            const prices = {
                province: province,
                GAS_92: data.provinceData.GAS_92 || data.provinceData.GAS_92_STATUS,
                GAS_95: data.provinceData.GAS_95 || data.provinceData.GAS_95_STATUS,
                AIPAO_GAS_98: data.provinceData.AIPAO_GAS_98 || data.provinceData.AIPAO_GAS_98_STATUS,
                CHECHAI_0: data.provinceData.CHECHAI_0 || data.provinceData.CHECHAI_0_STATUS,
                timestamp: new Date().getTime()
            }
            saveData(prices)
            $notify("油价更新成功", "", `${province}油价已刷新`)
        }
    } catch (error) {
        $notify("油价更新失败", "", error)
    }
}

// 执行任务
fetchOilPrice()
$done()
