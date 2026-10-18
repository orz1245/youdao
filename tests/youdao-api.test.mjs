/**
 * 有道增删接口测试
 * 用最小 chrome API 桩执行真实的 service-worker.js，校验：
 *   1) 添加接口 URL = dict.youdao.com/wordbook/webapi/v2/ajax/add?word=X&lan=en
 *   2) 删除接口 URL = dict.youdao.com/wordbook/webapi/v2/ajax/del?word=X
 *   3) 两者都是 GET + credentials:'include'，且不手写 Cookie 头（禁用头会被浏览器丢弃）
 *   4) lan 参数按字符集推断；失败时提示文案带 ⚠️ 且仍落本地
 * 运行：node tests/youdao-api.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const ADD = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/add';
const DEL = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/del';

// ---- chrome 桩（storage 用内存对象，get/set 真实生效）----
// 注意：Chrome 的 storage 回调是异步的，桩也必须异步 —— 若同步回调，
// 初始化块会在 const YOUDAO_*_URL 声明之前就触发 syncYoudao，撞 TDZ。
// 预置 autoSync:false，避免初始化时触发自动同步污染 fetch 记录。
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
  tts: { speak() {}, getVoices: (cb) => cb([]) },
  scripting: { insertCSS: () => ({ catch() {} }) },
};
globalThis.console.warn = () => {};

// ---- fetch 桩（按 URL 分流：增删接口 / 查词接口各给一份响应）----
let fetches = [];
let nextJson = { code: 0, msg: 'SUCCESS' };
let suggestJson = { result: { code: 200, msg: 'success' }, data: { entries: [] } };
globalThis.fetch = (url, opts) => {
  fetches.push({ url, opts });
  const body = /\/suggest\?/.test(url) ? suggestJson : nextJson;
  return Promise.resolve({
    ok: true, status: 200, url,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
};

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

new Function(code)();
check('service-worker.js 载入无异常', typeof msgListener === 'function');
fetches = [];   // 丢弃载入期可能产生的请求

/** 触发一次消息，返回 Promise<响应文案> */
function send(request) {
  return new Promise((resolve) => msgListener(request, { tab: { id: 1 } }, resolve));
}

const add = (word) => send({ type: 'addWord', word });
const del = (word) => send({ type: 'delete', wordData: { word, canonical: word.toLowerCase() } });
/** 按 URL 片段筛请求（addWord 现在会并行发一次查词请求，不能直接数 fetches.length） */
const reqs = (part) => fetches.filter(f => f.url.includes(part));

// ===== 1. 添加接口 =====
fetches = [];
nextJson = { code: 0, msg: 'SUCCESS' };
suggestJson = { result: { code: 200 }, data: { entries: [{ entry: 'hello', explain: 'int. 喂；你好' }] } };
let res = await add('hello');

check('添加走 v2/ajax/add 且带 word + lan=en',
  reqs('ajax/add').length === 1 && reqs('ajax/add')[0].url === `${ADD}?word=hello&lan=en`,
  '实际=' + (reqs('ajax/add')[0] && reqs('ajax/add')[0].url));
check('添加是 GET', reqs('ajax/add')[0]?.opts?.method === 'GET', '实际=' + reqs('ajax/add')[0]?.opts?.method);
check('添加带 credentials:include', reqs('ajax/add')[0]?.opts?.credentials === 'include');
check('添加不手写 Cookie 头（禁用头无效）',
  !reqs('ajax/add')[0]?.opts?.headers?.Cookie && !reqs('ajax/add')[0]?.opts?.headers?.cookie);
check('添加成功后返回成功文案', /已添加到有道生词本/.test(res), '实际=' + res);
check('添加后写入本地存储', !!store.newWords?.wordInfos?.hello);
check('添加时顺带查回释义并落库（气泡可直接显示）',
  store.newWords?.wordInfos?.hello?.trans === 'int. 喂；你好',
  '实际=' + JSON.stringify(store.newWords?.wordInfos?.hello));

// ===== 2. 重复添加不发请求 =====
fetches = [];
res = await add('hello');
check('已存在时不重复请求', fetches.length === 0);
check('已存在时提示已在生词本', /已在生词本中/.test(res), '实际=' + res);

// ===== 3. lan 推断 =====
fetches = [];
nextJson = { code: 0 };
await add('你好');
check('中文词 lan=zh', reqs('ajax/add')[0]?.url === `${ADD}?word=${encodeURIComponent('你好')}&lan=zh`,
  '实际=' + reqs('ajax/add')[0]?.url);
check('中文词查词用 le=zh',
  /\/suggest\?.*&le=zh&/.test(reqs('suggest')[0]?.url || ''), '实际=' + reqs('suggest')[0]?.url);
fetches = [];
await add('こんにちは');
check('日文词 lan=ja', /&lan=ja$/.test(reqs('ajax/add')[0]?.url || ''), '实际=' + reqs('ajax/add')[0]?.url);
fetches = [];
await add('New York');
check('空格被 URL 编码且统一转小写', reqs('ajax/add')[0]?.url === `${ADD}?word=${encodeURIComponent('new york')}&lan=en`,
  '实际=' + reqs('ajax/add')[0]?.url);

// ===== 4. 删除接口 =====
fetches = [];
nextJson = { code: 0, msg: 'SUCCESS' };
res = await del('hello');
check('删除走 v2/ajax/del 且按 word 传参（不再用 itemId）',
  reqs('ajax/del').length === 1 && reqs('ajax/del')[0].url === `${DEL}?word=hello`,
  '实际=' + (reqs('ajax/del')[0] && reqs('ajax/del')[0].url));
check('删除是 GET', reqs('ajax/del')[0]?.opts?.method === 'GET');
check('删除带 credentials:include', reqs('ajax/del')[0]?.opts?.credentials === 'include');
check('删除成功后从本地移除', !store.newWords?.wordInfos?.hello);
check('删除成功文案', /已从有道生词本删除/.test(res), '实际=' + res);

// ===== 5. 远端失败仍落本地并明确告警 =====
fetches = [];
nextJson = { code: 50, msg: '未登录' };
res = await add('notebook');
check('未登录时文案带告警', /⚠️/.test(res) && /仅添加到本地/.test(res), '实际=' + res);
check('未登录时仍写入本地（页面高亮立即生效）', !!store.newWords?.wordInfos?.notebook);

fetches = [];
nextJson = { code: 0 };
res = await add('gadget');
check('恢复后再次添加正常', /已添加到有道生词本/.test(res), '实际=' + res);

console.log(`\n=== 有道增删接口测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
