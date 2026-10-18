/**
 * 同步三策略降级链测试
 *
 * syncYoudao 由三层嵌套 promise 重构为 async/await，行为必须完全一致：
 *   S1 抓 wordlist 页解析 __NUXT__ → S2 www JSON 接口 → S3 dict JSON 接口
 * 本测试锁住降级顺序、成功落库、全失败文案与诊断记录。
 * 运行：node tests/sync-strategies.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const store = { autoSync: false };
let msgListener = null;
let requested = [];

globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        queueMicrotask(() => {
          if (typeof keys === 'function') return cb(store);
          if (keys == null) return cb(store);
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in store) out[k] = store[k];
          cb(out);
        });
      },
      set(obj, cb) { Object.assign(store, obj); if (cb) queueMicrotask(cb); },
    },
    onChanged: { addListener() {} },
  },
  runtime: {
    onMessage: { addListener: (fn) => { msgListener = fn; } },
    lastError: null,
  },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    query: (q, cb) => cb([]),
    sendMessage: () => ({ catch() {} }),
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  tts: { speak() {}, stop() {}, getVoices: (cb) => cb([]) },
};
globalThis.console.warn = () => {};
globalThis.console.error = () => {};

/** 每个 URL 片段对应的响应；设为 'throw' 表示网络异常 */
let route = {};
const NUXT_OK = (word) => `<script>window.__NUXT__={"itemList":[{"word":"${word}","trans":"释义"}]}</script>`;

globalThis.fetch = (url) => {
  requested.push(url);
  const key = url.includes('webwordbook/wordlist') ? 'S1'
    : url.includes('www.youdao.com/wordbook/webapi') ? 'S2'
      : 'S3';
  const handler = route[key];
  if (handler === 'throw') return Promise.reject(new Error('network down'));
  return Promise.resolve({
    ok: true, status: 200, url,
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(typeof handler === 'string' ? handler : JSON.stringify(handler)),
    json: () => Promise.resolve(handler),
  });
};

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

new Function(code)();
check('service-worker.js 载入无异常', typeof msgListener === 'function');

const tick = () => new Promise((r) => setTimeout(r, 0));
const syncOnce = () => new Promise((resolve) => {
  requested = [];
  msgListener({ type: 'sync' }, { tab: { id: 1 } }, resolve);
});
const strategyOf = (url) => url.includes('webwordbook/wordlist') ? 'S1'
  : url.includes('www.youdao.com/wordbook/webapi') ? 'S2' : 'S3';

// ===== 1. S1 无 __NUXT__ → S2 返回非 0 → S3 成功 =====
route = {
  S1: '<html><body>no payload here</body></html>',
  S2: { code: 500, msg: 'boom' },
  S3: { code: 0, data: { itemList: [{ word: 'gamma', trans: 'γ' }] } },
};
let res = await syncOnce();
check('三策略按 S1→S2→S3 顺序尝试',
  requested.map(strategyOf).join(',') === 'S1,S2,S3', '实际=' + requested.map(strategyOf).join(','));
check('S3 命中后同步成功', /同步成功.*1 个生词/.test(res || ''), '实际=' + res);
check('S3 结果落库', !!store.newWords?.wordInfos?.gamma, '实际=' + JSON.stringify(Object.keys(store.newWords?.wordInfos || {})));
await tick();
check('诊断记录 ok=true 且 strategy=S3',
  store.syncDiagnostics?.lastAttempt?.ok === true && store.syncDiagnostics.lastAttempt.strategy === 'S3',
  '实际=' + JSON.stringify(store.syncDiagnostics?.lastAttempt));
check('诊断 attempts 记录了三级尝试',
  (store.syncDiagnostics?.lastAttempt?.attempts || []).length === 3,
  '实际=' + JSON.stringify(store.syncDiagnostics?.lastAttempt?.attempts));

// ===== 2. S1 网络异常 → S2 成功 =====
route = {
  S1: 'throw',
  S2: { code: 0, data: { itemList: [{ word: 'delta', trans: 'δ' }] } },
  S3: { code: 0, data: { itemList: [] } },
};
res = await syncOnce();
check('S1 抛异常后降级到 S2',
  requested.map(strategyOf).join(',') === 'S1,S2', '实际=' + requested.map(strategyOf).join(','));
check('S2 成功文案', /同步成功.*1 个生词/.test(res || ''), '实际=' + res);
check('S2 结果落库', !!store.newWords?.wordInfos?.delta);

// ===== 3. 三级全失败 =====
route = { S1: '<html>nope</html>', S2: { code: 500 }, S3: { code: 503, msg: 'oops' } };
res = await syncOnce();
check('全失败返回明确文案（含排查提示）',
  /同步失败/.test(res || '') && /登录/.test(res || ''), '实际=' + res);
await tick();
check('全失败时诊断 ok=false 且带 reason',
  store.syncDiagnostics?.lastAttempt?.ok === false &&
  store.syncDiagnostics.lastAttempt.reason === 'no-supported-word-list-payload',
  '实际=' + JSON.stringify(store.syncDiagnostics?.lastAttempt));
check('全失败不覆盖已有词表', !!store.newWords?.wordInfos?.delta);

// ===== 4. 登录页重定向（S1 就终止，不再往下试）=====
route = {
  S1: '<html><a href="/passport/login">请登录</a></html>',
  S2: { code: 0, data: { itemList: [{ word: 'should-not-use' }] } },
  S3: { code: 0, data: { itemList: [{ word: 'should-not-use' }] } },
};
res = await syncOnce();
check('识别登录失效后立即终止（不再降级）',
  requested.map(strategyOf).join(',') === 'S1', '实际=' + requested.map(strategyOf).join(','));
check('登录失效文案带 ⚠️', /⚠️.*登录已失效/.test(res || ''), '实际=' + res);
check('登录失效不写登录态', store.loggedIn === false);

console.log(`\n=== 同步三策略测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
