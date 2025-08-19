// 名称: 中国联通签到脚本
// 描述: 每日自动执行中国联通积分签到
// 作者: haoyu592
// 日期: 2025-08-19
// 支持: https://github.com/haoyu592/DSbox
// 使用说明: 通过 BoxJS 填写 Cookie (key: 10010Cookie)
// 使用BoxJS配置Cookie，重写链接：https://raw.githubusercontent.com/haoyu592/DSbox/main/Script/10010.js

const $ = new Env("中国联通签到");
const COOKIE_KEY = "10010Cookie";
const API_URL = "https://m.jf.10010.com/jf-external-application/uasptask/sign";

// 从持久化存储获取 Cookie
let cookie = $.getdata(COOKIE_KEY);

// 主函数
(async () => {
  if (!cookie) {
    $.notify("❌ 中国联通签到失败", "请先填写 Cookie", "");
    $.done();
    return;
  }

  try {
    const response = await signTask();
    handleResponse(response);
  } catch (error) {
    $.notify("❌ 中国联通请求异常", error.message || error, "");
  } finally {
    $.done();
  }
})();

// 执行签到请求
function signTask() {
  const headers = {
    "Content-Type": "application/json;charset=UTF-8",
    "Cookie": cookie,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
  };

  const body = JSON.stringify({
    taskCode: "s746994535376642048"
  });

  return $.fetch({
    url: API_URL,
    method: "POST",
    headers: headers,
    body: body
  });
}

// 处理响应结果
function handleResponse(response) {
  try {
    const result = JSON.parse(response.body);
    
    if (result.code === "0000") {
      $.notify("✅ 中国联通签到成功", result.msg || "积分已到账", "");
      $.log("签到成功: " + JSON.stringify(result));
    } else {
      $.notify("❌ 中国联通签到失败", result.msg || "未知错误", "");
      $.log("签到失败: " + response.body);
    }
  } catch (e) {
    $.notify("❌ 中国联通响应解析失败", "请检查接口返回", "");
    $.log("响应解析失败: " + response.body);
  }
}

// 工具函数
function Env(name) {
  this.name = name;
  this.getdata = (key) => $persistentStore.read(key);
  this.setdata = (val, key) => $persistentStore.write(val, key);
  this.fetch = (options) => $task.fetch(options);
  this.notify = (title, subtitle, message) => $notify(title, subtitle, message);
  this.log = (message) => console.log(`${this.name}: ${message}`);
  this.done = () => $done();
}