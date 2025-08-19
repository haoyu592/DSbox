// 名称: 中国联通积分签到
// 描述: 通过BoxJS配置Cookie，每日自动签到获取积分
// 作者: haoyu592
// 日期: 2025-08-19
// 使用BoxJS配置Cookie，重写链接：https://raw.githubusercontent.com/haoyu592/DSbox/main/Script/10010.js

const cookieName = '中国联通积分签到';
const cookieKey = 'sliverkiss_10010_cookie';
const signurl = 'https://m.jf.10010.com/jf-external-application/uasptask/sign';
const databody = JSON.stringify({ taskCode: "s746994535376642048" });

let chavy = init();
const cookieVal = chavy.getdata(cookieKey);

if (cookieVal) {
  sign();
} else {
  chavy.msg(cookieName, '⚠️ 请先配置Cookie', '');
  chavy.done();
}

function sign() {
  const url = { url: signurl, headers: { Cookie: cookieVal, 'Content-Type': 'application/json;charset=UTF-8' }, body: databody };
  chavy.post(url, (error, response, data) => {
    try {
      const result = JSON.parse(data);
      if (result.code === '0') {
        chavy.msg(cookieName, '✅ 签到成功', '');
      } else if (result.code === '2') {
        chavy.msg(cookieName, '⏰ 今日已签到', '');
      } else {
        chavy.msg(cookieName, '❌ 签到失败', `原因: ${result.message || '未知错误'}`);
      }
    } catch (e) {
      chavy.msg(cookieName, '❌ 解析响应失败', `错误: ${e}`);
    } finally {
      chavy.done();
    }
  });
}

function init() {
  isSurge = () => typeof $httpClient != "undefined";
  isQuanX = () => typeof $task != "undefined";
  getdata = (key) => $prefs.valueForKey(key);
  setdata = (key, val) => $prefs.setValueForKey(val, key);
  msg = (title, subtitle, body) => {
    if (isQuanX()) $notify(title, subtitle, body);
    if (isSurge()) $notification.post(title, subtitle, body);
  };
  log = (message) => console.log(message);
  post = (options, callback) => {
    if (isQuanX()) {
      $task.fetch(options).then(response => callback(null, response, response.body), reason => callback(reason.error, null, null));
    }
    if (isSurge()) $httpClient.post(options, callback);
  };
  done = (value = {}) => $done(value);
  return { getdata, setdata, msg, log, post, done };
}