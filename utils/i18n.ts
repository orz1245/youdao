import { ref, computed } from 'vue';

export const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    addAlreadyExists: '“$1” is already in your wordbook',
    addFailNoWord: 'Add failed: empty word',
    addFailed: '⚠️ Youdao rejected the add ($1). Added locally only.',
    addNeedLogin: '⚠️ “$1” was added locally only ($2). Sign in to Youdao again.',
    addOk: 'Added “$1” to your wordbook',
    addToWordbook: 'Add “$1” to your wordbook',
    addedFallback: '$1 added',
    appDesc: 'Highlight your vocabulary words on any web page with phonetics, definitions and pronunciation. Syncs with your Youdao wordbook; select any text to add a word. Third-party tool, not affiliated with Youdao.',
    appName: 'Vocabulary Highlighter',
    ariaAdd: 'Add to wordbook',
    ariaClose: 'Close',
    ariaDelete: 'Delete',
    ariaLogout: 'Sign out',
    ariaPreview: 'Preview pronunciation',
    ariaSpeak: 'Pronounce',
    btnCancel: 'Cancel',
    btnConfirm: 'Confirm',
    btnHelp: 'Help',
    btnLogin: 'Sign in',
    btnReLogin: 'Sign in again',
    btnReset: 'Reset',
    bubbleLoading: 'Looking up…',
    cardDict: 'Dictionary',
    cardFeature: 'Features',
    cardHighlight: 'Highlight',
    cardLanguage: 'Language',
    cardTts: 'Speech',
    confirmDelete: 'Delete “$1”?',
    confirmLogout: 'Sign out of Youdao?\n\n· You will need to sign in again to sync your wordbook\n· Words already synced stay on this device and highlighting keeps working',
    confirmReset: 'Reset all settings to default?',
    defaultAccountName: 'Youdao Dictionary',
    deleteFailNoWord: 'Delete failed: no word given',
    deleteFailed: '⚠️ Youdao rejected the delete ($1). Removed locally; it may come back after the next sync.',
    deleteNeedLogin: '⚠️ Not removed on Youdao ($1), but removed locally. Sign in to Youdao again.',
    deleteOk: 'Removed “$1” from your wordbook',
    deleteRequestFailed: '⚠️ Delete request failed: $1',
    labelBg: 'Background',
    labelHighlightStyle: 'Style',
    labelText: 'Text',
    labelVoice: 'Voice',
    langAuto: 'Browser default',
    loginExpiredBanner: 'Your Youdao session has expired. Sign in again to sync your wordbook.',
    loginExpiredBannerReason: 'Your Youdao session has expired ($1). Sign in again to sync your wordbook.',
    loginHint: 'Sign in to sync your wordbook',
    logoutDone: 'Signed out of Youdao',
    noEnglishVoiceTitle: 'No English voice found; speech is unavailable. Install one in your system settings',
    noMeaning: '(no definition)',
    notLoggedIn: 'Not signed in',
    opFailed: '⚠️ Operation failed: $1',
    popupTitle: 'Vocabulary Highlighter',
    presetBlue: 'Blue',
    presetGray: 'Gray',
    presetGreen: 'Green',
    presetOrange: 'Orange',
    presetPink: 'Pink',
    presetPurple: 'Purple',
    presetYellow: 'Yellow',
    previewSentence: 'Expanding $1 will boost your reading efficiency.',
    previewTitle: 'Preview',
    previewWord: 'vocabulary',
    reasonNetworkError: 'Network error ($1)',
    reasonNotJson: 'Response was not JSON (the session may have expired and been redirected to the sign-in page)',
    reasonSyncLoginExpired: 'Session expired while syncing',
    styleBg: 'Background',
    styleDashed: 'Dashed',
    styleOutline: 'Outline',
    styleUnderline: 'Underline',
    styleWavy: 'Wavy',
    syncFailAll: 'Sync failed: none of the three strategies returned any words. Check that (1) you are signed in to Youdao in this browser and (2) your wordbook is not empty. Run __yhDebug.enable() in the extension service worker console for detailed logs.',
    syncFailNetwork: 'Network error. Check your connection and try again.',
    syncFailUnexpected: 'Sync failed with an unexpected error. Please try again.',
    syncLabel: 'Sync wordbook',
    syncLoginExpired: '⚠️ Session expired. Sign in to Youdao again and retry the sync.',
    syncOk: 'Synced: $1 words',
    syncOkDupes: 'Synced: imported $1 entries ($2 duplicates), $3 unique words in total',
    toggleAutoSync: 'Auto sync',
    toggleLabel: 'Highlight words',
    toggleTts: 'Speak on hover',
    tutorialTitle: 'Vocabulary Highlighter · Guide',
    voiceAuto: 'Auto (recommended)',
    wordbookCount: 'Wordbook: $1 words'
  },
  zh_CN: {
    addAlreadyExists: '「$1」已在生词本中',
    addFailNoWord: '添加失败：单词为空',
    addFailed: '⚠️ 有道端添加失败（$1），已仅添加到本地',
    addNeedLogin: '⚠️ 「$1」仅添加到本地（$2），请重新登录有道词典',
    addOk: '「$1」已添加到有道生词本',
    addToWordbook: '添加「$1」到有道生词本',
    addedFallback: '$1 已添加',
    appDesc: '在任意网页高亮生词并显示音标释义与发音，支持同步有道词典生词本、选中文字一键添加。第三方工具，与有道官方无关。',
    appName: '生词高亮助手',
    ariaAdd: '加入生词本',
    ariaClose: '关闭',
    ariaDelete: '删除',
    ariaLogout: '登出账号',
    ariaPreview: '试听发音',
    ariaSpeak: '发音',
    btnCancel: '取消',
    btnConfirm: '确认',
    btnHelp: '说明',
    btnLogin: '登录',
    btnReLogin: '重新登录',
    btnReset: '恢复默认',
    bubbleLoading: '查询中…',
    cardDict: '词典',
    cardFeature: '功能',
    cardHighlight: '高亮',
    cardLanguage: '界面语言',
    cardTts: '发音',
    confirmDelete: '确认删除「$1」？',
    confirmLogout: '确认登出有道词典？\n\n· 登出后需要重新登录才能同步生词本\n· 已同步到本地的生词会保留，网页高亮继续生效',
    confirmReset: '确认恢复默认设置？',
    defaultAccountName: '有道词典',
    deleteFailNoWord: '删除失败：缺少单词',
    deleteFailed: '⚠️ 有道端删除失败（$1），已从本地移除；下次同步可能重新出现',
    deleteNeedLogin: '⚠️ 有道端未删除（$1），已从本地移除，请重新登录有道词典',
    deleteOk: '「$1」已从有道生词本删除',
    deleteRequestFailed: '⚠️ 删除请求失败：$1',
    labelBg: '背景',
    labelHighlightStyle: '高亮样式',
    labelText: '文字',
    labelVoice: '语音',
    langAuto: '跟随浏览器',
    loginExpiredBanner: '有道登录已失效，请重新登录以同步生词本',
    loginExpiredBannerReason: '有道登录已失效（$1），请重新登录以同步生词本',
    loginHint: '登录后可同步生词本',
    logoutDone: '已登出有道词典',
    noEnglishVoiceTitle: '未检测到英语语音，发音不可用；请在系统设置中安装英语语音',
    noMeaning: '（暂无释义）',
    notLoggedIn: '未登录',
    opFailed: '⚠️ 操作失败：$1',
    popupTitle: '生词高亮',
    presetBlue: '蓝',
    presetGray: '灰',
    presetGreen: '绿',
    presetOrange: '橙',
    presetPink: '粉',
    presetPurple: '紫',
    presetYellow: '黄',
    previewSentence: '坚持积累生词 $1 提升英语阅读效率。',
    previewTitle: '效果预览',
    previewWord: 'vocabulary',
    reasonNetworkError: '网络错误（$1）',
    reasonNotJson: '返回非 JSON（登录可能已过期，被重定向到登录页）',
    reasonSyncLoginExpired: '同步时发现登录已失效',
    styleBg: '背景高亮',
    styleDashed: '虚线',
    styleOutline: '圆角边框',
    styleUnderline: '下划线',
    styleWavy: '波浪线',
    syncFailAll: '同步失败：三种方式均未获取到生词。请确认：①已在浏览器登录有道词典；②生词本不为空。可在扩展 Service Worker 控制台执行 __yhDebug.enable() 查看详细日志',
    syncFailNetwork: '网络错误，请检查网络后重试',
    syncFailUnexpected: '同步失败：发生未预期的错误，请重试',
    syncLabel: '同步生词本',
    syncLoginExpired: '⚠️ 登录已失效，请重新登录有道词典后再次同步',
    syncOk: '同步成功，共 $1 个生词',
    syncOkDupes: '同步成功：导入 $1 条，其中 $2 条与现有生词重复，实际共 $3 个不重复单词',
    toggleAutoSync: '自动同步',
    toggleLabel: '生词高亮',
    toggleTts: '悬浮发音',
    tutorialTitle: '生词高亮助手 · 使用说明',
    voiceAuto: '自动（推荐）',
    wordbookCount: '生词本：$1 个'
  }
};

let currentLang: string = 'auto';

export function getBrowserLang(): 'zh_CN' | 'en' {
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    if (nav.toLowerCase().startsWith('zh')) return 'zh_CN';
  } catch {}
  return 'en';
}

export function resolveEffectiveLocale(lang: string = currentLang): 'zh_CN' | 'en' {
  if (lang === 'zh_CN' || lang === 'en') return lang;
  return getBrowserLang();
}

export function setLanguage(lang: string): void {
  currentLang = lang || 'auto';
  localeRef.value = currentLang;
}

export function getLanguage(): string {
  return currentLang;
}

export function t(
  key: string,
  fallback?: string,
  subs?: (string | number)[] | string | number
): string {
  const loc = resolveEffectiveLocale(currentLang);
  const table = MESSAGES[loc] || MESSAGES.zh_CN || {};
  let text = table[key] || (MESSAGES.zh_CN && MESSAGES.zh_CN[key]) || fallback || key;
  const list = Array.isArray(subs) ? subs : (subs == null ? [] : [subs]);
  list.forEach((v, i) => {
    text = text.split('$' + (i + 1)).join(String(v));
  });
  return text;
}

// Vue 响应式状态支持
const localeRef = ref<string>('auto');

export function useI18n() {
  const currentLocale = computed(() => resolveEffectiveLocale(localeRef.value));

  const translate = (
    key: string,
    fallback?: string,
    subs?: (string | number)[] | string | number
  ) => {
    const loc = resolveEffectiveLocale(localeRef.value);
    const table = MESSAGES[loc] || MESSAGES.zh_CN || {};
    let text = table[key] || (MESSAGES.zh_CN && MESSAGES.zh_CN[key]) || fallback || key;
    const list = Array.isArray(subs) ? subs : (subs == null ? [] : [subs]);
    list.forEach((v, i) => {
      text = text.split('$' + (i + 1)).join(String(v));
    });
    return text;
  };

  return {
    locale: localeRef,
    currentLocale,
    setLanguage,
    t: translate,
  };
}

// 初始化读取 storage 中的语言设置
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  try {
    chrome.storage.local.get(['uiLang'], (res: any) => {
      if (res && res.uiLang) {
        setLanguage(String(res.uiLang));
      }
    });
    chrome.storage.onChanged.addListener((changes: any, area: string) => {
      if (area === 'local' && changes.uiLang) {
        setLanguage(String(changes.uiLang.newValue || 'auto'));
      }
    });
  } catch {}
}
