#!/usr/bin/env node
/**
 * 生成 lib/i18n-messages.js
 *
 * 为什么需要这份「冗余」的文案拷贝：
 *   1) 浏览器只在 manifest.json（以及 CSS）里替换 __MSG_x__，**不会**替换 HTML，
 *      所以弹窗里直接写 __MSG_cardDict__ 会原样显示成占位符；
 *   2) chrome.i18n.getMessage 只能跟随浏览器语言，无法支持扩展里的「自选语言」；
 *   3) content script 需要在首帧前同步取到文案，fetch 语言包会有时序问题。
 * 于是把 _locales/<locale>/messages.json 里真正用于界面的文案同步成一份 JS 常量，
 * 运行时（lib/i18n.js）按用户设置同步取用。语言包仍然是唯一文案来源。
 *
 * 用法：node tools/build-i18n.mjs
 * 校验：tools/lint.mjs 与 tests/i18n.test.mjs 都会比对生成结果，改完语言包忘记重新生成会失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE_FILE = 'lib/i18n-messages.js';

/** 读取 _locales/<locale>/messages.json，返回 { locale: { key: message } }（按 locale 名排序，保证输出稳定） */
export function readLocaleTables(root = ROOT) {
  const dir = path.join(root, '_locales');
  const locales = fs.readdirSync(dir)
    .filter((name) => fs.existsSync(path.join(dir, name, 'messages.json')))
    .sort();

  const tables = {};
  for (const locale of locales) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, locale, 'messages.json'), 'utf8'));
    const table = {};
    for (const key of Object.keys(raw).sort()) {
      const message = raw[key] && raw[key].message;
      if (typeof message === 'string' && message) table[key] = message;
    }
    tables[locale] = table;
  }
  return tables;
}

/** 渲染 lib/i18n-messages.js 的完整内容 */
export function renderBundle(tables) {
  return [
    '/**',
    ' * 自动生成，请勿手改 —— 来源：_locales/<locale>/messages.json',
    ' * 重新生成：node tools/build-i18n.mjs（npm run build:i18n）',
    ' * 用途见 lib/i18n.js：浏览器不会替换 HTML 里的 __MSG_x__，也不支持用户自选语言。',
    ' */',
    'globalThis.YHI18N_MESSAGES = ' + JSON.stringify(tables, null, 2) + ';',
    '',
  ].join('\n');
}

function main() {
  const out = path.join(ROOT, BUNDLE_FILE);
  const next = renderBundle(readLocaleTables());
  const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (prev === next) {
    console.log('✓ ' + BUNDLE_FILE + ' 已是最新');
    return;
  }
  fs.writeFileSync(out, next);
  console.log('✓ 已生成 ' + BUNDLE_FILE + '（' + next.length + ' bytes）');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
