/**
 * 扩展上下文失效守卫测试
 *
 * 背景（真实复现的报错）：在 chrome://extensions 点「重新加载」后，已打开页面里的旧
 * content script 会与扩展失联。此时任何 chrome.* 调用都会 **同步抛出**
 *   Error: Extension context invalidated.
 * 于是页面上每次悬浮/点击都会在控制台刷一条未捕获错误：
 *   at showUnhighlightBubble (content/content.js)  ← chrome.runtime.sendMessage
 *   at showUnhighlightBubbleAtCursor (...)
 *
 * 本测试锁住两件事：
 *   ① 内容脚本/popup 里除守卫函数自身外，不再有裸的 chrome.runtime.sendMessage /
 *      chrome.storage.local.get 调用（新加的调用点必须走 safe* 封装）；
 *   ② 守卫本身在「上下文失效」和「正常」两种情况下行为正确（把真实源码抽出来跑一遍）。
 *   ③ SW 侧异步消息一定回一次响应（onceResponder），避免通道静默关闭报
 *      "message port closed before a response was received"。
 *
 * 运行：node tests/ext-context.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentJs = fs.readFileSync(path.join(ROOT, 'content/content.js'), 'utf8');
const popupJs = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');
const swJs = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

/** 按花括号配平截取函数源码 */
function grabFn(code, name) {
  const i = code.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0;
  for (let j = code.indexOf('{', i); j < code.length; j++) {
    if (code[j] === '{') depth++;
    else if (code[j] === '}') { depth--; if (depth === 0) return code.slice(i, j + 1); }
  }
  return '';
}

/** 截取两个标记之间的源码 */
function sliceBetween(code, from, to) {
  const i = code.indexOf(from);
  if (i < 0) return '';
  const j = code.indexOf(to, i + from.length);
  return j < 0 ? code.slice(i) : code.slice(i, j);
}

// ===== ① 所有 chrome API 调用都已收口 =====
// 去掉「守卫函数自身」那段源码后，剩余部分不允许再出现裸调用。
const contentGuardBlock = sliceBetween(contentJs, '// ===== 扩展上下文有效性守卫 =====', '// ===== 初始化 =====');
const contentRest = contentJs.replace(contentGuardBlock, '');
check('content.js 的守卫块存在且包含 safeSendMessage / safeStorageGet / isExtAlive',
  /function safeSendMessage\(/.test(contentGuardBlock)
  && /function safeStorageGet\(/.test(contentGuardBlock)
  && /function isExtAlive\(/.test(contentGuardBlock)
  && /function markExtDead\(/.test(contentGuardBlock));

check('content.js 除守卫外无裸 chrome.runtime.sendMessage',
  !/chrome\.runtime\.sendMessage\(/.test(contentRest),
  '出现裸调用，扩展重载后会在页面控制台抛 "Extension context invalidated."');

check('content.js 除守卫外无裸 chrome.storage.local.get',
  !/chrome\.storage\.local\.get\(/.test(contentRest),
  '出现裸调用（chrome.storage 在上下文失效后同样会抛）');

const popupGuardBlock = sliceBetween(popupJs, 'function isExtAlive() {', 'const els = {');
const popupRest = popupJs.replace(popupGuardBlock, '');
check('popup.js 有守卫且除守卫外无裸 chrome.runtime.sendMessage',
  /function isExtAlive\(/.test(popupGuardBlock)
  && /function safeSendMessage\(/.test(popupGuardBlock)
  && !/chrome\.runtime\.sendMessage\(/.test(popupRest),
  'popup 点按钮会抛 "Extension context invalidated."');

// 关键入口都加了早退守卫（否则会白弹浮层/确认框）
for (const fnName of ['processHoverAt', 'showBubble', 'showUnhighlightBubble', 'showUnhighlightBubbleAtCursor', 'handleBubbleAction', 'handleSpeak', 'handleDelete']) {
  const src = grabFn(contentJs, fnName);
  check(`${fnName} 入口有 isExtAlive() 守卫`, /isExtAlive\(\)/.test(src), '缺少守卫');
}

// ===== ② 把真实守卫代码抽出来跑 =====
function makeHarness(code, returnNames) {
  const fn = new Function(`
    ${code}
    return { ${returnNames.join(', ')} };
  `);
  return fn;
}

// —— 场景 A：上下文已失效（chrome API 同步抛异常）——
{
  let calls = 0;
  const fakeChrome = {
    // 与真实行为一致：失效后访问 runtime.id 得到 undefined，调用 API 同步抛错
    runtime: {
      id: undefined,
      lastError: null,
      sendMessage: () => { calls++; throw new Error('Extension context invalidated.'); }
    },
    storage: { local: { get: () => { calls++; throw new Error('Extension context invalidated.'); } } }
  };
  const infos = [];
  const mk = makeHarness(contentGuardBlock, ['isExtAlive', 'safeSendMessage', 'safeStorageGet', 'markExtDead']);
  const h = mk.call(null);
  // 注入依赖（守卫会调这些 DOM 清理函数）
  globalThis.chrome = fakeChrome;
  globalThis.console = { ...console, info: (...a) => infos.push(a.join(' ')), warn: () => {} };
  globalThis.hideBubble = () => {};
  globalThis.removeAddMenu = () => {};
  globalThis.cancelHover = () => {};
  globalThis.cancelTts = () => {};

  const h2 = mk.call(null);
  let cbArg = 'unset';
  const threw = (() => { try { h2.safeSendMessage({ type: 'lookup' }, (r) => { cbArg = r; }); return false; } catch (_) { return true; } })();
  check('上下文失效时 safeSendMessage 不抛异常', threw === false, '仍抛出 "Extension context invalidated."');
  check('上下文失效时回调收到 null（调用方不会以为成功）', cbArg === null, '实际=' + String(cbArg));
  check('上下文失效时不会真的去调 chrome API', calls === 0, '调用次数=' + calls);
  check('上下文失效时 isExtAlive() 返回 false', h2.isExtAlive() === false);

  let cb2 = 'unset';
  h2.safeStorageGet(['newWords'], (r) => { cb2 = r; });
  check('上下文失效时 safeStorageGet 以空对象回调', cb2 && typeof cb2 === 'object', '实际=' + JSON.stringify(cb2));
  check('失联提示只提示一次（不刷屏）', infos.length === 1, 'info 次数=' + infos.length);

  delete globalThis.chrome; delete globalThis.hideBubble; delete globalThis.removeAddMenu;
  delete globalThis.cancelHover; delete globalThis.cancelTts;
}

// —— 场景 B：上下文正常（消息能发出去、lastError 被翻译成 null）——
{
  const sent = [];
  let lastError = null;
  const fakeChrome = {
    runtime: {
      id: 'abcdefghijklmnop',
      get lastError() { return lastError; },
      sendMessage: (msg, cb) => { sent.push(msg); if (cb) cb({ ok: true, trans: 'n. 测试' }); }
    },
    storage: { local: { get: (keys, cb) => cb({ newWords: { wordInfos: {} } }) } }
  };
  globalThis.chrome = fakeChrome;
  const h = makeHarness(contentGuardBlock, ['isExtAlive', 'safeSendMessage', 'safeStorageGet']).call(null);

  let got = 'unset';
  const okSend = h.safeSendMessage({ type: 'lookup', word: 'test' }, (r) => { got = r; });
  check('上下文正常时 safeSendMessage 正常投递', okSend === true && sent.length === 1);
  check('上下文正常时回调收到真实响应', got && got.trans === 'n. 测试', '实际=' + JSON.stringify(got));

  lastError = { message: 'The message port closed before a response was received.' };
  let got2 = 'unset';
  h.safeSendMessage({ type: 'lookup', word: 'x' }, (r) => { got2 = r; });
  check('响应通道关闭（lastError）时回调收到 null，而不是让调用方卡在「查询中…」', got2 === null);

  let got3 = 'unset';
  h.safeStorageGet(['newWords'], (r) => { got3 = r; });
  check('上下文正常时 safeStorageGet 透传结果', got3 && got3.newWords, '实际=' + JSON.stringify(got3));

  // 无回调形式：返回值必须带 catch（否则未处理的 Promise 拒绝会进控制台）
  const p = h.safeSendMessage({ type: 'count', words: ['a'] });
  check('无回调形式安全投递（不抛）', p === true);

  delete globalThis.chrome;
}

// —— 场景 C：非失效类错误仍要留下可诊断日志 ——
{
  const warns = [];
  globalThis.chrome = {
    runtime: { id: 'x'.repeat(16), lastError: null, sendMessage: () => { throw new Error('boom'); } },
    storage: { local: { get: () => {} } }
  };
  globalThis.console = { ...console, warn: (...a) => warns.push(a.join(' ')), info: () => {} };
  globalThis.hideBubble = () => {}; globalThis.removeAddMenu = () => {};
  globalThis.cancelHover = () => {}; globalThis.cancelTts = () => {};
  const h = makeHarness(contentGuardBlock, ['safeSendMessage']).call(null);
  h.safeSendMessage({ type: 'lookup' });
  check('非失效类错误（如 boom）仍会 warn，便于定位真 bug', warns.some((w) => /boom/.test(w)), JSON.stringify(warns));
  delete globalThis.chrome; delete globalThis.hideBubble; delete globalThis.removeAddMenu;
  delete globalThis.cancelHover; delete globalThis.cancelTts;
}

// ===== ③ SW：异步消息一定回一次响应 =====
const swGuardBlock = sliceBetween(swJs, 'function onceResponder(sendResponse, tag) {', 'chrome.runtime.onMessage.addListener(');
check('service-worker.js 定义 onceResponder / runMessageHandler',
  /function onceResponder\(/.test(swGuardBlock) && /function runMessageHandler\(/.test(swGuardBlock));

for (const tag of ['sync', 'checkLogin', 'openLoginPage', 'delete', 'logout', 'addWord', 'lookup', 'resetSettings']) {
  check(`SW 分支「${tag}」使用 onceResponder 收口`,
    new RegExp(`onceResponder\\(sendResponse, '${tag}'\\)`).test(swJs) || new RegExp(`'${tag}'\\)`).test(swGuardBlock),
    '仍有分支可能不回响应 → 发送端报 message port closed');
}
check('SW 不再有裸 whenI18nReady(() => xxx(sendResponse))',
  !/whenI18nReady\(\(\) => \w+\(sendResponse\)\)/.test(swJs),
  '出现未收口的异步分支');

{
  const calls = [];
  globalThis.t = (key, fallback, subs) => (fallback || key).replace('$1', (subs && subs[0]) || '');
  const h = new Function(`
    ${swGuardBlock}
    return { onceResponder, runMessageHandler };
  `).call(null);

  const reply = h.onceResponder((m) => calls.push(m), 'test');
  reply('first'); reply('second');
  check('onceResponder 只回一次（重复回会报 message port closed）', calls.length === 1 && calls[0] === 'first', JSON.stringify(calls));

  let threw = false;
  const bad = h.onceResponder(() => { throw new Error('port closed'); }, 'test');
  try { bad('x'); } catch (_) { threw = true; }
  check('sendResponse 自身抛错时不会把异常抛回消息循环', threw === false);

  // handler 同步抛错 → 必须补一次兜底响应
  const calls2 = [];
  const reply2 = h.onceResponder((m) => calls2.push(m), 'test');
  h.runMessageHandler('test', reply2, () => { throw new Error('内部炸了'); });
  check('handler 同步抛错时补发兜底响应', calls2.length === 1 && /内部炸了/.test(String(calls2[0])), JSON.stringify(calls2));

  // handler 返回 rejected promise → 同样补兜底
  const calls3 = [];
  const reply3 = h.onceResponder((m) => calls3.push(m), 'test');
  h.runMessageHandler('test', reply3, () => Promise.reject(new Error('异步炸了')));
  await new Promise((r) => setTimeout(r, 10));
  check('handler 异步拒绝时补发兜底响应', calls3.length === 1 && /异步炸了/.test(String(calls3[0])), JSON.stringify(calls3));

  // handler 自己正常回了 → 不重复补
  const calls4 = [];
  const reply4 = h.onceResponder((m) => calls4.push(m), 'test');
  h.runMessageHandler('test', reply4, () => { reply4('正常结果'); });
  await new Promise((r) => setTimeout(r, 10));
  check('handler 正常回响应时不重复补发', calls4.length === 1 && calls4[0] === '正常结果', JSON.stringify(calls4));

  delete globalThis.t;
}

console.log(`\n=== 扩展上下文测试: ${pass} 通过, ${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
