#!/usr/bin/env node
/**
 * 项目自检（lint）—— 零第三方依赖，不替代 ESLint，只查这个仓库真实踩过的坑
 * 和 Chrome 应用商店审核的红线：
 *
 *   1. 运行时代码语法可解析
 *   2. 运行时代码不含 eval / new Function（商店会判"动态代码"）
 *   3. 不用 innerHTML 拼接插值（XSS 面；word 来自页面选中文字）
 *   4. 不裸用 console.log（必须走 logDebug 开关，否则会在用户控制台刷屏）
 *   5. 不留 debugger
 *   6. manifest.json 引用的文件都存在
 *   7. manifest 与代码里用到的 i18n key 都在 locales 里存在，且各语言 key 集合一致
 *   8. HTML 里不出现 __MSG_x__（浏览器只替换 manifest.json，HTML 会原样显示占位符），
 *      data-i18n* 用到的 key 必须存在；lib/i18n-messages.js 与语言包保持同步
 *
 * 用法：npm run lint
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { BUNDLE_FILE, readLocaleTables, renderBundle } from './build-i18n.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p) || p;

const problems = [];
const fail = (file, msg) => problems.push(`${rel(file)}: ${msg}`);

/** 运行时（会进商店包）的脚本，preview/ 与 tests/ 不在检查范围 */
const RUNTIME_FILES = [
  'service-worker.js',
  'content/content.js',
  'lib/word-matcher.js',
  'popup/popup.js',
  'lib/i18n.js',
  'lib/doc-i18n.js',
].map((p) => path.join(ROOT, p));

// ===== 1. 语法 =====
for (const file of RUNTIME_FILES) {
  if (!fs.existsSync(file)) { fail(file, '文件不存在'); continue; }
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (e) {
    fail(file, '语法错误：' + e.message);
  }
}

// ===== 2~5. 运行时代码红线 =====
const RULES = [
  { name: 'eval', re: /\beval\s*\(/, msg: '使用了 eval（商店会判动态代码）' },
  { name: 'new Function', re: /new\s+Function\s*\(/, msg: '使用了 new Function（商店会判动态代码）' },
  { name: 'debugger', re: /(^|[^.\w])debugger\s*;?/, msg: '残留 debugger' },
  // alert/confirm 会阻塞页面或弹窗（扩展弹窗还可能因失焦被关掉），统一用页面内 toast / 确认框。
  // 注意 \b 边界：不会误伤 showConfirm( / showToast(。
  { name: 'alert', re: /\balert\s*\(/, msg: '使用了 alert（改用页面内 showToast）' },
  { name: 'confirm', re: /\bconfirm\s*\(/, msg: '使用了 confirm（改用页面内 showConfirm）' },
];

for (const file of RUNTIME_FILES) {
  if (!fs.existsSync(file)) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    const at = `${rel(file)}:${i + 1}`;
    for (const rule of RULES) {
      if (rule.re.test(line)) problems.push(`${at}: ${rule.msg}`);
    }
    // innerHTML 里做模板插值 = 把页面文本拼进 HTML。
    // 模板字符串常常跨多行，所以赋值行之后再看 15 行，别只盯同一行。
    if (/\.innerHTML\s*=/.test(line)) {
      const window = lines.slice(i, i + 15).join('\n');
      if (/\$\{/.test(window)) {
        problems.push(`${at}: innerHTML 拼接插值（改用 createElement + textContent）`);
      }
    }
    // 裸 console.log：只允许 logDebug 内部那一行
    if (/console\.log\s*\(/.test(line) && !/debugLogEnabled/.test(line)) {
      problems.push(`${at}: 裸 console.log（应走 logDebug，或改用 warn/error）`);
    }
  });
}

// ===== 6. manifest 完整性 =====
const MANIFEST = path.join(ROOT, 'manifest.json');
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch (e) {
  fail(MANIFEST, 'JSON 解析失败：' + e.message);
}

function collectManifestPaths(m) {
  const out = new Set();
  if (m.background?.service_worker) out.add(m.background.service_worker);
  if (m.action?.default_popup) out.add(m.action.default_popup);
  for (const p of Object.values(m.icons || {})) out.add(p);
  for (const p of Object.values(m.action?.default_icon || {})) out.add(p);
  for (const cs of m.content_scripts || []) {
    for (const p of [...(cs.js || []), ...(cs.css || [])]) out.add(p);
  }
  return out;
}

if (manifest) {
  for (const p of collectManifestPaths(manifest)) {
    if (!fs.existsSync(path.join(ROOT, p))) fail(MANIFEST, `引用的文件不存在：${p}`);
  }
  if (!manifest.default_locale) fail(MANIFEST, '缺少 default_locale');
  if (!fs.existsSync(path.join(ROOT, '_locales', manifest.default_locale, 'messages.json')) &&
      !fs.existsSync(path.join(ROOT, '_locales', manifest.default_locale, 'messages.json'))) {
    fail(MANIFEST, `default_locale「${manifest.default_locale}」缺少 _locales/${manifest.default_locale}/messages.json`);
  }
}

// ===== 6b. i18n 脚本加载顺序 =====
// 消费方依赖 lib/i18n.js；lib/i18n.js 又依赖 lib/i18n-messages.js 提供文案。
// 顺序错了会静默退化（文案全变中文兜底 / 出现裸 key），所以在这里拦住。
if (manifest) {
  const js = (manifest.content_scripts || []).flatMap((cs) => cs.js || []);
  const msgAt = js.indexOf('lib/i18n-messages.js');
  const i18nAt = js.indexOf('lib/i18n.js');
  const contentAt = js.indexOf('content/content.js');
  if (msgAt === -1) fail(MANIFEST, 'content_scripts 未加载 lib/i18n-messages.js');
  if (i18nAt === -1) fail(MANIFEST, 'content_scripts 未加载 lib/i18n.js');
  else if (contentAt !== -1 && i18nAt > contentAt) {
    fail(MANIFEST, 'lib/i18n.js 必须在 content/content.js 之前加载');
  }
  if (msgAt !== -1 && i18nAt !== -1 && msgAt > i18nAt) {
    fail(MANIFEST, 'lib/i18n-messages.js 必须在 lib/i18n.js 之前加载');
  }

  const popupHtml = path.join(ROOT, manifest.action?.default_popup || '');
  if (manifest.action?.default_popup && fs.existsSync(popupHtml)) {
    // 只看 <script src> 的出现顺序：按字符串 indexOf 会被注释/文案里的文件名误伤
    const html = fs.readFileSync(popupHtml, 'utf8');
    const srcs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
    const msgIdx = srcs.findIndex((s) => s.endsWith('i18n-messages.js'));
    const i18nIdx = srcs.findIndex((s) => s.includes('i18n.js'));
    const popupIdx = srcs.findIndex((s) => s.includes('popup.js'));
    if (msgIdx === -1) fail(popupHtml, '未加载 lib/i18n-messages.js');
    if (i18nIdx === -1) fail(popupHtml, '未加载 lib/i18n.js');
    else if (popupIdx !== -1 && i18nIdx > popupIdx) {
      fail(popupHtml, 'lib/i18n.js 必须在 popup.js 之前加载');
    }
    if (msgIdx !== -1 && i18nIdx !== -1 && msgIdx > i18nIdx) {
      fail(popupHtml, 'lib/i18n-messages.js 必须在 lib/i18n.js 之前加载');
    }
  }
}

// ===== 7. i18n key 一致性 =====
const LOCALES_DIR = path.join(ROOT, '_locales');
const locales = fs.existsSync(LOCALES_DIR)
  ? fs.readdirSync(LOCALES_DIR).filter((d) => fs.existsSync(path.join(LOCALES_DIR, d, 'messages.json')))
  : [];
const messagesByLocale = {};
for (const loc of locales) {
  const file = path.join(LOCALES_DIR, loc, 'messages.json');
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    messagesByLocale[loc] = Object.keys(json);
  } catch (e) {
    fail(file, 'JSON 解析失败：' + e.message);
  }
}

const defaultLocale = manifest?.default_locale || 'zh_CN';
const defaultKeys = new Set(messagesByLocale[defaultLocale] || []);

// 各语言 key 集合必须一致
for (const [loc, keys] of Object.entries(messagesByLocale)) {
  if (loc === defaultLocale) continue;
  for (const k of defaultKeys) {
    if (!keys.includes(k)) fail(path.join(LOCALES_DIR, loc, 'messages.json'), `缺少 key：${k}`);
  }
  for (const k of keys) {
    if (!defaultKeys.has(k)) fail(path.join(LOCALES_DIR, loc, 'messages.json'), `多余 key（默认语言里没有）：${k}`);
  }
}

// manifest 里的 __MSG_x__
if (manifest) {
  const manifestSrc = fs.readFileSync(MANIFEST, 'utf8');
  for (const [, key] of manifestSrc.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    if (!defaultKeys.has(key)) fail(MANIFEST, `__MSG_${key}__ 在 ${defaultLocale} 里没有定义`);
  }
}

// 代码里用到的 key：t('key') / getMessage('key')
const codeFiles = [
  ...RUNTIME_FILES,
  path.join(ROOT, 'popup/popup.html'),
].filter((f) => fs.existsSync(f));

const usedKeys = new Set();
for (const file of codeFiles) {
  const src = fs.readFileSync(file, 'utf8');
  for (const [, key] of src.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) usedKeys.add(key);
  for (const [, key] of src.matchAll(/getMessage\(\s*'([A-Za-z0-9_]+)'/g)) usedKeys.add(key);
}
for (const key of usedKeys) {
  if (!defaultKeys.has(key)) problems.push(`i18n: 代码用到 key「${key}」，但 _locales/${defaultLocale}/messages.json 里没有`);
}

// 扩展页面 HTML：① 禁止 __MSG_x__（浏览器只替换 manifest.json，HTML 里会原样显示占位符）；
// ② data-i18n* 用到的 key 必须在默认语言包里存在；
// ③ 页面内引用的本地 script / link / img 静态资源路径必须存在。
const htmlFiles = ['popup/popup.html', 'docs/tutorial.html'].map((f) => path.join(ROOT, f));
for (const file of htmlFiles) {
  if (!fs.existsSync(file)) { fail(file, 'HTML 文件不存在'); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const rawPlaceholders = [...src.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((m) => m[1]);
  if (rawPlaceholders.length) {
    problems.push(`${rel(file)}: HTML 里不能用 __MSG_${rawPlaceholders[0]}__（浏览器不会替换 HTML，会原样显示；改用 data-i18n + lib/i18n.js）`);
  }
  for (const [, key] of src.matchAll(/\bdata-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)) {
    if (!defaultKeys.has(key)) {
      problems.push(`${rel(file)}: data-i18n key「${key}」在 _locales/${defaultLocale}/messages.json 里没有`);
    }
  }
  const htmlDir = path.dirname(file);
  for (const [, ref] of src.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|data:|#|mailto:)/i.test(ref)) continue;
    const cleanRef = ref.split(/[?#]/)[0];
    if (!cleanRef) continue;
    const targetPath = path.resolve(htmlDir, cleanRef);
    if (!fs.existsSync(targetPath)) {
      fail(file, `引用的静态资源不存在：${ref}（解析为 ${rel(targetPath)}）`);
    }
  }
}

// 运行时代码里通过 chrome.runtime.getURL('...') 引用的包内路径必须存在
for (const file of RUNTIME_FILES) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const [, urlPath] of src.matchAll(/chrome\.runtime\.getURL\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const cleanUrlPath = urlPath.replace(/^\//, '').split(/[?#]/)[0];
    if (cleanUrlPath && !fs.existsSync(path.join(ROOT, cleanUrlPath))) {
      fail(file, `chrome.runtime.getURL 引用的文件不存在：${urlPath}`);
    }
  }
}

// ===== 8. 生成的文案常量必须与语言包一致 =====
// （改完 _locales 忘记跑 node tools/build-i18n.mjs 时，界面会停在旧文案）
const bundlePath = path.join(ROOT, BUNDLE_FILE);
if (!fs.existsSync(bundlePath)) {
  problems.push(`${BUNDLE_FILE}: 文件不存在（运行 node tools/build-i18n.mjs 生成）`);
} else {
  try {
    new vm.Script(fs.readFileSync(bundlePath, 'utf8'), { filename: bundlePath });
  } catch (e) {
    problems.push(`${BUNDLE_FILE}: 语法错误：${e.message}`);
  }
  const expected = renderBundle(readLocaleTables(ROOT));
  if (fs.readFileSync(bundlePath, 'utf8') !== expected) {
    problems.push(`${BUNDLE_FILE}: 与 _locales 语言包不一致（运行 node tools/build-i18n.mjs 重新生成）`);
  }
}

// ===== 输出 =====
if (problems.length) {
  console.error(`\n✗ 自检失败，共 ${problems.length} 处：\n`);
  for (const p of problems) console.error('  • ' + p);
  console.error('');
  process.exit(1);
}
console.log(`✓ 自检通过（${RUNTIME_FILES.length} 个运行时脚本，${locales.length} 个语言包，${usedKeys.size} 个代码 i18n key，文案常量与语言包一致）`);
