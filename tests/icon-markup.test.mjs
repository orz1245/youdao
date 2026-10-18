/**
 * 浮层按钮图标结构测试（防回归）
 *
 * 历史坑：删除按钮的垃圾桶只有外轮廓、桶身内部留白，16px 下看着空。
 * 定为「描边垃圾桶 + 桶内两条等长竖线」（lucide trash-2 风格）。
 *
 * 垃圾桶 SVG 在 content.js 里出现在两处（createBubble 的静态 HTML 与 setActionButton
 * 的 delete 分支），必须保持逐字一致——否则一处改了另一处没改，按钮切换状态时图标会跳。
 * 本测试把「有内竖线」和「两处一致」都钉住。
 *
 * 运行：node tests/icon-markup.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contentJs = fs.readFileSync(path.join(ROOT, 'content/content.js'), 'utf8');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// 取出所有「垃圾桶」SVG（以桶盖横线 polyline 为特征）
const trashSvgs = contentJs.match(
  /<svg\b[^>]*>(?:(?!<\/svg>)[\s\S])*?<polyline points="3 6 5 6 21 6"[\s\S]*?<\/svg>/g
) || [];

check('找到 2 处垃圾桶图标（静态 HTML + setActionButton）', trashSvgs.length === 2,
  `实际 ${trashSvgs.length} 处`);

check('垃圾桶为描边风格（fill="none"）',
  trashSvgs.every((s) => /fill="none"/.test(s) && /stroke="currentColor"/.test(s)),
  '被改回填充风格');

check('垃圾桶线宽一致（stroke-width="2"）',
  trashSvgs.every((s) => /stroke-width="2"/.test(s)));

// 桶身内两条等长竖线 —— 本次需求的核心
const INNER_LINES = ['<line x1="10" y1="11" x2="10" y2="17"/>', '<line x1="14" y1="11" x2="14" y2="17"/>'];
check('垃圾桶桶身内含两条等长竖线',
  trashSvgs.length === 2 && trashSvgs.every((s) => INNER_LINES.every((l) => s.includes(l))),
  '桶身又是空白的');

check('桶内只有这两条内线（不多不少）',
  trashSvgs.every((s) => (s.match(/<line\b/g) || []).length === 2),
  '内线条数异常');

// 内竖线必须落在桶身范围内：桶身 x∈[5,19]、y∈[6,22]，且不压到底部圆角
check('内竖线不越出桶身（x 在桶身内、y 不到桶底圆角）',
  trashSvgs.every((s) => {
    const xs = [...s.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)];
    return xs.every(([, x1, y1, x2, y2]) =>
      x1 === x2 && Number(x1) > 5 && Number(x1) < 19 &&
      Number(y1) >= 6 && Number(y2) <= 20);
  }));

check('两处垃圾桶 SVG 逐字一致（状态切换时图标不跳）',
  trashSvgs.length === 2 && trashSvgs[0] === trashSvgs[1],
  'createBubble 与 setActionButton 的图标已分叉');

// 删除按钮的静态标记仍带 data-action，事件委托依赖它
check('删除按钮保留 data-action="delete"',
  /data-action="delete"/.test(contentJs));

// 加入按钮：纯加号，不带圆形外圈
check('加入按钮是纯加号（两笔十字）',
  /<line x1="12" y1="5.5" x2="12" y2="18.5"\/><line x1="5.5" y1="12" x2="18.5" y2="12"\/>/.test(contentJs));
check('加入按钮不再有圆形外圈',
  !/<circle cx="12" cy="12" r="10"\/>/.test(contentJs), '又加回了圆圈');

// ===== 按钮配色：图标纯黑，不单独用红/绿 =====
const css = fs.readFileSync(path.join(ROOT, 'content/content.css'), 'utf8');
check('动作按钮不再单独设红/绿配色',
  !/\.yh-bubble-btn\.(primary|danger)\s*\{[^}]*color\s*:/.test(css),
  '又给按钮加回了红/绿配色');
check('图标按钮为中性灰（.yh-bubble-btn color:#999999）',
  /\.yh-bubble-btn\s*\{[^}]*color:\s*#999999/.test(css));
check('深色模式下图标按钮改用更深一档的灰（#8b8b8b）',
  /prefers-color-scheme:\s*dark\)[\s\S]*\.yh-bubble-btn\s*\{[^}]*color:\s*#8b8b8b/.test(css));
check('喇叭按钮不单独配色（继承 .yh-bubble-btn 的中性灰）',
  !/\.yh-bubble-speak\s*\{[^}]*color\s*:/.test(css), '喇叭按钮仍带独立配色');

// ===== 交互态：悬浮 / 按下用「底色加深」+ 平滑过渡（防回归）=====
// 口径：只动 background-color，不碰尺寸/形状/文字；不写 transition: all，
// 否则边框、尺寸也会被一起动画，鼠标划过时会抖。
const btnBase = css.match(/\.yh-bubble-btn\s*\{[^}]*\}/)?.[0] || '';
// 注释里也会出现 "transition: all"、"background-color" 这类字样，断言前先剥掉注释，避免误伤
const cssDecl = css.replace(/\/\*[\s\S]*?\*\//g, '');
check('按钮默认态无底色（background-color: transparent）',
  /background-color:\s*transparent/.test(btnBase), '默认态被加了底色，没悬浮也像选中');
check('按钮只声明 background-color 过渡，时长 0.24s（移出淡回）',
  /transition:\s*background-color\s+0\.24s/.test(btnBase), '基础过渡缺失或时长被改');
check('全局没有 transition: all（防尺寸/边框一起动画）',
  !/transition:\s*all/.test(cssDecl), '出现了 transition: all');
check('悬浮态底色走加深变量 --yh-btn-hover-bg',
  /\.yh-bubble-btn:hover\s*\{[^}]*background-color:\s*var\(--yh-btn-hover-bg\)/.test(css),
  '悬浮没有加深背景');
check('悬浮态过渡更快（0.15s，移入跟手）',
  /\.yh-bubble-btn:hover\s*\{[^}]*transition:\s*background-color\s+0\.15s/.test(css));
check('按下态底色再深一档 --yh-btn-active-bg',
  /\.yh-bubble-btn:active\s*\{[^}]*background-color:\s*var\(--yh-btn-active-bg\)/.test(css),
  '按下没有更深一档');
check('按下态过渡最短（0.08s，点击反馈即时）',
  /\.yh-bubble-btn:active\s*\{[^}]*transition:\s*background-color\s+0\.08s/.test(css));
check('交互态只改 background-color（不动尺寸/形状/位移/字号）',
  !/\.yh-bubble-btn:(?:hover|active)\s*\{[^}]*\b(?:transform|width|height|padding|margin|font-size|border-radius)\s*:/.test(cssDecl) &&
  !/\.yh-bubble-btn:(?:hover|active)\s*\{[^}]*[\s;]color\s*:/.test(cssDecl),
  'hover/active 里改了尺寸、形状或图标颜色');
check('键盘聚焦有可见环，且用 outline（不占布局）',
  /\.yh-bubble-btn:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--yh-btn-focus-ring\)/.test(css));

// 加深幅度必须在浅色 / 深色下成对给出（只写一边会导致另一边「悬浮没反应」）
check('浅色默认加深幅度成对定义（悬浮 6% / 按下 12% 黑）',
  /--yh-btn-hover-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.06\)/.test(css) &&
  /--yh-btn-active-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.12\)/.test(css));
check('深色模式覆盖加深幅度（悬浮 32% / 按下 50% 黑）',
  /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*--yh-btn-hover-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.32\)/.test(css) &&
  /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*--yh-btn-active-bg:\s*rgba\(0,\s*0,\s*0,\s*0\.5\)/.test(css),
  '深色主题下加深幅度缺失或过小');

// ===== 气泡头部一行内垂直居中（防回归）=====
// 坑：.yh-bubble-head-word 没有样式时是普通块级行盒，里面的行内按钮按 baseline 对齐、
// 基线=盒子底边 → 整行被撑高，单词被压到行底，音标/删除按钮按 center 居中 → 看着全都没对齐。
check('气泡头部 .yh-bubble-head 是 flex 且垂直居中',
  /\.yh-bubble-head\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/.test(css));
check('单词+喇叭容器 .yh-bubble-head-word 是 flex 且垂直居中',
  /\.yh-bubble-head-word\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/.test(css),
  '该容器没有 flex 居中，喇叭会按基线对齐把整行撑高');
check('图标按钮自身内容也居中（inline-flex + center）',
  /\.yh-bubble-btn\s*\{[^}]*display:\s*inline-flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/.test(css));

console.log(`\n=== 图标结构测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
