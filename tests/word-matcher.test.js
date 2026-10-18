/**
 * 单词变体匹配引擎 - 单元测试
 * 运行：node tests/word-matcher.test.js
 */

const assert = require('assert');

// 加载 WordMatcher（从 lib 目录）
const path = require('path');
const vm = require('vm');
const fs = require('fs');

const libPath = path.join(__dirname, '..', 'lib', 'word-matcher.js');
const code = fs.readFileSync(libPath, 'utf8');
const sandbox = { globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { WordMatcher } = sandbox.globalThis;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log('\n=== WordMatcher 单元测试 ===\n');

// 测试1：基础匹配
test('基础单词直接匹配', () => {
  const m = new WordMatcher();
  m.buildIndex(['apple']);
  assert.strictEqual(m.lookup('apple'), 'apple');
  assert.strictEqual(m.lookup('Apple'), 'apple');
  assert.strictEqual(m.lookup('APPLE'), 'apple');
});

// 测试2：名词复数
test('名词复数匹配 (book -> books)', () => {
  const m = new WordMatcher();
  m.buildIndex(['book']);
  assert.strictEqual(m.lookup('books'), 'book');
});

test('以 y 结尾复数 (city -> cities)', () => {
  const m = new WordMatcher();
  m.buildIndex(['city']);
  assert.strictEqual(m.lookup('cities'), 'city');
  assert.strictEqual(m.lookup('citys'), 'city');
});

test('以 s/x/z/ch/sh 结尾复数 (box -> boxes)', () => {
  const m = new WordMatcher();
  m.buildIndex(['box']);
  assert.strictEqual(m.lookup('boxes'), 'box');
});

test('以 f/fe 结尾复数 (leaf -> leaves)', () => {
  const m = new WordMatcher();
  m.buildIndex(['leaf']);
  assert.strictEqual(m.lookup('leaves'), 'leaf');
});

// 测试3：动词时态
test('动词第三人称 (run -> runs)', () => {
  const m = new WordMatcher();
  m.buildIndex(['run']);
  assert.strictEqual(m.lookup('runs'), 'run');
});

test('动词现在分词 (make -> making)', () => {
  const m = new WordMatcher();
  m.buildIndex(['make']);
  assert.strictEqual(m.lookup('making'), 'make');
});

test('动词现在分词双写 (stop -> stopping)', () => {
  const m = new WordMatcher();
  m.buildIndex(['stop']);
  assert.strictEqual(m.lookup('stopping'), 'stop');
});

test('动词过去式 (play -> played)', () => {
  const m = new WordMatcher();
  m.buildIndex(['play']);
  assert.strictEqual(m.lookup('played'), 'play');
});

test('动词过去式去 e (use -> used)', () => {
  const m = new WordMatcher();
  m.buildIndex(['use']);
  assert.strictEqual(m.lookup('used'), 'use');
});

test('动词过去式双写 (plan -> planned)', () => {
  const m = new WordMatcher();
  m.buildIndex(['plan']);
  assert.strictEqual(m.lookup('planned'), 'plan');
});

// 测试4：形容词比较级/最高级
test('形容词比较级 (big -> bigger)', () => {
  const m = new WordMatcher();
  m.buildIndex(['big']);
  assert.strictEqual(m.lookup('bigger'), 'big');
  assert.strictEqual(m.lookup('biggest'), 'big');
});

test('以 y 结尾形容词 (happy -> happier/happiest)', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy']);
  assert.strictEqual(m.lookup('happier'), 'happy');
  assert.strictEqual(m.lookup('happiest'), 'happy');
});

// 测试5：副词
test('副词 (quick -> quickly)', () => {
  const m = new WordMatcher();
  m.buildIndex(['quick']);
  assert.strictEqual(m.lookup('quickly'), 'quick');
});

test('副词 y->ily (happy -> happily)', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy']);
  assert.strictEqual(m.lookup('happily'), 'happy');
});

// 测试6：否定前缀
test('否定前缀 (happy -> unhappy)', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy']);
  assert.strictEqual(m.lookup('unhappy'), 'happy');
});

// 测试7：非生词不匹配
test('非生词不匹配', () => {
  const m = new WordMatcher();
  m.buildIndex(['apple', 'book']);
  assert.strictEqual(m.lookup('banana'), null);
  assert.strictEqual(m.lookup('orange'), null);
});

// 测试8：多个单词
test('多个单词独立匹配', () => {
  const m = new WordMatcher();
  m.buildIndex(['apple', 'banana', 'cherry']);
  assert.strictEqual(m.lookup('apples'), 'apple');
  assert.strictEqual(m.lookup('bananas'), 'banana');
  assert.strictEqual(m.lookup('cherries'), 'cherry');
});

// 测试9：has() 方法
test('has() 方法正确性', () => {
  const m = new WordMatcher();
  m.buildIndex(['run']);
  assert.strictEqual(m.has('running'), true);
  assert.strictEqual(m.has('walk'), false);
});

// 测试10：变体数量
test('变体数量随单词增加', () => {
  const m = new WordMatcher();
  m.buildIndex(['run']);
  const count1 = m.size();
  m.buildIndex(['run', 'jump']);
  const count2 = m.size();
  assert.ok(count2 > count1, '加入更多单词后变体数量应增加');
});

// 测试11：生成变体正确性
test('generateVariants 不返回空', () => {
  const m = new WordMatcher();
  const variants = m.generateVariants('test');
  assert.ok(variants.length > 0, '应生成至少一个变体');
  assert.ok(variants.every(v => v.length > 0), '变体不应为空字符串');
});

// 测试12：大小写处理
test('lookup 大小写不敏感', () => {
  const m = new WordMatcher();
  m.buildIndex(['Apple']);
  assert.strictEqual(m.lookup('APPLE'), 'apple');
  assert.strictEqual(m.lookup('apple'), 'apple');
  assert.strictEqual(m.lookup('ApPlE'), 'apple');
});

// 测试13：重复单词不重复索引
test('重复单词只索引一次', () => {
  const m = new WordMatcher();
  m.buildIndex(['apple', 'apple', 'apple']);
  const words = m.getWords();
  const appleCount = words.filter(w => w === 'apple').length;
  assert.strictEqual(appleCount, 1, 'apple 应只出现一次');
});

// 测试14：复杂词形 (study -> studies/studied/studying)
test('复杂词形 study 所有变体', () => {
  const m = new WordMatcher();
  m.buildIndex(['study']);
  assert.strictEqual(m.lookup('studies'), 'study');
  assert.strictEqual(m.lookup('studied'), 'study');
  assert.strictEqual(m.lookup('studying'), 'study');
});

// 测试15：buildIndex 后 size 正确
test('buildIndex 后变体集包含原词', () => {
  const m = new WordMatcher();
  m.buildIndex(['cat']);
  assert.strictEqual(m.has('cat'), true);
  assert.strictEqual(m.has('cats'), true);
});

// 测试16：所有格撇号归一化（patients' / patient's 类变体）
test('名词所有格 patient\'s 归一到 patient', () => {
  const m = new WordMatcher();
  m.buildIndex(['patient']);
  assert.strictEqual(m.lookup("patient's"), 'patient');
});

test('复数所有格 patients\' 归一到 patient', () => {
  const m = new WordMatcher();
  m.buildIndex(['patient']);
  assert.strictEqual(m.lookup("patients'"), 'patient');
});

test('children\'s 归一到 children', () => {
  const m = new WordMatcher();
  m.buildIndex(['children']);
  assert.strictEqual(m.lookup("children's"), 'children');
});

test('缩写 don\'t 不被误归一（不以 \'s 或单独 \' 结尾）', () => {
  const m = new WordMatcher();
  m.buildIndex(['do']);
  assert.strictEqual(m.lookup("don't"), null);
});

test('normalizePossessive 静态方法行为', () => {
  assert.strictEqual(WordMatcher.normalizePossessive("patient's"), 'patient');
  assert.strictEqual(WordMatcher.normalizePossessive("patients'"), 'patients');
  assert.strictEqual(WordMatcher.normalizePossessive("don't"), "don't");
  assert.strictEqual(WordMatcher.normalizePossessive('happy'), 'happy');
});

// ===== 规则收紧：不再把「另一个词」当成变体（误高亮治理）=====
// 背景：原实现对每个词套所有派生规则，导致保存 use 会把页面上的 user 高亮成 use，
// 保存 read 会把 reader 高亮成 read。这类错高亮比漏高亮更伤，故改为白名单 + 词干长度门槛。

test('use 不再误匹配 user（-er 只对白名单形容词生成）', () => {
  const m = new WordMatcher();
  m.buildIndex(['use']);
  assert.strictEqual(m.lookup('user'), null);
  assert.strictEqual(m.lookup('users'), null);
});

test('read 不再误匹配 reader', () => {
  const m = new WordMatcher();
  m.buildIndex(['read']);
  assert.strictEqual(m.lookup('reader'), null);
});

test('run 不再误匹配 runner（CVC 双写也只在白名单内做比较级）', () => {
  const m = new WordMatcher();
  m.buildIndex(['run']);
  assert.strictEqual(m.lookup('runner'), null);
});

test('carry 不再误匹配 carrier', () => {
  const m = new WordMatcher();
  m.buildIndex(['carry']);
  assert.strictEqual(m.lookup('carrier'), null);
});

test('hard 不再误匹配 hardly（-ly 含义跑偏的词不入白名单）', () => {
  const m = new WordMatcher();
  m.buildIndex(['hard']);
  assert.strictEqual(m.lookup('hardly'), null);
});

test('late / near / like / live 的 -ly 形式不再误匹配', () => {
  for (const [base, derived] of [['late', 'lately'], ['near', 'nearly'], ['like', 'likely'], ['live', 'lively']]) {
    const m = new WordMatcher();
    m.buildIndex([base]);
    assert.strictEqual(m.lookup(derived), null, `${base} 不应匹配 ${derived}`);
  }
});

test('play 不再误匹配 display（dis- 前缀规则已移除）', () => {
  const m = new WordMatcher();
  m.buildIndex(['play']);
  assert.strictEqual(m.lookup('display'), null);
});

test('cover / form / on / age 不再误匹配 discover / inform / iron / image', () => {
  for (const [base, derived] of [['cover', 'discover'], ['form', 'inform'], ['on', 'iron'], ['age', 'image']]) {
    const m = new WordMatcher();
    m.buildIndex([base]);
    assert.strictEqual(m.lookup(derived), null, `${base} 不应匹配 ${derived}`);
  }
});

test('over 不再误匹配 moreover（more/most 前缀已移除）', () => {
  const m = new WordMatcher();
  m.buildIndex(['over']);
  assert.strictEqual(m.lookup('moreover'), null);
});

test('new 不再误匹配 news（复数撞词黑名单）', () => {
  const m = new WordMatcher();
  m.buildIndex(['new']);
  assert.strictEqual(m.lookup('news'), null);
});

// ===== 收紧后仍必须保留的匹配能力（防止收过头）=====

test('白名单形容词仍支持比较级/最高级', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy', 'big', 'large', 'small', 'hot']);
  assert.strictEqual(m.lookup('happier'), 'happy');
  assert.strictEqual(m.lookup('happiest'), 'happy');
  assert.strictEqual(m.lookup('bigger'), 'big');
  assert.strictEqual(m.lookup('biggest'), 'big');
  assert.strictEqual(m.lookup('larger'), 'large');
  assert.strictEqual(m.lookup('smallest'), 'small');
  assert.strictEqual(m.lookup('hotter'), 'hot');
});

test('白名单形容词仍支持 -ly 副词（含 y→ily / le→y / ic→ally 拼写）', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy', 'simple', 'basic', 'possible', 'real', 'full', 'quick']);
  assert.strictEqual(m.lookup('happily'), 'happy');
  assert.strictEqual(m.lookup('simply'), 'simple');
  assert.strictEqual(m.lookup('basically'), 'basic');
  assert.strictEqual(m.lookup('possibly'), 'possible');
  assert.strictEqual(m.lookup('really'), 'real');
  assert.strictEqual(m.lookup('fully'), 'full');
  assert.strictEqual(m.lookup('quickly'), 'quick');
});

test('un- / -less 仍对够长（≥4）的词干生效', () => {
  const m = new WordMatcher();
  m.buildIndex(['happy', 'hope', 'care']);
  assert.strictEqual(m.lookup('unhappy'), 'happy');
  assert.strictEqual(m.lookup('hopeless'), 'hope');
  assert.strictEqual(m.lookup('careless'), 'care');
});

test('词干过短时不生成派生前缀（避免 it→unit 这类碰撞）', () => {
  const m = new WordMatcher();
  m.buildIndex(['it', 'on']);
  assert.strictEqual(m.lookup('unit'), null);
  assert.strictEqual(m.lookup('unon'), null);
});

test('屈折变化不受影响（复数/三单/分词/过去式）', () => {
  const m = new WordMatcher();
  m.buildIndex(['book', 'run', 'make', 'stop', 'plan', 'study']);
  assert.strictEqual(m.lookup('books'), 'book');
  assert.strictEqual(m.lookup('runs'), 'run');
  assert.strictEqual(m.lookup('running'), 'run');
  assert.strictEqual(m.lookup('making'), 'make');
  assert.strictEqual(m.lookup('stopping'), 'stop');
  assert.strictEqual(m.lookup('planned'), 'plan');
  assert.strictEqual(m.lookup('studied'), 'study');
  assert.strictEqual(m.lookup('studying'), 'study');
});

console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);

process.exit(failed > 0 ? 1 : 0);
