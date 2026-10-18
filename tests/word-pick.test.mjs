/**
 * 悬浮取词逻辑测试（防回归，源码断言，无 DOM）
 *
 * 历史坑：
 *   1) 鼠标划向窗口外 / 滚动条时，边缘处最后一个词会误触发悬浮气泡 ——
 *      processHoverAt 在取词前先过「屏幕边缘守卫」。
 *   2) caretRangeFromPoint 会吸附到附近的词，导致鼠标停在空白间隙也取到词 ——
 *      getWordAtPoint 用单词 Range 的矩形 + 像素容差校验鼠标确实落在词上。
 *   3) 所有格词 patient's / patients' 需要归一化后才能命中生词本。
 *   4) mousemove 每秒 60~120 次、all_frames 下每个 iframe 一份，原先每次事件都做
 *      「强制 layout 读取 + 命中测试 + caretRangeFromPoint」—— 必须 rAF 合并 + 位移阈值，
 *      并把未高亮词的取词推迟到 600ms 定时器（见 ⑦）。
 * 运行：node tests/word-pick.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const contentJs = read('content/content.js');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

/** 取某个函数体（到下一个同缩进 function 声明为止），用于断言内部顺序 */
const bodyOf = (name, max = 3000) => {
  const start = contentJs.indexOf('function ' + name + '(');
  return start < 0 ? '' : contentJs.slice(start, start + max);
};

// ===== 屏幕边缘守卫 =====
check('content.js 定义边缘阈值常量 EDGE_GUARD_PX',
  /const\s+EDGE_GUARD_PX\s*=\s*\d+/.test(contentJs));
check('content.js 定义 isNearViewportEdge',
  /function\s+isNearViewportEdge\s*\(/.test(contentJs));
check('边缘判定用 clientWidth/clientHeight（排除滚动条）',
  /isNearViewportEdge[\s\S]{0,400}documentElement\.clientWidth/.test(contentJs) &&
  /documentElement\.clientHeight/.test(contentJs));
check('边缘判定覆盖四个方向',
  /x\s*<=\s*EDGE_GUARD_PX/.test(contentJs) && /y\s*<=\s*EDGE_GUARD_PX/.test(contentJs) &&
  /x\s*>=\s*w\s*-\s*EDGE_GUARD_PX/.test(contentJs) && /y\s*>=\s*h\s*-\s*EDGE_GUARD_PX/.test(contentJs));

// 守卫必须在取词之前：否则等于没拦
const hoverBody = bodyOf('processHoverAt', 2600);
check('processHoverAt 在取词前调用边缘守卫',
  hoverBody.indexOf('isNearViewportEdge') > -1 &&
  hoverBody.indexOf('isNearViewportEdge') < hoverBody.indexOf('getWordAtPoint'),
  '守卫应排在 getWordAtPoint 之前');
check('边缘处取消悬浮/发音并收起气泡',
  /isNearViewportEdge\(x,\s*y\)[\s\S]{0,200}cancelHover\(\)[\s\S]{0,120}scheduleHideBubble\(\)/.test(contentJs));

// ===== ⑦ mousemove 节流 =====
check('定义位移阈值常量 MOVE_EPSILON_PX', /const\s+MOVE_EPSILON_PX\s*=\s*\d+/.test(contentJs));

const moveBody = bodyOf('handleMouseMove', 900);
check('mousemove 用 requestAnimationFrame 合并（一帧最多处理一次）',
  /requestAnimationFrame\(flushMouseMove\)/.test(moveBody) && /if\s*\(moveRafId\)\s*return/.test(moveBody));
check('mousemove 在页面不可见时直接返回（不取词、不命中测试）',
  /document\.hidden\)\s*return/.test(moveBody));
check('mousemove 每次都记录坐标（气泡兜底定位依赖 lastMouse）',
  /lastMouse\s*=\s*\{\s*x:\s*e\.clientX,\s*y:\s*e\.clientY\s*\}/.test(moveBody));
check('mousemove 不直接做命中测试与取词（已下沉到 processHoverAt）',
  !/elementFromPoint/.test(moveBody) && !/getWordAtPoint/.test(moveBody),
  'handleMouseMove 仍直接调用了 elementFromPoint/getWordAtPoint');

const flushBody = bodyOf('flushMouseMove', 900);
check('位移小于阈值时跳过（静止/微抖零开销）',
  /dx\s*\*\s*dx\s*\+\s*dy\s*\*\s*dy\s*<\s*MOVE_EPSILON_PX\s*\*\s*MOVE_EPSILON_PX/.test(flushBody));
check('阈值比较用「上次真正处理」的坐标，慢速移动可累积位移不漏取词',
  /lastHandledX/.test(flushBody) && /lastHandledX\s*=\s*pos\.x/.test(flushBody));

// ===== ⑧ 取词推迟到 600ms 定时器 =====
const deferredBody = bodyOf('showUnhighlightBubbleAtCursor', 900);
check('未高亮词取词被推迟到定时器（showUnhighlightBubbleAtCursor 内才调 getWordAtPoint）',
  /getWordAtPoint/.test(deferredBody));
check('推迟取词用最新坐标复核，且复核时重过边缘守卫与词形校验',
  /lastMouse/.test(deferredBody) && /isNearViewportEdge\(x,\s*y\)/.test(deferredBody) &&
  /WORD_PICK_RE\.test\(w\.word\)/.test(deferredBody));
check('浮层未显示时走推迟路径，浮层已显示才即时取词（保证收起/切换不延迟）',
  /if\s*\(!isBubbleShown\(\)\)\s*\{[\s\S]{0,200}setTimeout\(showUnhighlightBubbleAtCursor/.test(hoverBody));

// ===== 取词精度守卫（鼠标必须真的落在词上）=====
check('getWordAtPoint 用 Range 矩形校验鼠标位置',
  /getBoundingClientRect\(\)/.test(contentJs) &&
  /x\s*<\s*rect\.left\s*-\s*TOL/.test(contentJs) && /x\s*>\s*rect\.right\s*\+\s*TOL/.test(contentJs));
check('getWordAtPoint 容差是可读常量 TOL', /const\s+TOL\s*=\s*\d+/.test(contentJs));
check('取词拼接相邻文本节点（解决单词被 <b> 等拆开）',
  /function\s+collectTextAround\s*\(/.test(contentJs) &&
  /previousSibling/.test(contentJs) && /nextSibling/.test(contentJs));
check('① 拼接会逐层向外爬（文本节点自己被父元素包住时，邻居在父元素那一层）',
  /collectTextAround[\s\S]{0,2400}parentNode[\s\S]{0,200}isBlockBoundary/.test(contentJs));
check('① 碰到块级边界立即停（不把相邻段落粘成假词）',
  /const\s+BLOCK_TAGS\s*=\s*new\s+Set\(\[/.test(contentJs) &&
  /function\s+isBlockBoundary\s*\(/.test(contentJs));
check('② 零宽字符表含 U+200B / U+FEFF / U+2060，且正则不带 /g（test 不携带 lastIndex）',
  /const\s+ZERO_WIDTH_RE\s*=\s*\/\[\\u200B\\uFEFF\\u2060\]\/;/.test(contentJs));
check('③ 词形收口函数存在',
  /function\s+sanitizePickedWord\s*\(/.test(contentJs));
check('③ 只拒尾部连字符（不碰 patients\' / James\' 这类所有格）',
  /sanitizePickedWord[\s\S]{0,400}\/-\$\/[\s\S]{0,200}test\(word\)/.test(contentJs) &&
  /!\/s'\$\/i\.test\(word\)/.test(contentJs));
check('③ 收口接在取词链路上（挑词元 → 收口 → 返回）',
  /pickWordTokenAt\(text,\s*localOffset\)[\s\S]{0,300}sanitizePickedWord\(hit\.raw\)/.test(contentJs));

// ===== 所有格归一化接入取词/展示路径 =====
check('悬浮取词走 normalizePossessive 归一',
  /getWordAtPoint\(x,\s*y\)[\s\S]{0,400}WordMatcher\.normalizePossessive/.test(contentJs));
check('推迟取词路径同样归一化词形',
  /showUnhighlightBubbleAtCursor[\s\S]{0,600}normalizePossessive/.test(contentJs));
check('未高亮气泡用归一化词形做匹配与加入',
  /function\s+showUnhighlightBubble\([\s\S]{0,600}normalizePossessive/.test(contentJs));

// ===== ①②③ 真跑一遍：跨边界取词 + 零宽字符 + 词形收口 =====
// 把源码里这几个自洽的小函数原样抽出来执行（不重写逻辑），只补 Node 常量桩。
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

const constsSrc = [
  contentJs.match(/const ZERO_WIDTH_RE = .*;/)[0],
  contentJs.match(/const SOFT_HYPHEN = .*;/)[0],
  contentJs.match(/const BLOCK_TAGS = new Set\(\[[\s\S]*?\]\);/)[0],
].join('\n');

const pickChainFactory = new Function('Node', `
  ${constsSrc}
  ${grabFn(contentJs, 'isBlockBoundary')}
  ${grabFn(contentJs, 'lowerBoundIndex')}
  ${grabFn(contentJs, 'sanitizePickedWord')}
  ${grabFn(contentJs, 'collectTextAround')}
  ${grabFn(contentJs, 'pickWordTokenAt')}
  return { sanitizePickedWord, collectTextAround, pickWordTokenAt, BLOCK_TAGS };
`);
check('取词链路可被抽出执行（说明这几个函数是自洽的）',
  pickChainFactory !== undefined);

const { sanitizePickedWord, collectTextAround, pickWordTokenAt, BLOCK_TAGS } =
  pickChainFactory({ ELEMENT_NODE: 1, TEXT_NODE: 3 });

check('BLOCK_TAGS 覆盖块级与硬换行标签',
  ['P', 'DIV', 'LI', 'BR', 'TD'].every((t) => BLOCK_TAGS.has(t)) && !BLOCK_TAGS.has('SPAN'));

// ---- 迷你 DOM ----
const T = (s) => ({ nodeType: 3, textContent: s });
const C = () => ({ nodeType: 8, textContent: '' });          // 注释节点
const E = (tag, kids) => {
  const n = { nodeType: 1, tagName: tag.toUpperCase(), childNodes: kids || [] };
  n.textContent = n.childNodes.map((c) => c.textContent).join('');
  return n;
};
const link = (p) => {
  p.childNodes.forEach((c, i) => {
    c.parentNode = p;
    c.previousSibling = p.childNodes[i - 1] || null;
    c.nextSibling = p.childNodes[i + 1] || null;
    if (c.nodeType === 1) link(c);
  });
  return p;
};
const findText = (root, text) => {
  let hit = null;
  (function walk(n) {
    if (hit) return;
    if (n.nodeType === 3 && n.textContent === text) { hit = n; return; }
    if (n.nodeType === 1) n.childNodes.forEach(walk);
  })(root);
  return hit;
};

/** 复刻 getWordAtPoint 的取词链路：拼接 → 挑词元 → 收口 */
const pickAt = (root, nodeText, offset) => {
  const node = findText(root, nodeText);
  if (!node) throw new Error('测试用例找不到文本节点: ' + JSON.stringify(nodeText));
  const ctx = collectTextAround(node, offset);
  if (!ctx || !ctx.text) return null;
  const hit = pickWordTokenAt(ctx.text, ctx.localOffset);
  if (!hit || hit.raw.length < 2) return null;
  return sanitizePickedWord(hit.raw);
};

const H = 'Court mail-'.length - 1; // 鼠标停在连字符上（与截图一致）

const CASES = [
  ['无拆分（基线）',
    () => E('p', [T('Court mail-ballot ruling')]), 'Court mail-ballot ruling', H, 'mail-ballot'],
  ['<wbr> 拆断',
    () => E('p', [T('Court mail-'), E('wbr', []), T('ballot ruling')]), 'Court mail-', H, 'mail-ballot'],
  ['兄弟 <span> 拆断（文本节点自己没有兄弟）',
    () => E('p', [E('span', [T('Court mail-')]), E('span', [T('ballot')])]), 'Court mail-', H, 'mail-ballot'],
  ['多层嵌套后再遇到兄弟（<b><i> 内 + <span>）',
    () => E('p', [E('b', [E('i', [T('Court mail-')])]), E('span', [T('ballot')])]), 'Court mail-', H, 'mail-ballot'],
  ['注释节点隔断（注释是透明的）',
    () => E('p', [T('Court mail-'), C(), T('ballot')]), 'Court mail-', H, 'mail-ballot'],
  ['同节点 U+200B 零宽空格',
    () => E('p', [T('Court mail-\u200Bballot ruling')]), 'Court mail-\u200Bballot ruling', H, 'mail-ballot'],
  ['同节点 U+00AD 软连字符',
    () => E('p', [T('Court mail\u00ADballot ruling')]), 'Court mail\u00ADballot ruling', H, 'mail-ballot'],
  ['块级隔断 <br>（后半截取不到 → 不弹，而不是拿 mail- 去查）',
    () => E('p', [E('span', [T('Court mail-')]), E('br', []), E('span', [T('ballot')])]), 'Court mail-', H, null],
  ['跨段落（<p> 之间本就不是一个词）',
    () => E('div', [E('p', [T('Court mail-')]), E('p', [T('ballot')])]), 'Court mail-', H, null],
  ['页面本身就只写了片段 data-',
    () => E('li', [T('data-')]), 'data-', 4, null],
  ['引号收尾要剥：he said \'mail-ballot\'',
    () => E('p', [T("He said 'mail-ballot' loudly")]), "He said 'mail-ballot' loudly", 10, 'mail-ballot'],
  ['rock \'n\' roll 的 n\'（剥完只剩单字母 → 不弹）',
    () => E('p', [T("rock 'n' roll forever")]), "rock 'n' roll forever", 6, null],
  ['所有格 patients\' 必须原样活着',
    () => E('p', [T("The patients' recovery")]), "The patients' recovery", 5, "patients'"],
  ['所有格 patient\'s 必须原样活着',
    () => E('p', [T("The patient's condition")]), "The patient's condition", 5, "patient's"],
  ['引号包着的复数名词：\'patients\' → 撇号保留（宁可当所有格，也不剥）',
    () => E('p', [T("said 'patients' clearly")]), "said 'patients' clearly", 7, "patients'"],
];

for (const [name, build, nodeText, offset, want] of CASES) {
  const got = pickAt(link(build()), nodeText, offset);
  check('取词 ' + name, got === want, `期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
}

// ② 零宽字符被剔除后，位置映射必须跟着变：干净下标 ≠ 原始下标
const zwAfter = link(E('p', [T('Court mail-\u200Bballot ruling')]));
const ctxAfter = collectTextAround(findText(zwAfter, 'Court mail-\u200Bballot ruling'), H);
check('② 零宽字符在光标「之后」：text 里已无零宽字符，下标不变',
  ctxAfter.text === 'Court mail-ballot ruling' && ctxAfter.localOffset === H,
  `text=${JSON.stringify(ctxAfter.text)} localOffset=${ctxAfter.localOffset}`);
check('② 零宽字符在光标「之前」：干净下标左移一位，cleanToRaw 能换回原始下标',
  (() => {
    const rawCaret = 'Court \u200Bmail-'.length - 1;          // 原始下标 11
    const zw = link(E('p', [T('Court \u200Bmail-ballot ruling')]));
    const ctx = collectTextAround(findText(zw, 'Court \u200Bmail-ballot ruling'), rawCaret);
    return ctx.text === 'Court mail-ballot ruling' &&
           ctx.localOffset === H &&                            // 干净下标 10（左移 1）
           ctx.cleanToRaw[ctx.localOffset] === rawCaret;       // 换回原始下标 11
  })());

// 反例：不能把相邻段落粘成一个词
const twoParas = link(E('div', [E('p', [T('alpha')]), E('p', [T('beta')])]));
check('不跨段落拼接（beta 不会被拼成 alphabeta）',
  pickAt(twoParas, 'beta', 1) === 'beta');
check('收口对正常词零影响（don\'t / state-of-the-art / 弯撇号）',
  sanitizePickedWord("don't") === "don't" &&
  sanitizePickedWord('state-of-the-art') === 'state-of-the-art' &&
  sanitizePickedWord('James\u2019') === 'James\u2019');
check('收口拦掉尾部连字符（mail- / a- / data-），词元正则不会产出前导连字符',
  sanitizePickedWord('mail-') === null &&
  sanitizePickedWord('a-') === null &&
  sanitizePickedWord('data-') === null &&
  sanitizePickedWord('-ballot') === '-ballot');   // 词元必须以字母开头，所以根本走不到这里

console.log(`\n=== 悬浮取词逻辑测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
