/*
 * ============================================================================
 * JD_GetCookie_App.js —— 京东 App 端 Cookie 抓取（跨客户端兼容版）
 * ============================================================================
 * 支持：Quantumult X / Surge / Loon / Shadowrocket / Stash
 *
 * 各客户端规则写法：
 *   Quantumult X : ^https:\/\/api\.m\.jd\.com\/ url script-request-header <本文件>
 *   Surge / SR   : type=http-request, pattern=^https:\/\/api\.m\.jd\.com\/, requires-body=0
 *   Loon         : http-request ^https:\/\/api\.m\.jd\.com\/ script-path=<本文件>, requires-body=0
 *
 * 行为：命中登录态时
 *   1) 日志输出一行：pt_key=…;pt_pin=…;
 *   2) 弹系统通知「已获取到 Cookie」（同账号 30 分钟内只弹一次，避免刷屏）
 *   3) 将 cookie 写入持久化键 JD_COOKIE_RECENT，供签到类脚本直接取用
 * 其余情况静默放行，不刷任何日志。
 *
 * 兼容性说明（相比 v1 的改动）：
 *   - $notify 仅在 QX 存在，SR/Surge/Loon 走 $notification.post，故做能力探测
 *   - 持久化：QX 用 $prefs，其余用 $persistentStore，同样做能力探测
 *   - 匹配范围由单一 functionId 放宽到 api.m.jd.com 全域（原 weGameHome 接口已失效）
 * ============================================================================
 */

// 请求必须放行且只能放行一次；return 分支也会走 finally，故用标记去重
let finished = false;

function done(obj) {
  if (typeof $done === 'function') $done(obj || {});
}

function finish() {
  if (finished) return;
  finished = true;
  try {
    done({});
  } catch (e) {
    /* 放行失败也不能再抛异常拖累 App 请求 */
  }
}

/* ---------------------------------------------------------------- 环境兼容层 */

// 通知：QX 是 $notify(...)，Surge/SR/Loon 是 $notification.post(...)
function notify(title, subtitle, body) {
  try {
    if (typeof $notification !== 'undefined' && typeof $notification.post === 'function') {
      $notification.post(String(title), String(subtitle), String(body));
      return true;
    }
  } catch (e) {
    /* 继续尝试下一种 */
  }
  try {
    if (typeof $notify === 'function') {
      $notify(String(title), String(subtitle), String(body));
      return true;
    }
  } catch (e) {
    /* 通知失败不影响主流程 */
  }
  return false;
}

// 持久化读：QX $prefs.valueForKey / 其余 $persistentStore.read
function storeGet(key) {
  try {
    if (typeof $persistentStore !== 'undefined' && typeof $persistentStore.read === 'function') {
      const v = $persistentStore.read(key);
      return v == null ? '' : String(v);
    }
  } catch (e) {
    /* 继续尝试下一种 */
  }
  try {
    if (typeof $prefs !== 'undefined' && typeof $prefs.valueForKey === 'function') {
      const v = $prefs.valueForKey(key);
      return v == null ? '' : String(v);
    }
  } catch (e) {
    /* 无存储能力时静默 */
  }
  return '';
}

// 持久化写：QX $prefs.setValueForKey(value,key) / 其余 $persistentStore.write(value,key)
function storeSet(key, val) {
  try {
    if (typeof $persistentStore !== 'undefined' && typeof $persistentStore.write === 'function') {
      $persistentStore.write(String(val), key);
      return true;
    }
  } catch (e) {
    /* 继续尝试下一种 */
  }
  try {
    if (typeof $prefs !== 'undefined' && typeof $prefs.setValueForKey === 'function') {
      $prefs.setValueForKey(String(val), key);
      return true;
    }
  } catch (e) {
    /* 无存储能力时静默 */
  }
  return false;
}

/* ---------------------------------------------------------------- Header 工具 */

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

/* ---------------------------------------------------------------- 通知节流 */

const THROTTLE_MS = 30 * 60 * 1000; // 同一账号 30 分钟内不重复弹窗
const STORE_LAST_NOTIFY = 'JD_COOKIE_LAST_NOTIFY';
const STORE_RECENT_COOKIE = 'JD_COOKIE_RECENT';

// 返回 true 表示本次允许弹窗（并把时间戳落盘）
function shouldNotify(ptPin) {
  const now = Date.now();
  const raw = storeGet(STORE_LAST_NOTIFY);
  if (raw) {
    const parts = raw.split('|');
    const lastPin = parts[0] || '';
    const lastTs = parseInt(parts[1], 10) || 0;
    if (lastPin === ptPin && now - lastTs < THROTTLE_MS) return false;
  }
  storeSet(STORE_LAST_NOTIFY, ptPin + '|' + now);
  return true;
}

/* ---------------------------------------------------------------- 主流程 */

(function main() {
  try {
    const req = (typeof $request !== 'undefined' && $request) || {};
    const cookie = getHeader(req.headers || {}, 'Cookie');
    if (!cookie) return finish();

    const ptKey = pick(cookie, 'pt_key');
    const ptPin = pick(cookie, 'pt_pin');
    if (!ptKey || !ptPin) return finish();

    const shortCookie = 'pt_key=' + ptKey + ';pt_pin=' + ptPin + ';';

    // 落盘，供其它签到脚本直接读取（不依赖通知是否弹出）
    storeSet(STORE_RECENT_COOKIE, shortCookie);

    // 唯一的一行日志（Shadowrocket / Surge 在「日志」页可见）
    console.log(shortCookie);

    // 系统弹窗提醒（pt_pin 一般是 URL 编码，解码失败就用原串，别让通知整条丢掉）
    if (shouldNotify(ptPin)) {
      let pinShow = ptPin;
      try {
        pinShow = decodeURIComponent(ptPin);
      } catch (e) {
        /* 保持原串 */
      }
      const ok = notify('🫘 京东 Cookie 已获取', pinShow, shortCookie);
      if (!ok) console.log('[JD_GetCookie] 当前环境无通知能力，仅输出日志');
    }
  } catch (e) {
    /* 静默 */
  } finally {
    finish();
  }
})();
