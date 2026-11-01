<template>
  <div class="tutorial-page" :class="`lang-${lang}`">
    <!-- 顶部导航栏 -->
    <nav class="top-nav">
      <div class="nav-content">
        <div class="brand-mini">
          <img src="/icon/32.png" alt="Logo" width="24" height="24" class="brand-icon" />
          <span class="brand-title">{{ isZh ? '生词高亮助手' : 'Vocabulary Highlighter' }}</span>
        </div>
        <div class="nav-right">
          <a
            href="https://github.com/orz1245/youdao"
            target="_blank"
            rel="noopener noreferrer"
            class="nav-github-link"
          >
            GitHub
          </a>
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
    </nav>

    <!-- 顶部说明 -->
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
              ? '在英文网页中自动高亮有道生词本中的单词，鼠标悬停即可查看释义与发音。'
              : 'Highlight saved words from your Youdao wordbook across web pages, with instant definitions and audio on hover.'
          }}
        </p>

        <div class="hero-actions">
          <a href="#preview" class="btn btn-primary">
            {{ isZh ? '样式预览' : 'Style Preview' }}
          </a>
          <a href="#quick" class="btn btn-ghost">
            {{ isZh ? '使用方法' : 'Getting Started' }}
          </a>
          <a href="#features" class="btn btn-ghost">
            {{ isZh ? '功能特点' : 'Features' }}
          </a>
          <a href="#faq" class="btn btn-ghost">
            {{ isZh ? '常见问题' : 'FAQ' }}
          </a>
          <a
            href="https://github.com/orz1245/youdao"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-ghost"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>

    <!-- 主体容器 -->
    <main class="container">
      <!-- 样式预览与交互演示 -->
      <section id="preview" class="section-card">
        <div class="section-header-row">
          <h2 class="section-title">
            {{ isZh ? '样式预览' : 'Style Preview' }}
          </h2>
        </div>
        <p class="section-desc">
          {{
            isZh
              ? '支持切换不同的高亮样式与颜色，将鼠标悬停在下列单词上可查看释义气泡。'
              : 'Switch between highlight styles and color presets below. Hover over any word to inspect the definition bubble.'
          }}
        </p>

        <!-- 工具栏 -->
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

        <!-- 预览区域 -->
        <div
          class="sandbox-preview"
          :class="`sandbox-style-${activeStyle}`"
          :style="sandboxCssVars"
          @mouseleave="hideBubble"
        >
          <div class="sandbox-status-bar">
            <span>{{ isZh ? '悬停在下方单词上查看释义与发音：' : 'Hover over any word below to see definition and pronunciation:' }}</span>
          </div>

          <p class="sandbox-text">
            Reading English articles is an
            <span
              class="demo-word"
              data-word="effective"
              data-phonetic="ɪˈfektɪv"
              data-pos="adj."
              :data-trans="isZh ? '有效的；起作用的' : 'successful in producing a desired or intended result'"
              @mouseenter="onWordHover($event, 'effective', 'ɪˈfektɪv', 'adj.', isZh ? '有效的；起作用的' : 'successful in producing a desired or intended result')"
            >effective</span>
            way to build your
            <span
              class="demo-word"
              data-word="vocabulary"
              data-phonetic="vəˈkæbjələri"
              data-pos="n."
              :data-trans="isZh ? '词汇量；生词表' : 'all the words known and used by a particular person'"
              @mouseenter="onWordHover($event, 'vocabulary', 'vəˈkæbjələri', 'n.', isZh ? '词汇量；生词表' : 'all the words known and used by a particular person')"
            >vocabulary</span>.
            Regular reading
            <span
              class="demo-word"
              data-word="practice"
              data-phonetic="ˈpræktɪs"
              data-pos="n."
              :data-trans="isZh ? '练习；实践' : 'repeated exercise in or performance of an activity'"
              @mouseenter="onWordHover($event, 'practice', 'ˈpræktɪs', 'n.', isZh ? '练习；实践' : 'repeated exercise in or performance of an activity')"
            >practice</span>
            helps you remember words naturally in context.
          </p>

          <!-- 模拟释义气泡 -->
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
                  :title="isZh ? '播放发音' : 'Play audio'"
                  @click="playSpeech(bubbleData.word)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3z"></path>
                    <path d="M14 7.5a5 5 0 0 1 0 9v-2.2a2.8 2.8 0 0 0 0-4.6V7.5z"></path>
                  </svg>
                </button>
              </div>
              <span class="bubble-status-pill">{{ isZh ? '已收录' : 'Saved' }}</span>
            </div>
            <div class="bubble-body">
              <span class="bubble-pos">{{ bubbleData.pos }}</span>
              <span class="bubble-trans">{{ bubbleData.trans }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- 使用方法 -->
      <section id="quick" class="section-card">
        <h2 class="section-title">
          {{ isZh ? '使用方法' : 'Getting Started' }}
        </h2>
        <div class="steps-grid">
          <div class="step-card">
            <div class="step-num">1</div>
            <h3>{{ isZh ? '登录有道词典' : 'Sign in to Youdao' }}</h3>
            <p>
              {{
                isZh
                  ? '在浏览器中打开并登录 dict.youdao.com，扩展会自动读取登录状态。'
                  : 'Open dict.youdao.com in your browser and sign in. The extension automatically detects your login session.'
              }}
            </p>
          </div>
          <div class="step-card">
            <div class="step-num">2</div>
            <h3>{{ isZh ? '同步生词本' : 'Sync Wordbook' }}</h3>
            <p>
              {{
                isZh
                  ? '点击扩展面板中的「同步生词本」按钮，生词和释义将自动保存到本地。'
                  : 'Click "Sync" in the extension popup to fetch and cache your saved words locally.'
              }}
            </p>
          </div>
          <div class="step-card">
            <div class="step-num">3</div>
            <h3>{{ isZh ? '浏览网页' : 'Browse the Web' }}</h3>
            <p>
              {{
                isZh
                  ? '在任意英文网页阅读时，生词会自动高亮显示；鼠标悬停可查看音标、释义并收听发音。'
                  : 'Words from your wordbook highlight automatically on English web pages. Hover to view definitions and hear audio.'
              }}
            </p>
          </div>
        </div>
      </section>

      <!-- 功能特点 -->
      <section id="features" class="section-card">
        <h2 class="section-title">
          {{ isZh ? '功能特点' : 'Features' }}
        </h2>
        <div class="feature-grid">
          <div class="feature-card">
            <h3>{{ isZh ? '5 种高亮样式' : '5 Highlight Styles' }}</h3>
            <p>
              {{
                isZh
                  ? '支持背景高亮、直线下划线、波浪线、虚线及圆角边框。下划线已优化下移距离，不会遮挡字母下垂笔画（如 p、g、y、q、j）。'
                  : 'Choose between background, underline, wavy, dashed, and outline styles. Underline offsets prevent overlapping character descenders (p, g, y).'
              }}
            </p>
          </div>

          <div class="feature-card">
            <h3>{{ isZh ? '正文智能聚焦' : 'Main Content Focus' }}</h3>
            <p>
              {{
                isZh
                  ? '自动跳过导航栏、页眉页脚、侧边栏、按钮与代码块，只在文章正文文本中进行高亮，减少干扰。'
                  : 'Filters out navigation bars, headers, footers, sidebars, buttons, and code blocks to focus cleanly on article text.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <h3>{{ isZh ? '悬浮释义气泡' : 'Hover Definition Bubble' }}</h3>
            <p>
              {{
                isZh
                  ? '鼠标悬停在生词上即可查看音标、词性及中文释义，支持一键朗读发音和直接删词，移除了打扰阅读的划词弹窗。'
                  : 'Hover over highlighted words to see definitions and phonetic transcriptions. Supports one-click audio playback and word removal.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <h3>{{ isZh ? '语法屈折变体识别' : 'Inflection Recognition' }}</h3>
            <p>
              {{
                isZh
                  ? '支持常规复数、时态、比较级等屈折变化的自动归一匹配，避免派生词误标。'
                  : 'Recognizes plurals, tenses, and grammatical inflections safely without creating noisy false-positives.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <h3>{{ isZh ? '双发音引擎' : 'Dual Speech Engine' }}</h3>
            <p>
              {{
                isZh
                  ? '优先调用 Google 自然在线语音，在离线或网络不可达时自动平滑切换至系统本地语音。'
                  : 'Prioritizes Google Cloud voices with seamless fallback to offline system voices when offline.'
              }}
            </p>
          </div>

          <div class="feature-card">
            <h3>{{ isZh ? '动态页面自适应' : 'Dynamic Page Support' }}</h3>
            <p>
              {{
                isZh
                  ? '监听页面 DOM 变化并进行节流渲染，兼容 Twitter、Reddit、GitHub 等单页应用的内容动态加载。'
                  : 'Observes dynamic DOM mutations smoothly for single-page applications like Twitter, Reddit, and GitHub.'
              }}
            </p>
          </div>
        </div>
      </section>

      <!-- 使用提示 -->
      <section class="section-card">
        <h2 class="section-title">
          {{ isZh ? '使用提示' : 'Tips' }}
        </h2>
        <div class="tips-list">
          <div class="tip-item">
            <strong>{{ isZh ? '保持气泡显示' : 'Keep Bubble Visible' }}：</strong>
            {{
              isZh
                ? '将光标移入气泡内部可以保持浮层不关闭，方便复制释义文本或点击发音按钮。'
                : 'Move the mouse cursor into the bubble to keep it open while selecting text or clicking audio.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '页面快捷删词' : 'Quick Delete' }}：</strong>
            {{
              isZh
                ? '悬停在已高亮单词上，点击气泡右上角的删除图标即可将该词从生词本中移除。'
                : 'Hover over any highlighted word and click the trash can icon in the bubble to remove it from your wordbook.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '防误触设计' : 'Debounce Protection' }}：</strong>
            {{
              isZh
                ? '设置了 600ms 悬停延迟，在页面快速滚动或光标掠过时不会误触发弹窗。'
                : 'A 600ms hover debounce prevents unwanted popups during rapid scrolling or skimming.'
            }}
          </div>
          <div class="tip-item">
            <strong>{{ isZh ? '颜色标签联动' : 'Color Customization' }}：</strong>
            {{
              isZh
                ? '在设置面板中切换高亮样式时，颜色标签会自动对应显示为“背景”、“线条”或“边框”。'
                : 'Color labels dynamically adapt to "Background", "Line", or "Border" depending on your active highlight style.'
            }}
          </div>
        </div>
      </section>

      <!-- 常见问题 -->
      <section id="faq" class="section-card">
        <h2 class="section-title">
          {{ isZh ? '常见问题' : 'FAQ' }}
        </h2>
        <div class="faq-accordion">
          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? '为什么点击同步提示「未获取到生词」？' : 'Why does sync report "No words found"?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '请确认是否已在当前浏览器中登录 dict.youdao.com，且有道生词本中已有至少 1 个单词。如果仍无法同步，可以在扩展面板中尝试重新登录。'
                    : 'Please ensure you are signed in on dict.youdao.com and that your wordbook has at least one word. If issues persist, try re-logging in.'
                }}
              </p>
            </div>
          </div>

          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? '悬停在单词上为什么没有发音声音？' : 'Why is there no pronunciation sound?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '扩展首选 Google 在线发音，如受网络限制可能无法连通。若系统未安装本地英语语音包，请在系统设置中添加英语语音。'
                    : 'The extension uses online Google speech by default. If network issues occur, ensure your operating system has a local English voice pack installed.'
                }}
              </p>
            </div>
          </div>

          <div class="faq-item">
            <h4 class="faq-q">
              {{ isZh ? '扩展会收集或上传我的网页浏览数据吗？' : 'Does the extension track my browsing activity?' }}
            </h4>
            <div class="faq-a">
              <p>
                {{
                  isZh
                    ? '不会。所有高亮匹配都在浏览器本地内存中完成，仅在同步生词本和查询释义时直接与有道服务器通信，不会收集或上传任何网页浏览数据。'
                    : 'No. All word matching runs entirely client-side. Network requests only communicate directly with Youdao servers for wordbook data.'
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 联系与反馈 -->
      <section id="contact" class="section-card contact-card">
        <h2 class="section-title">
          {{ isZh ? '联系与反馈' : 'Contact & Feedback' }}
        </h2>
        <p class="contact-desc">
          {{
            isZh
              ? '如遇问题、有功能建议或交流讨论，欢迎通过微信、邮件或 GitHub 联系。'
              : 'For bug reports, feature suggestions, or feedback, feel free to reach out via WeChat, Email, or GitHub.'
          }}
        </p>

        <div class="contact-methods">
          <div class="contact-badge" @click="copyWeChat">
            <div class="contact-info">
              <div class="contact-label">{{ isZh ? '微信' : 'WeChat' }}</div>
              <div class="contact-value">v587233</div>
            </div>
            <span class="copy-hint">{{ copied ? (isZh ? '已复制' : 'Copied') : (isZh ? '点击复制' : 'Click to copy') }}</span>
          </div>

          <a href="mailto:wenjiajun.cn@gmail.com" class="contact-badge">
            <div class="contact-info">
              <div class="contact-label">{{ isZh ? '邮箱' : 'Email' }}</div>
              <div class="contact-value">wenjiajun.cn@gmail.com</div>
            </div>
            <span class="copy-hint">{{ isZh ? '发送邮件' : 'Send email' }}</span>
          </a>

          <a href="https://github.com/orz1245/youdao" target="_blank" rel="noopener noreferrer" class="contact-badge">
            <div class="contact-info">
              <div class="contact-label">GitHub</div>
              <div class="contact-value">orz1245/youdao</div>
            </div>
            <span class="copy-hint">{{ isZh ? '访问仓库' : 'Visit repo' }}</span>
          </a>
        </div>
      </section>
    </main>

    <!-- 底部版权 -->
    <footer class="page-footer">
      <p>
        {{ isZh ? '© 2026 生词高亮助手 · ' : '© 2026 Vocabulary Highlighter · ' }}
        <a href="https://github.com/orz1245/youdao" target="_blank" rel="noopener noreferrer" class="footer-link">GitHub</a>
      </p>
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

const version = ref('1.0.2');
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
  { id: 'underline', nameZh: '下划线', nameEn: 'Underline' },
  { id: 'wavy', nameZh: '波浪线', nameEn: 'Wavy' },
  { id: 'dashed', nameZh: '虚线', nameEn: 'Dashed' },
  { id: 'outline', nameZh: '边框', nameEn: 'Border' },
  { id: 'bg', nameZh: '背景', nameEn: 'Background' },
];

const colorPresets: ColorOption[] = [
  { bg: '#ffe464', line: '#d97706', titleZh: '黄', titleEn: 'Yellow' },
  { bg: '#9be4a4', line: '#16a34a', titleZh: '绿', titleEn: 'Green' },
  { bg: '#80b6f6', line: '#2563eb', titleZh: '蓝', titleEn: 'Blue' },
  { bg: '#c2a3f7', line: '#9333ea', titleZh: '紫', titleEn: 'Purple' },
  { bg: '#ffbe72', line: '#ea580c', titleZh: '橙', titleEn: 'Orange' },
  { bg: '#f69ba4', line: '#e11d48', titleZh: '粉', titleEn: 'Pink' },
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
  word: 'effective',
  phonetic: 'ɪˈfektɪv',
  pos: 'adj.',
  trans: '有效的；起作用的',
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
    }, 2000);
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
  transition: background-color 0.2s, color 0.2s;
}

/* 顶部栏 */
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid #e2e8f0;
}
.nav-content {
  max-width: 880px;
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
}
.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.nav-github-link {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 6px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #334155;
  text-decoration: none;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}
.nav-github-link:hover {
  background: #e2e8f0;
  color: #0f172a;
}
.footer-link {
  color: #059669;
  text-decoration: none;
  font-weight: 500;
}
.footer-link:hover {
  text-decoration: underline;
}
.lang-switcher {
  display: flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
  border: 1px solid #e2e8f0;
}
.lang-pill {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  color: #64748b;
  font-weight: 500;
  transition: all 0.15s;
}
.lang-pill.active {
  background: #ffffff;
  color: #0f172a;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

/* 顶部说明区 */
.hero {
  background: #0f172a;
  color: #ffffff;
  padding: 48px 24px 44px;
  text-align: center;
}
.hero-inner {
  max-width: 680px;
  margin: 0 auto;
}
.hero-logo {
  border-radius: 14px;
  margin-bottom: 14px;
}
.hero-title {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 10px;
  letter-spacing: -0.3px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.version-badge {
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
}
.hero-subtitle {
  font-size: 15px;
  opacity: 0.88;
  margin-bottom: 24px;
  font-weight: 400;
  line-height: 1.5;
}
.hero-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 8px 18px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.15s ease;
}
.btn-primary {
  background: #ffffff;
  color: #0f172a;
}
.btn-primary:hover {
  background: #f1f5f9;
}
.btn-ghost {
  background: transparent;
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.btn-ghost:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

/* 主内容区 */
.container {
  max-width: 860px;
  margin: 24px auto 60px;
  padding: 0 20px;
}
.section-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  border: 1px solid #e2e8f0;
}
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #0f172a;
  margin-bottom: 8px;
}
.section-desc {
  font-size: 13.5px;
  color: #64748b;
  margin-bottom: 16px;
  line-height: 1.5;
}

/* 预览工具栏 */
.sandbox-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}
.style-toggle-group {
  display: flex;
  gap: 2px;
  background: #f1f5f9;
  padding: 3px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}
.style-btn {
  border: none;
  background: transparent;
  padding: 5px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s;
}
.style-btn.active {
  background: #ffffff;
  color: #0f172a;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.style-icon-demo {
  font-weight: 600;
  font-size: 11px;
}
.demo--underline {
  text-decoration: underline;
  text-decoration-color: #d97706;
  text-decoration-thickness: 1.5px;
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
  border: 1px solid #d97706;
  border-radius: 2px;
  padding: 0 2px;
}
.demo--bg {
  background: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
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
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.15s;
}
.color-dot:hover {
  transform: scale(1.15);
}
.color-dot.active {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px #0f172a;
}

.sandbox-preview {
  position: relative;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 18px 20px;
  min-height: 110px;
}
.sandbox-status-bar {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 10px;
}
.sandbox-text {
  font-size: 14.5px;
  line-height: 1.8;
  color: #1e293b;
}

/* 高亮样式在演示区的渲染 */
.sandbox-style-bg .demo-word {
  background-color: var(--sb-bg);
  border-radius: 2px;
  padding: 0 3px;
  cursor: pointer;
}
.sandbox-style-bg .demo-word:hover {
  background-color: var(--sb-bg-hover);
}

.sandbox-style-underline .demo-word {
  text-decoration: underline;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 4.5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-underline .demo-word:hover {
  background-color: var(--sb-tint);
}

.sandbox-style-wavy .demo-word {
  text-decoration: underline wavy;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-wavy .demo-word:hover {
  background-color: var(--sb-tint);
}

.sandbox-style-dashed .demo-word {
  text-decoration: underline dashed;
  text-decoration-color: var(--sb-line);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 4.5px;
  text-decoration-skip-ink: none;
  cursor: pointer;
}
.sandbox-style-dashed .demo-word:hover {
  background-color: var(--sb-tint);
}

.sandbox-style-outline .demo-word {
  border: 1px solid var(--sb-line);
  border-radius: 3px;
  padding: 1px 4px;
  margin: 0 1px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  cursor: pointer;
}
.sandbox-style-outline .demo-word:hover {
  background-color: var(--sb-tint);
}

/* 释义气泡 */
.sandbox-bubble {
  position: absolute;
  z-index: 40;
  width: 250px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.bubble-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bubble-word {
  font-weight: 600;
  font-size: 13.5px;
  color: #0f172a;
}
.bubble-phonetic {
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
}
.bubble-speaker-btn {
  border: none;
  background: #f1f5f9;
  color: #059669;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.bubble-speaker-btn:hover {
  background: #e2e8f0;
}
.bubble-status-pill {
  font-size: 10.5px;
  color: #059669;
  background: #ecfdf5;
  padding: 1px 5px;
  border-radius: 4px;
}
.bubble-body {
  display: flex;
  align-items: baseline;
  gap: 6px;
  line-height: 1.4;
}
.bubble-pos {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  padding: 0 4px;
  border-radius: 3px;
}
.bubble-trans {
  font-size: 12px;
  color: #334155;
}

/* 步骤网格 */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.step-card {
  background: #f8fafc;
  padding: 20px 18px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  position: relative;
}
.step-num {
  font-size: 18px;
  font-weight: 700;
  color: #64748b;
  margin-bottom: 8px;
}
.step-card h3 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.step-card p {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

/* 特性网格 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.feature-card {
  background: #f8fafc;
  padding: 18px 20px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.feature-card h3 {
  font-size: 14.5px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.feature-card p {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

/* 提示列表 */
.tips-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tip-item {
  background: #f8fafc;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  border: 1px solid #e2e8f0;
}
.tip-item strong {
  color: #0f172a;
}

/* FAQ */
.faq-accordion {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.faq-item {
  background: #f8fafc;
  padding: 16px 18px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.faq-q {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.faq-a p {
  font-size: 13px;
  color: #475569;
  line-height: 1.5;
}

/* 联系方式 */
.contact-desc {
  font-size: 13.5px;
  color: #475569;
  margin-bottom: 16px;
}
.contact-methods {
  display: flex;
  gap: 14px;
}
.contact-badge {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.contact-badge:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.contact-label {
  font-size: 11.5px;
  color: #64748b;
}
.contact-value {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}
.copy-hint {
  margin-left: auto;
  font-size: 11.5px;
  color: #059669;
}

/* 页脚 */
.page-footer {
  text-align: center;
  padding: 24px 20px 40px;
  font-size: 12.5px;
  color: #94a3b8;
}

/* 深色模式 */
@media (prefers-color-scheme: dark) {
  .tutorial-page {
    background-color: #0b0f17;
    color: #e2e8f0;
  }
  .top-nav {
    background: rgba(11, 15, 23, 0.9);
    border-bottom: 1px solid #1e293b;
  }
  .brand-title {
    color: #f8fafc;
  }
  .nav-github-link {
    background: #1e293b;
    border-color: #334155;
    color: #cbd5e1;
  }
  .nav-github-link:hover {
    background: #334155;
    color: #ffffff;
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
    background: #111827;
    border-color: #1f2937;
    box-shadow: none;
  }
  .section-title {
    color: #f8fafc;
  }
  .section-desc {
    color: #9ca3af;
  }
  .style-toggle-group {
    background: #0b0f17;
    border-color: #1f2937;
  }
  .style-btn {
    color: #9ca3af;
  }
  .style-btn.active {
    background: #1f2937;
    color: #f8fafc;
  }
  .sandbox-preview {
    background: #0b0f17;
    border-color: #1f2937;
  }
  .sandbox-text {
    color: #e5e7eb;
  }
  .sandbox-bubble {
    background: #1f2937;
    border-color: #374151;
  }
  .bubble-word {
    color: #f9fafb;
  }
  .bubble-phonetic {
    background: #111827;
    color: #9ca3af;
  }
  .bubble-speaker-btn {
    background: #111827;
    color: #34d399;
  }
  .bubble-trans {
    color: #d1d5db;
  }
  .bubble-header {
    border-color: #374151;
  }
  .step-card,
  .feature-card,
  .faq-item,
  .contact-badge,
  .tip-item {
    background: #0b0f17;
    border-color: #1f2937;
  }
  .step-num {
    color: #9ca3af;
  }
  .step-card h3,
  .feature-card h3,
  .faq-q,
  .contact-value,
  .tip-item strong {
    color: #f3f4f6;
  }
  .step-card p,
  .feature-card p,
  .faq-a p,
  .contact-desc,
  .tip-item {
    color: #9ca3af;
  }
  .contact-badge:hover {
    background: #1f2937;
  }
  .color-dot.active {
    box-shadow: 0 0 0 2px #0b0f17, 0 0 0 4px #34d399;
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
    padding: 20px 16px;
  }
  .sandbox-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
