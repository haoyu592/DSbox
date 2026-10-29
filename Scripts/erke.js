/*
脚本名称：鸿星尔克签到（诊断修复版 v2）
活动入口：鸿星尔克小程序
环境变量：erke_data（Node 环境，多账号以 @ 隔开）
更新时间：2026-10-29

================ 相对原脚本的修复点 ================
1. 结果判定兼容 code / errcode 两种返回格式（原版只认 code === '0'，接口返回
   {"errcode":-1,"errmsg":"参数异常"} 时只会显示「签到失败: undefined」）
2. 抓包时同时保存请求 headers，签到/查积分时原样带回（GIC 网关现在校验 header）
3. 查积分改用固定接口 + 抓包 headers，不再复用带过期 sign/timestamp 的旧 URL
4. 用资产接口 D021（是否已签到）、D022（连签天数）作为签到结果佐证，避免假失败
5. 抓包覆盖改为数组重建，修复 savedData.replace() 误替换多账号片段的问题
6. 失败时打印原始响应（erke_debug=true 打开完整日志），便于定位

================ Surge 配置 ================
[MITM]
hostname = %APPEND% hope.demogic.com

[Script]
# 建议同时抓「资产」和「签到」两个请求，签到请求会连 body 一起存下来做重放
鸿星尔克Cookie = type=http-request,pattern=^https:\/\/hope\.demogic\.com\/gic-wx-app\/(get-member-asset|sign\/member_sign)\.json,script-path=<本脚本地址>

鸿星尔克 = type=cron, cronexp=15 9 * * *, script-path=<本脚本地址>
*/

const $ = new Env('鸿星尔克');
const notify = (() => { try { return $.isNode() ? require('./sendNotify') : null } catch (e) { return null } })();

const API_HOST = 'https://hope.demogic.com';
const SIGN_PATH = '/gic-wx-app/sign/member_sign.json';
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
  const params = parseQuery(url.split('?')[1] || '');
  const memberId = params.memberId || params.cliqueMemberId || '';

  if (!memberId) {
    $.msg($.name, '', '⚠️ 抓到请求但没有 memberId，未保存');
    return;
  }

  const list = loadAccounts(true);
  const idx = list.findIndex((it) => it.memberId === memberId);
  const old = idx >= 0 ? list[idx] : {};

  const isSign = /member_sign/.test(url);
  const entry = {
    memberId,
    // 抓签到请求时不要把已存的资产 URL 覆盖成空
    assetUrl: isSign ? (old.assetUrl || '') : url,
    signUrl: isSign ? url.split('?')[0] : (old.signUrl || `${API_HOST}${SIGN_PATH}`),
    headers,
    params,
  };
  // 抓到的是签到 POST，就把 body 一并存下来，运行时可直接重放
  if (isSign && $request.body) {
    entry.signBody = typeof $request.body === 'string' ? $request.body : $.toStr($request.body);
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
    const body = acc.signBody || $.toStr(buildSignBody(acc.params));
    const signResp = await postJSON(acc.signUrl || `${API_HOST}${SIGN_PATH}`, acc.headers, body);

    if (DEBUG) console.log(`[账号${no}] 签到原始响应: ${$.toStr(signResp)}`);

    if (isOk(signResp)) {
      const earned = sumIntegral(signResp);
      const already = /已签|重复/.test(pickMsg(signResp));
      lines.push(earned > 0 ? `🎉 签到成功: 积分 +${earned}`
        : (already ? `✅ 今日已签到（${pickMsg(signResp) || '无需重复签到'}）` : `🎉 签到成功${pickMsg(signResp) ? ': ' + pickMsg(signResp) : ''}`));
    } else {
      lines.push(`❌ 签到失败: ${pickMsg(signResp) || '接口无返回信息'} (code=${pickCode(signResp) || '无'})`);
    }

    // 查积分：固定接口 + 抓包 headers，兼容旧数据里的 assetUrl
    try {
      const assetUrl = `${API_HOST}${ASSET_PATH}?${$.queryStr(acc.params)}`;
      const asset = await getJSON(assetUrl, acc.headers);
      if (DEBUG) console.log(`[账号${no}] 资产原始响应: ${$.toStr(asset)}`);
      const r = asset && asset.result;
      if (r) {
        lines.push(`🎉 当前积分: ${r.D007 === undefined ? 0 : r.D007}`);
        const signFlag = String(r.D021) === '1' ? '已签到' : '未签到';
        lines.push(`📅 今日状态: ${signFlag}｜连签 ${r.D022 || 0} 天`);
      } else {
        lines.push(`⚠️ 积分查询异常: ${pickMsg(asset) || 'result 为空'}`);
      }
    } catch (e) {
      lines.push(`⚠️ 积分查询失败: ${e.message}`);
    }
  } catch (e) {
    lines.push(`❌ 执行失败: ${e && e.message ? e.message : e}`);
  } finally {
    Message += `账号 ${no}\n${lines.join('\n')}\n\n`;
    console.log(`账号 ${no}:\n${lines.join('\n')}`);
  }
}

/* ---------------- 请求构造与判定 ---------------- */

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
    $.post({ url, headers: Object.assign({}, headers, { 'Content-Type': 'application/json' }), body, timeout: 20000 }, (err, resp, data) => {
      if (err) return reject(new Error(`签到请求失败: ${err}`));
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`签到响应非 JSON: ${String(data).slice(0, 200)}`)); }
    });
  });
}

function getJSON(url, headers) {
  return new Promise((resolve, reject) => {
    $.get({ url, headers, timeout: 20000 }, (err, resp, data) => {
      if (err) return reject(new Error(`${err}`));
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`响应非 JSON: ${String(data).slice(0, 200)}`)); }
    });
  });
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
