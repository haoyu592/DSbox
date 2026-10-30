#!/usr/bin/env node
/**
 * 京东价格提醒脚本 - 本地运行器
 *
 * 用途：在 Node 里模拟 Surge/Loon/QuanX 运行环境，原封不动地执行远程脚本，
 *      用于验证接口可用性、调试解析逻辑。
 *
 * 用法：
 *   node tools/jd_price_runner.js                 # 使用内置示例商品
 *   node tools/jd_price_runner.js <url> <price>   # 指定链接与目标价
 *   MMB_COOKIE='xxx' node tools/jd_price_runner.js  # 注入慢慢买 Cookie 头
 *   MMB_TOKEN='xxx' MMB_SESSION='xxx' MMB_SIGN='xxx' node tools/jd_price_runner.js
 *                                                   # 注入慢慢买 App 登录参数
 *   MOCK=hit|miss|restrict node tools/jd_price_runner.js  # 离线模拟接口返回
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const https = require("https");

const SCRIPT_URL =
  "https://raw.githubusercontent.com/wangzhao1989/Blog/Surge/JD_price_detect.js";
const CACHE_FILE = path.join(__dirname, ".jd_price_cache.json");
const STORE_FILE = path.join(__dirname, ".jd_price_store.json");

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const TEST_URL = argv[0] || "https://item.jd.com/100012043978.html";
const TEST_PRICE = argv[1] || "1"; // 故意设极低，强制走"低于目标价"分支

// 慢慢买登录 Cookie：优先环境变量，其次 tools/mmb_cookie.txt
const COOKIE = (() => {
  if (process.env.MMB_COOKIE) return process.env.MMB_COOKIE.trim();
  const f = path.join(__dirname, "mmb_cookie.txt");
  if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
  return "";
})();

// 慢慢买 App 登录参数：token 是唯一身份凭证，sign 为请求签名
const MMB = {
  token: process.env.MMB_TOKEN || "",
  session: process.env.MMB_SESSION || "",
  sign: process.env.MMB_SIGN || "",
  appver: process.env.MMB_APPVER || "5.2.21",
};
// 附加到请求体的鉴权参数（原脚本 body 之后追加）
const AUTH_QS = MMB.token
  ? [
      `token=${MMB.token}`,
      MMB.session && `c_session=${MMB.session}`,
      MMB.sign && `sign=${MMB.sign}`,
      "c_app=mmb",
      `c_appver=${MMB.appver}`,
      "c_ostype=ios",
    ]
      .filter(Boolean)
      .join("&")
  : "";

// ---------- 持久化 ----------
const loadJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
const saveJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2));
const store = loadJson(STORE_FILE);

// 写入 BoxJs 配置
store["tlb_jd_detect_url"] = TEST_URL;
store["tlb_jd_detect_price"] = TEST_PRICE;
store["tlb_jd_debug"] = "true";
store["tlb_jd_timeout"] = "15000";
saveJson(STORE_FILE, store);

// ---------- Mock 场景 ----------
// hit: 正常低价命中 / miss: 字符串比较导致漏报 / restrict: 接口要求登录
const MOCK = process.env.MOCK || "";
function mockResponse() {
  // 对齐到整点，保证同一小时内多次运行返回相同时间戳，用于验证去重
  const now = Math.floor(Date.now() / 3600000) * 3600000;
  const d = (ms) => `/Date(${ms}+0800)/`;
  const base = {
    single: {
      title: "测试商品 Apple iPhone 15 128GB 黑色 移动联通电信5G",
      currentPriceyhStatus: "满199减20",
      // 注意：原脚本的正则只兼容"无外层中括号"的老格式；标准 JSON 数组会被多吞一个 ] 导致 eval 报错
      jiagequshiyh: `[${now - 172800000},199,'',''],[${now - 86400000},189,'',''],[${now - 3600000},179,'满199减20','']`,
    },
    recentlyZK: {
      spprice: "<p>满199减20</p><p>plus会员再减10</p>",
      currentprice: "179.00",
      dt: d(now - 3600000),
    },
  };
  if (MOCK === "miss") base.recentlyZK.currentprice = "79.00";
  return base;
}
const RESTRICT = {
  ok: 0,
  msg: "当前访问人数过多，需登录验证后继续使用",
  code: 7700,
  data: { restrict: true, restrictAction: "requestLogin", restrictDesc: "当前访问人数过多，需登录验证后继续使用" },
};

// ---------- HTTP ----------
function request(opts, cb) {
  if (MOCK) {
    const payload = MOCK === "restrict" ? RESTRICT : mockResponse();
    const text = JSON.stringify(payload);
    console.log(`\n→ POST (MOCK:${MOCK}) 已拦截请求`);
    console.log(`  返回: ${text.slice(0, 200)}...`);
    setTimeout(() => cb(null, { statusCode: 200, status: 200, body: text }, text), 20);
    return;
  }
  const u = new URL(opts.url);

  const t0 = Date.now();
  const headers = Object.assign({}, opts.headers);
  // 不请求压缩，避免本地解码
  headers["Accept-Encoding"] = "identity";
  if (COOKIE) headers["Cookie"] = COOKIE;

  // 修正硬编码时间戳：原脚本 t 固定为 2020 年的 1594629654371，带 token 请求会被判「token失效」
  const body = (opts.body || "").replace(/(^|&)t=\d+/, `$1t=${Date.now()}`) + (AUTH_QS ? "&" + AUTH_QS : "");
  headers["Content-Length"] = Buffer.byteLength(body);

  console.log(`\n→ ${opts.method || "GET"} ${u.host}${u.pathname}`);
  console.log(`  UA: ${(headers["User-Agent"] || "").slice(0, 60)}...`);
  console.log(`  Cookie: ${COOKIE ? COOKIE.slice(0, 50) + "..." : "(无)"}`);
  console.log(`  Token: ${MMB.token ? MMB.token.slice(0, 12) + "..." : "(无)"}`);

  const req = https.request(
    { hostname: u.hostname, path: u.pathname + u.search, method: opts.method || "GET", headers },
    (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        console.log(`← HTTP ${res.statusCode} | ${Date.now() - t0}ms | ${Buffer.byteLength(text)}B`);
        console.log(`  原始响应: ${text.slice(0, 400)}${text.length > 400 ? "..." : ""}`);
        cb(null, { statusCode: res.statusCode, status: res.statusCode, headers: res.headers, body: text }, text);
      });
    }
  );
  req.on("error", (e) => {
    console.log(`← 网络错误: ${e.message}`);
    cb(e, { statusCode: 0, status: 0, body: "" }, "");
  });
  req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  if (body) req.write(body);
  req.end();
}

// ---------- 沙箱 ----------
const sandbox = {
  console,
  $httpClient: {
    get: (o, cb) => request({ ...o, method: "GET" }, cb),
    post: (o, cb) => request({ ...o, method: "POST" }, cb),
  },
  $persistentStore: {
    read: (k) => (k in store ? store[k] : null),
    write: (v, k) => {
      store[k] = v;
      saveJson(STORE_FILE, store);
      return true;
    },
  },
  $notification: {
    post: (title, subtitle, body, opts) => {
      console.log("\n╔════════════ 推送通知 ════════════");
      console.log(`║ 标题: ${title}`);
      console.log(`║ 副标: ${subtitle}`);
      console.log(`║ 内容: ${body}`);
      if (opts) console.log(`║ 链接: ${opts}`);
      console.log("╚══════════════════════════════════");
    },
  },
  $done: () => console.log("\n✅ 脚本调用 $done() 正常结束"),
  setTimeout,
  setInterval,
  clearTimeout,
  Date,
  Math,
  JSON,
  Promise,
  encodeURIComponent,
  decodeURIComponent,
  parseInt,
  parseFloat,
  isFinite,
  String,
  Number,
  Array,
  Object,
  RegExp,
  Error,
  Buffer,
};
sandbox.globalThis = sandbox;

// ---------- 执行 ----------
(async () => {
  console.log("=".repeat(56));
  console.log(`测试商品: ${TEST_URL}`);
  console.log(`目标价格: ${TEST_PRICE} 元`);
  console.log(`慢慢买Cookie: ${COOKIE ? "已注入" : "未提供"}`);
  console.log("=".repeat(56));

  let code;
  try {
    const res = await fetch(SCRIPT_URL);
    code = await res.text();
    fs.writeFileSync(CACHE_FILE + ".js", code);
  } catch (e) {
    code = fs.readFileSync(CACHE_FILE + ".js", "utf8");
    console.log("(使用本地缓存脚本)");
  }

  try {
    vm.runInNewContext(code, sandbox, { filename: "JD_price_detect.js", timeout: 60000 });
  } catch (e) {
    console.log(`\n💥 脚本抛出未捕获异常: ${e.constructor.name}: ${e.message}`);
    console.log(e.stack.split("\n").slice(0, 4).join("\n"));
  }

  // 等异步收尾
  await new Promise((r) => setTimeout(r, 18000));
  console.log("\n" + "=".repeat(56));
  console.log("运行结束");
})();
