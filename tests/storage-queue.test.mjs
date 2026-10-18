/**
 * 存储写入队列测试（⑩ 释义缓存并发写竞态 + TTL）
 *
 * 背景：chrome.storage.local 没有事务。cacheMeaning 是「读整表 → 合并 → 写回」，
 * 多标签页同时悬浮不同生词时两个写操作会交叉执行、后写者覆盖先写者，丢缓存条目
 * （现象是「刚查过的词过一会又查一次」）。
 * 同文件的 recordSyncDiagnostic 早就有串行化写链，本测试锁住这套模式被抽成通用工具、
 * 缓存也复用上，并且缓存补上了 TTL 与过期清理。
 *
 * 关键：chrome.storage 桩必须「get 在发起时取快照、set 异步落盘」，
 * 否则读-改-写的覆盖问题根本复现不出来（后写者总能读到先写者的结果）。
 * 运行：node tests/storage-queue.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// ===== ① 源码断言：写队列被抽成通用工具，两处复用 =====
check('定义了通用写队列工具 createWriteQueue',
  /function\s+createWriteQueue\s*\(/.test(code));
check('诊断与缓存各有一条独立写队列（同一工具创建）',
  /const\s+enqueueDiagnosticsWrite\s*=\s*createWriteQueue\(\)/.test(code) &&
  /const\s+enqueueCacheWrite\s*=\s*createWriteQueue\(\)/.test(code));
check('recordSyncDiagnostic 走 enqueueDiagnosticsWrite',
  /function\s+recordSyncDiagnostic[\s\S]{0,600}enqueueDiagnosticsWrite\(/.test(code));
check('cacheMeaning 走 enqueueCacheWrite（读-改-写已串行化）',
  /function\s+cacheMeaning[\s\S]{0,300}enqueueCacheWrite\(/.test(code));
check('旧的裸 diagnosticsWriteChain 变量已彻底移除',
  !/diagnosticsWriteChain/.test(code));
check('队列在任务抛错后不断链（catch 兜住再排下一个）',
  /chain\s*=\s*chain\s*\.catch\(\(\)\s*=>\s*\{\}\)\s*\.then\(task\)/.test(code));

// ===== ② 源码断言：TTL 与兼容 =====
check('定义了缓存 TTL 常量 WORD_CACHE_TTL_MS',
  /const\s+WORD_CACHE_TTL_MS\s*=/.test(code));
check('cacheEntry 兼容旧版纯字符串值',
  /function\s+cacheEntry[\s\S]{0,300}typeof\s+raw\s*===\s*'string'/.test(code));
check('读缓存时按 TTL 判定过期即未命中',
  /getCachedMeaning[\s\S]{0,600}Date\.now\(\)\s*-\s*entry\.at\s*>\s*WORD_CACHE_TTL_MS/.test(code));
check('写缓存时丢弃过期条目（定期清理）',
  /cacheMeaning[\s\S]{0,1200}now\s*-\s*entry\.at\s*>\s*WORD_CACHE_TTL_MS\)\s*continue/.test(code));

// ===== ③ 用真实 service-worker.js 跑行为 =====
const store = { autoSync: false };
let msgListener = null;
let fetches = [];
const clone = (v) => JSON.parse(JSON.stringify(v));

globalThis.chrome = {
  storage: {
    local: {
      // 忠实模拟：get 在「发起时」取快照，set 异步落盘
      get(keys, cb) {
        const snap = clone(store);
        setTimeout(() => {
          if (typeof keys === 'function') return cb(snap);
          if (keys == null) return cb(snap);
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in snap) out[k] = snap[k];
          cb(out);
        }, 0);
      },
      set(obj, cb) {
        setTimeout(() => { Object.assign(store, clone(obj)); if (cb) cb(); }, 0);
      },
    },
    onChanged: { addListener() {} },
  },
  runtime: { onMessage: { addListener: (fn) => { msgListener = fn; } }, lastError: null },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    query: (q, cb) => cb([]),
    sendMessage: () => ({ catch() {} }),
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  tts: { speak() {}, stop() {}, getVoices: (cb) => cb([]) },
  scripting: { insertCSS: () => ({ catch() {} }) },
};
globalThis.console.warn = () => {};
globalThis.console.error = () => {};

globalThis.fetch = (url) => {
  fetches.push(url);
  const q = decodeURIComponent((/[?&]q=([^&]*)/.exec(url) || [])[1] || '');
  return Promise.resolve({
    ok: true, status: 200, url,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ result: { code: 200 }, data: { entries: [{ entry: q, explain: q + '-释义' }] } }),
    text: () => Promise.resolve(''),
  });
};

new Function(code)();
check('service-worker.js 载入无异常', typeof msgListener === 'function');

const lookup = (word) => new Promise((resolve) => msgListener({ type: 'lookup', word }, { tab: { id: 1 } }, resolve));
async function drain(rounds = 16) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
}

// ===== ④ 并发写不丢条目 =====
store.wordCache = {};
fetches = [];
const words = ['alpha', 'beta', 'gamma', 'delta'];
await Promise.all(words.map(lookup));
await drain();
check('并发查 4 个词都真的走了网络（缓存为空的首查）',
  fetches.length === 4, '实际=' + fetches.length);
check('并发写后 4 条缓存一条都没丢（读-改-写已串行化）',
  words.every((w) => store.wordCache?.[w]?.trans === w + '-释义'),
  '实际=' + JSON.stringify(Object.keys(store.wordCache || {})));

// ===== ⑤ TTL =====
const DAY = 24 * 60 * 60 * 1000;

store.wordCache = { stale: { trans: '过期释义', at: Date.now() - 40 * DAY } };
fetches = [];
let res = await lookup('stale');
await drain();
check('过期（40 天前）条目视为未命中、重新走网络',
  res?.trans === 'stale-释义' && res?.cached !== true && fetches.length === 1,
  '实际=' + JSON.stringify(res) + ' fetches=' + fetches.length);

store.wordCache = { fresh: { trans: '新鲜释义', at: Date.now() - DAY } };
fetches = [];
res = await lookup('fresh');
check('未过期（1 天前）条目直接命中、不发网络',
  res?.trans === '新鲜释义' && res?.cached === true && fetches.length === 0,
  '实际=' + JSON.stringify(res) + ' fetches=' + fetches.length);

// ===== ⑥ 写入时清理过期条目 =====
store.wordCache = {
  stale2: { trans: '过期释义', at: Date.now() - 40 * DAY },
  keep: { trans: '仍有效', at: Date.now() - DAY },
};
fetches = [];
await lookup('newbie');
await drain();
check('写入时顺手丢弃过期条目、保留有效条目',
  !store.wordCache?.stale2 && store.wordCache?.keep?.trans === '仍有效' &&
  store.wordCache?.newbie?.trans === 'newbie-释义',
  '实际=' + JSON.stringify(Object.keys(store.wordCache || {})));

// ===== ⑦ 兼容 v1 旧格式（纯字符串）=====
store.wordCache = { legacy: '旧格式释义' };
fetches = [];
res = await lookup('legacy');
check('v1 旧格式（纯字符串）仍能命中缓存、不发网络',
  res?.trans === '旧格式释义' && fetches.length === 0,
  '实际=' + JSON.stringify(res) + ' fetches=' + fetches.length);

store.wordCache = { legacy: '旧格式释义' };
fetches = [];
await lookup('upgrader');
await drain();
check('旧格式条目在下次写入时被升级为 {trans, at}（纳入 TTL 管理）',
  store.wordCache?.legacy?.trans === '旧格式释义' &&
  typeof store.wordCache.legacy.at === 'number' && store.wordCache.legacy.at > 0,
  '实际=' + JSON.stringify(store.wordCache?.legacy));

// ===== ⑧ 上限淘汰 =====
const big = {};
for (let i = 0; i < 2000; i++) big['w' + i] = { trans: 't' + i, at: Date.now() };
store.wordCache = big;
fetches = [];
await lookup('overflow');
await drain();
const count = Object.keys(store.wordCache || {}).length;
check('超过 2000 条上限时按插入顺序淘汰最旧的一条',
  count === 2000 && !store.wordCache.w0 && !!store.wordCache.overflow,
  '实际条数=' + count);

console.log(`\n=== 存储写入队列测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
