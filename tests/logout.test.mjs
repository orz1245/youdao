/**
 * 登出流程测试（service worker 侧）
 * 用最小 chrome API 桩执行真实的 service-worker.js，校验：
 *   1) logout 消息会清掉登录态并置 userLoggedOut，且广播给所有标签页
 *   2) 登出后 service worker 重启时不再自动同步 —— 否则后台会把登录态又"同步"回来，
 *      登出形同虚设（这是最容易漏的一条边界）
 *   3) 对照组：未登出时自动同步照常触发，证明 2) 是被 userLoggedOut 拦下的
 * 运行：node tests/logout.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

// ---- 桩 ----
let store = {};
let msgListener = null;
const notified = [];
let fetches = [];
let alarmListener = null;
let activeAlarm = null;
const createdAlarms = [];

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
      remove(key, cb) { delete store[key]; if (cb) queueMicrotask(cb); },
    },
    onChanged: { addListener() {} },
  },
  runtime: {
    onMessage: { addListener: (fn) => { msgListener = fn; } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    lastError: null
  },
  alarms: {
    get: (name, cb) => queueMicrotask(() => cb(activeAlarm && activeAlarm.name === name ? activeAlarm : null)),
    create: (name, info) => {
      activeAlarm = { name, ...info };
      createdAlarms.push(activeAlarm);
    },
    onAlarm: { addListener: (fn) => { alarmListener = fn; } },
  },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    query: (q, cb) => cb([{ id: 1, url: 'https://example.com/' }]),
    sendMessage: (id, msg) => { notified.push(msg && msg.type); return { catch() {} }; },
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  tts: { speak() {}, getVoices: (cb) => cb([]) },
  scripting: { insertCSS: () => ({ catch() {} }) },
};
globalThis.console.warn = () => {};

globalThis.fetch = (url) => {
  fetches.push(url);
  return Promise.resolve({
    ok: true, status: 200, url,
    // 同步策略1（抓 wordlist 页面解析 __NUXT__）要求 HTML 里带单词，
    // 否则会一路降级到策略3，请求数就不是 1 了
    json: () => Promise.resolve({
      code: 0, msg: 'SUCCESS',
      data: { total: 1, itemList: [{ word: 'hello', phonetic: 'həˈloʊ', trans: '你好' }] }
    }),
    text: () => Promise.resolve(
      '<script>window.__NUXT__={data:{"wordList":' +
      '[{"word":"hello","phonetic":"həˈloʊ","trans":"你好"}]}};</script>'
    ),
  });
};

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};
const tick = () => new Promise((r) => setTimeout(r, 5));
const loadSW = () => { fetches = []; msgListener = null; new Function(code)(); };
const send = (request) => new Promise((resolve) => msgListener(request, { tab: { id: 1 } }, resolve));

// ===== 1. 登出消息 =====
store = { autoSync: false, loggedIn: true, userLoggedOut: false,
          newWords: { wordInfos: { hello: { word: 'hello' } } } };
loadSW();
notified.length = 0;

let res = await send({ type: 'logout' });

check('登出后 loggedIn=false', store.loggedIn === false, '实际=' + store.loggedIn);
check('登出后 userLoggedOut=true（关键：防止被 cookie 兜底判回已登录）',
  store.userLoggedOut === true, '实际=' + store.userLoggedOut);
check('登出后广播 wordsUpdated 给标签页（让页面刷新高亮状态）',
  notified.includes('wordsUpdated'), '实际=' + JSON.stringify(notified));
check('登出回执文案', /已登出/.test(res || ''), '实际=' + res);
check('登出保留本地生词缓存（高亮继续生效）',
  !!store.newWords?.wordInfos?.hello, '实际=' + JSON.stringify(store.newWords));

// ===== 2. 登出后 SW 重启：不应自动同步 =====
store = { autoSync: true, syncTime: 0, userLoggedOut: true };
loadSW();
await tick();
check('登出后 SW 重启不触发自动同步', fetches.length === 0,
  '实际请求=' + JSON.stringify(fetches));
check('已创建每日自动同步 Alarm',
  activeAlarm?.name === 'youdaoDailyWordbookSync' && activeAlarm?.periodInMinutes === 24 * 60,
  '实际=' + JSON.stringify(activeAlarm));

// 主动登出后，即便网站 Cookie 仍有效，也不得通过服务端探测回写为已登录。
res = await send({ type: 'checkLogin' });
check('登出后服务端登录探测保持未登录且不发网络请求',
  res?.ok === false && res?.userLoggedOut === true && fetches.length === 0,
  '实际响应=' + JSON.stringify(res) + ' 请求=' + JSON.stringify(fetches));

// ===== 3. 对照组：未登出时应照常自动同步 =====
store = { autoSync: true, syncTime: 0, userLoggedOut: false };
loadSW();
await tick();
check('未登出时 SW 重启会触发自动同步（证明上一条是被 userLoggedOut 拦下的）',
  fetches.length === 1 && /webwordbook\/wordlist/.test(fetches[0]),
  '实际请求=' + JSON.stringify(fetches));

// Alarm 是每日同步的主路径：将上次成功时间调旧后触发 alarm，应实际发起同步。
store = { autoSync: true, syncTime: Date.now(), userLoggedOut: false };
loadSW();
await tick();
fetches = [];
store.syncTime = 0;
alarmListener({ name: 'youdaoDailyWordbookSync' });
await tick();
check('每日 Alarm 到期时触发自动同步',
  fetches.length === 1 && /webwordbook\/wordlist/.test(fetches[0]),
  '实际请求=' + JSON.stringify(fetches));
// ===== 4. 同步成功后应清掉登出标记 =====
store = { autoSync: false, loggedIn: false, userLoggedOut: true };
loadSW();
notified.length = 0;
await send({ type: 'sync' });
check('同步成功后清掉 userLoggedOut 并置 loggedIn=true',
  store.userLoggedOut === false && store.loggedIn === true,
  '实际 loggedIn=' + store.loggedIn + ' userLoggedOut=' + store.userLoggedOut);

// ===== 5. 远端空生词本也应视为同步成功，并清理旧缓存 =====
store = {
  autoSync: false, loggedIn: true, userLoggedOut: false,
  newWords: { wordInfos: { stale: { word: 'stale' } } }
};
globalThis.fetch = (url) => {
  fetches.push(url);
  return Promise.resolve({
    ok: true, status: 200, url,
    // S1 无注入数据，转到 JSON API；S2 返回合法空数组。
    text: () => Promise.resolve('<html><body>wordbook</body></html>'),
    json: () => Promise.resolve({ code: 0, data: { total: 0, itemList: [] } }),
  });
};
loadSW();
res = await send({ type: 'sync' });
check('空生词本同步成功并清空旧本地缓存',
  /同步成功.*0 个生词/.test(res || '') &&
  Object.keys(store.newWords?.wordInfos || {}).length === 0,
  '实际响应=' + res + ' 词表=' + JSON.stringify(store.newWords));
await tick();
check('同步诊断记录接口/解析版本、策略和失败率',
  store.syncDiagnostics?.lastAttempt?.strategy === 'S2' &&
  store.syncDiagnostics?.lastAttempt?.interfaceVersion === 'youdao-wordbook-sync-v2' &&
  store.syncDiagnostics?.lastAttempt?.attempts?.[0]?.page?.parserVersion === 'nuxt-ssr-json-array-v1' &&
  store.syncDiagnostics?.stats?.failureRate === 0,
  '实际=' + JSON.stringify(store.syncDiagnostics));

console.log(`\n=== 登出流程测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
