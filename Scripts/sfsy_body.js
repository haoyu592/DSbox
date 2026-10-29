/*
 * 顺丰 · 请求体探针（抓 commonPost 各接口的真实 body）
 *
 * 用法：
 *   [rewrite_local]
 *   ^https:\/\/mcs-mimp-web\.sf-express\.com\/mcs-mimp\/commonPost\/ url script-request-body <本脚本raw地址>
 *   [task_local] 手动跑一次本脚本 → 导出全部已捕获 body
 *
 * 说明：QX 的 script-request-header 阶段读不到 body，必须用 script-request-body。
 *       本脚本只读，$done({}) 原样放行。
 */

(function () {
'use strict';

const KEY = 'sfsy_bodies';
const MAX_KEEP = 14;
const MAX_NOTIFY = 700;

function nowStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function clip(s, n) {
  s = (s === undefined || s === null) ? '' : String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function readList() {
  try { const v = $prefs.valueForKey(KEY); const a = v ? JSON.parse(v) : []; return Array.isArray(a) ? a : []; }
  catch (e) { return []; }
}

function writeList(a) {
  try { $prefs.setValueForKey(JSON.stringify(a.slice(0, MAX_KEEP)), KEY); } catch (e) { }
}

// ~memberNonactivity~xService~method -> xService/method
function nameOf(url) {
  const tail = String(url || '').split('?')[0].split('/').pop();
  if (tail.indexOf('~') < 0) return tail;
  const seg = tail.split('~').filter(function (s) { return s; });
  if (!seg.length) return tail;
  const method = seg[seg.length - 1];
  const group = seg.length > 1 ? seg[0] : '';
  return group ? group + '/' + method : method;
}

function done(p) {
  try { $done(p || {}); } catch (e) { }
}

function capture() {
  const req = $request;
  const body = (req.body === undefined || req.body === null) ? '' : String(req.body);
  const name = nameOf(req.url);
  const list = readList();
  const dup = list.some(function (x) { return x.name === name && x.body === body; });

  if (!dup) {
    list.unshift({ name: name, method: (req.method || 'POST').toUpperCase(), body: body, t: nowStr() });
    writeList(list);
    try {
      $notify('顺丰 body · ' + (req.method || 'POST').toUpperCase(), name, clip(body, MAX_NOTIFY) || '（空 body）');
    } catch (e) { }
  }
  return done({});
}

function dump() {
  const list = readList();
  if (!list.length) {
    try { $notify('顺丰 body · 无数据', '先打开小程序积分页', '捕获规则需为 script-request-body'); } catch (e) { }
    return done();
  }
  const lines = [];
  list.forEach(function (x, i) {
    lines.push('#' + (i + 1) + ' ' + x.method + ' ' + x.name);
    lines.push(x.body || '（空）');
    lines.push('');
  });

  const chunks = [];
  let buf = '';
  lines.forEach(function (l) {
    if ((buf + l).length > 800) { chunks.push(buf); buf = ''; }
    buf += l + '\n';
  });
  if (buf) chunks.push(buf);

  chunks.forEach(function (c, i) {
    try { $notify('顺丰 body 导出 ' + (i + 1) + '/' + chunks.length, '', c); } catch (e) { }
  });
  return done();
}

if (typeof $request !== 'undefined' && $request && $request.url) capture();
else dump();

})();
