/**
 * 使用说明页（tutorial.html）与版本联动测试
 * 校验：
 *   1. tutorial.html 结构完整、所有静态引用均存在；
 *   2. .app-version 节点存在于页眉与页脚；
 *   3. lib/doc-i18n.js 中的 applyVersion 能跟随 chrome.runtime.getManifest().version 动态回填；
 *   4. 支持深色模式与双语节点覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

const htmlPath = path.join(ROOT, 'docs/tutorial.html');
check('docs/tutorial.html 文件存在', fs.existsSync(htmlPath));

const html = read('docs/tutorial.html');
const manifest = JSON.parse(read('manifest.json'));

// 1. 静态资源引用检查
const assetRefs = [...html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const localRefs = assetRefs.filter((r) => !/^(?:https?:|data:|#|mailto:)/i.test(r)).map((r) => r.split(/[?#]/)[0]);

check('tutorial.html 引用的本地资源全存在',
  localRefs.every((r) => fs.existsSync(path.resolve(path.dirname(htmlPath), r))),
  '引用的资源=' + JSON.stringify(localRefs));

// 2. 页面元素与导航锚点
const requiredSections = ['feat', 'quick', 'highlight', 'hover', 'add', 'voice', 'color', 'sync', 'login', 'faq', 'privacy', 'contact'];
check('包含全部主要章节锚点',
  requiredSections.every((id) => html.includes(`id="${id}"`)),
  '章节=' + JSON.stringify(requiredSections));

check('包含两种添加生词方式的说明（悬浮加词 + 划词选中添加）',
  html.includes('划词') && html.includes('Text Selection') && html.includes('加入生词本'));

check('包含深色模式适配规则（prefers-color-scheme: dark）',
  html.includes('prefers-color-scheme: dark'));

check('包含作者微信联系方式（v587233）', html.includes('v587233'));

// 3. 版本号联动检查
const appVersionMatches = [...html.matchAll(/class="app-version"/g)];
check('HTML 中至少包含 2 处 .app-version 标记（页眉与页脚）',
  appVersionMatches.length >= 2,
  '匹配数量=' + appVersionMatches.length);

// 4. 执行 lib/doc-i18n.js 验证版本号动态注入
const docI18nCode = read('lib/doc-i18n.js');

function createMockEl(initialText = '') {
  return {
    textContent: initialText,
    setAttribute() {},
    getAttribute() { return null; },
    classList: { toggle() {}, add() {}, remove() {} },
  };
}

const mockVersionEls = [createMockEl('1.0.0'), createMockEl('1.0.0')];
const mockDoc = {
  documentElement: {
    setAttribute() {},
  },
  querySelectorAll: (sel) => {
    if (sel.includes('.app-version')) return mockVersionEls;
    return [];
  },
  addEventListener() {},
};

const sandbox = {
  document: mockDoc,
  globalThis: {},
  chrome: {
    runtime: {
      getManifest: () => ({ version: '2.3.4' }),
    },
  },
};
sandbox.globalThis = sandbox;

try {
  vm.runInNewContext(docI18nCode, sandbox);
  const runtimeVer = mockVersionEls[0].textContent;
  check('applyVersion 成功将版本号动态更新为 manifest 中的版本',
    runtimeVer === '2.3.4' && mockVersionEls[1].textContent === '2.3.4',
    '实际=' + runtimeVer);
} catch (e) {
  check('applyVersion 执行无异常', false, e.message);
}

// 5. 校验当前 manifest 版本与 fallback 版本同步
check('tutorial.html 中的默认静态版本与 manifest.json 一致',
  html.includes(`v<span class="app-version">${manifest.version}</span>`));

console.log(`\n=== tutorial 页面与版本号联动测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
