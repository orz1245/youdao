#!/usr/bin/env bash
#
# 生成 Chrome 应用商店上架用的 ZIP 包
# 用法: ./build-store.sh
# 输出: dist/youdao-store-<version>.zip
#
# 关键：manifest.json 必须位于 ZIP 根目录，且不能包含 .git / tests / preview
# 等非运行文件（tests 里的 new Function 会被商店自动扫描误判为动态代码）。

set -euo pipefail
cd "$(dirname "$0")/.."

# 打包前先跑项目自检（语法 / 动态代码 / XSS 面 / i18n key）
if command -v node >/dev/null 2>&1; then
  node tools/lint.mjs
fi

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
if [ -z "$VERSION" ]; then
  echo "错误：无法从 manifest.json 解析 version" >&2
  exit 1
fi

OUT="dist/youdao-store-${VERSION}.zip"
BUILD="dist/.build"

rm -rf "$BUILD"
rm -f "$OUT"
mkdir -p "$BUILD"

rsync -a \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude '.workbuddy' \
  --exclude '.DS_Store' \
  --exclude 'node_modules' \
  --exclude 'tests' \
  --exclude 'tools' \
  --exclude 'preview' \
  --exclude 'dist' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'README.md' \
  --exclude 'STORE-SUBMISSION.md' \
  --exclude 'build' \
  --exclude 'build-store.sh' \
  --exclude 'privacy.html' \
  --exclude 'images/other' \
  --exclude 'docs/*.md' \
  ./ "$BUILD/"

# 校验：manifest 必须在构建目录根，且引用的文件都存在
[ -f "$BUILD/manifest.json" ] || { echo "错误：manifest.json 缺失" >&2; exit 1; }

MISSING=0
for f in service-worker.js \
         popup/popup.html popup/popup.js popup/popup.css \
         content/content.js content/content.css \
         lib/word-matcher.js lib/i18n-messages.js lib/i18n.js lib/doc-i18n.js lib/doc-i18n.css \
         images/icons/16.png images/icons/32.png images/icons/48.png images/icons/128.png \
         _locales/zh_CN/messages.json _locales/en/messages.json \
         docs/tutorial.html; do
  if [ ! -f "$BUILD/$f" ]; then
    echo "缺失：$f" >&2
    MISSING=1
  fi
done
[ "$MISSING" -eq 0 ] || { echo "错误：存在缺失文件" >&2; exit 1; }

# i18n 校验：manifest 里 __MSG_xxx__ 必须在 default_locale 的 messages.json 中存在。
# 拼错 key 不会报错，只会原样显示成 "__MSG_appName__"，所以必须在这里拦住。
node -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const loc = m.default_locale;
if (!loc) { console.log("i18n 校验跳过：未声明 default_locale"); process.exit(0); }
const path = "_locales/" + loc + "/messages.json";
if (!fs.existsSync(path)) { console.error("i18n 错误：缺少 " + path); process.exit(1); }
const msgs = JSON.parse(fs.readFileSync(path, "utf8"));
const keys = [...new Set((JSON.stringify(m).match(/__MSG_[A-Za-z0-9_]+__/g) || []).map(s => s.slice(6, -2)))];
const missing = keys.filter(k => !msgs[k]);
if (missing.length) { console.error("i18n 错误：messages.json 缺少 key -> " + missing.join(", ")); process.exit(1); }
if (keys.length) { console.log("i18n 校验通过：" + keys.map(k => k + "=" + msgs[k].message).join(" | ")); }
' || exit 1

# 禁止项自检
if grep -rlE '\b(eval|new Function)\s*\(' "$BUILD" --include='*.js' 2>/dev/null; then
  echo "警告：包内检出 eval / new Function，请确认" >&2
fi
# 只拦「加载远程资源」；<a href> 这类用户点击才跳转的普通外链是允许的，不算违规
if grep -rlE 'src="https?://' "$BUILD" --include='*.html' 2>/dev/null; then
  echo "警告：包内检出远程资源外链（script/img/link 的 src），建议本地化" >&2
fi

(cd "$BUILD" && zip -rqX "../$(basename "$OUT")" . -x '*.DS_Store')
rm -rf "$BUILD"

echo "已生成：$OUT"
echo "体积：$(du -h "$OUT" | cut -f1)"
echo "清单：$(cd "$(dirname "$OUT")" && unzip -l "$(basename "$OUT")" | tail -n +4 | head -30)"
