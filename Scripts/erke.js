/*
脚本名称：鸿星尔克签到
活动入口：鸿星尔克小程序
环境变量：erke_data（Node 环境，多账号以 @ 隔开）
更新时间：2026-10-29

================ Surge 配置 ================
[MITM]
hostname = %APPEND% hope.demogic.com
 
[Script]
鸿星尔克Cookie = type=http-request,pattern=^https:\/\/hope\.demogic\.com\/gic-wx-app\/get-member-asset\.json,script-path=https://raw.githubusercontent.com/haoyu592/DSbox/main/Scripts/erke.js
 
鸿星尔克 = type=cron,cronexp="15 9 * * *",script-path=https://raw.githubusercontent.com/haoyu592/DSbox/main/Scripts/erke.js

============ Quantumult X 配置 =============
[MITM]
hostname = hope.demogic.com
 
[rewrite_local]
^https:\/\/hope\.demogic\.com\/gic-wx-app\/get-member-asset\.json url script-request-header https://raw.githubusercontent.com/haoyu592/DSbox/main/Scripts/erke.js
 
[task_local]
15 9 * * * https://raw.githubusercontent.com/haoyu592/DSbox/main/Scripts/erke.js, tag=鸿星尔克, enabled=true
*/

const $ = new Env('鸿星尔克');
const notify = (() => { try { return $.isNode() ? require('./sendNotify') : null } catch (e) { return null } })();

const API_HOST = 'https://hope.demogic.com';
const SIGN_PATH = '/gic-wx-app/sign/member_sign.json';           // 旧签到接口（已失效，保留兜底）
const SIGN_PATH_NEW = '/gic-wx-app/page-custom/member-sign.json'; // 新签到接口（page-custom 路由族）
const ASSET_PATH = '/gic-wx-app/get-member-asset.json';
const KEY_erke_data = 'erke_data';
const KEY = KEY_erke_data;

const DEBUG = String(
  safeGet('erke_debug') ||
  (typeof process !== 'undefined' && process.env ? process.env.erke_debug : '') || ''
).toLowerCase() === 'true';

let Message = '';

if (typeof $request !== 'undefined' && $request && $request.url) {
  captureRequest();
  $.done();
} else {
  main();
}

async function main() {
  try {
    const accounts = loadAccounts();
    if (!accounts.length) {
      $.msg($.name, '【提示】未找到有效数据', '请先打开鸿星尔克小程序抓一次包，或配置环境变量 erke_data。');
      return;
    }
    for (let i = 0; i < accounts.length; i++) {
      await runAccount(i + 1, accounts[i]);
    }
    if (Message) {
      if ($.isNode() && notify) await notify.sendNotify($.name, Message);
      else $.msg($.name, '', Message);
    }
  } catch (e) {
    console.error(`❌ ${$.name} 执行失败: ${e && e.stack ? e.stack : e}`);
  } finally {
    $.done();
  }
}

/* ---------------- 抓包 ---------------- */

function captureRequest() {
  const url = $request.url;
  const headers = cleanHeaders($request.headers || $request.header || {});
  const rawBody = typeof $request.body === 'string' ? $request.body : '';
  // 新版 page-custom 接口的参数放在 POST body 里，必须一并解析
  let bodyParams = {};
  if (rawBody) {
    try { bodyParams = JSON.parse(rawBody); }
    catch (e) { bodyParams = parseQuery(rawBody); }
    if (!bodyParams || typeof bodyParams !== 'object') bodyParams = {};
  }
  const params = Object.assign({}, parseQuery(url.split('?')[1] || ''), bodyParams);
  const memberId = params.memberId || params.cliqueMemberId || '';

  if (!memberId) {
    $.msg($.name, '', '⚠️ 抓到请求但没有 memberId，未保存');
    return;
  }

  const list = loadAccounts(true);
  const idx = list.findIndex((it) => it.memberId === memberId);
  const old = idx >= 0 ? list[idx] : {};

  // 只有真正的签到动作接口才按 sign 处理；页面装修接口 member-sign-page 不算
  const isSign = /page-custom\/member-sign\.json|sign\/member_sign\.json/.test(url);
  const isAsset = /get-member-asset\.json/.test(url);

  const entry = {
    memberId,
    assetUrl: isAsset ? url : (old.assetUrl || ''),
    signUrl: isSign ? url.split('?')[0] : (old.signUrl || `${API_HOST}${SIGN_PATH_NEW}`),
    headers,
    params,
  };
  // 抓到的是签到 POST，就把 body 一并存下来，运行时可直接重放
  if (isSign && rawBody) {
    entry.signBody = rawBody;
  } else if (old.signBody) {
    entry.signBody = old.signBody;
  }

  if (idx >= 0) {
    list[idx] = Object.assign({}, list[idx], entry);
    saveAccounts(list);
    $.msg($.name, '', `🎉 账号 ${memberId} 已存在，已覆盖保存${isSign ? '（含签到 body）' : ''}`);
  } else {
    list.push(entry);
    saveAccounts(list);
    $.msg($.name, '', `🎉 新账号 ${memberId} 已保存，当前共 ${list.length} 个`);
  }
}

function cleanHeaders(h) {
  const drop = ['host', 'content-length', 'connection', 'accept-encoding', 'content-encoding'];
  const out = {};
  Object.keys(h || {}).forEach((k) => {
    if (!drop.includes(k.toLowerCase())) out[k] = h[k];
  });
  // 确保能带鉴权信息
  if (!Object.keys(out).some((k) => k.toLowerCase() === 'content-type')) {
    out['Content-Type'] = 'application/json';
  }
  return out;
}

/* ---------------- 账号存取（兼容旧格式：纯 URL 以 @ 分隔） ---------------- */

function safeGet(k) {
  try { return $.getdata(k); } catch (e) { return ''; }
}

function loadAccounts(rawOnly) {
  const raw = safeGet(KEY) || ($.isNode() && process.env ? process.env[KEY] : '') || '';
  if (!raw) return [];
  const list = [];
  raw.split('@').forEach((seg) => {
    const s = String(seg).trim();
    if (!s) return;
    if (s.startsWith('{')) {
      try {
        const o = JSON.parse(s);
        if (o && o.memberId) list.push(normalizeEntry(o));
        return;
      } catch (e) { /* 落到 URL 分支 */ }
    }
    if (/^https?:\/\//.test(s)) {
      const p = parseQuery(s.split('?')[1] || '');
      list.push(normalizeEntry({ memberId: p.memberId || `url_${list.length + 1}`, assetUrl: s, headers: {}, params: p }));
    }
  });
  return rawOnly ? list : list;
}

function normalizeEntry(o) {
  const params = o.params && Object.keys(o.params).length ? o.params : parseQuery((o.assetUrl || o.signUrl || '').split('?')[1] || '');
  return {
    memberId: o.memberId || params.memberId || '',
    assetUrl: o.assetUrl || '',
    signUrl: o.signUrl || `${API_HOST}${SIGN_PATH}`,
    headers: o.headers || { 'Content-Type': 'application/json' },
    signBody: o.signBody || '',
    params,
  };
}

function saveAccounts(list) {
  const data = list.map((it) => JSON.stringify(it)).join('@');
  $.setdata(data, KEY);
}

/* ---------------- 单账号执行 ---------------- */

async function runAccount(no, acc) {
  const lines = [];
  try {
    if (!acc.params || !acc.params.enterpriseId) {
      lines.push('⚠️ 缺少 enterpriseId：请在鸿星尔克小程序里打开「会员签到」页重新抓一次包');
    }

    // 1. 先查资产拿今日签到状态，D021 才是最终判定依据（接口报错不代表没签到）
    const before = await fetchAsset(no, acc, lines);
    if (before && String(before.D021) === '1') {
      lines.push('✅ 今日已签到，无需重复');
      pushAsset(lines, before);
      return;
    }

    // 2. 未签到 → 打签到接口
    const attempts = buildSignAttempts(acc);
    let ok = null;
    let lastFail = '';
    for (const at of attempts) {
      try {
        const resp = await postJSON(at.url, acc.headers, at.body);
        if (DEBUG) console.log(`[账号${no}][${at.label}] ${$.toStr(resp)}`);
        if (isOk(resp)) { ok = { at, resp }; break; }
        lastFail = pickMsg(resp) || '';
        lines.push(`· ${at.label} → ${lastFail || '无返回'} (code=${pickCode(resp) || '无'})`);
      } catch (e) {
        lastFail = e.message;
        lines.push(`· ${at.label} → ${e.message}`);
      }
    }

    if (ok) {
      const earned = sumIntegral(ok.resp) || extractIntegral(ok.resp);
      lines.push(earned > 0 ? `🎉 签到成功: 积分 +${earned}` : '🎉 签到成功');
    } else {
      // 3. 签到接口失败时复查询，用服务端状态兜底，避免"签到了却报失败"
      const after = await fetchAsset(no, acc, []);
      if (after && String(after.D021) === '1') {
        lines.push('✅ 签到已生效（接口虽报错，服务端状态为已签到）');
      } else if (/签名/.test(lastFail)) {
        lines.push('❌ 签到失败: 接口要求动态签名（服务端密钥，离线无法计算）');
        lines.push('💡 请在小程序里手动签到，让脚本抓到真实请求后自动重放');
      } else {
        lines.push(`❌ 签到失败: ${lastFail || '以上接口均未通过'}`);
        lines.push('💡 可先在小程序里手动签到一次');
      }
      if (after) { pushAsset(lines, after); return; }
    }

    // 4. 兜底刷新状态
    const now = await fetchAsset(no, acc, []);
    if (now) pushAsset(lines, now);
    else if (before) pushAsset(lines, before);
  } catch (e) {
    lines.push(`❌ 执行失败: ${e && e.message ? e.message : e}`);
  } finally {
    Message += `账号 ${no}\n${lines.join('\n')}\n\n`;
    console.log(`账号 ${no}:\n${lines.join('\n')}`);
  }
}

// 查资产（D007 可用积分 / D021 是否已签到 / D022 连签天数）
async function fetchAsset(no, acc, lines) {
  try {
    const url = buildAssetUrl(acc);
    if (DEBUG) console.log(`[账号${no}] 积分请求 URL: ${url}`);
    const resp = await getJSON(url, acc.headers);
    if (DEBUG) console.log(`[账号${no}] 资产响应: ${$.toStr(resp)}`);
    if (resp && resp.result) return resp.result;
    if (lines) lines.push(`⚠️ 积分查询异常: ${pickMsg(resp) || 'result 为空'}`);
    return null;
  } catch (e) {
    if (lines) lines.push(`⚠️ 积分查询失败: ${e.message}`);
    return null;
  }
}

function pushAsset(lines, r) {
  lines.push(`🎉 当前积分: ${r.D007 === undefined || r.D007 === null ? 0 : r.D007}`);
  const flag = String(r.D021) === '1' ? '已签到' : '未签到';
  lines.push(`📅 今日状态: ${flag}｜连签 ${r.D022 || 0} 天`);
}

/* ---------------- 请求构造与判定 ---------------- */

// 签到只有 sign/member_sign 一个真实接口（page-custom/member-sign 实测不存在，返回 910009 URL错误）
// 它强制校验 body 里的 sign，离线算不出来 → 必须靠抓包重放
function buildSignAttempts(acc) {
  const list = [];
  if (acc.signBody) {
    list.push({ label: '重放抓包 ' + shortPath(acc.signUrl), url: acc.signUrl, body: acc.signBody });
  }
  list.push({ label: 'sign/member_sign', url: `${API_HOST}${SIGN_PATH}`, body: $.toStr(buildPageBody(acc.params)) });
  return list;
}

function shortPath(u) {
  const m = String(u || '').match(/gic-wx-app\/([^?]+)/);
  return m ? m[1] : 'unknown';
}

// 全参数透传（新版接口/重放都用这套），保留 undefined 过滤
function buildPageBody(p) {
  const out = {};
  Object.keys(p || {}).forEach((k) => {
    if (p[k] !== undefined && p[k] !== null && p[k] !== '') out[k] = p[k];
  });
  if (!out.source) out.source = 'wxapp';
  return out;
}

// 从签到响应里递归捞积分字段（新接口结构未知，多关键词兜底）
function extractIntegral(resp, depth = 0) {
  if (!resp || typeof resp !== 'object' || depth > 4) return 0;
  const keys = ['integral', 'point', 'points', 'score', 'signIntegral', 'awardIntegral', 'totalIntegral'];
  for (const k of keys) {
    const v = resp[k];
    if (typeof v === 'number' && v > 0) return v;
    if (typeof v === 'string' && /^\d+$/.test(v) && Number(v) > 0) return Number(v);
  }
  for (const k of Object.keys(resp)) {
    const v = resp[k];
    if (v && typeof v === 'object') {
      const n = extractIntegral(v, depth + 1);
      if (n > 0) return n;
    }
  }
  return 0;
}

function buildSignBody(p) {
  return {
    random: p.random,
    wxOpenid: p.wxOpenid,
    enterpriseId: p.enterpriseId,
    appid: p.appid,
    gicWxaVersion: p.gicWxaVersion,
    timestamp: p.timestamp,
    cliqueMemberId: p.cliqueMemberId,
    unionid: p.unionid,
    source: 'wxapp',
    cliqueId: p.cliqueId,
    openid: p.openid,
    memberId: p.memberId,
    transId: p.transId,
    useClique: p.useClique,
    launchOptions: JSON.stringify({ path: 'pages/pointsmall-index/pointsmall-index', query: {}, scene: 1089, referrerInfo: {}, mode: 'default', apiCategory: 'default' }),
    sign: p.sign,
  };
}

function pickCode(o) {
  if (!o) return '';
  for (const k of ['code', 'errcode', 'errCode', 'status', 'success']) {
    if (o[k] !== undefined && o[k] !== null) {
      if (typeof o[k] === 'boolean') return o[k] ? '0' : '1';
      return String(o[k]);
    }
  }
  return '';
}

function isOk(o) {
  const c = pickCode(o);
  return c === '0' || c === '0000' || c.toLowerCase() === 'success' || c.toLowerCase() === 'true';
}

function pickMsg(o) {
  if (!o) return '';
  return o.message || o.errmsg || o.msg || o.errMsg || o.desc || '';
}

function sumIntegral(resp) {
  const list = Array.isArray(resp.result) ? resp.result
    : (resp.result && Array.isArray(resp.result.signList) ? resp.result.signList : null);
  if (!list) return 0;
  const today = list.find((e) => e && (e.currentDayFlag === 1 || e.currentDayFlag === '1'));
  if (!today || !Array.isArray(today.memberSignAwards)) return 0;
  return today.memberSignAwards.reduce((a, w) => a + (w && w.type === 'integral' ? Number(w.count) || 0 : 0), 0);
}

/* ---------------- 基础请求 ---------------- */

function postJSON(url, headers, body) {
  return new Promise((resolve, reject) => {
    const target = sanitizeUrl(url) || `${API_HOST}${SIGN_PATH}`;
    $.post({ url: target, headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }), body, timeout: 20000 }, (err, resp, data) => {
      if (err) return reject(new Error(`签到请求失败: ${err}`));
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`签到响应非 JSON: ${String(data).slice(0, 200)}`)); }
    });
  });
}

function getJSON(url, headers) {
  return new Promise((resolve, reject) => {
    const target = sanitizeUrl(url);
    if (!target) return reject(new Error(`URL 非法: ${String(url).slice(0, 120)}`));
    $.get({ url: target, headers, timeout: 20000 }, (err, resp, data) => {
      if (err) return reject(new Error(`${err}`));
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`响应非 JSON: ${String(data).slice(0, 200)}`)); }
    });
  });
}

// 组装积分查询 URL：能用抓到的原始 URL 就不重建，重建时严格编码
function buildAssetUrl(acc) {
  const p = acc.params || {};
  // 实测最小必需参数只有三个：dataIconKeyList + memberId + enterpriseId
  // appid/sign/random/timestamp/transId/openid/unionid 全省略也返回同样数据，且永不过期
  const need = {
    dataIconKeyList: 'D007,D021,D022',
    memberId: p.memberId,
    enterpriseId: p.enterpriseId,
  };
  if (need.memberId && need.enterpriseId) {
    const url = `${API_HOST}${ASSET_PATH}?${encodeQuery(need)}`;
    if (sanitizeUrl(url)) return url;
  }

  const raw = sanitizeUrl(acc.assetUrl);
  if (raw && raw.includes('/get-member-asset.json')) return raw;

  const qs = encodeQuery(p);
  const url = `${API_HOST}${ASSET_PATH}${qs ? '?' + qs : ''}`;
  if (!sanitizeUrl(url)) throw new Error(`积分 URL 组装失败: ${url}`);
  return url;
}

// 参数编码：decodeURIComponent 解析过的值必须重新编码，否则 + & = 空格 会破坏 URL
function encodeQuery(params) {
  if (!params) return '';
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&');
}

// 清理 URL：去空白、去尾部 ? / &、去 hash、编码空格与中文，非法返回 ''
function sanitizeUrl(u) {
  if (!u || typeof u !== 'string') return '';
  let s = u.trim().replace(/\s+/g, '%20').replace(/#.*$/, '');
  s = s.replace(/[?&]+$/, '');
  if (!/^https?:\/\/[^/]+/i.test(s)) return '';
  if (/[^\x21-\x7E]/.test(s)) return ''; // 仍含非 ASCII，Surge 会判 bad url
  return s;
}

function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  qs.split('&').forEach((kv) => {
    if (!kv) return;
    const i = kv.indexOf('=');
    const k = i < 0 ? kv : kv.slice(0, i);
    const v = i < 0 ? '' : kv.slice(i + 1);
    try { out[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { out[k] = v; }
  });
  return out;
}


/* ======== 以下为通用 Env 环境（保持原样） ======== */
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; "POST" === e && (s = this.post); const i = new Promise(((e, i) => { s.call(this, t, ((t, s, o) => { t ? i(t) : e(s) })) })); return t.timeout ? ((t, e = 1e3) => Promise.race([t, new Promise(((t, s) => { setTimeout((() => { s(new Error("请求超时")) }), e) }))]))(i, t.timeout) : i } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 }, this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " }, this.logLevel = "info", this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null, ...s) { try { return JSON.stringify(t, ...s) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, i) => e(i))) })) } runScript(t, e) { return new Promise((s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let o = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); o = o ? 1 * o : 20, o = e && e.timeout ? e.timeout : o; const [r, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: o }, headers: { "X-Key": r, Accept: "*/*" }, policy: "DIRECT", timeout: o }; this.post(n, ((t, e, i) => s(i))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const t of i) if (o = Object(o)[t], void 0 === o) return s; return o } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { const t = JSON.parse(o); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? "null" === r ? null : r || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, o, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const r = {}; this.lodash_set(r, o, t), s = this.setval(JSON.stringify(r), i) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.cookie && void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: i, statusCode: o, headers: r, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: i, response: o } = t; e(i, o, o && s.decode(o.rawBody, this.encoding)) })); break } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let i = require("iconv-lite"); this.initGotEnv(t); const { url: o, ...r } = t; this.got[s](o, r).then((t => { const { statusCode: s, statusCode: o, headers: r, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: s, response: o } = t; e(s, o, o && i.decode(o.rawBody, this.encoding)) })); break } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let i = t[s]; null != i && "" !== i && ("object" == typeof i && (i = JSON.stringify(i)), e += `${s}=${i}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", i = "", o = {}) { const r = t => { const { $open: e, $copy: s, $media: i, $mediaMime: o } = t; switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { const r = {}; let a = t.openUrl || t.url || t["open-url"] || e; a && Object.assign(r, { action: "open-url", url: a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; if (n && Object.assign(r, { action: "clipboard", text: n }), i) { let t, e, s; if (i.startsWith("http")) t = i; else if (i.startsWith("data:")) { const [t] = i.split(";"), [, o] = i.split(","); e = o, s = t.replace("data:", "") } else { e = i, s = (t => { const e = { JVBERi0: "application/pdf", R0lGODdh: "image/gif", R0lGODlh: "image/gif", iVBORw0KGgo: "image/png", "/9j/": "image/jpg" }; for (var s in e) if (0 === t.indexOf(s)) return e[s]; return null })(i) } Object.assign(r, { "media-url": t, "media-base64": e, "media-base64-mime": o ?? s }) } return Object.assign(r, { "auto-dismiss": t["auto-dismiss"], sound: t.sound }), r } case "Loon": { const s = {}; let o = t.openUrl || t.url || t["open-url"] || e; o && Object.assign(s, { openUrl: o }); let r = t.mediaUrl || t["media-url"]; return i?.startsWith("http") && (r = i), r && Object.assign(s, { mediaUrl: r }), console.log(JSON.stringify(s)), s } case "Quantumult X": { const o = {}; let r = t["open-url"] || t.url || t.openUrl || e; r && Object.assign(o, { "open-url": r }); let a = t["media-url"] || t.mediaUrl; i?.startsWith("http") && (a = i), a && Object.assign(o, { "media-url": a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; return n && Object.assign(o, { "update-pasteboard": n }), console.log(JSON.stringify(o)), o } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, i, r(o)); break; case "Quantumult X": $notify(e, s, i, r(o)); break; case "Node.js": break }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } debug(...t) { this.logLevels[this.logLevel] <= this.logLevels.debug && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.debug}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } info(...t) { this.logLevels[this.logLevel] <= this.logLevels.info && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.info}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } warn(...t) { this.logLevels[this.logLevel] <= this.logLevels.warn && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.warn}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } error(...t) { this.logLevels[this.logLevel] <= this.logLevels.error && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.error}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.map((t => t ?? String(t))).join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, e, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, e, void 0 !== t.message ? t.message : t, t.stack); break } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
