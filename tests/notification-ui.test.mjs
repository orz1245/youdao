/**
 * 页面内提示 / 确认框 接线测试
 *
 * alert/confirm 会阻塞页面（扩展弹窗里还可能因失焦被关掉），
 * 已统一替换为：
 *   - content script：.yh-toast（右下角自动消失）+ .yh-confirm（页面内确认框）
 *   - popup：.toast-area + .dialog-area
 * 「不许再用 alert/confirm」由 tools/lint.mjs 强制；这里检查组件确实接线并有样式，
 * 避免出现「调用了一个不存在的 showToast」这类只在真机上才暴露的问题。
 * 运行：node tests/notification-ui.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const contentJs = read('content/content.js');
const contentCss = read('content/content.css');
const popupJs = read('popup/popup.js');
const popupCss = read('popup/popup.css');
const popupHtml = read('popup/popup.html');

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// ===== content script =====
check('content.js 定义 showToast / hideToast',
  /function showToast\(/.test(contentJs) && /function hideToast\(/.test(contentJs));
check('content.js 定义 showConfirm（返回 Promise）',
  /function showConfirm\(/.test(contentJs) && /new Promise\(/.test(contentJs));
check('content.js 已无 alert/confirm 调用',
  !/\balert\s*\(/.test(contentJs) && !/\bconfirm\s*\(/.test(contentJs));

check('加词结果用 showToast 回执',
  /showToast\(text/.test(contentJs));
check('删除结果用 showToast 回执（带 ⚠️ 走警示色）',
  /showToast\(msg/.test(contentJs) && /toast-warn/.test(contentJs));
check('删除前走 showConfirm 确认',
  /await showConfirm\(/.test(contentJs));

check('content.css 有 .yh-toast 样式', /\.yh-toast\s*\{/.test(contentCss));
check('content.css 有 .yh-confirm 样式', /\.yh-confirm\s*\{/.test(contentCss));
check('content.css 的 toast/confirm 有深色适配',
  /prefers-color-scheme:\s*dark[\s\S]*\.yh-confirm/.test(contentCss) &&
  /prefers-color-scheme:\s*dark[\s\S]*\.yh-confirm-btn/.test(contentCss));

// 自绘浮层不能被当成页面文本高亮（否则提示语里的单词会再被高亮）
check('高亮排除自绘浮层（toast/confirm/菜单/横幅）',
  /\.yh-toast[\s\S]{0,80}\.yh-confirm|\.yh-confirm[\s\S]{0,80}\.yh-toast/.test(contentJs));
check('MutationObserver 忽略自绘浮层',
  /contains\('yh-toast'\)/.test(contentJs) && /contains\('yh-confirm'\)/.test(contentJs));

// ===== popup =====
check('popup.js 定义 showToast / showConfirm',
  /function showToast\(/.test(popupJs) && /function showConfirm\(/.test(popupJs));
check('popup.js 已无 alert/confirm 调用',
  !/\balert\s*\(/.test(popupJs) && !/\bconfirm\s*\(/.test(popupJs));
check('popup.html 提供 toast / dialog 容器',
  /id="toastArea"/.test(popupHtml) && /id="dialogArea"/.test(popupHtml));
check('popup.js 取到两个容器', /toastArea:\s*\$\('#toastArea'\)/.test(popupJs) &&
  /dialogArea:\s*\$\('#dialogArea'\)/.test(popupJs));
check('popup.css 有 .toast-area / .dialog-area 样式',
  /\.toast-area\s*\{/.test(popupCss) && /\.dialog-area\s*\{/.test(popupCss));
// 提示必须是「悬浮」的：曾经是文档流里的块，被 footer 顶到最底部、常被挤出可视区看不清
check('popup 的提示为悬浮浮层（position: fixed）',
  /\.toast-area\s*\{[^}]*position:\s*fixed/.test(popupCss),
  '仍不是悬浮定位，会挤在文档流最底部');
check('popup 的提示用透明度过渡而非 display 切换',
  /\.toast-area\s*\{[^}]*opacity:\s*0/.test(popupCss) &&
  /\.toast-area\.toast-show\s*\{[^}]*opacity:\s*1/.test(popupCss));
check('popup 的提示层级高于确认框遮罩',
  (() => {
    const z = (sel) => {
      const m = popupCss.match(new RegExp(sel + '\\s*\\{[^}]*z-index:\\s*(\\d+)'));
      return m ? Number(m[1]) : NaN;
    };
    return z('\\.toast-area') > z('\\.dialog-area');
  })(), 'toast 应浮在确认框之上（或至少不被其盖住）');
check('popup 的确认框有取消与确认按钮 id',
  /dialogCancel/.test(popupJs) && /dialogConfirm/.test(popupJs));
check('popup.css 的弹窗有深色适配',
  /prefers-color-scheme:\s*dark[\s\S]*\.dialog-card/.test(popupCss));

// ===== 新文案已进语言包 =====
const zh = JSON.parse(read('_locales/zh_CN/messages.json'));
const en = JSON.parse(read('_locales/en/messages.json'));
check('确认框按钮文案已在语言包里（btnConfirm / btnCancel）',
  !!(zh.btnConfirm && zh.btnCancel && en.btnConfirm && en.btnCancel));

console.log(`\n=== 页面内提示/确认框 测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
