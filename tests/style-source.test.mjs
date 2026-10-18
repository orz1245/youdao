/**
 * 样式单一来源测试（防回归）
 *
 * 历史坑：同一套高亮/气泡 CSS 曾在三处各写一份
 *   content/content.css、content.js 的 applyStyles()、service-worker.js 的 applyStyleToAllTabs()
 * 结果透明度改成 0.55 后另一处还是 0.4，页面呈现不一致。
 *
 * 现在约定：结构样式只在 content.css，配色只在 content.js 写 CSS 变量（--yh-*）。
 * 本测试用源码断言把这个约定钉住，谁再复制一份 CSS 就会红。
 * 运行：node tests/style-source.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const css = read('content/content.css');
const contentJs = read('content/content.js');
const swJs = read('service-worker.js');
const popupJs = read('popup/popup.js');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// ===== 配色变量只在 content.css 定义默认值 =====
const vars = ['--yh-hl-bg', '--yh-hl-bg-hover', '--yh-hl-fg', '--yh-bubble-bg', '--yh-bubble-fg'];
for (const v of vars) {
  check(`content.css 定义默认值 ${v}`, css.includes(`${v}:`), '缺失');
}

// ===== content.js 只写变量，不再拼 CSS 文本 =====
check('content.js 写入 --yh-hl-bg 变量', contentJs.includes("setProperty('--yh-hl-bg'"));
check('content.js 写入 --yh-hl-bg-hover 变量', contentJs.includes("setProperty('--yh-hl-bg-hover'"));
check('content.js 不再用 <style> 注入 CSS 文本',
  !/styleEl\.textContent|youdao-highlight-styles/.test(contentJs), '仍存在 style 元素注入');
check('content.js 不再自带一份气泡布局（width:280px 只在 content.css）',
  !/yh-bubble\{background/.test(contentJs));

// ===== service-worker.js 不再参与样式分发 =====
check('service-worker.js 不再调用 insertCSS', !/insertCSS\s*\(/.test(swJs));
check('service-worker.js 不再有 applyStyleToAllTabs', !/applyStyleToAllTabs/.test(swJs));
check('service-worker.js 不再重复实现 hexToRgba',
  !/function\s+hexToRgba/.test(swJs), '仍有一份 hexToRgba');
check('service-worker.js 不再处理 setStyle 消息', !/'setStyle'/.test(swJs));

// ===== content.css 是气泡几何的唯一来源 =====
check('content.css 定义气泡固定宽度', /\.yh-bubble\s*\{[^}]*width:\s*280px\s*!important/.test(css));
check('content.css 定义高亮色变量引用', /\.yh-highlight\s*\{[^}]*var\(--yh-hl-bg\)/.test(css));

// ===== popup 改色后走内容脚本，而不是让 SW 逐标签页注入 =====
check('popup.js 的 applyStyleToAllTabs 不再发 setStyle 消息', !/'setStyle'/.test(popupJs));

// ===== 深色模式：默认值不能写死成行内样式，否则媒体查询永远覆盖不上 =====
// 行内自定义属性优先级高于 @media，所以 content.js 必须对「未自定义」的项用 removeProperty。
check('content.js 对未自定义的配色用 removeProperty（让深色模式能生效）',
  /removeProperty\(/.test(contentJs), '没有 removeProperty，深色模式会被行内默认值压住');

check('content.css 定义深色模式气泡底色', /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*--yh-bubble-bg/.test(css));
check('content.css 深色模式覆盖气泡文字色', /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*--yh-bubble-fg/.test(css));
check('content.css 定义深色模式下的菜单/横幅',
  /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*\.yh-add-menu/.test(css) &&
  /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*\.yh-login-banner/.test(css));

// 刻意的取舍：高亮色不跟随系统主题（它叠在任意网页底色上，prefers-color-scheme 不代表页面底色）
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
check('深色模式刻意不改高亮色（--yh-hl-*）',
  !/--yh-hl-/.test(darkBlock.slice(0, darkBlock.indexOf('.yh-bubble {'))),
  '深色模式不应覆盖高亮色');

const popupCss = read('popup/popup.css');
check('popup.css 提供深色模式', /@media\s*\(prefers-color-scheme:\s*dark\)/.test(popupCss));

console.log(`\n=== 样式单一来源测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
