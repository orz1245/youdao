<template>
  <div class="container">
    <!-- 头部 -->
    <header class="header">
      <div class="logo">
        <span class="logo-text">{{ t('popupTitle', '生词高亮') }}</span>
      </div>
      <span class="version">v{{ manifestVersion }}</span>
    </header>

    <!-- 词典卡片 -->
    <section class="card">
      <div class="card-title">{{ t('cardDict', '词典') }}</div>

      <!-- 未登录状态 -->
      <div v-if="!loggedIn" class="account-row">
        <span class="user-avatar guest" aria-hidden="true">Y</span>
        <div class="user-meta">
          <span class="user-name">{{ t('notLoggedIn', '未登录') }}</span>
          <span class="wordbook-count">{{ t('loginHint', '登录后可同步生词本') }}</span>
        </div>
        <div class="row-actions">
          <a
            href="https://www.youdao.com/"
            target="_blank"
            class="primary-btn compact"
            @click="handleLoginClick"
          >
            {{ t('btnLogin', '登录') }}
          </a>
        </div>
      </div>

      <!-- 已登录状态 -->
      <div v-else class="account-row">
        <img
          v-if="!avatarError"
          class="user-avatar-img"
          alt="有道词典"
          src="/icon/youdao-favicon.png"
          @error="avatarError = true"
        />
        <span v-else class="user-avatar" aria-hidden="true">Y</span>

        <div class="user-meta">
          <span class="user-name">{{ t('defaultAccountName', '有道词典') }}</span>
          <span class="wordbook-count">{{ t('wordbookCount', '生词本：$1 个', [wordCount]) }}</span>
        </div>

        <div class="row-actions">
          <!-- 同步按钮 -->
          <button
            class="icon-btn"
            :class="{ syncing }"
            :disabled="syncing"
            :data-tip="t('syncLabel', '同步生词本')"
            :aria-label="t('syncLabel', '同步生词本')"
            @click="handleSync"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>

          <!-- 登出按钮 -->
          <button
            class="icon-btn icon-btn--danger"
            :disabled="loggingOut"
            :data-tip="t('ariaLogout', '登出账号')"
            :aria-label="t('ariaLogout', '登出账号')"
            @click="handleLogout"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </section>

    <!-- 功能开关 -->
    <section class="card">
      <div class="card-title">{{ t('cardFeature', '功能') }}</div>
      <div class="feature-grid">
        <label class="feature-item">
          <input
            v-model="toggle"
            type="checkbox"
            class="switch"
            @change="updateToggle"
          />
          <span class="feature-label">{{ t('toggleLabel', '生词高亮') }}</span>
        </label>
        <label class="feature-item">
          <input
            v-model="ttsToggle"
            type="checkbox"
            class="switch"
            @change="updateTtsToggle"
          />
          <span class="feature-label">{{ t('toggleTts', '悬浮发音') }}</span>
        </label>
        <label class="feature-item">
          <input
            v-model="autoSync"
            type="checkbox"
            class="switch"
            @change="updateAutoSync"
          />
          <span class="feature-label">{{ t('toggleAutoSync', '自动同步') }}</span>
        </label>
      </div>
    </section>

    <!-- 发音设置 -->
    <section class="card">
      <div class="card-title">{{ t('cardTts', '发音') }}</div>
      <div class="voice-row">
        <label class="voice-label" for="voiceSelect">{{ t('labelVoice', '语音') }}</label>
        <select
          id="voiceSelect"
          v-model="ttsVoice"
          class="voice-select"
          :disabled="!voices.length && ttsVoice === ''"
          @change="updateVoice"
        >
          <option value="">{{ t('voiceAuto', '自动（推荐）') }}</option>
          <option
            v-for="v in voices"
            :key="v.voiceName"
            :value="v.voiceName"
          >
            {{ formatVoiceName(v) }}
          </option>
        </select>
        <button
          class="icon-btn"
          :data-tip="t('ariaPreview', '试听发音')"
          :aria-label="t('ariaPreview', '试听发音')"
          @click="previewAudio"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        </button>
      </div>
    </section>

    <!-- 高亮配色 -->
    <section class="card">
      <div class="card-title">{{ t('cardHighlight', '高亮') }}</div>

      <!-- 样式选择 -->
      <div class="section-subtitle">{{ t('labelHighlightStyle', '高亮样式') }}</div>
      <div class="style-selector" role="radiogroup" :aria-label="t('labelHighlightStyle', '高亮样式')">
        <button
          v-for="opt in styleOptions"
          :key="opt.id"
          type="button"
          class="style-chip"
          :class="{ active: highlightStyle === opt.id }"
          :aria-checked="highlightStyle === opt.id"
          role="radio"
          @click="updateHighlightStyle(opt.id)"
        >
          <span class="style-chip-preview" :class="'style-chip--' + opt.id">Aa</span>
          <span class="style-chip-text">{{ t(opt.labelKey, opt.defaultLabel) }}</span>
        </button>
      </div>

      <!-- 颜色预设 -->
      <div class="section-subtitle">{{ t('labelBg', '背景') }}</div>
      <div class="color-presets">
        <button
          v-for="p in presets"
          :key="p.bg"
          class="preset"
          :class="{ active: activePresetBg === p.bg }"
          :style="{ background: p.bg }"
          :title="t(p.titleKey, p.fallbackTitle)"
          @click="applyPreset(p)"
        ></button>
      </div>

      <!-- 自定义颜色 -->
      <div class="custom-row">
        <div class="custom-color-item">
          <span class="custom-label">{{ t('labelBg', '背景') }}</span>
          <div class="color-picker-wrapper" :style="{ backgroundColor: highlightBg }">
            <input
              v-model="highlightBg"
              type="color"
              class="color-picker"
              @input="handleCustomBg"
            />
          </div>
        </div>
        <div class="custom-color-item">
          <span class="custom-label">{{ t('labelText', '文字') }}</span>
          <div class="color-picker-wrapper" :style="{ backgroundColor: highlightText || '#333333' }">
            <input
              v-model="highlightText"
              type="color"
              class="color-picker"
              @input="handleCustomText"
            />
          </div>
        </div>
      </div>

      <!-- 实时预览卡片 -->
      <div class="preview-card">
        <div class="preview-badge">{{ t('previewTitle', '效果预览') }}</div>
        <div class="preview-text">
          <span>{{ previewSentenceParts[0] }}</span>
          <span class="preview-target-word" :style="previewWordStyle">{{ t('previewWord', 'vocabulary') }}</span>
          <span>{{ previewSentenceParts[1] }}</span>
        </div>
      </div>
    </section>

    <!-- 界面语言 -->
    <section class="card">
      <div class="card-title">{{ t('cardLanguage', '界面语言') }}</div>
      <div class="voice-row">
        <select
          v-model="uiLang"
          class="voice-select"
          :aria-label="t('cardLanguage', '界面语言')"
          @change="updateLanguage"
        >
          <option value="auto">{{ t('langAuto', '跟随浏览器') }}</option>
          <option value="zh_CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
    </section>

    <!-- 底部操作与帮助 -->
    <footer class="footer">
      <button class="text-btn" @click="handleReset">
        {{ t('btnReset', '恢复默认') }}
      </button>
      <button class="text-btn" type="button" @click="openTutorial">
        {{ t('btnHelp', '说明') }}
      </button>
    </footer>

    <!-- Toast 提示 -->
    <div
      v-if="toast.visible"
      class="toast-area toast-show"
      :class="{ 'toast-warn': toast.type === 'warn' }"
      role="status"
      aria-live="polite"
    >
      {{ toast.message }}
    </div>

    <!-- 确认模态框 -->
    <div v-if="confirmDialog.visible" class="dialog-area">
      <div class="dialog-card">
        <div class="dialog-text" style="white-space: pre-line;">{{ confirmDialog.message }}</div>
        <div class="dialog-actions">
          <button
            type="button"
            class="dialog-btn"
            @click="confirmDialog.resolve(false)"
          >
            {{ t('btnCancel', '取消') }}
          </button>
          <button
            type="button"
            class="dialog-btn dialog-btn-danger"
            @click="confirmDialog.resolve(true)"
          >
            {{ confirmDialog.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, reactive } from 'vue';
import { useI18n } from '../../utils/i18n';
import { toHex6, hexToRgba, toLineColor, isExtAlive } from '../../utils/storage';
import { getVoicesCached, isGoogleVoice, isEnglishVoice, voiceOrder } from '../../utils/voice';
import type { TtsVoiceLike } from '../../utils/voice';
import type { Settings, WordbookData, CheckLoginResponse, HighlightStyle } from '../../types';

const { t, setLanguage } = useI18n();

const manifestVersion = ref('1.0.1');
try {
  const ver = chrome.runtime?.getManifest?.()?.version;
  if (ver) manifestVersion.value = ver;
} catch {}

const loggedIn = ref(false);
const wordCount = ref(0);
const syncing = ref(false);
const loggingOut = ref(false);
const avatarError = ref(false);

const toggle = ref(true);
const ttsToggle = ref(true);
const autoSync = ref(true);

const ttsVoice = ref('');
const voices = ref<TtsVoiceLike[]>([]);

const highlightBg = ref('#ffe464');
const highlightText = ref('#000000');
const highlightStyle = ref<HighlightStyle>('bg');
const activePresetBg = ref('#ffe464');
const uiLang = ref<'auto' | 'zh_CN' | 'en'>('auto');

const styleOptions: Array<{ id: HighlightStyle; labelKey: string; defaultLabel: string }> = [
  { id: 'bg', labelKey: 'styleBg', defaultLabel: '背景' },
  { id: 'underline', labelKey: 'styleUnderline', defaultLabel: '下划线' },
  { id: 'wavy', labelKey: 'styleWavy', defaultLabel: '波浪线' },
  { id: 'dashed', labelKey: 'styleDashed', defaultLabel: '虚线' },
  { id: 'outline', labelKey: 'styleOutline', defaultLabel: '边框' },
];

function updateHighlightStyle(style: HighlightStyle) {
  highlightStyle.value = style;
  chrome.storage.local.set({ highlightStyle: style }, notifyActiveContent);
}

const previewSentenceParts = computed(() => {
  const sentence = t('previewSentence', '坚持积累生词 $1 提升英语阅读效率。');
  const parts = sentence.split('$1');
  return [parts[0] || '', parts[1] || ''];
});

const previewWordStyle = computed(() => {
  const bg = highlightBg.value || '#ffe464';
  const lineCol = toLineColor(bg);
  const fg = highlightText.value || 'inherit';

  switch (highlightStyle.value) {
    case 'underline':
      return {
        color: fg,
        textDecoration: `underline ${lineCol} 2px`,
        textUnderlineOffset: '3px',
        backgroundColor: 'transparent',
      };
    case 'wavy':
      return {
        color: fg,
        textDecoration: `underline wavy ${lineCol} 1.5px`,
        textUnderlineOffset: '3.5px',
        backgroundColor: 'transparent',
      };
    case 'dashed':
      return {
        color: fg,
        textDecoration: `underline dashed ${lineCol} 1.5px`,
        textUnderlineOffset: '3px',
        backgroundColor: 'transparent',
      };
    case 'outline':
      return {
        color: fg,
        border: `1.5px solid ${lineCol}`,
        borderRadius: '4px',
        padding: '1px 5px',
        backgroundColor: 'transparent',
      };
    case 'bg':
    default:
      return {
        backgroundColor: hexToRgba(bg, 0.55),
        color: fg,
        borderRadius: '3px',
        padding: '1px 5px',
      };
  }
});

const presets = [
  { bg: '#ffe464', text: '', titleKey: 'presetYellow', fallbackTitle: '黄' },
  { bg: '#9be4a4', text: '', titleKey: 'presetGreen', fallbackTitle: '绿' },
  { bg: '#f69ba4', text: '', titleKey: 'presetPink', fallbackTitle: '粉' },
  { bg: '#80b6f6', text: '', titleKey: 'presetBlue', fallbackTitle: '蓝' },
  { bg: '#ffbe72', text: '', titleKey: 'presetOrange', fallbackTitle: '橙' },
  { bg: '#c2a3f7', text: '', titleKey: 'presetPurple', fallbackTitle: '紫' },
  { bg: '#969aa0', text: '', titleKey: 'presetGray', fallbackTitle: '灰' },
];

const toast = reactive({
  visible: false,
  message: '',
  type: 'ok' as 'ok' | 'warn',
});
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string, type: 'ok' | 'warn' = 'ok') {
  toast.message = message;
  toast.type = type;
  toast.visible = true;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.visible = false;
  }, 4000);
}

const confirmDialog = reactive({
  visible: false,
  message: '',
  confirmLabel: '',
  resolve: (_result: boolean) => {},
});

function askConfirm(message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialog.message = message;
    confirmDialog.confirmLabel = confirmLabel;
    confirmDialog.resolve = (val: boolean) => {
      confirmDialog.visible = false;
      resolve(val);
    };
    confirmDialog.visible = true;
  });
}

function safeSendMessage(message: any, callback?: (res: any) => void) {
  if (!isExtAlive()) {
    callback?.(null);
    return;
  }
  try {
    if (typeof callback === 'function') {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          callback(null);
          return;
        }
        callback(res);
      });
    } else {
      chrome.runtime.sendMessage(message);
    }
  } catch {
    callback?.(null);
  }
}

function notifyActiveContent() {
  if (!isExtAlive() || !chrome.tabs) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsChanged' }).catch(() => {});
    }
  });
}

function updateToggle() {
  chrome.storage.local.set({ toggle: toggle.value }, notifyActiveContent);
}

function updateTtsToggle() {
  chrome.storage.local.set({ ttsToggle: ttsToggle.value });
}

function updateAutoSync() {
  chrome.storage.local.set({ autoSync: autoSync.value });
}

function updateVoice() {
  chrome.storage.local.set({ ttsVoice: ttsVoice.value }, previewAudio);
}

function previewAudio() {
  safeSendMessage({ type: 'tts', word: 'highlight', force: true });
}

function applyPreset(p: { bg: string; text: string }) {
  activePresetBg.value = p.bg;
  highlightBg.value = p.bg;
  highlightText.value = p.text || '#000000';
  chrome.storage.local.set(
    {
      highlightBackground: p.bg,
      highlightText: p.text,
    },
    notifyActiveContent
  );
}

function handleCustomBg() {
  activePresetBg.value = '';
  chrome.storage.local.set(
    {
      highlightBackground: highlightBg.value,
    },
    notifyActiveContent
  );
}

function handleCustomText() {
  activePresetBg.value = '';
  chrome.storage.local.set(
    {
      highlightText: highlightText.value,
    },
    notifyActiveContent
  );
}

function updateLanguage() {
  setLanguage(uiLang.value);
  chrome.storage.local.set({ uiLang: uiLang.value });
}

function handleLoginClick() {
  chrome.storage.local.set({ userLoggedOut: false });
}

async function handleLogout() {
  const ok = await askConfirm(
    t(
      'confirmLogout',
      '确认登出有道词典？\n\n· 登出后需要重新登录才能同步生词本\n· 已同步到本地的生词会保留，网页高亮继续生效'
    ),
    t('ariaLogout', '登出账号')
  );
  if (!ok) return;

  loggingOut.value = true;
  safeSendMessage({ type: 'logout' }, (msg) => {
    loggingOut.value = false;
    loggedIn.value = false;
    if (msg) showToast(msg);
  });
}

function handleSync() {
  syncing.value = true;
  safeSendMessage({ type: 'sync' }, (msg: string) => {
    syncing.value = false;
    if (msg) {
      showToast(msg, /^⚠️/.test(msg) ? 'warn' : 'ok');
      chrome.storage.local.get(['newWords', 'loggedIn'], (r: any) => {
        loggedIn.value = !!r.loggedIn;
        const stored = r.newWords as WordbookData | undefined;
        wordCount.value = stored?.wordInfos ? Object.keys(stored.wordInfos).length : 0;
      });
    }
    notifyActiveContent();
  });
}

async function handleReset() {
  const ok = await askConfirm(t('confirmReset', '确认恢复默认设置？'), t('btnReset', '恢复默认'));
  if (!ok) return;
  safeSendMessage({ type: 'resetSettings' }, () => {
    location.reload();
  });
}

function openTutorial() {
  chrome.tabs.create({ url: chrome.runtime.getURL('tutorial.html') }, () => {
    if (!chrome.runtime.lastError) window.close();
  });
}

function formatVoiceName(v: TtsVoiceLike): string {
  const shortName = (v.voiceName || '').replace(/^Google\s+/i, '');
  return v.lang ? `${shortName}（${v.lang}）` : shortName;
}

const KNOWN_LOGIN_COOKIES = [
  'DICT_SESS', 'OUTFOX_CNR_MEMBER_LOGIN', 'OUTFOX_CNR_MEMBER',
  'USER_ID', 'P_INFO', 'YNOTE_SESS', 'JSESSIONID', 'yd_tm_task',
];
const LOGIN_COOKIE_RE = /sess|uid|user|token|auth|login|member|pfr|qa/i;

async function detectLoginByCookie(): Promise<boolean> {
  if (!chrome.cookies || !chrome.cookies.getAll) return false;
  const sources = ['https://www.youdao.com/', 'https://youdao.com/'];
  for (const url of sources) {
    try {
      const cookies = await new Promise<chrome.cookies.Cookie[]>((res) => {
        chrome.cookies.getAll({ url }, (cs) => {
          if (chrome.runtime.lastError) res([]);
          else res(cs || []);
        });
      });
      if (cookies.some((c) => KNOWN_LOGIN_COOKIES.includes(c.name) || LOGIN_COOKIE_RE.test(c.name))) {
        return true;
      }
    } catch {}
  }
  return false;
}

function checkLogin(callback: (loggedIn: boolean) => void) {
  chrome.storage.local.get(['loggedIn', 'userLoggedOut'], (s: any) => {
    if (s.loggedIn) {
      callback(true);
      return;
    }
    if (s.userLoggedOut) {
      callback(false);
      return;
    }
    detectLoginByCookie().then(callback);
  });
}

async function loadVoices() {
  const SYSTEM_VOICE_LIMIT = 10;
  const list = await getVoicesCached();
  const englishVoices = list.filter((v) => isEnglishVoice(v) && v.voiceName).sort(voiceOrder);

  const googleEn = englishVoices.filter(isGoogleVoice);
  const sysEn = englishVoices.filter((v) => !isGoogleVoice(v)).slice(0, SYSTEM_VOICE_LIMIT);
  voices.value = [...googleEn, ...sysEn];

  chrome.storage.local.get(['ttsVoice'], (r: any) => {
    if (r.ttsVoice && voices.value.some((v) => v.voiceName === r.ttsVoice)) {
      ttsVoice.value = r.ttsVoice;
    }
  });
}

onMounted(() => {
  chrome.storage.local.get(
    [
      'toggle', 'ttsToggle', 'autoSync', 'newWords', 'loggedIn', 'userLoggedOut',
      'highlightBackground', 'highlightText', 'highlightStyle', 'uiLang', 'ttsVoice'
    ],
    (result: any) => {
      if (result.uiLang) {
        uiLang.value = result.uiLang;
        setLanguage(result.uiLang);
      }
      toggle.value = result.toggle !== false;
      ttsToggle.value = result.ttsToggle !== false;
      autoSync.value = result.autoSync !== false;

      if (result.highlightStyle) {
        highlightStyle.value = result.highlightStyle;
      }

      const savedBg = toHex6(result.highlightBackground || '#ffe464');
      highlightBg.value = savedBg;
      activePresetBg.value = savedBg;
      if (result.highlightText) {
        highlightText.value = result.highlightText;
      }

      const storedWords = result.newWords as WordbookData | undefined;
      wordCount.value = storedWords?.wordInfos ? Object.keys(storedWords.wordInfos).length : 0;

      checkLogin((isLoggedIn) => {
        loggedIn.value = isLoggedIn;
      });

      if (!result.userLoggedOut) {
        safeSendMessage({ type: 'checkLogin' }, (r: CheckLoginResponse | null) => {
          if (!r || typeof r.ok !== 'boolean') return;
          if (r.ok) {
            loggedIn.value = true;
          } else {
            loggedIn.value = false;
            chrome.storage.local.set({ loggedIn: false });
          }
        });
      }

      loadVoices();
    }
  );
});
</script>
