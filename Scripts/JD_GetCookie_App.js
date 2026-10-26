/*
 * ============================================================================
 * JD_GetCookie_App.js —— 京东 App 端 Cookie 抓取（静默版）
 * ============================================================================
 * 类型：url script-request-header（Quantumult X 重写 → 请求头脚本）
 * 目标域名：api.m.jd.com（App 内 H5 / webview 接口通道）
 *
 * 行为：命中登录态时
 *   1) 日志只输出一行：pt_key=…;pt_pin=…;
 *   2) 弹系统通知提醒「已获取到 Cookie」
 *   其余情况静默放行，不刷任何日志。
 * ============================================================================
 */

// 请求必须放行且只能放行一次；return 分支也会走 finally，故用标记去重
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  try {
    if (typeof $done === 'function') $done({});
  } catch (e) {
    /* 放行失败也不能再抛异常拖累 App 请求 */
  }
}

// header 名大小写不统一，逐个比对
function getHeader(headers, name) {
  if (!headers) return '';
  const target = String(name).toLowerCase();
  for (const k in headers) {
    if (String(k).toLowerCase() === target) {
      const v = headers[k];
      return Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v);
    }
  }
  return '';
}

// 取 Cookie 字段：必须允许「行首」和「; 之后」两种边界
function pick(cookieStr, name) {
  const re = new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]*)');
  const m = String(cookieStr || '').match(re);
  return m ? String(m[1]).trim() : '';
}

(function main() {
  try {
    const req = (typeof $request !== 'undefined' && $request) || {};
    const cookie = getHeader(req.headers || {}, 'Cookie');
    if (!cookie) return finish();

    const ptKey = pick(cookie, 'pt_key');
    const ptPin = pick(cookie, 'pt_pin');
    if (!ptKey || !ptPin) return finish();

    const shortCookie = 'pt_key=' + ptKey + ';pt_pin=' + ptPin + ';';

    // 唯一的一行日志
    console.log(shortCookie);

    // 系统弹窗提醒（pt_pin 一般是 URL 编码，解码失败就用原串，别让通知整条丢掉）
    let pinShow = ptPin;
    try {
      pinShow = decodeURIComponent(ptPin);
    } catch (e) {
      /* 保持原串 */
    }
    try {
      if (typeof $notify === 'function') {
        $notify('🫘 京东 Cookie 已获取', pinShow, shortCookie);
      }
    } catch (e) {
      /* 通知失败不影响主流程 */
    }
  } catch (e) {
    /* 静默 */
  } finally {
    finish();
  }
})();
