/*
 * 顺丰会员中心 · 登录态探针
 * 类型：Quantumult X http-request 脚本（只读，不改请求不改响应）
 * 目的：确认 mcs-mimp-web 的 commonPost 业务接口到底用哪个 header / cookie 承载登录态
 *
 * 输出：
 *   1. 通知：命中接口 + cookie 关键字段 + 身份候选头 + 签名三件套
 *   2. $prefs["sfsy_probe_raw"]：最近 5 次完整 headers（明文，排查完请手动清空）
 *   3. $prefs["sfsy_probe_log"]：最近 5 次精简记录
 *
 * 防扰：同一接口 + 同一身份组合只弹一次通知；换了账号或换了 token 才会再弹。
 */

(function () {
'use strict';

const LOG_KEY   = 'sfsy_probe_log';
const RAW_KEY   = 'sfsy_probe_raw';
const FP_KEY    = 'sfsy_probe_fp';
const MAX_KEEP  = 5;      // prefs 里保留最近几条
const MAX_BODY  = 900;    // 通知正文上限
const MASK      = false;  // true = 通知里对敏感值打码（prefs 中始终保存明文）

// 可能是身份凭证的自定义头（按优先级）
const ID_HEADERS = ['token', 'authorization', 'access-token', 'x-token', 'userid', 'user-id', 'serviceid', 'memberid', 'openid'];
// 业务上下文头，用于确认请求合法性
const CTX_HEADERS = ['signature', 'timestamp', 'syscode', 'channel', 'platform', 'xversion', 'content-type', 'referer', 'sw8'];
// cookie 中值得关注的键
const COOKIE_KEYS = ['sessionId', 'JSESSIONID', '_login_user_id_', '_login_mobile_', 'mimp_g_env'];

function nowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function clip(s, n) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function maskVal(v) {
  if (!MASK) return v;
  v = String(v);
  if (v.length <= 8) return '***';
  return v.slice(0, 4) + '***' + v.slice(-4);
}

function lowerHeaders(h) {
  const out = {};
  if (!h) return out;
  for (const k in h) out[String(k).toLowerCase()] = h[k];
  return out;
}

// cookie 串 -> 关注键的键值对
function parseCookie(str) {
  const out = {};
  if (!str) return out;
  String(str).split(';').forEach(function (seg) {
    const i = seg.indexOf('=');
    if (i < 0) return;
    const k = seg.slice(0, i).trim();
    const v = seg.slice(i + 1).trim();
    if (COOKIE_KEYS.indexOf(k) >= 0) out[k] = v;
  });
  return out;
}

// ~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage
//   -> memberNonactivity/automaticSignFetchPackage（保留分组名 + 方法名，短且可辨认）
function shortPath(url) {
  const noQuery = String(url || '').split('?')[0];
  const parts = noQuery.split('/');
  const tail = parts[parts.length - 1] || noQuery;
  if (tail.indexOf('~') < 0) return tail.length > 40 ? tail.slice(0, 40) + '…' : tail;
  const seg = tail.split('~').filter(function (s) { return s; });
  const name = seg.length ? seg[seg.length - 1] : tail;
  const group = seg.length > 1 ? seg[0] : '';
  const out = group ? group + '/' + name : name;
  return out.length > 46 ? out.slice(0, 46) + '…' : out;
}

function readJson(key, fallback) {
  try {
    const v = $prefs.valueForKey(key);
    if (!v) return fallback;
    const o = JSON.parse(v);
    return o === null || o === undefined ? fallback : o;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, val) {
  try {
    $prefs.setValueForKey(JSON.stringify(val), key);
  } catch (e) { /* 存储失败不阻断请求 */ }
}

function main() {
  const req = (typeof $request !== 'undefined') ? $request : null;
  if (!req) return dumpMode();   // 无 $request = 以定时任务方式运行，输出已存结果

  const url = req.url || '';
  const method = (req.method || 'GET').toUpperCase();
  const h = lowerHeaders(req.headers);
  const cookieStr = h['cookie'] || '';
  const ck = parseCookie(cookieStr);

  // 身份候选
  const hits = [];
  ID_HEADERS.forEach(function (k) {
    if (h[k]) hits.push(k + '=' + clip(maskVal(h[k]), 48));
  });
  COOKIE_KEYS.forEach(function (k) {
    if (ck[k]) hits.push('cookie.' + k + '=' + clip(maskVal(ck[k]), 48));
  });

  // 去重指纹：接口 + 身份内容（忽略每次都变的 signature / timestamp）
  const fp = [method, shortPath(url), ck['sessionId'] || '', ck['JSESSIONID'] || '',
    ck['_login_user_id_'] || '', h['token'] || '', h['userid'] || '', h['channel'] || ''].join('|');

  // 完整 headers 落盘（供排查/回贴）
  const raw = readJson(RAW_KEY, []);
  raw.unshift({ t: nowStr(), method: method, url: String(url).slice(0, 300), headers: h });
  writeJson(RAW_KEY, raw.slice(0, MAX_KEEP));

  const log = readJson(LOG_KEY, []);
  log.unshift({ t: nowStr(), method: method, path: shortPath(url), hits: hits });
  writeJson(LOG_KEY, log.slice(0, MAX_KEEP));

  // 同一身份+接口只提示一次
  let lastFp = '';
  try { lastFp = $prefs.valueForKey(FP_KEY) || ''; } catch (e) { lastFp = ''; }
  if (lastFp === fp) return done();
  try { $prefs.setValueForKey(fp, FP_KEY); } catch (e) { /* ignore */ }

  const lines = [];
  lines.push(method + ' ' + clip(shortPath(url), 60));

  COOKIE_KEYS.forEach(function (k) {
    if (ck[k]) lines.push('ck.' + k + ' = ' + clip(maskVal(ck[k]), 40));
  });

  ID_HEADERS.forEach(function (k) {
    if (h[k]) lines.push('h.' + k + ' = ' + clip(maskVal(h[k]), 40));
  });

  CTX_HEADERS.forEach(function (k) {
    if (h[k] && k !== 'referer') lines.push(k + ' = ' + clip(h[k], 32));
  });

  if (hits.length) {
    const names = hits.map(function (x) { return x.split('=')[0]; });
    lines.push('🎯 身份候选: ' + names.join(', '));
  } else {
    lines.push('⚠️ 无任何身份头/身份 cookie —— 登录态可能只靠服务端 session(绑 IP)');
  }
  if (req.body) lines.push('body = ' + clip(req.body, 80));
  lines.push('完整 headers 已存 sfsy_probe_raw');

  let body = lines.join('\n');
  if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY) + '…';

  try { $notify('顺丰探针 · ' + method, clip(shortPath(url), 46), body); } catch (e) { }
  return done();
}

function done() {
  // 原样放行，绝不修改请求
  try { $done({}); } catch (e) { }
}

// 定时任务模式：把已抓到的内容分段弹出来，方便复制回贴
function dumpMode() {
  const raw = readJson(RAW_KEY, []);
  if (!raw.length) {
    try { $notify('顺丰探针 · 无数据', '先触发一次请求', '打开小程序「我的 → 积分」页后再跑本任务'); } catch (e) { }
    return done();
  }
  const r = raw[0];
  const lines = ['记录时间 ' + r.t, r.method + ' ' + clip(r.url, 80)];
  const ks = Object.keys(r.headers || {});
  ks.forEach(function (k) { lines.push(k + ': ' + clip(r.headers[k], 120)); });

  // 每 800 字一条通知，避免正文被截断
  const chunks = [];
  let buf = '';
  lines.forEach(function (l) {
    if ((buf + l).length > 800) { chunks.push(buf); buf = ''; }
    buf += l + '\n';
  });
  if (buf) chunks.push(buf);

  chunks.forEach(function (c, i) {
    try { $notify('顺丰探针 · 导出 ' + (i + 1) + '/' + chunks.length, clip(shortPath(r.url), 40), c); } catch (e) { }
  });
  return done();
}

main();

})();
