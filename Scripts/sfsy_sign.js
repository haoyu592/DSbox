/*
 * 顺丰会员中心 · 每日任务
 * 采集 Cookie 的 sessionId → 定时跑 签到 / 积分任务 / 会员日 / 优惠券，结果走通知 + 日志
 */

(function () {
'use strict';

const SESSION_KEY = 'sfsy_session';
const SALT = 'wwesldfs29aniversaryvdld29';
const APP_TOKEN = 'zeTLTYeG0bLetfRk';
const SYS_CODE = 'MCS-MIMP-CORE';
const CHANNEL = 'mypoint';
const PLATFORM = 'MINI_PROGRAM';
const BASE = 'https://mcs-mimp-web.sf-express.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.80(0x18005028) NetType/WIFI Language/zh_CN miniProgram/wxd4185d00bf7e08ac';

const EP = {
  userInfo: BASE + '/mcs-mimp/commonPost/~memberIntegral~userInfoService~queryUserInfo',
  signV2: BASE + '/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~sign',
  signV1: BASE + '/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage',
  taskList: BASE + '/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES',
  welfare: BASE + '/mcs-mimp/commonPost/~memberActLengthy~redPacketActivityService~superWelfare~receiveRedPacket',
  memberDay: BASE + '/mcs-mimp/commonPost/~memberNonactivity~memberDayIndexService~index',
  coupon: BASE + '/mcs-mimp/coupon/available/list'
};

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
      B = add(B, rotl(F, S[(i >> 4) * 4 + (i % 4)]));
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  function hex(n) {
    let out = '';
    for (let i = 0; i < 4; i++) out += ('0' + ((n >>> (i * 8)) & 0xFF).toString(16)).slice(-2);
    return out;
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

function nowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function clip(s, n) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
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
  try { const v = $prefs.valueForKey(SESSION_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

function saveSession(obj) {
  try { $prefs.setValueForKey(JSON.stringify(obj), SESSION_KEY); return true; } catch (e) { return false; }
}

function notify(title, sub, body) {
  try { $notify(title, sub || '', body || ''); } catch (e) { }
}

function log(s) {
  try { console.log(String(s)); } catch (e) { }
}

function done(payload) {
  try { $done(payload || {}); } catch (e) { }
}

function subst(v, sid) {
  if (typeof v === 'string') return v === '__SID__' ? sid : v;
  if (Array.isArray(v)) return v.map(function (x) { return subst(x, sid); });
  if (v && typeof v === 'object') {
    const o = {};
    for (const k in v) o[k] = subst(v[k], sid);
    return o;
  }
  return v;
}

function deviceId() {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue; }
    if (i === 14) { out += '4'; continue; }
    if (i === 19) { out += hex[8 + Math.floor(Math.random() * 4)]; continue; }
    out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

function capture() {
  const h = $request.headers || {};
  const ck = parseCookie(h['Cookie'] || h['cookie'] || '');
  const sid = ck['sessionId'] || ck['JSESSIONID'] || '';
  if (!sid) return done({});

  const prev = readSession();
  if (prev && prev.sessionId === sid) return done({});

  saveSession({
    sessionId: sid,
    userId: ck['_login_user_id_'] || '',
    mobile: ck['_login_mobile_'] || '',
    savedAt: nowStr()
  });
  notify('顺丰任务 · 已捕获会话', (ck['_login_mobile_'] || '') + ' ' + sid.slice(0, 8) + '…', 'savedAt ' + nowStr());
  log('[顺丰][采集] ' + nowStr() + ' 捕获 sessionId=' + sid.slice(0, 8) + '… mobile=' + (ck['_login_mobile_'] || '-') +
    ' (旧值 ' + (prev ? (prev.sessionId || '').slice(0, 8) + '…' : '无') + ')');
  return done({});
}

function api(sess, url, bodyObj, extraHeaders) {
  const ts = String(Date.now());
  const sign = md5('token=' + SALT + '&timestamp=' + ts + '&sysCode=' + SYS_CODE);
  const cookie = 'sessionId=' + sess.sessionId + '; JSESSIONID=' + sess.sessionId +
    (sess.userId ? '; _login_user_id_=' + sess.userId : '') +
    (sess.mobile ? '; _login_mobile_=' + sess.mobile : '') + '; mimp_g_env=5.0';

  const headers = {
    'Cookie': cookie,
    'syscode': SYS_CODE,
    'channel': CHANNEL,
    'platform': PLATFORM,
    'signature': sign,
    'timestamp': ts,
    'content-type': 'application/json',
    'accept': 'application/json, text/plain, */*',
    'origin': BASE,
    'referer': BASE + '/up-member/newPoints',
    'user-agent': UA
  };
  if (extraHeaders) for (const k in extraHeaders) headers[k] = extraHeaders[k];

  return $task.fetch({
    url: url, method: 'POST', headers: headers,
    body: JSON.stringify(bodyObj || {})
  }).then(function (res) {
    let data = null;
    try { data = JSON.parse(res.body); } catch (e) { }
    return { http: res.statusCode, data: data, raw: res.body };
  });
}

function judge(step, r) {
  const d = r.data;
  if (!d) return { state: 'fail', msg: 'HTTP ' + r.http + ' 非 JSON' };
  if (d.errorCode === '100111') return { state: 'expired', msg: '会话失效' };
  if (!d.success) {
    if (step.softFail) {
      const soft = step.softFail(d);
      if (soft) return { state: 'ok', msg: soft, data: d };
    }
    return { state: 'fail', msg: clip(d.errorMessage || ('code ' + d.errorCode), 44) };
  }
  let msg = 'OK';
  try { msg = String(step.parse ? step.parse(d) : 'OK'); } catch (e) { msg = 'OK'; }
  return { state: 'ok', msg: msg, data: d };
}

function retryable(msg) {
  return /token|权限验证|登录|鉴权/i.test(String(msg || ''));
}

function runStep(sess, step) {
  const variants = [{ label: '', url: step.url, body: step.body, headers: step.headers }].concat(step.fallbacks || []);
  let i = 0;

  function next() {
    const v = variants[i++];
    const body = subst(v.body, sess.sessionId);
    const hdr = v.headers ? subst(v.headers, sess.sessionId) : null;

    return api(sess, v.url || step.url, body, hdr).then(function (r) {
      const verdict = judge(step, r);
      const nextIsForced = variants[i] && variants[i].retryOnAny;
      if (verdict.state === 'fail' && i < variants.length && (nextIsForced || retryable(verdict.msg))) return next();
      if (verdict.state === 'ok' && v.label) verdict.msg += '（' + v.label + '）';
      return verdict;
    }).catch(function (err) {
      return { state: 'fail', msg: clip(err && err.message || err, 44) };
    });
  }
  return next();
}

function buildSteps() {
  const dev = deviceId();
  const day = new Date(Date.now() + 8 * 3600 * 1000).getUTCDate();
  const infoBody = { sysCode: 'ESG-CEMP-CORE', optionalColumns: ['usablePoint', 'cycleSub', 'leavePoint'] };
  const INFO_FALLBACKS = [{ label: '无token', body: infoBody }];

  return [
    {
      key: 'infoBefore', label: '积分(前)', url: EP.userInfo, silent: true,
      body: Object.assign({ token: APP_TOKEN }, infoBody),
      fallbacks: INFO_FALLBACKS,
      parse: function (d) { return d.obj && d.obj.usablePoint; }
    },
    {
      key: 'sign', label: '签到', url: EP.signV2,
      body: {},
      softFail: function (d) {
        return /已签到/.test(String(d.errorMessage || '')) ? '今日已签到' : null;
      },
      fallbacks: [{ label: 'V1兜底', url: EP.signV1, body: { comeFrom: 'vioin', channelFrom: 'SFAPP' }, retryOnAny: true }],
      parse: function (d) {
        const o = d.obj || {};
        if (o.hasFinishSign === 1) return '今日已签到（连续 ' + (o.countDay || '?') + ' 天）';
        const list = (o.integralTaskSignPackageVOList || []).map(function (x) {
          return (x.packetName || '') + '×' + (x.commodityCount || 1);
        }).filter(Boolean).join('、');
        if (list) return '签到成功，获得 ' + list;
        return o.countDay ? '签到成功（连续 ' + o.countDay + ' 天）' : '签到成功';
      }
    },
    {
      key: 'tasks', label: '积分任务', url: EP.taskList,
      body: { deviceId: dev, channelType: '3' },
      parse: function (d) {
        const o = d.obj || {};
        const list = o.taskTitleLevels || [];
        const done = list.filter(function (x) { return x.status === 1; }).length;
        const point = (typeof o.totalPoint === 'number') ? '，总积分 ' + o.totalPoint : '';
        return list.length ? '共 ' + list.length + ' 个，已完成 ' + done + ' 个' + point : ('无任务' + point);
      }
    },
    {
      key: 'welfare', label: '超值福利', url: EP.welfare,
      body: {},
      skip: true,
      skipReason: '接口参数未确认（空 body 返回 999999），已默认关闭',
      parse: function (d) {
        const o = d.obj || {};
        return o.point ? '领取 ' + o.point + ' 积分' : '已处理';
      }
    },
    {
      key: 'memberDay', label: '会员日', url: EP.memberDay,
      body: {},
      skip: day < 26 || day > 28,
      skipReason: '非会员日（' + day + ' 号，仅 26-28）',
      parse: function (d) {
        const o = d.obj || {};
        const st = o.actStatus;
        const stText = st === undefined ? '' : '，状态 ' + st;
        return '抽奖机会 ' + (o.lotteryNum === undefined ? '-' : o.lotteryNum) + ' 次' + stText;
      }
    },
    {
      key: 'coupon', label: '优惠券', url: EP.coupon,
      body: { pageNum: 1, pageSize: 20 },
      parse: function (d) {
        const o = d.obj;
        const arr = Array.isArray(o) ? o : (o && (o.list || o.records)) || [];
        return '可用 ' + arr.length + ' 张';
      }
    },
    {
      key: 'infoAfter', label: '积分(后)', url: EP.userInfo, silent: true,
      body: Object.assign({ token: APP_TOKEN }, infoBody),
      fallbacks: INFO_FALLBACKS,
      parse: function (d) { return d.obj && d.obj.usablePoint; }
    }
  ];
}

function runTask() {
  const sess = readSession();
  if (!sess || !sess.sessionId) {
    notify('顺丰任务 · 未配置', '请先打开小程序', '打开小程序「我的 → 积分」页即可自动捕获 sessionId');
    log('[顺丰][任务] 未配置：存储里没有 sessionId');
    return done();
  }

  const steps = buildSteps();
  const results = [];
  let beforePoint = null;
  let expired = false;

  function pushResult(r) {
    results.push(r);
    const icon = { ok: '✅', fail: '❌', skip: '⏭' }[r.state] || '·';
    log('[顺丰][步骤] ' + icon + ' ' + r.label + '：' + r.msg);
  }

  let chain = Promise.resolve();
  steps.forEach(function (step) {
    chain = chain.then(function () {
      if (expired) return;
      if (step.skip) { pushResult({ label: step.label, state: 'skip', msg: step.skipReason }); return; }

      return runStep(sess, step).then(function (v) {
        if (v.state === 'expired') {
          expired = true;
          pushResult({ label: step.label, state: 'fail', msg: v.msg });
          return;
        }
        pushResult({ label: step.label, state: v.state, msg: v.msg });

        if (step.key === 'infoBefore' && v.data) beforePoint = v.data.obj && v.data.obj.usablePoint;
        if (step.key === 'infoAfter' && v.data && typeof beforePoint === 'number') {
          const after = v.data.obj && v.data.obj.usablePoint;
          if (typeof after === 'number') {
            const delta = after - beforePoint;
            pushResult({ label: '积分变化', state: 'ok', msg: (delta >= 0 ? '+' : '') + delta });
          }
        }
      });
    });
  });

  return chain.then(function () {
    const icon = { ok: '✅', fail: '❌', skip: '⏭' };
    const lines = results.map(function (r) {
      return icon[r.state] + ' ' + r.label + '：' + r.msg;
    });
    if (expired) lines.push('⏭ 其余步骤：会话失效后跳过');

    if (expired) {
      log('[顺丰][步骤] ⏭ 其余步骤：会话失效后跳过');
      notify('顺丰任务 · 会话失效', sess.mobile || '',
        '请重新打开小程序积分页，脚本会自动换新 sessionId\n' + lines.join('\n'));
    } else {
      const okN = results.filter(function (r) { return r.state === 'ok'; }).length;
      const failN = results.filter(function (r) { return r.state === 'fail'; }).length;
      notify('顺丰任务 · 成功 ' + okN + (failN ? ' / 失败 ' + failN : ''),
        sess.mobile || '', lines.join('\n'));
    }
    return done();
  });
}

if (typeof $request !== 'undefined' && $request && $request.headers) capture();
else runTask();

})();
