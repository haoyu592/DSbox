/*
 * ============================================================================
 * JD_GetCookie_App.js  —— 京东 App 端 Cookie 抓取（日志打印版）
 * ============================================================================
 * 适用环境：Quantumult X / Surge / Loon / Stash 的「重写 → 请求头脚本」
 *          类型：url script-request-header
 *
 * 当前默认目标域名：api.m.jd.com（App 内 H5 / webview 接口通道）
 *   已验证：https://api.m.jd.com/api?functionId=weGameHome 携带完整登录态
 *   备用域名：perf.m.jd.com（启动埋点，原生网络栈，UA 族不同）
 *
 * 设计原则（和 panghujiajia/GetCookie.js 的关键区别）：
 *   1. 只读不写 —— 不碰 $prefs / localStorage，不存在「后一条请求冲掉前一条」的风险
 *   2. 只打印不修改 —— 始终 $done({}) 原样放行，不影响 App 正常请求
 *   3. 主动识别形态 —— 直接告诉你这是 App 端 appck 还是网页端 pt_key
 *   4. 识别 UA 族 —— 告诉你该账号的「原点 UA」应该配哪一串
 *   5. 输出可直接复制 —— 单独一行 pt_key=…;pt_pin=…;
 *
 * 用法：见同目录「QX抓包取Cookie-使用说明.md」
 * ============================================================================
 */

/* ----------------------------- 可调开关 ---------------------------------- */

const CONFIG = {
  // 是否额外分段打印「完整 Cookie」（含 shshshfp / 3AB9D23F7A4B3C9B 等设备指纹）
  // 默认 false：日志里分段几十行，手机上一行行复制不现实，而且短串就够用了。
  // 确有需要（比如要连设备指纹一起回放）再改成 true。
  PRINT_FULL: false,

  // 分段长度（字符）。QX 日志单行过长会被折行，120 比较稳。
  CHUNK: 120,

  // 是否打印 User-Agent —— 用于 JDBeanBot 的「设置原点 UA」
  PRINT_UA: true,

  // 排障用：打印全部请求头（默认关，因为会刷屏）
  SHOW_HEADERS: false,
};

/* ----------------------------- 工具函数 ---------------------------------- */

const TAG = '🫘JD-Cookie';

function log(msg) {
  // QX / Surge / Loon 里 console.log 会进「日志」页；node 里进 stdout
  console.log(TAG + ' │ ' + msg);
}

function logRaw(msg) {
  // 不带前缀，用于输出要复制的那一行
  console.log(msg);
}

// 无论发生什么，都必须放行请求。
// QX 的 rewrite 脚本如果没调 $done，这条请求会被一直挂着，App 那边就卡住/超时。
//
// 去重是必须的：脚本里有「提前 return」的分支，而 return 仍会触发 finally，
// 于是在那些分支上 $done 会被调用两次。QX 对重复 $done 的行为不可靠（可能报错或二次放行），
// 所以用 finished 标记保证全程只放行一次。
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  try {
    if (typeof $done === 'function') $done({});
  } catch (e) {
    /* 吞掉，绝不能因为放行失败再抛一次 */
  }
}

// header 名大小写不统一（Cookie / cookie / COOKIE 都见过），逐个比对
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

// 从 Cookie 串里取某个字段。注意必须允许 ; 和行首两种边界，
// 否则 pt_pin 在第二位往后就取不到。
function pick(cookieStr, name) {
  const re = new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]*)');
  const m = String(cookieStr || '').match(re);
  return m ? String(m[1]).trim() : '';
}

// 判断形态，直接给出人话结论
function detectForm(ptKey) {
  if (!ptKey) {
    return { ok: false, text: '❌ 没有 pt_key —— 这条请求不是登录态（App 未登录，或命中的是预处理请求）' };
  }
  if (/^app_open/i.test(ptKey)) {
    return { ok: true, text: '✅ App 端 appck（app_open 开头）—— 活动类接口认这个，正是要的' };
  }
  if (/^AAJ/i.test(ptKey)) {
    return { ok: false, text: '⚠️ 网页端 pt_key（AAJ… 开头）—— 活动类接口大概率 403，不是要的' };
  }
  if (/^fake_/i.test(ptKey)) {
    return { ok: false, text: '❌ 风控诱饵（fake_ 开头）—— wskey 换票被拦了，这串没用' };
  }
  return { ok: false, text: '⚠️ 未知形态的 pt_key —— 先当可疑处理，实测能不能用' };
}

/*
 * 识别 UA 族。这一步不是锦上添花 —— 京东把会话(pt_key)和取号时的设备/App 指纹绑定，
 * 用「另一族」UA 去用一个原生 App 建立的会话，等于同一 token 从不同设备出现，风控会强踢。
 *
 * 现状（实测）：data/scripts/js_user_agents.js 里 77 条兜底 UA **全部是 jdltapp 开头**，
 * 而真机 iOS App 抓包拿到的是 JD4iPhone（原生网络栈）或 jdapp（webview）。
 * 也就是说：只要不配「原点 UA」，bot 就一定在用异族 UA —— 这是 403 / 掉线的长期来源。
 */
function detectUaFamily(ua) {
  const s = String(ua || '');
  if (!s) return '（无 UA）';
  if (/^JD4iPhone/i.test(s)) return '原生 App 网络栈（JD4iPhone）—— 取号侧最匹配，优先设成原点 UA';
  if (/^jdapp;/i.test(s)) return 'App 内 webview / H5 通道（jdapp）—— 同样可作原点 UA，更贴合 H5 接口脚本';
  if (/^jdltapp/i.test(s)) return '小程序 / 轻应用（jdltapp）—— 脚本库兜底池就是这一族，与真机 App 不同族';
  if (/Mozilla\/5\.0.*(Safari|AppleWebKit)/i.test(s)) return '浏览器 / 通用 WebView —— 不是 App 通道，拿来当原点 UA 意义不大';
  return '未识别的 UA 族';
}

// 把长串切成若干段，避免单行超长
function chunk(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) out.push(str.substr(i, size));
  return out;
}

/* ------------------------------- 主逻辑 ---------------------------------- */

(function main() {
  try {
    const req = (typeof $request !== 'undefined' && $request) || {};
    const url = req.url || '(拿不到 url)';
    const headers = req.headers || {};

    let host = '(未知)';
    const mHost = String(url).match(/^https?:\/\/([^/:]+)/i);
    if (mHost) host = mHost[1];

    const cookie = getHeader(headers, 'Cookie');
    const ptKey = pick(cookie, 'pt_key');
    const ptPin = pick(cookie, 'pt_pin');
    const form = detectForm(ptKey);

    log('──────── 抓到一条京东请求 ────────');
    log('host      : ' + host);
    log('形态      : ' + form.text);
    log('Cookie长度: ' + cookie.length + ' 字符');

    if (CONFIG.PRINT_UA) {
      const ua = getHeader(headers, 'User-Agent');
      log('UA 族     : ' + detectUaFamily(ua));
      // jdapp 族在 ep=%7B…%7D 里塞了加密设备指纹(hdid/ud)和时间戳(ts)，
      // 整串拿去复用等于主动告诉京东「指纹对不上」。只打到 ep 之前 —— 那一段才是可复用的干净部分。
      // 注意 /api.m.jd.com 这条的写法是 ";ep/%7B…"（斜杠，不是等号），别写成 ep=
      const clean = String(ua || '').split(/[;?&]ep[/=]/)[0];
      if (clean.length < ua.length) {
        log('User-Agent: ' + clean);
        log('            ↳ 已截去 ep/ 动态指纹（原串 ' + ua.length + ' 字符）；以上这段可作原点 UA 参考');
      } else {
        log('User-Agent: ' + (ua || '(无)'));
        if (ua) log('            ↳ 无动态指纹，可直接当作原点 UA');
      }
    }

    if (!cookie) {
      log('❌ 这条请求根本没带 Cookie 头。');
      log('   常见原因：命中的是静态资源/图片，或该接口本身不带凭证。');
      log('   对策：在 App 里打开任意活动页/首页再回来看日志；或把规则放宽一层。');
      finish();
      return;
    }

    if (!ptKey) {
      log('⚠️ 有 Cookie 但没有 pt_key，说明这时 App 还没登录（或这条接口不带登录态）。');
      log('   对策：先在 App 里完成登录，再打开一个活动页触发 /api?functionId= 请求。');
      if (CONFIG.SHOW_HEADERS) log('全部请求头: ' + JSON.stringify(headers));
      finish();
      return;
    }

    // —— 核心产物：一行可直接复制粘贴的短串 ——
    // pt_pin 缺失时不拼空的 "pt_pin="，否则照抄进控制台会是个空 pin。
    const shortCookie = 'pt_key=' + ptKey + (ptPin ? ';pt_pin=' + ptPin : '') + ';';

    log('──────────────────────────────────');
    log('⬇️ 下面这一整行，直接复制粘进 JDBeanBot');
    log('──────────────────────────────────');
    logRaw(shortCookie);
    log('──────────────────────────────────');
    log('长度 ' + shortCookie.length + ' 字符 · pt_pin = ' + (ptPin || '(缺失!)'));

    if (!ptPin) {
      log('⚠️ pt_pin 没取到，粘贴前请自己补上 ;pt_pin=你的pin;');
    }

    // —— 可选：完整 Cookie 分段 ——
    if (CONFIG.PRINT_FULL) {
      const parts = chunk(cookie, CONFIG.CHUNK);
      log('完整 Cookie 共 ' + parts.length + ' 段（含设备指纹，拼接时按顺序首尾相接）：');
      parts.forEach((p, i) => {
        logRaw('[' + (i + 1) + '/' + parts.length + '] ' + p);
      });
    } else {
      const fpCount = (cookie.match(/shshshfp|3AB9D23F7A4B3C9B|unpl|jcap_dvzw_fp/g) || []).length;
      log('（完整 Cookie 已省略；其中含 ' + fpCount + ' 处设备指纹字段。');
      log('  需要整串请把脚本里 PRINT_FULL 改成 true 再抓一次。）');
    }

    if (CONFIG.SHOW_HEADERS) {
      log('全部请求头: ' + JSON.stringify(headers));
    }
  } catch (e) {
    // 脚本自己出错也绝不能拖累 App 的请求
    log('❌ 脚本异常: ' + e + ' / ' + (e && e.stack ? e.stack : ''));
  } finally {
    finish();
  }
})();
