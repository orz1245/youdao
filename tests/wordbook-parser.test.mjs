/**
 * 生词本 HTML 解析器 - 单元测试
 * 直接测试 Service Worker 内联的唯一实现，避免维护未被扩展加载的副本。
 * 运行：node tests/wordbook-parser.test.mjs
 */
import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const start = worker.indexOf('function _wbAddInfo');
const end = worker.indexOf('// ===== 解析器内联结束 =====');
if (start < 0 || end < 0) throw new Error('未找到 Service Worker 内联解析器');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(worker.slice(start, end), sandbox);
const { parseWordbookHtml } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('\n=== 生词本 HTML 解析测试 ===\n');

// 模拟有道 web wordbook 结构化页面
const STRUCTURED_HTML = `
<html><body>
  <ul class="wordbook-list">
    <li class="wordbook-item">
      <div class="word">apple</div>
      <div class="phonetic">[ˈæpl]</div>
      <div class="trans">n. 苹果</div>
    </li>
    <li class="wordbook-item">
      <div class="word">Book</div>
      <div class="phonetic">[bʊk]</div>
      <div class="trans">n. 书</div>
    </li>
  </ul>
</body></html>
`;

test('结构化 HTML 提取单词/音标/释义', () => {
  const info = parseWordbookHtml(STRUCTURED_HTML);
  assert.strictEqual(Object.keys(info).length, 2);
  assert.ok(info['apple']);
  assert.strictEqual(info['apple'].word, 'apple');
  assert.strictEqual(info['apple'].phonetic, 'ˈæpl');
  assert.strictEqual(info['apple'].trans, 'n. 苹果');
  assert.strictEqual(info['book'].word, 'Book'); // 保留原始大小写
  assert.strictEqual(info['book'].phonetic, 'bʊk');
});

// 模拟 SPA 内嵌 JSON 数据
const EMBEDDED_JSON_HTML = `
<html><body>
  <script>window.__INITIAL_STATE__ = {"list":[{"word":"cat","phonetic":"[kæt]","trans":"猫"},{"word":"dog","trans":"狗"}]}</script>
</body></html>
`;

test('内嵌 JSON 提取单词', () => {
  const info = parseWordbookHtml(EMBEDDED_JSON_HTML);
  assert.strictEqual(Object.keys(info).length, 2);
  assert.ok(info['cat']);
  assert.strictEqual(info['cat'].phonetic, 'kæt');
  assert.strictEqual(info['dog'].trans, '狗');
});

// 未登录跳转到登录页（无生词）
const LOGIN_PAGE_HTML = `<html><body><h1>有道词典 - 登录</h1></body></html>`;

test('登录页/空页返回空', () => {
  const info = parseWordbookHtml(LOGIN_PAGE_HTML);
  assert.strictEqual(Object.keys(info).length, 0);
});

test('空输入安全返回空', () => {
  assert.strictEqual(Object.keys(parseWordbookHtml('')).length, 0);
  assert.strictEqual(Object.keys(parseWordbookHtml(null)).length, 0);
});

// 单字母单词（a/I）不应被收录
const SHORT_HTML = `<div class="word">a</div><div class="word">go</div>`;
test('单字母单词被忽略', () => {
  const info = parseWordbookHtml(SHORT_HTML);
  assert.strictEqual(Object.keys(info).length, 1);
  assert.ok(info['go']);
});

console.log(`\n=== 解析测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
