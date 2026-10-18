/**
 * 调试日志开关测试
 *
 * 背景：service-worker.js 里同步/接口路径原本有 20+ 处 console.log，
 * 其中还会打印完整响应体；商店版不该往用户控制台刷这些。
 * 现在统一走 logDebug()，默认静默；排查时用 __yhDebug.enable() 打开，
 * 开关写入 storage，SW 重启后仍生效。
 * 运行：node tests/debug-log.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const store = { autoSync: false };
let msgListener = null;
let captured = [];

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
globalThis.fetch = () => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve({ result: { code: 200 }, data: { entries: [] } }),
  text: () => Promise.resolve(''),
});

const realLog = console.log;
console.log = (...args) => captured.push(args.join(' '));

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log = realLog;
  if (cond) { pass++; realLog('PASS  ' + name); }
  else { failed++; realLog('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
  console.log = (...args) => captured.push(args.join(' '));
};

const tick = () => new Promise((r) => setTimeout(r, 0));
/** 触发一次必定走 logDebug 的路径 */
const triggerDebugPath = async () => {
  captured = [];
  msgListener({ type: 'lookup', word: 'hello' }, { tab: { id: 1 } }, () => {});
  await tick();
  return captured.filter(l => l.includes('[YH]'));
};

// ===== 1. 默认静默 =====
new Function(code)();
await tick();   // 等 storage 里的 debugLog 读取完成
check('service-worker.js 载入无异常', typeof msgListener === 'function');
check('默认不打印调试日志', (await triggerDebugPath()).length === 0);

// ===== 2. enable() 后打开 =====
globalThis.__yhDebug.enable();
check('enable() 后 __yhDebug.enabled 为 true', globalThis.__yhDebug.enabled === true);
check('enable() 把开关写入 storage（重启后仍生效）', store.debugLog === true);
check('enable() 后调试日志出现', (await triggerDebugPath()).length > 0);

// ===== 3. 重启后仍生效 =====
new Function(code)();   // 模拟 SW 被回收后重启，读取 storage.debugLog
await tick();
check('SW 重启后仍保持开启（读 storage）', (await triggerDebugPath()).length > 0);

// ===== 4. disable() 后关回去 =====
globalThis.__yhDebug.disable();
check('disable() 后 __yhDebug.enabled 为 false', globalThis.__yhDebug.enabled === false);
check('disable() 把开关写回 storage', store.debugLog === false);
check('disable() 后调试日志消失', (await triggerDebugPath()).length === 0);

console.log = realLog;
console.log(`\n=== 调试日志开关测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
