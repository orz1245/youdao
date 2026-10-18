/**
 * 查词接口（suggest）测试
 * 用最小 chrome API 桩执行真实的 service-worker.js，校验：
 *   1) 请求 URL 形如 dict.youdao.com/suggest?num=5&ver=3.0&doctype=json&cache=false&le=en&q=xxx
 *   2) 只认「entry 与查询词完全一致」的那条释义 —— 有道把精确匹配和联想词混在 entries 里，
 *      查 never 会带出 nevertheless / never mind，取错就给错释义（最容易踩的坑）
 *   3) 释义走本地缓存，同一个词第二次查不再打网络
 * 运行：node tests/lookup.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const SUGGEST = 'https://dict.youdao.com/suggest';
const NEVER_URL = `${SUGGEST}?num=5&ver=3.0&doctype=json&cache=false&le=en&q=never`;

// ---- chrome 桩 ----
const store = { autoSync: false };
let msgListener = null;

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
  runtime: { onMessage: { addListener: (fn) => { msgListener = fn; } }, lastError: null },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    query: (q, cb) => cb([]),
    sendMessage: () => ({ catch() {} }),
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  tts: { speak() {}, getVoices: (cb) => cb([]) },
  scripting: { insertCSS: () => ({ catch() {} }) },
};
globalThis.console.warn = () => {};

// ---- fetch 桩 ----
let fetches = [];
let suggestBody = null;
let httpOk = true;
globalThis.fetch = (url, opts) => {
  fetches.push({ url, opts });
  return Promise.resolve({
    ok: httpOk, status: httpOk ? 200 : 500, url,
    json: () => Promise.resolve(suggestBody),
    text: () => Promise.resolve(JSON.stringify(suggestBody)),
  });
};

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

new Function(code)();
const lookup = (word) => new Promise((resolve) => msgListener({ type: 'lookup', word }, { tab: { id: 1 } }, resolve));

// 真实返回结构（查 never 时的一手抓包内容）
const NEVER_BODY = {
  result: { msg: 'success', code: 200 },
  data: {
    entries: [
      { explain: 'adv. 决不，永不；不会，不可能（表示惊讶或震惊）', entry: 'never' },
      { explain: 'adv. 然而，不过', entry: 'nevertheless' },
      { explain: '不要紧，不用在意', entry: 'never mind' },
      { explain: 'n. 别介意，无所谓', entry: 'nevermind' },
    ],
    query: 'never', language: 'en', type: 'dict',
  },
};

// ===== 1. URL 与请求方式 =====
fetches = [];
store.wordCache = {};
suggestBody = NEVER_BODY;
let res = await lookup('never');

check('请求 URL 完全符合实测接口形态', fetches[0]?.url === NEVER_URL, '实际=' + fetches[0]?.url);
check('查词是 GET', fetches[0]?.opts?.method === 'GET');
check('查词带 credentials:include', fetches[0]?.opts?.credentials === 'include');

// ===== 2. 精确匹配（核心坑）=====
check('取到精确匹配的释义，而不是联想词的',
  res?.ok === true && res.trans === 'adv. 决不，永不；不会，不可能（表示惊讶或震惊）',
  '实际=' + JSON.stringify(res));
check('没有把 nevertheless 的释义安到 never 上', !/然而，不过/.test(res?.trans || ''));

// ===== 3. 大小写不敏感 =====
fetches = [];
store.wordCache = {};             // 清缓存，确保真的发请求
res = await lookup('Never');
check('大小写不同仍能精确匹配', res?.ok === true && /决不，永不/.test(res.trans || ''),
  '实际=' + JSON.stringify(res));

// ===== 4. 只有联想词时不硬套 =====
fetches = [];
store.wordCache = {};
suggestBody = { result: { code: 200 }, data: { entries: [{ entry: 'nevertheless', explain: 'adv. 然而，不过' }] } };
res = await lookup('never');
check('无精确匹配时返回空释义（不硬套联想词）',
  res?.ok === true && res.trans === '', '实际=' + JSON.stringify(res));

// ===== 5. 有道没有这个词 =====
fetches = [];
store.wordCache = {};
suggestBody = { result: { code: 200 }, data: { entries: [] } };
res = await lookup('zzzznotaword');
check('空 entries 视为查不到（ok=true，释义为空）',
  res?.ok === true && res.trans === '', '实际=' + JSON.stringify(res));

// ===== 6. 缓存 =====
fetches = [];
store.wordCache = {};
suggestBody = NEVER_BODY;
await lookup('never');
const firstCount = fetches.length;
fetches = [];
await lookup('never');           // 第二次应命中缓存
check('第二次查同一个词命中缓存、不再发请求',
  firstCount === 1 && fetches.length === 0,
  '首次=' + firstCount + ' 二次=' + fetches.length);
check('缓存确实写进了 wordCache（v2：{trans, at}）',
  store.wordCache?.never?.trans === 'adv. 决不，永不；不会，不可能（表示惊讶或震惊）' &&
  typeof store.wordCache.never.at === 'number' && store.wordCache.never.at > 0,
  '实际=' + JSON.stringify(store.wordCache));

fetches = [];
await lookup('NEVER');           // 大小写不同应命中同一份缓存
check('大小写不同命中同一份缓存', fetches.length === 0, '实际请求数=' + fetches.length);

// ===== 7. HTTP 错误 =====
fetches = [];
store.wordCache = {};
httpOk = false;
suggestBody = NEVER_BODY;
res = await lookup('never');
check('HTTP 失败时 ok=false 且带原因',
  res?.ok === false && /HTTP 500/.test(res.reason || ''), '实际=' + JSON.stringify(res));
httpOk = true;

// ===== 8. 结果码异常 =====
fetches = [];
store.wordCache = {};
suggestBody = { result: { code: 500, msg: 'error' }, data: { entries: [] } };
res = await lookup('never');
check('result.code 非 200 时 ok=false',
  res?.ok === false && /code 500/.test(res.reason || ''), '实际=' + JSON.stringify(res));

console.log(`\n=== 查词接口测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
