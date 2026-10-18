/**
 * popup.js 初始化冒烟测试
 * 用最小 DOM / chrome API 桩执行真实的 popup.js，确认初始化链路无 ReferenceError。
 * 用途：防止「调用了尚未定义/尚未写入的函数」这类低级错误漏到线上。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'popup/popup.js'), 'utf8');
// popup.html 会先加载 lib/i18n.js 再加载 popup.js，这里保持同样的顺序，
// 以便测试走真实的 t()（含 $1 占位替换），而不是简写里的降级分支。
const i18nCode = fs.readFileSync(path.join(ROOT, 'lib/i18n.js'), 'utf8');

const PRESETS = ['#ffe464', '#9be4a4', '#f69ba4', '#80b6f6', '#ffbe72', '#c2a3f7', '#969aa0'];

function makeEl(extra = {}) {
  const classes = new Set();
  const el = {
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    checked: false, disabled: false, title: '', id: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    _events: {},
    // 记录事件处理器，便于测试直接触发
    addEventListener(ev, fn) { el._events[ev] = fn; },
    replaceWith() {}, appendChild() {}, remove() {},
    ...extra,
  };
  return el;
}

const presets = PRESETS.map((bg) => makeEl({ dataset: { bg, text: '' } }));
const createdEls = [];   // document.createElement 创建过的元素，用于驱动动态 UI
const byId = new Map();
['toggle', 'ttsToggle', 'autoSync', 'syncBtn', 'logoutBtn', 'resetBtn', 'highlightBg', 'highlightText',
 'voiceSelect', 'previewBtn', 'loginArea', 'accountArea', 'loginBtn', 'userName',
 'wordbookCount', 'userAvatar', 'toastArea', 'dialogArea', 'langSelect'].forEach((id) => byId.set('#' + id, makeEl({ id })));

const voices = [
  { voiceName: 'Samantha', lang: 'en-US', localService: true },
  { voiceName: 'Google 普通话（中国大陆）', lang: 'zh-CN' },
  { voiceName: 'Google US English', lang: 'en-US' },
  { voiceName: 'Google UK English Female', lang: 'en-GB' },
];

let insertedOptions = [];
const sentMessages = [];   // popup 发出的 runtime 消息
const storageSets = [];    // popup 写入 storage 的内容
let popupStore = { highlightBackground: '#ffe464', highlightText: '', loggedIn: true };
let popupServerResponse = 'ok';

globalThis.document = {
  querySelector: (sel) => (sel === '.preset' ? presets[0] : byId.get(sel) || makeEl()),
  querySelectorAll: (sel) => (sel === '.preset' ? presets : []),
  createElement: () => {
    const el = makeEl();
    // 记录被创建出来的 <option> 文案（popup.js 通过 textContent 赋值）
    Object.defineProperty(el, 'textContent', {
      set(v) { el._text = v; insertedOptions.push({ value: el.value, text: v }); },
      get() { return el._text; },
    });
    createdEls.push(el);
    return el;
  },
};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb(popupStore),
      set: (o, cb) => { storageSets.push(o); cb && cb(); },
      remove: () => {},
    },
    onChanged: { addListener() {} },
  },
  // 同步回调：让 popup 里「打开弹窗 → 点按钮 → 回填」的链路能真正跑完
  // id 必须给：popup.js 的 isExtAlive() 以 chrome.runtime.id 判断扩展上下文是否还有效
  runtime: { id: 'test-extension', sendMessage: (msg, cb) => { sentMessages.push(msg); if (cb) cb(popupServerResponse); }, lastError: null },
  cookies: { getAll: (o, cb) => cb([]) },
  tabs: { query: (o, cb) => cb([]), sendMessage: () => ({ catch() {} }) },
  tts: {
    getVoices: (cb) => cb(voices),
  },
};
globalThis.location = { reload() {} };
globalThis.alert = () => {};
globalThis.confirm = () => true;

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

try {
  new Function(i18nCode)();   // 挂载 globalThis.YHI18n
  new Function(code)();
  check('popup.js 初始化无异常', true);
} catch (e) {
  check('popup.js 初始化无异常', false, e.message);
}

// 语音下拉：第一项是「自动（推荐）」，其后列出全部英语语音（中文/日文应被过滤）
// 桩里 1 项系统嗓音 + 2 项英语谷歌 + 1 项中文谷歌 → 过滤后应为 3 项
const optionTexts = insertedOptions.map(o => o.text);
const voiceOptionTexts = optionTexts.filter((t) => t !== '自动（推荐）');
check('语音下拉第一项是「自动（推荐）」',
  optionTexts[0] === '自动（推荐）',
  '实际=' + JSON.stringify(optionTexts));
check('语音下拉列出全部英语语音（中文谷歌被过滤）',
  voiceOptionTexts.length === 3 &&
  voiceOptionTexts.every(t => /en-US|en-GB/.test(t)) &&
  voiceOptionTexts.every(t => !/普通话|日语/.test(t)),
  '实际=' + JSON.stringify(voiceOptionTexts));

check('谷歌语音排在系统嗓音前面（与自动策略的优先顺序一致）',
  voiceOptionTexts.findIndex(t => /US English/.test(t)) <
  voiceOptionTexts.findIndex(t => /^Samantha/.test(t)),
  '实际=' + JSON.stringify(voiceOptionTexts));

check('语音名去掉了冗余的 Google 前缀',
  optionTexts.includes('US English（en-US）'),
  '实际=' + JSON.stringify(optionTexts));

// 登录态渲染：桩里 storage 返回 loggedIn:true，应显示「同步 + 登出」、隐藏「登录」
check('已登录时账号行可见、登录行隐藏',
  byId.get('#accountArea').style.display === 'flex' &&
  byId.get('#loginArea').style.display === 'none',
  'accountArea=' + byId.get('#accountArea').style.display +
  ' loginArea=' + byId.get('#loginArea').style.display);
check('已登录时回填生词本数量',
  /生词本：\d+ 个/.test(byId.get('#wordbookCount').textContent),
  '实际=' + JSON.stringify(byId.get('#wordbookCount').textContent));

// 三个按钮都必须真的绑上点击处理，否则按钮点了没反应
const bound = (id) => typeof byId.get(id)._events.click === 'function';
check('登录/同步/登出三个按钮都绑定了点击处理',
  bound('#loginBtn') && bound('#syncBtn') && bound('#logoutBtn'),
  'login=' + bound('#loginBtn') + ' sync=' + bound('#syncBtn') + ' logout=' + bound('#logoutBtn'));

// ===== 登出流程：先弹页面内确认框，确认后才发 logout 消息 =====
// （不再用 window.confirm：弹窗会阻塞、样式不可控，且扩展弹窗失焦就可能被关掉）
sentMessages.length = 0;
createdEls.length = 0;
byId.get('#logoutBtn')._events.click();
check('点击登出先弹确认框，不直接登出',
  byId.get('#dialogArea').hidden === false && !sentMessages.some(m => m.type === 'logout'),
  'hidden=' + byId.get('#dialogArea').hidden + ' 消息=' + JSON.stringify(sentMessages.map(m => m.type)));
const dialogOk = createdEls.find(el => el.id === 'dialogConfirm');
const dialogCancel = createdEls.find(el => el.id === 'dialogCancel');
check('确认框同时提供确认与取消按钮',
  !!(dialogOk && dialogCancel && dialogOk._events.click && dialogCancel._events.click));

dialogOk._events.click();
await new Promise((r) => setTimeout(r, 0));   // 等 async 处理器继续执行
check('点击确认后发送 logout 消息',
  sentMessages.some(m => m.type === 'logout'),
  '实际=' + JSON.stringify(sentMessages.map(m => m.type)));
check('确认后关闭确认框', byId.get('#dialogArea').hidden === true);
check('登出后界面切回未登录（显示登录行、隐藏账号行）',
  byId.get('#loginArea').style.display === 'flex' &&
  byId.get('#accountArea').style.display === 'none',
  'loginArea=' + byId.get('#loginArea').style.display +
  ' accountArea=' + byId.get('#accountArea').style.display);

// ===== 登录流程：点击后清掉「主动登出」标记，让下次打开恢复检测 =====
storageSets.length = 0;
byId.get('#loginBtn')._events.click();
check('点击登录清除 userLoggedOut 标记',
  storageSets.some(o => o.userLoggedOut === false),
  '实际=' + JSON.stringify(storageSets));

// ===== 界面语言：下拉框回填 + 切换后写入设置 =====
check('语言下拉框回填为已保存的语言（没设置过就是 auto）',
  byId.get('#langSelect').value === 'auto',
  '实际=' + JSON.stringify(byId.get('#langSelect').value));
storageSets.length = 0;
byId.get('#langSelect').value = 'en';
byId.get('#langSelect')._events.change();
check('切换语言下拉框会写入 uiLang 并重载弹窗',
  storageSets.some(o => o.uiLang === 'en'),
  '实际=' + JSON.stringify(storageSets));
check('语言下拉框绑定的是真实字符串值（不是 index）',
  byId.get('#langSelect').value === 'en');

// 主动登出后浏览器仍保留站点 Cookie。重新打开 popup 时不得再做服务端探测并显示为已登录。
for (const id of ['toggle', 'ttsToggle', 'autoSync', 'syncBtn', 'logoutBtn', 'resetBtn', 'highlightBg', 'highlightText',
  'voiceSelect', 'previewBtn', 'loginArea', 'accountArea', 'loginBtn', 'userName',
  'wordbookCount', 'userAvatar', 'toastArea', 'dialogArea', 'langSelect']) {
  byId.set('#' + id, makeEl({ id }));
}
popupStore = { highlightBackground: '#ffe464', highlightText: '', loggedIn: false, userLoggedOut: true };
popupServerResponse = { ok: true, needLogin: false, loggedIn: true }; // 模拟仍有效的有道 Cookie
sentMessages.length = 0;
new Function(code)();
check('主动登出后重开 popup 仍显示未登录',
  byId.get('#loginArea').style.display === 'flex' &&
  byId.get('#accountArea').style.display === 'none',
  'loginArea=' + byId.get('#loginArea').style.display +
  ' accountArea=' + byId.get('#accountArea').style.display);
check('主动登出后不再发起服务端登录探测',
  !sentMessages.some(m => m.type === 'checkLogin'),
  '实际=' + JSON.stringify(sentMessages.map(m => m.type)));

// ===== 语音列表限量：macOS 有 40+ 个英语系统语音（含 Zarvox/Bells 这类趣味音），
// 全列会淹没下拉框 → 谷歌语音全部保留，系统嗓音只取排序后的前 10 个 =====
for (const id of ['toggle', 'ttsToggle', 'autoSync', 'syncBtn', 'logoutBtn', 'resetBtn', 'highlightBg', 'highlightText',
  'voiceSelect', 'previewBtn', 'loginArea', 'accountArea', 'loginBtn', 'userName',
  'wordbookCount', 'userAvatar', 'toastArea', 'dialogArea', 'langSelect']) {
  byId.set('#' + id, makeEl({ id }));
}
insertedOptions.length = 0;
voices.length = 0;
for (let i = 0; i < 15; i++) voices.push({ voiceName: `Sys Voice ${i}`, lang: 'en-US', remote: false });
voices.push({ voiceName: 'Google US English', lang: 'en-US', remote: true });
voices.push({ voiceName: 'Google UK English Female', lang: 'en-GB', remote: true });
voices.push({ voiceName: 'Ting-Ting', lang: 'zh-CN', localService: true });
popupStore = { highlightBackground: '#ffe464', highlightText: '', loggedIn: false };
new Function(code)();
const capped = insertedOptions.map(o => o.text).filter(t => t !== '自动（推荐）');
check('英文谷歌语音全部保留（不被系统嗓音的限量挤掉）',
  capped.filter(t => !/^Sys Voice/.test(t)).length === 2 &&
  capped.some(t => t === 'US English（en-US）') &&
  capped.some(t => t === 'UK English Female（en-GB）'),
  '实际=' + JSON.stringify(capped));
check('系统嗓音最多列出 10 个（防止 macOS 趣味音淹没下拉框）',
  capped.filter(t => /Sys Voice/.test(t)).length === 10,
  '实际=' + JSON.stringify(capped));
check('限量后仍然过滤掉非英语语音',
  capped.every(t => !/普通话|Ting-Ting/.test(t)),
  '实际=' + JSON.stringify(capped));

console.log(`\n=== popup 初始化测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
