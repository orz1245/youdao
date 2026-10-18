<template>
  <div class="tutorial-page" :class="`lang-${lang}`">
    <!-- 顶部导航栏 / 语言切换 -->
    <div class="top-nav">
      <div class="nav-content">
        <div class="brand-mini">
          <img src="/icon/32.png" alt="Logo" width="24" height="24" />
          <span class="brand-title">{{ isZh ? '生词高亮助手' : 'Vocabulary Highlighter' }}</span>
        </div>
        <div class="lang-switcher">
          <button
            type="button"
            class="lang-pill"
            :class="{ active: lang === 'zh_CN' }"
            @click="setLang('zh_CN')"
          >
            中文
          </button>
          <button
            type="button"
            class="lang-pill"
            :class="{ active: lang === 'en' }"
            @click="setLang('en')"
          >
            English
          </button>
        </div>
      </div>
    </div>

    <!-- 顶部 Hero 区域 - 暖焦糖与温润大地色调（取色自仓鼠 Logo） -->
    <header class="hero">
      <div class="hero-inner">
        <img
          src="/icon/128.png"
          alt="生词高亮助手 Logo"
          width="64"
          height="64"
          class="hero-logo"
        />
        <h1 class="hero-title">
          {{ isZh ? '生词高亮助手' : 'Vocabulary Highlighter' }}
          <span class="version-badge">v{{ version }}</span>
        </h1>
        <p class="hero-subtitle">
          {{
            isZh
              ? '把整张网页变成你的生词练习场 · 智能变体识别 · 纯净无打扰'
              : 'Turn the web into your active vocabulary sandbox · Smart Inflection Engine · Lightweight & Private'
          }}
        </p>

        <div class="hero-actions">
          <a href="#quick" class="btn btn-primary">
            {{ isZh ? '快速上手' : 'Quick Start' }}
          </a>
          <a href="#features" class="btn btn-ghost">
            {{ isZh ? '功能特性' : 'Features' }}
          </a>
          <a href="#contact" class="btn btn-ghost">
            {{ isZh ? '联系作者' : 'Contact Author' }}
          </a>
        </div>
      </div>
    </header>

    <!-- 主体容器 -->
    <main class="container">
      <!-- 快速上手 -->
      <section id="quick" class="section-card">
        <h2 class="section-title">
          <span class="title-icon">🚀</span>
          {{ isZh ? '三步快速上手' : 'Get Started in 3 Steps' }}
        </h2>
        <div class="steps-grid">
          <div class="step-card">
            <div class="step-num">1</div>
            <h3>{{ isZh ? '登录有道' : 'Sign in to Youdao' }}</h3>
            <p>
              {{
                isZh
                  ? '在浏览器中打开并登录有道词典网页版（dict.youdao.com）。扩展会自动读取 Cookie，无需输入账号密码。'
                  : 'Open and sign in to Youdao Dictionary (dict.youdao.com) in your browser. The extension detects your session automatically.'
              }}
            </p>
          </div>
          <div class="step-card">
            <div class="step-num">2</div>
            <h3>{{ isZh ? '点击同步' : 'Sync Wordbook' }}</h3>
            <p>
              {{
                isZh
                  ? '点击扩展弹窗中的「同步生词本」按钮，生词列表与释义将自动导入本地存储，毫秒级就绪。'
                  : 'Click the "Sync" button in the extension popup. Your vocabulary is saved locally for instant lookup.'
              }}
            </p>
          </div>
          <div class="step-card">
            <div class="step-num">3</div>
            <h3>{{ isZh ? '畅游阅读' : 'Browse & Learn' }}</h3>
            <p>
              {{
                isZh
                  ? '阅读任意英文网页，生词自动高亮。指针悬停 600ms 即弹出权威释义与音标，听谷歌自然发音。'
                  : 'Read any English web page. Words highlight automatically. Hover for 600ms to preview phonetics and definitions.'
              }}
            </p>
          </div>
        </div>
      </section>

      <!-- 核心特性 -->
      <section id="features" class="section-card">
        <h2 class="section-title">
          <span class="title-icon">✨</span>
          {{ isZh ? '核心亮点' : 'Key Highlights' }}
        </h2>
        <div class="feature-grid">
          <div class="feature-card">
            <div class="f-icon">🧠</div>
            <h3>{{ isZh ? '语法屈折变体识别' : 'Precision Inflection Engine' }}</h3>
            <p>
              {{
                isZh
                  ? '独创白名单屈折变化引擎：复数、时态、比较级自动归一；拒绝 use→user、play→display 这种伪派生产生的错高亮。'
                  : 'Generates grammatical inflections (plurals, tenses, comparatives) safely. Avoids noisy false-positives like use→user.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">🎧</div>
            <h3>{{ isZh ? '离线 / 在线智能双发音' : 'Dual Speech Engine' }}</h3>
            <p>
              {{
                isZh
                  ? '首选 Google 自然英语朗读，遇网络不可达时自动无缝降级至系统英语嗓音（Windows David/Zira，macOS Samantha），永不哑火。'
                  : 'Prioritizes Google Cloud voices with transparent fallback to offline system voices (David, Samantha) on network drops.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">⚡</div>
            <h3>{{ isZh ? 'SPA 动态页面自适应' : 'Dynamic SPA Support' }}</h3>
            <p>
              {{
                isZh
                  ? '基于 MutationObserver 与 requestIdleCallback 节流渲染，平滑兼容 Twitter、Reddit、GitHub 等单页应用的异步流。'
                  : 'MutationObserver and requestIdleCallback integration keeps single-page apps (Twitter, Reddit, GitHub) smooth.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">🎨</div>
            <h3>{{ isZh ? '多彩预设与深色模式' : '7 Presets & Dark Mode' }}</h3>
            <p>
              {{
                isZh
                  ? '内置黄、绿、粉、蓝、橙、紫、灰 7 档护眼预设与自由拾色器，深度适配 prefers-color-scheme 暗黑浏览环境。'
                  : '7 clean color presets plus full custom hex pickers, naturally aligned with prefers-color-scheme dark themes.'
              }}
            </p>
          </div>
        </div>
      </section>

      <!-- 交互操作指南 -->
      <section class="section-card">
        <h2 class="section-title">
          <span class="title-icon">💡</span>
          {{ isZh ? '常用交互小技巧' : 'Interactive Tips' }}
        </h2>
        <div class="tips-list">
          <div class="tip-item">
            <strong>{{ isZh ? '查词气泡常驻' : 'Keep Bubble Open' }}：</strong>
            {{
              isZh
                ? '光标移入气泡内部可保持浮层不关闭，自由复制释义或点击发音喇叭。'
                : 'Move the cursor directly into the bubble to keep it open, copy definitions, or click the speaker.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '快捷删词与撤销' : 'Delete & In-page Confirm' }}：</strong>
            {{
              isZh
                ? '悬浮已高亮单词，点击气泡右上角红色垃圾桶即可删除，弹出轻量非阻塞确认框，不打扰阅读体验。'
                : 'Hover highlighted words and click the trash can icon to remove them from your wordbook with non-blocking confirmation.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '划词一键添加' : 'Select Text to Add' }}：</strong>
            {{
              isZh
                ? '在网页上选中文本，鼠标松开后浮现「加入有道生词本」菜单，点击即可同步提交并实时上色。'
                : 'Select any English word on a webpage and click the floating menu to add it immediately to your wordbook.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '防抖与边缘保护' : 'Edge Guards & Debounce' }}：</strong>
            {{
              isZh
                ? '指针贴近浏览器边框或滚动条时自动屏蔽误触；600ms 悬浮判定确保扫读时光标掠过不乱弹窗。'
                : 'Edge guards prevent unintended popups near scrollbars, while a 600ms hold debounce keeps rapid scanning calm.'
            }}
          </div>
        </div>
      </section>

      <!-- 常见问题 -->
      <section class="section-card">
        <h2 class="section-title">
          <span class="title-icon">❓</span>
          {{ isZh ? '常见问题 FAQ' : 'Frequently Asked Questions' }}
        </h2>
        <div class="faq-accordion">
          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? 'Q: 为什么点击同步提示「未获取到生词」？' : 'Q: Why does sync report no words found?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '请确认两点：① 打开 dict.youdao.com 并确认处于正常登录状态；② 有道生词本中已有至少 1 个单词。如果依然失败，可以在扩展弹窗中尝试重新登录。'
                    : 'Check: (1) You are signed in on dict.youdao.com in this browser; (2) Your wordbook contains at least 1 word.'
                }}
              </p>
            </div>
          </div>

          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? 'Q: 为什么某些单词悬浮点喇叭没有声音？' : 'Q: Why does the speaker make no sound sometimes?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '部分国内网络下谷歌远程在线语音可能受阻。扩展已具备自动降级机制，但如果系统中未安装任何本地英语语音包，请在系统设置中添加英语语音（Windows：设置 → 时间和语言 → 语音 → 添加语音）。'
                    : 'Google remote speech might be unreachable on certain networks. Please ensure an offline English speech pack is installed in your OS settings.'
                }}
              </p>
            </div>
          </div>

          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? 'Q: 插件会自动收集或上传我的网页浏览内容吗？' : 'Q: Does the extension track my browsing history?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '绝不收集！本扩展 100% 运行在本地浏览器中，所有网络请求仅直接与有道官方服务器（dict.youdao.com）通信用于同步词本与拉取释义，无第三方中转分析服务器。'
                    : 'Never. The extension runs 100% client-side. Requests only communicate directly with Youdao servers to fetch wordbook data.'
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 联系作者 -->
      <section id="contact" class="section-card contact-card">
        <h2 class="section-title">
          <span class="title-icon">💬</span>
          {{ isZh ? '联系作者与交流反馈' : 'Contact & Feedback' }}
        </h2>
        <p class="contact-desc">
          {{
            isZh
              ? '如果你在使用过程中遇到任何 bug、有功能建议，或者单纯想交流技术，欢迎添加作者微信或发送邮件！'
              : 'Have any bug reports, ideas, or feedback? Feel free to reach out via WeChat or Email!'
          }}
        </p>

        <div class="contact-methods">
          <div class="contact-badge" @click="copyWeChat">
            <div class="contact-icon">📱</div>
            <div class="contact-info">
              <div class="contact-label">{{ isZh ? '作者微信' : 'WeChat' }}</div>
              <div class="contact-value">v587233</div>
            </div>
            <span class="copy-hint">{{ copied ? (isZh ? '已复制！' : 'Copied!') : (isZh ? '点击复制' : 'Click to copy') }}</span>
          </div>

          <a href="mailto:wenjiajun.cn@gmail.com" class="contact-badge">
            <div class="contact-icon">✉️</div>
            <div class="contact-info">
              <div class="contact-label">{{ isZh ? '电子邮箱' : 'Email' }}</div>
              <div class="contact-value">wenjiajun.cn@gmail.com</div>
            </div>
            <span class="copy-hint">{{ isZh ? '发送邮件' : 'Send email' }}</span>
          </a>
        </div>
      </section>
    </main>

    <!-- 底部版权 -->
    <footer class="page-footer">
      <p>© 2026 生词高亮助手 · Modernized with WXT + TypeScript + Vue 3</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from '../../utils/i18n';

const { setLanguage, currentLocale } = useI18n();

const lang = ref<'zh_CN' | 'en'>('zh_CN');
const isZh = computed(() => lang.value === 'zh_CN');

const version = ref('1.0.1');
try {
  const ver = chrome.runtime?.getManifest?.()?.version;
  if (ver) version.value = ver;
} catch {}

function setLang(newLang: 'zh_CN' | 'en') {
  lang.value = newLang;
  setLanguage(newLang);
  try {
    chrome.storage.local.set({ uiLang: newLang });
  } catch {}
}

const copied = ref(false);
function copyWeChat() {
  navigator.clipboard.writeText('v587233').then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  });
}

onMounted(() => {
  try {
    chrome.storage.local.get(['uiLang'], (r: any) => {
      if (r && (r.uiLang === 'zh_CN' || r.uiLang === 'en')) {
        lang.value = r.uiLang;
      } else {
        lang.value = currentLocale.value;
      }
    });
  } catch {
    lang.value = currentLocale.value;
  }
});
</script>

<style scoped>
:root {
  --brand: #c97a3e;
  --brand-dark: #a25c27;
  --bg: #f9f9fb;
  --card: #ffffff;
  --text: #1f2429;
  --text-muted: #656d76;
  --border: #e1e4e8;
}

.tutorial-page {
  min-height: 100vh;
  background-color: #f7f8fa;
  color: #24292f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.6;
}

/* 顶部轻量条 */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 0.85);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.nav-content {
  max-width: 900px;
  margin: 0 auto;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand-mini {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-title {
  font-weight: 600;
  font-size: 14px;
  color: #3d2416;
}
.lang-switcher {
  display: flex;
  background: #f1f2f5;
  border-radius: 20px;
  padding: 2px;
}
.lang-pill {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 16px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}
.lang-pill.active {
  background: #ffffff;
  color: #8a5124;
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

/* 暖焦糖大地色 Hero */
.hero {
  background: linear-gradient(135deg, #3d2416 0%, #5d381c 45%, #8a5124 100%);
  background-image:
    radial-gradient(circle at 18% 20%, rgba(247, 222, 189, 0.18) 0%, transparent 40%),
    radial-gradient(circle at 82% 80%, rgba(184, 115, 51, 0.28) 0%, transparent 50%),
    linear-gradient(135deg, #3d2416 0%, #5d381c 45%, #8a5124 100%);
  color: #ffffff;
  padding: 60px 24px 50px;
  text-align: center;
  border-bottom-left-radius: 36px;
  border-bottom-right-radius: 36px;
  box-shadow: 0 16px 40px -8px rgba(61, 36, 22, 0.35);
}
.hero-inner {
  max-width: 720px;
  margin: 0 auto;
}
.hero-logo {
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  margin-bottom: 16px;
}
.hero-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 12px;
  letter-spacing: -0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.version-badge {
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 12px;
  letter-spacing: 0;
}
.hero-subtitle {
  font-size: 16px;
  opacity: 0.92;
  margin-bottom: 28px;
  font-weight: 400;
}
.hero-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
}
.btn {
  display: inline-block;
  padding: 10px 22px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}
.btn-primary {
  background: #ffffff;
  color: #5d381c;
}
.btn-primary:hover {
  background: #fdfaf6;
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
}
.btn-ghost {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

/* 主内容区 */
.container {
  max-width: 880px;
  margin: -24px auto 60px;
  padding: 0 20px;
  position: relative;
  z-index: 10;
}
.section-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 32px 36px;
  margin-bottom: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  border: 1px solid #f0f1f3;
}
.section-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 24px;
  color: #1f2429;
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-icon {
  font-size: 22px;
}

/* 步骤网格 */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.step-card {
  background: #fafafc;
  padding: 24px 20px;
  border-radius: 14px;
  border: 1px solid #f0f1f4;
  position: relative;
}
.step-num {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 32px;
  font-weight: 800;
  color: rgba(138, 81, 36, 0.12);
  line-height: 1;
}
.step-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #3d2416;
}
.step-card p {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
}

/* 特性网格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}
.feature-card {
  background: #fbfbfc;
  padding: 22px;
  border-radius: 14px;
  border: 1px solid #edf0f3;
  transition: transform 0.2s, box-shadow 0.2s;
}
.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
}
.f-icon {
  font-size: 28px;
  margin-bottom: 12px;
}
.feature-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #222;
}
.feature-card p {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

/* 技巧列表 */
.tips-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tip-item {
  background: #fdfaf7;
  border-left: 4px solid #8a5124;
  padding: 12px 18px;
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  color: #444;
}
.tip-item strong {
  color: #3d2416;
}

/* FAQ 手风琴样式 */
.faq-accordion {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.faq-item {
  background: #fafafa;
  padding: 18px 22px;
  border-radius: 12px;
  border: 1px solid #eaeaea;
}
.faq-q {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #3d2416;
}
.faq-a p {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
}

/* 联系卡片 */
.contact-desc {
  font-size: 14px;
  color: #555;
  margin-bottom: 24px;
}
.contact-methods {
  display: flex;
  gap: 20px;
}
.contact-badge {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: #fafafc;
  border: 1px solid #e8ecf0;
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.contact-badge:hover {
  background: #f7f4ef;
  border-color: #d1b89d;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(93, 56, 28, 0.08);
}
.contact-icon {
  font-size: 30px;
}
.contact-label {
  font-size: 12px;
  color: #777;
}
.contact-value {
  font-size: 16px;
  font-weight: 600;
  color: #3d2416;
}
.copy-hint {
  margin-left: auto;
  font-size: 12px;
  color: #8a5124;
  font-weight: 500;
}

/* 页脚 */
.page-footer {
  text-align: center;
  padding: 30px 20px 40px;
  font-size: 13px;
  color: #999;
}

@media (max-width: 768px) {
  .steps-grid {
    grid-template-columns: 1fr;
  }
  .feature-grid {
    grid-template-columns: 1fr;
  }
  .contact-methods {
    flex-direction: column;
  }
}
</style>
