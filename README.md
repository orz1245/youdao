# 生词高亮助手 (Vocabulary Highlighter)

一款基于 **WXT + TypeScript + Vue 3** 现代扩展开发框架构建的 Chrome 浏览器扩展（MV3），根据**有道词典生词本**在任意网页中高亮显示生词：
- 单词变体匹配（复数/时态/比较级等，**精度优先**）
- 悬浮查看音标、权威释义与 Google 自然发音（系统离线语音无缝兜底）
- 网页选词一键添加、悬浮删除（非阻塞轻量确认）
- 设置弹窗与说明页全面升级为 **Vue 3 Composition API** 单文件组件
- 界面中英双语切换，气泡与弹窗自动跟随系统深色模式，结果回执与删除确认采用轻提示，不打扰阅读体验。

> 本扩展为第三方工具，与网易有道官方无关；「有道」仅用于指明生词本数据的来源服务。

---

## 现代化技术栈

- **框架**：[WXT (Next-gen Web Extension Framework)](https://wxt.dev/)
- **UI**：[Vue 3 (Composition API / `<script setup lang="ts">`)](https://vuejs.org/)
- **语言**：[TypeScript](https://www.typescriptlang.org/)（严格模式，100% 类型覆盖）
- **打包与构建**：[Vite](https://vitejs.dev/) + Rollup（极速热重载与生产构建）
- **测试**：[Vitest](https://vitest.dev/)（单元测试毫秒级运行）

---

## 目录结构

```
youdao/
├── entrypoints/                   # WXT 标准入口目录
│   ├── background.ts              # Service Worker 后台（同步调度/增删接口/TTS/Badge）
│   ├── content/                   # 内容脚本（DOM 观察/变体高亮/悬浮气泡/选词添加）
│   │   ├── index.ts               # defineContentScript 入口
│   │   └── style.css              # 内容脚本独立样式
│   ├── popup/                     # 扩展设置弹窗（Vue 3 单文件组件）
│   │   ├── index.html             # 弹窗 HTML 容器
│   │   ├── main.ts                # Vue 挂载入口
│   │   ├── App.vue                # 弹窗主组件
│   │   └── style.css              # 弹窗样式与动画
│   └── tutorial/                  # 使用指南说明页（Vue 3 单文件组件）
│       ├── index.html             # 说明页 HTML 容器
│       ├── main.ts                # Vue 挂载入口
│       └── App.vue                # 暖焦糖大地色自适应说明页（带作者微信 v587233）
├── public/                        # 静态资源（自动复制至产物根目录）
│   ├── _locales/                  # Chrome MV3 多语言包 (zh_CN / en)
│   └── icon/                      # 扩展图标 (16/32/48/128/favicon)
├── types/                         # TypeScript 强类型定义
│   └── index.ts                   # Settings, WordInfo, Messages, Diagnostics
├── utils/                         # 模块化核心逻辑库
│   ├── word-matcher.ts            # 单词变体匹配引擎（屈折变化与白名单派生）
│   ├── youdao-api.ts              # 有道词典 API、Nuxt SSR 解析、增删查词与三级同步策略
│   ├── voice.ts                   # TTS 语音挑选策略（Google 在线优先 + 系统离线兜底）
│   ├── storage.ts                 # Storage 读写包装、缓存 TTL 与颜色转换辅助函数
│   ├── storage-queue.ts           # 存储串行化写入队列（规避并发覆盖）
│   └── i18n.ts                    # 运行时双语解析与 Vue 响应式 useI18n composable
├── tests/                         # 自动化测试
│   └── ts-modules.test.ts         # Vitest 核心模块单元测试套件
├── package.json                   # 依赖与脚本
├── tsconfig.json                  # TypeScript 配置（继承自 WXT）
├── vitest.config.ts               # Vitest 测试配置
└── wxt.config.ts                  # WXT 配置文件与 Manifest MV3 声明
```

---

## 开发与构建命令

```bash
# 启动开发服务器（带热重载与自动加载到 Chrome）
npm run dev

# 运行 TypeScript 类型检查（严格检查，0 错误）
npm run compile

# 运行单元测试套件
npm test

# 生产环境构建（输出至 .output/chrome-mv3）
npm run build

# 打包发布 ZIP 包（输出至 .output/youdao-vocab-highlighter-<version>-chrome.zip）
npm run zip
```

---

## 在 Chrome 中加载扩展

1. 运行 `npm run build` 生成构建产物；
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`；
3. 打开右上角的 **「开发者模式」** 开关；
4. 点击左上角的 **「加载已解压的扩展程序」**；
5. 选择项目目录下的 `.output/chrome-mv3` 文件夹即可完成安装。

---

## 核心设计与特性

### 1. 单词变体匹配（精度优先）
错高亮比漏高亮更容易造成干扰，因此变体生成严格遵循「有把握才生成」：
- **屈折变化**走通用规则：名词复数、动词三单 / 现在分词 / 过去式；
- **比较级 / 最高级、-ly 副词**仅针对单音节与明确屈折规则的白名单形容词生成；
- **un- 前缀 / -less 后缀**仅针对长度 ≥ 4 的词干生成；
- 彻底避免 `use`→`user`、`read`→`reader`、`carry`→`carrier`、`hard`→`hardly`、`play`→`display` 等误匹配。

### 2. 双通道发音策略
- 优先挑选 Google 英语在线语音，提供自然清晰的发音；
- 遇到网络不可达时自动平滑回退到系统本地离线嗓音（如 macOS Samantha、Windows David/Zira）；
- 支持在设置弹窗中自定义首选发音并实时试听。

### 3. 三重生词本同步策略
1. **策略 1（主选）**：抓取 `www.youdao.com/webwordbook/wordlist` 页面，从 Nuxt.js SSR 渲染的 payload 中提取生词（与登录同域，Cookie 自动鉴权，不受 API 路径变更影响）；
2. **策略 2（备选）**：调用 `www.youdao.com/wordbook/webapi/words` JSON 接口；
3. **策略 3（兜底）**：调用 `dict.youdao.com/wordbook/webapi/words` JSON 接口。

### 4. 界面与交互体验
- **暖色调说明页**：依据仓鼠 Logo 暖焦糖与大地色系精细调色，提供响应式布局、完整使用指南、FAQ 与作者微信（`v587233`）；
- **轻量非阻塞**：完全剔除原生 `alert` 与 `confirm`，页面内采用轻量 toast 与居中确认卡片，支持 Esc 键与点击外部快捷取消；
- **深色模式支持**：深度适配 `prefers-color-scheme: dark`。

---

## 许可证

MIT License
