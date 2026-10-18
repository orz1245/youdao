/**
 * 高亮分词匹配 - 集成测试（复刻 content.js 的 processText 逻辑，纯函数无 DOM 依赖）
 * 运行：node tests/highlight.test.js
 */

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// 加载 WordMatcher
const libPath = path.join(__dirname, '..', 'lib', 'word-matcher.js');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(libPath, 'utf8'), sandbox);
const { WordMatcher } = sandbox.globalThis;

/**
 * 复刻 content.js 中 processText 的核心分词+匹配算法（抽成纯函数便于测试）
 * 返回被匹配的单词列表
 */
function extractHighlights(text, matcher) {
  const re = /([a-zA-Z]+(?:'[a-zA-Z]+)?)|([^a-zA-Z]+)/g;
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] === undefined) continue;
    const rawWord = m[1];
    if (rawWord.length < 2) continue;
    const canonical = matcher.lookup(rawWord);
    if (canonical) hits.push({ display: rawWord, canonical });
  }
  return hits;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('\n=== 高亮分词匹配集成测试 ===\n');

const matcher = new WordMatcher();
matcher.buildIndex(['apple', 'book', 'run', 'study', 'happy']);

test('普通句子高亮生词', () => {
  const hits = extractHighlights('I ate an apple and read a book yesterday.', matcher);
  const words = hits.map(h => h.canonical);
  assert.ok(words.includes('apple'));
  assert.ok(words.includes('book'));
});

test('单复数匹配', () => {
  const hits = extractHighlights('There are many books on the table.', matcher);
  assert.ok(hits.some(h => h.canonical === 'book' && h.display === 'books'));
});

test('时态匹配（run -> running/runs）', () => {
  const hits = extractHighlights('He runs fast and is running now.', matcher);
  assert.ok(hits.some(h => h.canonical === 'run'));
});

test('y 结尾动词（study -> studied/studying）', () => {
  const hits = extractHighlights('She studied hard and is studying.', matcher);
  assert.ok(hits.some(h => h.canonical === 'study'));
});

test('形容词比较级（happy -> happier）', () => {
  const hits = extractHighlights('She is happier than before.', matcher);
  assert.ok(hits.some(h => h.canonical === 'happy'));
});

test('非生词不高亮', () => {
  const hits = extractHighlights('The cat sat on the mat.', matcher);
  assert.strictEqual(hits.length, 0);
});

test('标点与连字符处理', () => {
  const hits = extractHighlights('"Books!" he said — well-known books.', matcher);
  assert.ok(hits.filter(h => h.canonical === 'book').length >= 2);
});

test('大小写不敏感', () => {
  const hits = extractHighlights('APPLE Apple apples', matcher);
  assert.strictEqual(hits.length, 3);
  assert.ok(hits.every(h => h.canonical === 'apple'));
});

test('短词（a/I）不匹配', () => {
  const hits = extractHighlights('a I go', matcher);
  // a, I 长度<2 跳过；go 不在生词本
  assert.strictEqual(hits.length, 0);
});

test('单单词文本节点也能匹配（修复 fragments<=1 漏高亮）', () => {
  const hits = extractHighlights('book', matcher);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].canonical, 'book');
  assert.strictEqual(hits[0].display, 'book');
});

test('撇号单词保留且不影响匹配', () => {
  const hits = extractHighlights("don't can't", matcher);
  // don't / can't 不在生词本，但不应抛错或丢失
  assert.strictEqual(hits.length, 0);
});

test('中文混入不影响英文匹配', () => {
  const hits = extractHighlights('这是一个 apple 测试 book 示例', matcher);
  const words = hits.map(h => h.canonical);
  assert.ok(words.includes('apple'));
  assert.ok(words.includes('book'));
});

test('所有格撇号变体 patient\'s / patients\' 命中生词本', () => {
  const pm = new WordMatcher();
  pm.buildIndex(['patient']);
  const hits = extractHighlights("The patients' recovery and patient's condition improved.", pm);
  assert.strictEqual(hits.length, 2);
  assert.ok(hits.every(h => h.canonical === 'patient'));
  // 高亮副本正则只接受撇号在中间（don't 类），故 patients' 的尾部撇号被丢弃为 patients；
  // patient's 撇号在中间，保留原样。两者均归一到 patient。
  assert.strictEqual(hits[0].display, 'patients');
  assert.strictEqual(hits[1].display, "patient's");
});

console.log(`\n=== 集成测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
