/**
 * Badge 计数测试（批量上报）
 *
 * 背景：content script 以前每命中一个高亮就 sendMessage 一次，一页几百个高亮
 * 会产生几百条消息、反复唤醒 SW。现在改为「页内去重 + 防抖」后批量发送
 * { type:'count', words:[...] }。本测试锁住协议与语义：
 *   - 批量数组按 tab 去重累加，Badge 显示不重复词数
 *   - 旧单条形式 { type:'count', word } 仍兼容
 *   - 重复上报同一批不重复刷新 Badge（避免无谓的 action API 调用）
 *   - tab 之间互不串味
 * 运行：node tests/badge-count.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const store = { autoSync: false };
let msgListener = null;
/** tabId -> 最近一次 setBadgeText 调用 */
const badgeTextCalls = [];
const badgeColorCalls = [];

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
  action: {
    setBadgeText(o) { badgeTextCalls.push(o); },
    setBadgeBackgroundColor(o) { badgeColorCalls.push(o); },
  },
  tts: { speak() {}, getVoices: (cb) => cb([]) },
};
globalThis.console.warn = () => {};
globalThis.fetch = () => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve({ code: 0 }),
  text: () => Promise.resolve(''),
});

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

new Function(code)();
check('service-worker.js 载入无异常', typeof msgListener === 'function');

/** 发一条消息（用 fire-and-forget 的 count 通道） */
const send = (request, tabId) => msgListener(request, { tab: { id: tabId } }, () => {});
const lastText = (tabId) => {
  for (let i = badgeTextCalls.length - 1; i >= 0; i--) {
    if (badgeTextCalls[i].tabId === tabId) return badgeTextCalls[i].text;
  }
  return null;
};
const textCallCount = (tabId) => badgeTextCalls.filter(c => c.tabId === tabId).length;

// ===== 1. 批量上报：去重累加 =====
badgeTextCalls.length = 0;
send({ type: 'count', words: ['apple', 'banana', 'apple'] }, 1);
check('批量上报按词去重后计数（apple/apple 只算一次 → 2）', lastText(1) === '2', '实际=' + lastText(1));

send({ type: 'count', words: ['cherry'] }, 1);
check('后续批次继续累加到同一 tab（2 + 1 → 3）', lastText(1) === '3', '实际=' + lastText(1));

// ===== 2. 重复上报不该重复刷新 Badge =====
const before = textCallCount(1);
send({ type: 'count', words: ['apple', 'cherry'] }, 1);
check('重复词不触发多余的 Badge 刷新', textCallCount(1) === before,
  `调用次数 ${before} → ${textCallCount(1)}`);

// ===== 3. 兼容旧的单条形式 =====
send({ type: 'count', word: 'durian' }, 1);
check('旧单条形式 { word } 仍被接受（3 + 1 → 4）', lastText(1) === '4', '实际=' + lastText(1));

// ===== 4. tab 之间互相隔离 =====
send({ type: 'count', words: ['apple'] }, 2);
check('另一个 tab 独立计数，不受 tab1 影响', lastText(2) === '1', '实际=' + lastText(2));
check('tab1 计数不被 tab2 改写', lastText(1) === '4', '实际=' + lastText(1));

// ===== 5. 空/异常入参不炸 =====
badgeTextCalls.length = 0;
send({ type: 'count', words: [] }, 3);
send({ type: 'count' }, 3);
send({ type: 'count', words: [null, '', 'ok'] }, 3);
check('空批次/非法词安全跳过，只计有效词', lastText(3) === '1', '实际=' + lastText(3));

console.log(`\n=== Badge 计数测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
