/*
 * 顺丰会员中心 · 每日签到（Cookie 版）
 *
 * 采集：http-request 阶段从 mcs-mimp-web 的请求里取 Cookie 中的 sessionId / JSESSIONID
 * 执行：定时任务阶段用该 sessionId + 固定盐签名调用签到接口
 *
 * 鉴权模型（已实测确认）：
 *   - 身份 = Cookie 的 sessionId（= JSESSIONID），与 userId、mobile 无关
 *   - 请求头 signature = MD5("token=wwesldfs29aniversaryvdld29&timestamp=<13位ms>&sysCode=MCS-MIMP-CORE")
 *     token 为客户端固定盐，非账号凭证
 *   - 签到 body：{"comeFrom":"vioin","channelFrom":"SFAPP"}
 *   - 返回 obj.hasFinishSign：0=本次签到成功（obj.integralTaskSignPackageVOList 为奖励明细）
 *                            1=今天已签到
 *   - errorCode 100111 = 会话失效，需重新打开小程序让脚本重新抓 sessionId
 *
 * 注意：sessionId 会轮换，重新进入小程序后旧值立即失效，属正常。脚本每次都存最新值。
 */

(function () {
'use strict';

const SESSION_KEY = 'sfsy_session';      // { sessionId, userId, mobile, savedAt }
const SALT = 'wwesldfs29aniversaryvdld29';
const SYS_CODE = 'MCS-MIMP-CORE';
const CHANNEL = 'mypoint';
const PLATFORM = 'MINI_PROGRAM';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.80 NetEase/WIFI Language/zh_CN miniProgram/wxd4185d00bf7e08ac';
const SIGN_URL = 'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage';

/* ---------------- MD5（仅用于签名串，纯 ASCII） ---------------- */
function md5(s) {
  function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
  function add(a, b) { return (a + b) & 0xFFFFFFFF; }
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xD800 || c >= 0xE000) bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      i++;
      const cc = 0x10000 + (((c & 0x3FF) << 10) | (s.charCodeAt(i) & 0x3FF));
      bytes.push(0xF0 | (cc >> 18), 0x80 | ((cc >> 12) & 63), 0x80 | ((cc >> 6) & 63), 0x80 | (cc & 63));
    }
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push((bitLen / Math.pow(2, 8 * i)) & 0xFF);

  let a0 = 0x67452301, b0 = 0xEFCDAB89, c0 = 0x98BADCFE, d0 = 0x10325476;
  const K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) & 0xFFFFFFFF;

  for (let off = 0; off < bytes.length; off += 64) {
    const M = [];
    for (let i = 0; i < 16; i++) {
      M[i] = bytes[off + i * 4] | (bytes[off + i * 4 + 1] << 8) | (bytes[off + i * 4 + 2] << 16) | (bytes[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = add(add(add(F, A), K[i]), M[g]);
      A = D; D = C; C = B;
      const sh = S[(i >> 4) * 4 + (i % 4)];
      B = add(B, rotl(F, sh));
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  function hex(n) {
    let out = '';
    for (let i = 0; i < 4; i++) {
      const b = (n >>> (i * 8)) & 0xFF;
      out += ('0' + b.toString(16)).slice(-2);
    }
    return out;
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

/* ---------------- 工具 ---------------- */
function nowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function parseCookie(str) {
  const out = {};
  String(str || '').split(';').forEach(function (seg) {
    const i = seg.indexOf('=');
    if (i < 0) return;
    out[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  });
  return out;
}

function readSession() {
  try {
    const v = $prefs.valueForKey(SESSION_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function saveSession(obj) {
  try { $prefs.setValueForKey(JSON.stringify(obj), SESSION_KEY); return true; } catch (e) { return false; }
}

function notify(title, sub, body) {
  try { $notify(title, sub || '', body || ''); } catch (e) { }
}

/* ---------------- 采集模式 ---------------- */
function capture() {
  const req = $request;
  const ck = parseCookie((req.headers || {})['Cookie'] || (req.headers || {})['cookie'] || '');
  const sid = ck['sessionId'] || ck['JSESSIONID'] || '';
  if (!sid) return done({});

  const prev = readSession();
  if (prev && prev.sessionId === sid) return done({});   // 没变就不写盘、不通知

  saveSession({
    sessionId: sid,
    userId: ck['_login_user_id_'] || '',
    mobile: ck['_login_mobile_'] || '',
    savedAt: nowStr()
  });
  notify('顺丰签到 · 已捕获会话', (ck['_login_mobile_'] || '') + ' ' + sid.slice(0, 8) + '…',
    'savedAt ' + nowStr() + '\n下次定时任务将用它签到');
  return done({});
}

/* ---------------- 签到任务 ---------------- */
function task() {
  const sess = readSession();
  if (!sess || !sess.sessionId) {
    notify('顺丰签到 · 未配置', '请先打开小程序', '打开小程序「我的 → 积分」页即可自动捕获 sessionId');
    return done();
  }

  const ts = String(Date.now());
  const sign = md5('token=' + SALT + '&timestamp=' + ts + '&sysCode=' + SYS_CODE);
  const cookie = 'sessionId=' + sess.sessionId + '; JSESSIONID=' + sess.sessionId +
    (sess.userId ? '; _login_user_id_=' + sess.userId : '') +
    (sess.mobile ? '; _login_mobile_=' + sess.mobile : '') + '; mimp_g_env=5.0';

  const req = {
    url: SIGN_URL,
    method: 'POST',
    headers: {
      'Cookie': cookie,
      'syscode': SYS_CODE,
      'channel': CHANNEL,
      'platform': PLATFORM,
      'signature': sign,
      'timestamp': ts,
      'content-type': 'application/json',
      'accept': 'application/json, text/plain, */*',
      'origin': 'https://mcs-mimp-web.sf-express.com',
      'referer': 'https://mcs-mimp-web.sf-express.com/up-member/newPoints',
      'user-agent': UA
    },
    body: JSON.stringify({ comeFrom: 'vioin', channelFrom: 'SFAPP' })
  };

  return $task.fetch(req).then(function (res) {
    let data = null;
    try { data = JSON.parse(res.body); } catch (e) { }

    if (!data) {
      notify('顺丰签到 · 解析失败', 'HTTP ' + res.statusCode, String(res.body || '').slice(0, 200));
      return done();
    }

    if (data.errorCode === '100111') {
      notify('顺丰签到 · 会话失效', sess.mobile || '', '请重新打开小程序积分页，脚本会自动换新 sessionId');
      return done();
    }

    if (!data.success) {
      notify('顺丰签到 · 失败', String(data.errorCode || ''), String(data.errorMessage || JSON.stringify(data)).slice(0, 200));
      return done();
    }

    const obj = data.obj || {};
    if (obj.hasFinishSign === 1) {
      notify('顺丰签到 · 今日已签到', sess.mobile || '', '连续 ' + (obj.countDay || '?') + ' 天');
      return done();
    }

    const list = obj.integralTaskSignPackageVOList || [];
    const names = list.map(function (x) {
      return (x.packetName || '') + '×' + (x.commodityCount || 1);
    }).filter(Boolean).join('、');
    notify('顺丰签到 · 成功', sess.mobile || '',
      (names ? '获得 ' + names : '签到完成') + '\n连续 ' + (obj.countDay || '?') + ' 天');
    return done();
  }).catch(function (err) {
    notify('顺丰签到 · 请求异常', sess.mobile || '', String(err && err.message || err).slice(0, 200));
    return done();
  });
}

function done(payload) {
  try { $done(payload || {}); } catch (e) { }
}

/* ---------------- 入口 ---------------- */
if (typeof $request !== 'undefined' && $request && $request.headers) capture();
else task();

})();
