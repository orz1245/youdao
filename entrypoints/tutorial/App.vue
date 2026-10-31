<template>
  <div class="tutorial-page" :class="`lang-${lang}`">
    <!-- 顶部导航栏 / 语言切换 -->
    <nav class="top-nav">
      <div class="nav-content">
        <div class="brand-mini">
          <img src="/icon/32.png" alt="Logo" width="24" height="24" class="brand-icon" />
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
    </nav>

    <!-- 顶部 Hero 区域 -->
    <header class="hero">
      <div class="hero-inner">
        <img
          src="/icon/128.png"
          alt="生词高亮助手 Logo"
          width="68"
          height="68"
          class="hero-logo"
        />
        <h1 class="hero-title">
          {{ isZh ? '生词高亮助手' : 'Vocabulary Highlighter' }}
          <span class="version-badge">v{{ version }}</span>
        </h1>
        <p class="hero-subtitle">
          {{
            isZh
              ? '把整张网页变成你的原版生词练习场 · 智能变体识别 · 纯净无干扰阅读'
              : 'Turn the web into your active vocabulary sandbox · Smart Inflection Engine · Distraction-Free Reading'
          }}
        </p>

        <div class="hero-actions">
          <a href="#sandbox" class="btn btn-primary">
            {{ isZh ? '交互沙盒体验' : 'Try Live Sandbox' }}
          </a>
          <a href="#quick" class="btn btn-ghost">
            {{ isZh ? '快速上手' : 'Quick Start' }}
          </a>
          <a href="#features" class="btn btn-ghost">
            {{ isZh ? '核心亮点' : 'Key Highlights' }}
          </a>
          <a href="#faq" class="btn btn-ghost">
            {{ isZh ? '常见问题' : 'FAQ' }}
          </a>
        </div>
      </div>
    </header>

    <!-- 主体容器 -->
    <main class="container">
      <!-- 交互沙盒（体验 5 种高亮与零重叠特性） -->
      <section id="sandbox" class="section-card">
        <div class="section-header-row">
          <h2 class="section-title">
            <span class="title-icon">🎮</span>
            {{ isZh ? '高亮与查词沙盒体验' : 'Interactive Sandbox' }}
          </h2>
          <span class="badge-tag">
            {{ isZh ? '无重叠 · 5 种形态自由选' : 'Zero Collision · 5 Styles' }}
          </span>
        </div>
        <p class="section-desc">
          {{
            isZh
              ? '实时测试最新高亮样式与气泡交互。光标悬停测试单词，可感受全新毛玻璃浮窗、自然语音朗读与字母降部（如 p, g, y）的无重叠避让。'
              : 'Test highlight styles and bubble interaction. Hover over words to inspect the new glassmorphism bubble, natural pronunciation, and zero-overlap descender rendering.'
          }}
        </p>

        <!-- 沙盒控制器 -->
        <div class="sandbox-toolbar">
          <div class="style-toggle-group" role="radiogroup">
            <button
              v-for="s in styleList"
              :key="s.id"
              type="button"
              class="style-btn"
              :class="{ active: activeStyle === s.id }"
              @click="activeStyle = s.id"
            >
              <span class="style-icon-demo" :class="`demo--${s.id}`">Aa</span>
              <span>{{ isZh ? s.nameZh : s.nameEn }}</span>
            </button>
          </div>

          <div class="color-toggle-group">
            <span class="color-label">{{ currentColorLabel }}:</span>
            <button
              v-for="c in colorPresets"
              :key="c.bg"
              type="button"
              class="color-dot"
              :class="{ active: activeColor.bg === c.bg }"
              :style="{ backgroundColor: c.bg }"
              :title="isZh ? c.titleZh : c.titleEn"
              @click="activeColor = c"
            ></button>
          </div>
        </div>

        <!-- 沙盒预览卡片 -->
        <div
          class="sandbox-preview"
          :class="`sandbox-style-${activeStyle}`"
          :style="sandboxCssVars"
          @mouseleave="hideBubble"
        >
          <div class="sandbox-status-bar">
            <span>{{ isZh ? '💡 将鼠标悬停在下方高亮词上方：' : '💡 Hover over any highlighted word below:' }}</span>
            <span class="sandbox-status-tag">{{ isZh ? '降部字符避让保护 ✓' : 'Descender Anti-Collision ✓' }}</span>
          </div>

          <p class="sandbox-text">
            Security audits revealed that several accounts were
            <span
              class="demo-word"
              data-word="compromised"
              data-phonetic="ˈkɒmprəmaɪzd"
              data-pos="adj."
              :data-trans="isZh ? '妥协的；受侵害泄露的' : 'vulnerable; having been revealed or exposed'"
              @mouseenter="onWordHover($event, 'compromised', 'ˈkɒmprəmaɪzd', 'adj.', isZh ? '妥协的；受侵害泄露的' : 'vulnerable; having been revealed or exposed')"
            >compromised</span>
            due to outdated keys. Readers enjoy sharp
            <span
              class="demo-word"
              data-word="typographic"
              data-phonetic="ˌtaɪpəˈɡræfɪk"
              data-pos="adj."
              :data-trans="isZh ? '排版的；印刷字体的' : 'relating to the style or appearance of printed matter'"
              @mouseenter="onWordHover($event, 'typographic', 'ˌtaɪpəˈɡræfɪk', 'adj.', isZh ? '排版的；印刷字体的' : 'relating to the style or appearance of printed matter')"
            >typographic</span>
            clarity while expanding daily
            <span
              class="demo-word"
              data-word="vocabulary"
              data-phonetic="vəˈkæbjələri"
              data-pos="n."
              :data-trans="isZh ? '词汇量；生词表' : 'all the words known and used by a particular person'"
              @mouseenter="onWordHover($event, 'vocabulary', 'vəˈkæbjələri', 'n.', isZh ? '词汇量；生词表' : 'all the words known and used by a particular person')"
            >vocabulary</span>
            in deep focus.
          </p>

          <!-- 模拟悬浮毛玻璃气泡 -->
          <div
            v-if="bubbleVisible"
            class="sandbox-bubble"
            :style="{ left: bubblePos.left + 'px', top: bubblePos.top + 'px' }"
          >
            <div class="bubble-header">
              <div class="bubble-title-group">
                <span class="bubble-word">{{ bubbleData.word }}</span>
                <span class="bubble-phonetic">[{{ bubbleData.phonetic }}]</span>
                <button
                  type="button"
                  class="bubble-speaker-btn"
                  :title="isZh ? '播放发音' : 'Play pronunciation'"
                  @click="playSpeech(bubbleData.word)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3z"></path>
                    <path d="M14 7.5a5 5 0 0 1 0 9v-2.2a2.8 2.8 0 0 0 0-4.6V7.5z"></path>
                  </svg>
                </button>
              </div>
              <span class="bubble-status-pill">{{ isZh ? '已掌握' : 'Saved' }}</span>
            </div>
            <div class="bubble-body">
              <span class="bubble-pos">{{ bubbleData.pos }}</span>
              <span class="bubble-trans">{{ bubbleData.trans }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 快速上手 -->
      <section id="quick" class="section-card">
        <h2 class="section-title">
          <span class="title-icon">🚀</span>
          {{ isZh ? '三步快速上手' : 'Get Started in 3 Steps' }}
        </h2>
        <div class="steps-grid">
          <div class="step-card">
            <div class="step-num">1</div>
            <h3>{{ isZh ? '登录有道词典' : 'Sign in to Youdao' }}</h3>
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
            <h3>{{ isZh ? '点击一键同步' : 'One-Click Sync' }}</h3>
            <p>
              {{
                isZh
                  ? '点击扩展弹窗中的「同步生词本」按钮，生词列表与释义将自动导入本地存储，秒级就绪，离线可用。'
                  : 'Click the "Sync" button in the extension popup. Your vocabulary is saved locally for instant lookup, even offline.'
              }}
            </p>
          </div>
          <div class="step-card">
            <div class="step-num">3</div>
            <h3>{{ isZh ? '沉浸流畅阅读' : 'Browse & Learn' }}</h3>
            <p>
              {{
                isZh
                  ? '阅读任意英文网页，正文生词自动高亮。指针悬停即弹出精致毛玻璃释义与音标，聆听自然发音。'
                  : 'Read any English web page. Words highlight automatically in body text. Hover to preview phonetics and definitions.'
              }}
            </p>
          </div>
        </div>
      </section>

      <!-- 核心升级与亮点 -->
      <section id="features" class="section-card">
        <h2 class="section-title">
          <span class="title-icon">✨</span>
          {{ isZh ? '核心亮点与功能升级' : 'Key Highlights & Upgrades' }}
        </h2>
        <div class="feature-grid">
          <div class="feature-card">
            <div class="f-icon">🎨</div>
            <h3>{{ isZh ? '5 种高亮形态 · 零重叠避让' : '5 Styles & Zero Collision' }}</h3>
            <p>
              {{
                isZh
                  ? '支持背景高亮、直线下划线、波浪下划线、虚线下划线及圆角边框。独创字符降部避让算法，彻底解决 p、g、y、q、j 字母压线与重叠问题。'
                  : 'Choose from background, underline, wavy, dashed, and rounded outline. Custom offset avoids collisions with descenders (p, g, y, q, j).'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">🎯</div>
            <h3>{{ isZh ? '正文精准聚焦 · 屏蔽干扰' : 'Main Content Smart Filter' }}</h3>
            <p>
              {{
                isZh
                  ? '全新 DOM 过滤引擎深度识别文章主体，主动排除导航栏、页眉页脚、侧边栏、交互按钮及代码块干扰，让阅读注意力完全集中于正文。'
                  : 'TreeWalker engine filters out navbars, headers, footers, sidebars, buttons, and code blocks, keeping your focus purely on article content.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">💬</div>
            <h3>{{ isZh ? '现代毛玻璃浮窗 · 纯净体验' : 'Glassmorphism Bubble & Clean UI' }}</h3>
            <p>
              {{
                isZh
                  ? '查词浮层升级为现代毛玻璃拟态质感，搭配独立词性药丸与翡翠绿发音喇叭。彻底移除了打扰阅读的划词弹窗，保持浏览清爽纯净。'
                  : 'Upgraded to a frosted-glass bubble with part-of-speech badges and emerald audio button. Removed intrusive selection popups for clean reading.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <div class="f-icon">🧠</div>
            <h3>{{ isZh ? '白名单语法屈折变体识别' : 'Precision Inflection Engine' }}</h3>
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
                  ? '基于 MutationObserver 与 requestIdleCallback 节流渲染，平滑兼容 Twitter、Reddit、GitHub 等单页应用的异步内容流。'
                  : 'MutationObserver and requestIdleCallback integration keeps single-page apps (Twitter, Reddit, GitHub) smooth and responsive.'
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
            <strong>{{ isZh ? '查词气泡常驻保持' : 'Keep Bubble Open' }}：</strong>
            {{
              isZh
                ? '光标移入气泡内部可保持浮层不关闭，自由选中文本、复制详细释义或点击发音喇叭收听。'
                : 'Move the cursor directly into the bubble to keep it open, select or copy definitions, or click the speaker.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '快捷删词与保护' : 'Delete & Safe Confirmation' }}：</strong>
            {{
              isZh
                ? '悬浮已高亮单词，点击气泡右上角垃圾桶图标即可在当前页面快捷删除该生词，并带有轻量撤销与非阻塞确认。'
                : 'Hover highlighted words and click the trash can icon to remove them from your wordbook with non-blocking confirmation.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '防抖与智能防误触' : 'Smart Edge Guards & Debounce' }}：</strong>
            {{
              isZh
                ? '指针贴近浏览器边框或滚动条时自动屏蔽弹窗；600ms 悬浮判断确保快速扫读光标滑过时不乱弹窗打扰。'
                : 'Edge guards prevent unintended popups near scrollbars, while a 600ms hold debounce keeps rapid scanning calm.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '动态颜色标签联动' : 'Dynamic Color Labels' }}：</strong>
            {{
              isZh
                ? '在扩展面板中切换高亮形态时，颜色选择器会自动联动为“背景”、“线条”或“边框”，一目了然。'
                : 'Switching highlight styles dynamically updates color picker labels to "Background", "Line", or "Border".'
            }}
          </div>
        </div>
      </section>

      <!-- 常见问题 -->
      <section id="faq" class="section-card">
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
      <p>© 2026 生词高亮助手 · Modernized with WXT + TypeScript + Vue 3 · 纯净开源</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from '../../utils/i18n';

type HighlightStyle = 'bg' | 'underline' | 'wavy' | 'dashed' | 'outline';

interface StyleOption {
  id: HighlightStyle;
  nameZh: string;
  nameEn: string;
}

interface ColorOption {
  bg: string;
  line: string;
  titleZh: string;
  titleEn: string;
}

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

const styleList: StyleOption[] = [
  { id: 'underline', nameZh: '直线下划线', nameEn: 'Underline' },
  { id: 'wavy', nameZh: '波浪下划线', nameEn: 'Wavy' },
  { id: 'dashed', nameZh: '虚线下划线', nameEn: 'Dashed' },
  { id: 'outline', nameZh: '圆角边框', nameEn: 'Border' },
  { id: 'bg', nameZh: '背景高亮', nameEn: 'Background' },
];

const colorPresets: ColorOption[] = [
  { bg: '#ffe464', line: '#d97706', titleZh: '琥珀黄', titleEn: 'Amber' },
  { bg: '#9be4a4', line: '#16a34a', titleZh: '翡翠绿', titleEn: 'Emerald' },
  { bg: '#80b6f6', line: '#2563eb', titleZh: '蔚蓝', titleEn: 'Sky Blue' },
  { bg: '#c2a3f7', line: '#9333ea', titleZh: '罗兰紫', titleEn: 'Purple' },
  { bg: '#ffbe72', line: '#ea580c', titleZh: '暖橙', titleEn: 'Orange' },
  { bg: '#f69ba4', line: '#e11d48', titleZh: '玫红', titleEn: 'Rose' },
];

const activeStyle = ref<HighlightStyle>('underline');
const activeColor = ref<ColorOption>(colorPresets[0]!);

const currentColorLabel = computed(() => {
  if (activeStyle.value === 'outline') {
    return isZh.value ? '边框颜色' : 'Border Color';
  }
  if (activeStyle.value === 'underline' || activeStyle.value === 'wavy' || activeStyle.value === 'dashed') {
    return isZh.value ? '线条颜色' : 'Line Color';
  }
  return isZh.value ? '背景颜色' : 'Background Color';
});

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const sandboxCssVars = computed(() => {
  const bg = activeColor.value.bg;
  const line = activeColor.value.line;
  return {
    '--sb-bg': hexToRgba(bg, 0.65),
    '--sb-bg-hover': hexToRgba(bg, 0.9),
    '--sb-line': line,
    '--sb-line-hover': hexToRgba(line, 0.9),
    '--sb-tint': hexToRgba(line, 0.08),
  };
});

// 模拟气泡浮层
const bubbleVisible = ref(false);
const bubblePos = ref({ left: 30, top: 80 });
const bubbleData = ref({
  word: 'compromised',
  phonetic: 'ˈkɒmprəmaɪzd',
  pos: 'adj.',
  trans: '妥协的；受侵害泄露的',
});

function onWordHover(e: MouseEvent, word: string, phonetic: string, pos: string, trans: string) {
  bubbleData.value = { word, phonetic, pos, trans };
  const target = e.currentTarget as HTMLElement;
  const parent = target.closest('.sandbox-preview') as HTMLElement;
  if (parent) {
    const parentRect = parent.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    bubblePos.value = {
      left: Math.max(16, targetRect.left - parentRect.left - 20),
      top: targetRect.bottom - parentRect.top + 10,
    };
    bubbleVisible.value = true;
  }
}

function hideBubble() {
  bubbleVisible.value = false;
}

function playSpeech(word: string) {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }
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
.tutorial-page {
  min-height: 100vh;
  background-color: #f8fafc;
  color: #0f172a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.6;
  transition: background-color 0.25s, color 0.25s;
}

/* 顶部轻量条 */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  background: rgba(255, 255, 255, 0.88);
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
}
.nav-content {
  max-width: 920px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand-mini {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-icon {
  border-radius: 6px;
}
.brand-title {
  font-weight: 600;
  font-size: 15px;
  color: #0f172a;
  letter-spacing: -0.2px;
}
.lang-switcher {
  display: flex;
  background: #f1f5f9;
  border-radius: 20px;
  padding: 3px;
  border: 1px solid #e2e8f0;
}
.lang-pill {
  border: none;
  background: transparent;
  padding: 4px 14px;
  font-size: 12px;
  border-radius: 16px;
  cursor: pointer;
  color: #64748b;
  font-weight: 500;
  transition: all 0.2s;
}
.lang-pill.active {
  background: #ffffff;
  color: #059669;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* 英雄区：渐变翡翠大地调 */
.hero {
  background: linear-gradient(135deg, #064e3b 0%, #065f46 45%, #047857 100%);
  background-image:
    radial-gradient(circle at 18% 20%, rgba(52, 211, 153, 0.25) 0%, transparent 40%),
    radial-gradient(circle at 82% 80%, rgba(245, 158, 11, 0.2) 0%, transparent 50%),
    linear-gradient(135deg, #064e3b 0%, #065f46 45%, #047857 100%);
  color: #ffffff;
  padding: 56px 24px 52px;
  text-align: center;
  border-bottom-left-radius: 32px;
  border-bottom-right-radius: 32px;
  box-shadow: 0 16px 36px -8px rgba(6, 78, 59, 0.3);
}
.hero-inner {
  max-width: 740px;
  margin: 0 auto;
}
.hero-logo {
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
  margin-bottom: 16px;
}
.hero-title {
  font-size: 29px;
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
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.hero-subtitle {
  font-size: 16px;
  opacity: 0.94;
  margin-bottom: 26px;
  font-weight: 400;
  line-height: 1.6;
}
.hero-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.btn-primary {
  background: #ffffff;
  color: #065f46;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.btn-primary:hover {
  background: #f0fdf4;
  transform: translateY(-1.5px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.16);
}
.btn-ghost {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.24);
  transform: translateY(-1.5px);
}

/* 主内容区 */
.container {
  max-width: 900px;
  margin: -24px auto 60px;
  padding: 0 20px;
  position: relative;
  z-index: 10;
}
.section-card {
  background: #ffffff;
  border-radius: 20px;
  padding: 32px 36px;
  margin-bottom: 24px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05);
  border: 1px solid #e2e8f0;
}
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 0;
}
.title-icon {
  font-size: 22px;
}
.badge-tag {
  font-size: 12px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 3px 10px;
  border-radius: 12px;
}
.section-desc {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 20px;
  line-height: 1.6;
}

/* 沙盒控制器与卡片 */
.sandbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}
.style-toggle-group {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.style-btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}
.style-btn.active {
  background: #ffffff;
  color: #0f172a;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.style-icon-demo {
  font-weight: 700;
  font-size: 12px;
}
.demo--underline {
  text-decoration: underline;
  text-decoration-color: #d97706;
  text-decoration-thickness: 2px;
}
.demo--wavy {
  text-decoration: underline wavy;
  text-decoration-color: #d97706;
}
.demo--dashed {
  text-decoration: underline dashed;
  text-decoration-color: #d97706;
}
.demo--outline {
  border: 1.5px solid #d97706;
  border-radius: 3px;
  padding: 0 2px;
}
.demo--bg {
  background: #fef08a;
  border-radius: 3px;
  padding: 0 3px;
  color: #713f12;
}

.color-toggle-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.color-label {
  font-size: 12px;
  color: #64748b;
  margin-right: 4px;
}
.color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.active {
  transform: scale(1.18);
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #059669;
}

.sandbox-preview {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 20px 24px;
  min-height: 120px;
}
.sandbox-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
  margin-bottom: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.sandbox-status-tag {
  color: #059669;
  font-weight: 600;
}
.sandbox-text {
  font-size: 15px;
  line-height: 1.8;
  color: #1e293b;
  font-family: Georgia, Cambria, "Times New Roman", Times, serif;
}

/* 5 种高亮在沙盒中的渲染 */
.sandbox-style-bg .demo-word {
  background-color: var(--sb-bg);
  border-radius: 3px;
  padding: 0 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.sandbox-style-bg .demo-word:hover {
  background-color: var(--sb-bg-hover);
}

.sandbox-style-underline .demo-word {
  text-decoration: underline;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 2px;
  text-underline-offset: 4.5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-underline .demo-word:hover {
  background-color: var(--sb-tint);
  border-radius: 2px;
}

.sandbox-style-wavy .demo-word {
  text-decoration: underline wavy;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 1.8px;
  text-underline-offset: 5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-wavy .demo-word:hover {
  background-color: var(--sb-tint);
  border-radius: 2px;
}

.sandbox-style-dashed .demo-word {
  text-decoration: underline dashed;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 1.8px;
  text-underline-offset: 4.5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-dashed .demo-word:hover {
  background-color: var(--sb-tint);
  border-radius: 2px;
}

.sandbox-style-outline .demo-word {
  border: 1.5px solid var(--sb-line);
  border-radius: 4px;
  padding: 2px 5px;
  margin: 0 1.5px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  cursor: pointer;
}
.sandbox-style-outline .demo-word:hover {
  background-color: var(--sb-tint);
}

/* 模拟浮层毛玻璃气泡 */
.sandbox-bubble {
  position: absolute;
  z-index: 40;
  width: 270px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 12px 28px -4px rgba(15, 23, 42, 0.16);
  pointer-events: auto;
  animation: bubblePop 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes bubblePop {
  0% { opacity: 0; transform: translateY(4px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 8px;
  margin-bottom: 8px;
}
.bubble-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bubble-word {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
}
.bubble-phonetic {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
}
.bubble-speaker-btn {
  border: none;
  background: #ecfdf5;
  color: #059669;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;
}
.bubble-speaker-btn:hover {
  transform: scale(1.15);
}
.bubble-status-pill {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  padding: 1px 6px;
  border-radius: 6px;
}
.bubble-body {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1.5;
}
.bubble-pos {
  font-size: 11px;
  font-weight: 700;
  color: #059669;
  background: #ecfdf5;
  padding: 1px 4px;
  border-radius: 4px;
  font-family: monospace;
}
.bubble-trans {
  font-size: 12px;
  color: #334155;
}

/* 步骤网格 */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.step-card {
  background: #f8fafc;
  padding: 24px 20px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  position: relative;
}
.step-num {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 32px;
  font-weight: 800;
  color: rgba(5, 150, 105, 0.15);
  line-height: 1;
}
.step-card h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #065f46;
}
.step-card p {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

/* 特性网格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
}
.feature-card {
  background: #f8fafc;
  padding: 22px;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s, box-shadow 0.2s;
}
.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}
.f-icon {
  font-size: 26px;
  margin-bottom: 10px;
}
.feature-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.feature-card p {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

/* 技巧列表 */
.tips-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tip-item {
  background: #f8fafc;
  border-left: 4px solid #059669;
  padding: 14px 18px;
  border-radius: 0 10px 10px 0;
  font-size: 13.5px;
  color: #334155;
  border-top: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
  border-bottom: 1px solid #f1f5f9;
}
.tip-item strong {
  color: #065f46;
}

/* FAQ */
.faq-accordion {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.faq-item {
  background: #f8fafc;
  padding: 18px 22px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.faq-q {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #065f46;
}
.faq-a p {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

/* 联系卡片 */
.contact-desc {
  font-size: 14px;
  color: #475569;
  margin-bottom: 22px;
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
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: all 0.2s;
}
.contact-badge:hover {
  background: #f0fdf4;
  border-color: #a7f3d0;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(5, 150, 105, 0.08);
}
.contact-icon {
  font-size: 28px;
}
.contact-label {
  font-size: 12px;
  color: #64748b;
}
.contact-value {
  font-size: 15px;
  font-weight: 600;
  color: #065f46;
}
.copy-hint {
  margin-left: auto;
  font-size: 12px;
  color: #059669;
  font-weight: 500;
}

/* 页脚 */
.page-footer {
  text-align: center;
  padding: 30px 20px 48px;
  font-size: 13px;
  color: #94a3b8;
}

/* 暗色模式全面适配 */
@media (prefers-color-scheme: dark) {
  .tutorial-page {
    background-color: #0b111e;
    color: #f1f5f9;
  }
  .top-nav {
    background: rgba(11, 17, 30, 0.88);
    border-bottom: 1px solid #1e293b;
  }
  .brand-title {
    color: #f8fafc;
  }
  .lang-switcher {
    background: #1e293b;
    border-color: #334155;
  }
  .lang-pill {
    color: #94a3b8;
  }
  .lang-pill.active {
    background: #0f172a;
    color: #34d399;
  }
  .section-card {
    background: #131b2e;
    border-color: #1e293b;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  .section-title {
    color: #f8fafc;
  }
  .section-desc {
    color: #94a3b8;
  }
  .badge-tag {
    background: rgba(5, 150, 105, 0.15);
    border-color: rgba(5, 150, 105, 0.3);
    color: #34d399;
  }
  .style-toggle-group {
    background: #0b111e;
    border-color: #1e293b;
  }
  .style-btn {
    color: #94a3b8;
  }
  .style-btn.active {
    background: #1e293b;
    color: #f8fafc;
  }
  .sandbox-preview {
    background: #0b111e;
    border-color: #1e293b;
  }
  .sandbox-text {
    color: #e2e8f0;
  }
  .sandbox-bubble {
    background: rgba(19, 27, 46, 0.94);
    border-color: #334155;
    box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.5);
  }
  .bubble-word {
    color: #f8fafc;
  }
  .bubble-phonetic {
    background: #0b111e;
    color: #94a3b8;
  }
  .bubble-speaker-btn {
    background: rgba(5, 150, 105, 0.2);
    color: #34d399;
  }
  .bubble-trans {
    color: #cbd5e1;
  }
  .bubble-header {
    border-color: #1e293b;
  }
  .step-card,
  .feature-card,
  .faq-item,
  .contact-badge {
    background: #0b111e;
    border-color: #1e293b;
  }
  .step-card h3,
  .faq-q,
  .contact-value {
    color: #34d399;
  }
  .step-card p,
  .feature-card p,
  .faq-a p,
  .contact-desc {
    color: #94a3b8;
  }
  .feature-card h3 {
    color: #f1f5f9;
  }
  .tip-item {
    background: #0b111e;
    border-color: #1e293b;
    border-left-color: #059669;
    color: #cbd5e1;
  }
  .tip-item strong {
    color: #34d399;
  }
  .contact-badge:hover {
    background: #162238;
    border-color: #059669;
  }
  .color-dot.active {
    box-shadow: 0 0 0 2px #0b111e, 0 0 0 4px #34d399;
  }
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
  .section-card {
    padding: 24px 20px;
  }
  .sandbox-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
