/**
 * DOM 变化监听测试（⑧ characterData 漏订阅）
 *
 * 背景：Vue 等框架原地更新文本走的是 node.data / nodeValue，产生的是 **characterData** 变更，
 * 不是 childList。原先 observer 只订阅 { childList: true, subtree: true }，于是：
 *   - 页面原地更新后，新出现的生词永远不会被高亮（旧文本里已有的高亮则留在原位）。
 * 代码里本来已处理「React 式 element.textContent = '...'」（新增 Text 节点 → childList），
 * 本测试锁住「另一半」也被覆盖，且顺带锁住内容不被破坏。
 *
 * 运行：node tests/dom-observer.test.mjs
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

/** 按花括号配平截取函数源码（用于把自洽的小函数抽出来真跑一遍） */
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

// ===== ① observer 订阅了 characterData =====
const observeCall = contentJs.slice(contentJs.indexOf('observer.observe('));
check('observer.observe 订阅 characterData',
  /observer\.observe\(document\.body,\s*\{[^}]*characterData:\s*true/.test(contentJs),
  '未订阅 characterData，Vue 式原地改写看不到');
check('显式关闭 characterDataOldValue（不留旧文本快照，省内存）',
  /observer\.observe\(document\.body,\s*\{[^}]*characterDataOldValue:\s*false/.test(contentJs),
  '实际=' + observeCall.slice(0, 200));
check('仍保留 childList + subtree（React 式 textContent 更新路径不能丢）',
  /observer\.observe\(document\.body,\s*\{[^}]*childList:\s*true/.test(contentJs) &&
  /observer\.observe\(document\.body,\s*\{[^}]*subtree:\s*true/.test(contentJs));

// ===== ② 回调里分流处理 characterData =====
check('MutationObserver 回调按 mut.type === characterData 分流',
  /mut\.type\s*===\s*'characterData'/.test(contentJs));
check('characterData 变更的 Text 节点被收进待处理集合（下一轮 flush 重新高亮）',
  /mut\.type\s*===\s*'characterData'[\s\S]{0,220}Node\.TEXT_NODE[\s\S]{0,120}pending\.add\(t\)/.test(contentJs));
check('只收还在文档里的节点（已被移除的不做无用功）',
  /mut\.type\s*===\s*'characterData'[\s\S]{0,220}t\.isConnected/.test(contentJs));
check('childList 分支仍在（addedNodes 遍历未被改坏）',
  /mut\.type\s*!==\s*'childList'\)\s*continue;[\s\S]{0,200}mut\.addedNodes/.test(contentJs));

// ===== ③ flush 里对「被我们 span 包裹」的节点先剥离再重算 =====
check('flush 对命中高亮 span 的文本节点先剥离包裹',
  /isInsideHighlight\(node\)\s*\?\s*unwrapHighlight\(node\)\s*:\s*node/.test(contentJs));
check('剥离后仍校验可高亮并重新走 highlightNodes',
  /unwrapHighlight\(node\)[\s\S]{0,240}isHighlightableTextNode\(target\)[\s\S]{0,80}highlightNodes\(\[target\]\)/.test(contentJs));
check('isInsideHighlight 判定的是 .yh-highlight 包裹',
  /function\s+isInsideHighlight[\s\S]{0,200}classList\.contains\('yh-highlight'\)/.test(contentJs));

// ===== ④ 真跑一遍 unwrapHighlight（内容不能被弄丢）=====
const factory = new Function('document', `
  ${grabFn(contentJs, 'isInsideHighlight')}
  ${grabFn(contentJs, 'unwrapHighlight')}
  return { isInsideHighlight, unwrapHighlight };
`);
const fakeDoc = {
  createTextNode(text) { return { nodeType: 3, textContent: text, parentElement: null, isConnected: false }; },
};
const { isInsideHighlight, unwrapHighlight } = factory(fakeDoc);

// 造一个最小 DOM：holder > span.yh-highlight > text
const holder = {
  child: null,
  replaceChild(next, prev) {
    if (this.child !== prev) throw new Error('replaceChild 传入的旧节点不是当前子节点');
    this.child = next;
    next.parentElement = this;
    next.isConnected = true;
  },
};
const span = {
  classList: { contains: (c) => c === 'yh-highlight' },
  textContent: "patients'",
  parentNode: holder,
};
const changedText = { nodeType: 3, textContent: "patients'", parentElement: span, isConnected: true };
holder.child = span;

check('isInsideHighlight：span 内的文本节点判定为 true',
  isInsideHighlight(changedText) === true);
check('isInsideHighlight：普通元素下的文本节点判定为 false',
  isInsideHighlight({ nodeType: 3, parentElement: { classList: { contains: () => false } } }) === false);
check('isInsideHighlight：没有 parentElement 也不炸',
  isInsideHighlight({ nodeType: 3, parentElement: null }) === false);

const unwrapped = unwrapHighlight(changedText);
check('unwrapHighlight 返回纯文本节点',
  !!unwrapped && unwrapped.nodeType === 3);
check('unwrapHighlight 保留了页面写入的最新文本（不丢内容）',
  unwrapped && unwrapped.textContent === "patients'", '实际=' + (unwrapped && unwrapped.textContent));
check('unwrapHighlight 把 span 原位换成了文本节点',
  holder.child === unwrapped && holder.child !== span);
check('剥离后该节点不再被判定为「在高亮里」（可正常重新高亮）',
  isInsideHighlight(unwrapped) === false);
check('unwrapHighlight 对已脱离文档的节点返回 null（不炸）',
  unwrapHighlight({ nodeType: 3, parentElement: null }) === null);

console.log(`\n=== DOM 变化监听测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
