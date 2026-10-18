/**
 * i18n 测试
 *
 * 约定（见 lib/i18n.js 注释）：
 *   1. 文案唯一来源是 _locales/<locale>/messages.json；
 *      lib/i18n-messages.js 是它的生成物，两者必须逐字一致（改完语言包要重新生成）。
 *   2. 代码里的 fallback、HTML 里的默认文案都必须与 zh_CN 逐字一致 ——
 *      中文用户不会因为「语言包没跑到」而看到另一个版本，也不会看到 __MSG_x__ 这类占位符。
 *   3. 语言由用户设置 uiLang 决定（auto 时按浏览器语言推断），
 *      popup / content script / service worker / 说明页共用同一份解析逻辑。
 * 运行：node tests/i18n.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BUNDLE_FILE, readLocaleTables, renderBundle } from '../tools/build-i18n.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// ===== 语言包 =====
const zh = JSON.parse(read('_locales/zh_CN/messages.json'));
const en = JSON.parse(read('_locales/en/messages.json'));
const zhKeys = Object.keys(zh);
const enKeys = Object.keys(en);

check('zh_CN / en 的 key 集合完全一致',
  zhKeys.length === enKeys.length && zhKeys.every((k) => k in en),
  `zh=${zhKeys.length} en=${enKeys.length}`);
check('每个 key 都有非空 message',
  zhKeys.every((k) => (zh[k].message || '').trim()) &&
  enKeys.every((k) => (en[k].message || '').trim()));
check('每个 key 都有 description（便于翻译者理解）',
  zhKeys.every((k) => (zh[k].description || '').trim()));

// 占位符不能在某份语言里丢失：zh 里有 $1 的，en 里也必须有
const placeholders = (msg) => (msg.match(/\$\d+/g) || []).sort().join(',');
const badPlaceholder = zhKeys.filter((k) => placeholders(zh[k].message) !== placeholders(en[k].message));
check('同一 key 的中英文占位符一致',
  badPlaceholder.length === 0,
  '不一致=' + JSON.stringify(badPlaceholder.map((k) => [k, placeholders(zh[k].message), placeholders(en[k].message)])));

// ===== 生成的文案常量 =====
const bundleCode = read(BUNDLE_FILE);
check('lib/i18n-messages.js 与语言包一致（改语言包后需重新生成）',
  bundleCode === renderBundle(readLocaleTables(ROOT)),
  '运行 node tools/build-i18n.mjs 重新生成');

// ===== lib/i18n.js 行为 =====
const i18nCode = read('lib/i18n.js');

/**
 * 在 vm 沙箱里装好 bundle + i18n.js。
 * @param {{lang?: string, store?: object, document?: object}} opts
 */
function runI18n(opts = {}) {
  const store = Object.assign({}, opts.store);
  const sandbox = {
    console,
    navigator: { language: opts.lang || 'zh-CN' },
    chrome: {
      // 扩展里 getUILanguage 是同步的；这里模拟浏览器语言
      i18n: { getUILanguage: () => opts.lang || 'zh-CN' },
      storage: {
        local: {
          get: (keys, cb) => cb(Object.assign({}, store)),
          set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
        },
        onChanged: { addListener() {} },
      },
    },
    document: opts.document || undefined,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  vm.runInContext(i18nCode, sandbox);
  return { api: sandbox.YHI18n, store, sandbox };
}

// 不带 bundle：只能走 fallback（单测桩 / 脚本没加载时的兜底路径）
const noBundle = (() => {
  const sandbox = { console, chrome: {}, navigator: { language: 'en-US' } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(i18nCode, sandbox);
  return sandbox.YHI18n;
})();
check('没有文案常量时用 fallback（含 $1 替换）',
  noBundle.t('greet', '你好 $1', ['世界']) === '你好 世界' &&
  noBundle.t('unknownKey') === 'unknownKey');
check('没有 chrome 也不炸（ready 照样 resolve）',
  typeof noBundle.ready.then === 'function');

// auto + 中文浏览器 → 中文
const zhApi = runI18n({ lang: 'zh-CN' });
check('auto：中文浏览器用 zh_CN 文案',
  zhApi.api.t('cardDict', '词典') === '词典',
  '实际=' + zhApi.api.t('cardDict', '词典'));

// auto + 英文浏览器 → 英文
const enApi = runI18n({ lang: 'en-US' });
check('auto：英文浏览器用 en 文案',
  enApi.api.t('cardDict', '词典') === 'Dictionary',
  '实际=' + enApi.api.t('cardDict', '词典'));

// 自选语言优先于浏览器语言（这正是 chrome.i18n.getMessage 做不到的）
const overrideApi = runI18n({ lang: 'zh-CN', store: { uiLang: 'en' } });
check('用户选了 English 时，中文浏览器也显示英文',
  overrideApi.api.t('cardDict', '词典') === 'Dictionary' &&
  overrideApi.api.getLocale() === 'en',
  '实际=' + overrideApi.api.t('cardDict', '词典'));

const zhOverrideApi = runI18n({ lang: 'en-US', store: { uiLang: 'zh_CN' } });
check('用户选了中文时，英文浏览器也显示中文',
  zhOverrideApi.api.t('cardDict', '词典') === '词典' &&
  zhOverrideApi.api.getLocale() === 'zh_CN',
  '实际=' + zhOverrideApi.api.t('cardDict', '词典'));

// 语言标签归一化：zh-TW / en-GB 也要落到有的语言包
check('zh-TW 落到 zh_CN、en-GB 落到 en',
  runI18n({ lang: 'zh-TW' }).api.getLocale() === 'zh_CN' &&
  runI18n({ lang: 'en-GB' }).api.getLocale() === 'en');
check('语言包里没有的浏览器语言（ja）回落到英文',
  runI18n({ lang: 'ja-JP' }).api.getLocale() === 'en');
check('无效的 uiLang 设置安全回落（不抛错、按 auto 处理）',
  runI18n({ lang: 'en-US', store: { uiLang: 'xx_YY' } }).api.getLocale() === 'en');

// 占位符：走语言包时 $1 也要替换
const subsApi = runI18n({ lang: 'en-US' });
check('语言包文案里的 $1 会被替换',
  subsApi.api.t('wordbookCount', '生词本：$1 个', [12]) === 'Wordbook: 12 words',
  '实际=' + subsApi.api.t('wordbookCount', '生词本：$1 个', [12]));

// ===== 静态文案（popup.html）=====
const popupHtml = read('popup/popup.html');

check('popup.html 里没有 __MSG_x__ 占位符（浏览器不会替换 HTML）',
  !/__MSG_[A-Za-z0-9_]+__/.test(popupHtml));

const htmlTextKeys = [...popupHtml.matchAll(/data-i18n="([A-Za-z0-9_]+)"[^>]*>([^<]*)</g)];
check('popup.html 有足够多的 data-i18n 文案',
  htmlTextKeys.length >= 12, '数量=' + htmlTextKeys.length);
check('popup.html 的 data-i18n key 都在语言包里',
  htmlTextKeys.every(([, key]) => key in zh && key in en),
  '缺失=' + JSON.stringify(htmlTextKeys.map(([, k]) => k).filter((k) => !(k in zh))));

const zhMismatch = htmlTextKeys
  .filter(([, key, text]) => zh[key] && zh[key].message !== text)
  .map(([, key, text]) => ({ key, html: text, zh: zh[key].message }));
check('popup.html 的默认文案与 zh_CN 逐字一致',
  zhMismatch.length === 0, JSON.stringify(zhMismatch.slice(0, 3)));

// 属性形式的文案（title / aria-label / data-tip）：默认值也要与 zh_CN 一致
const attrIssues = [];
for (const m of popupHtml.matchAll(/data-i18n-(?:title|aria|tip|placeholder)="([A-Za-z0-9_]+)"/g)) {
  const key = m[1];
  const tagStart = popupHtml.lastIndexOf('<', m.index);
  const tagEnd = popupHtml.indexOf('>', m.index);
  const tag = popupHtml.slice(tagStart, tagEnd + 1);
  if (!(key in zh)) attrIssues.push(key + ' 不在语言包里');
  else if (!tag.includes(zh[key].message)) attrIssues.push(key + ' 的默认属性文案不是「' + zh[key].message + '」');
}
check('popup.html 属性类文案的默认值与 zh_CN 一致',
  attrIssues.length === 0, JSON.stringify(attrIssues));

// ===== 语言选项（弹窗里的语言下拉框）=====
const langOptions = [...popupHtml.matchAll(/<option value="(auto|zh_CN|en)"/g)].map((m) => m[1]);
check('弹窗提供 auto / zh_CN / en 三个语言选项',
  langOptions.join(',') === 'auto,zh_CN,en', '实际=' + JSON.stringify(langOptions));
const popupJs = read('popup/popup.js');
check('popup.js 读取并写入 uiLang 设置',
  /'uiLang'/.test(popupJs) && /uiLang:\s*value/.test(popupJs));
check('popup.js 把下拉框的初值回填为已保存的语言',
  /langSelect\.value\s*=/.test(popupJs));

// ===== 英文文案更长，布局不能写死宽度 =====
// 中文「背景 / 文字」只有两个字，英文 Background 要 68px；
// "Speak on hover" 也比「悬浮发音」宽得多 —— 写死宽度 / nowrap 会把英文截断或顶破卡片。
const popupCss = read('popup/popup.css');
const cssRule = (sel) => {
  const m = popupCss.match(new RegExp('\\.' + sel + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};
check('popup.css 的颜色标签不再写死宽度（英文 Background 不被截断）',
  /min-width\s*:/.test(cssRule('custom-label')) && !/(^|[^-])width\s*:/.test(cssRule('custom-label')),
  '实际=' + JSON.stringify(cssRule('custom-label').trim()));
check('popup.css 的功能标签允许英文折行（不顶破卡片）',
  !/white-space\s*:\s*nowrap/.test(cssRule('feature-label')),
  '实际=' + JSON.stringify(cssRule('feature-label').trim()));

// ===== DOM 应用（apply）=====
function fakeEl(dataset, text = '默认中文') {
  const attrs = {};
  return {
    dataset,
    textContent: text,
    _attrs: attrs,
    setAttribute(k, v) { attrs[k] = v; },
    getAttribute(k) { return attrs[k]; },
    classList: { toggle() {} },
  };
}

const nodes = [
  fakeEl({ i18n: 'cardDict' }),
  fakeEl({ i18nTip: 'syncLabel', i18nAria: 'syncLabel' }),
];
let htmlLang = '';
const docStub = {
  documentElement: {
    hasAttribute: () => true,
    setAttribute: (k, v) => { if (k === 'lang') htmlLang = v; },
  },
  querySelectorAll: () => nodes,
};

const domApi = runI18n({ lang: 'en-US', document: docStub });
const applied = domApi.api.apply(docStub);
check('apply() 翻译 textContent 与属性，并返回处理数量',
  applied === 2 &&
  nodes[0].textContent === 'Dictionary' &&
  nodes[1]._attrs['data-tip'] === 'Sync wordbook' &&
  nodes[1]._attrs['aria-label'] === 'Sync wordbook',
  JSON.stringify({ applied, text: nodes[0].textContent, attrs: nodes[1]._attrs }));
check('<html lang> 跟着语言走',
  htmlLang === 'en', '实际=' + htmlLang);

domApi.api.setLanguage('zh_CN', { persist: true });
check('setLanguage 立即重译并写盘',
  nodes[0].textContent === '词典' &&
  domApi.store.uiLang === 'zh_CN' &&
  htmlLang === 'zh-CN',
  JSON.stringify({ text: nodes[0].textContent, store: domApi.store, htmlLang }));

// ===== 代码里的 fallback 必须与 zh_CN 文案一致 =====
const RUNTIME = ['service-worker.js', 'content/content.js', 'popup/popup.js'].map(read);
// 只检查「单段字符串字面量」形式的 fallback；多段用 + 拼接的（含换行）跳过
const callRe = /\bt\(\s*'([A-Za-z0-9_]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;

const mismatches = [];
const missing = [];
let checked = 0, skipped = 0;
for (const src of RUNTIME) {
  let m;
  callRe.lastIndex = 0;
  while ((m = callRe.exec(src)) !== null) {
    const [, key, rawFallback] = m;
    // 多段拼接（'foo' + 'bar'）没法在这里还原，跳过
    if (/^\s*\+/.test(src.slice(m.index + m[0].length))) { skipped++; continue; }
    const fallback = rawFallback.replace(/\\n/g, '\n');
    if (!(key in zh)) { missing.push(key); continue; }
    checked++;
    if (zh[key].message !== fallback) mismatches.push({ key, fallback, zh: zh[key].message });
  }
}

check('代码里用到的 key 都存在于 zh_CN 语言包',
  missing.length === 0, '缺失=' + JSON.stringify(missing));
check('代码里的 fallback 与 zh_CN 文案逐字一致',
  mismatches.length === 0,
  '不一致=' + JSON.stringify(mismatches.slice(0, 3)));
check('确实检查到了足够多的 fallback（防止正则失效而"假通过"）',
  checked >= 20, `checked=${checked} skipped=${skipped}`);

console.log(`\n=== i18n 测试: ${pass} 通过, ${failed} 失败（校验 ${checked} 处 fallback、${htmlTextKeys.length} 处 HTML 文案，跳过 ${skipped} 处多段拼接）===`);
process.exit(failed ? 1 : 0);
