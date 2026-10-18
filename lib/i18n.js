/**
 * i18n 运行时（popup / content script / 说明页 / service worker 共用）
 *
 * 为什么不用 __MSG_x__ 或 chrome.i18n.getMessage：
 *   1) 浏览器只在 manifest.json（和 CSS）里替换 __MSG_x__，HTML 里写了会原样显示，
 *      弹窗就会看到一片 __MSG_cardDict__；
 *   2) chrome.i18n.getMessage 只能跟随浏览器语言，没法让用户在扩展里自选语言。
 * 所以文案从 lib/i18n-messages.js（由 _locales/<locale>/messages.json 生成）里同步读取，
 * 语言 = 用户设置 uiLang；uiLang 为 auto 时按浏览器语言推断（zh* → zh_CN，其余 → en）。
 *
 * 约定：**fallback 一律写中文原文**（与 zh_CN 语言包逐字一致）。
 * 语言包缺 key、脚本没加载、单测环境里没有 chrome 时，界面都会退回中文原文，
 * 永远不会出现空白或裸 key —— tests/i18n.test.mjs 会逐条校验这个约定。
 */
(function () {
  'use strict';

  const SETTING_KEY = 'uiLang';
  const AUTO = 'auto';
  const DEFAULT_LOCALE = 'zh_CN';
  const BCP47 = { zh_CN: 'zh-CN', en: 'en' };

  /** 由 lib/i18n-messages.js 注入；没加载时退化为「全部走 fallback」 */
  const TABLES = (() => {
    const data = (typeof globalThis !== 'undefined' && globalThis.YHI18N_MESSAGES) || null;
    if (!data || typeof data !== 'object') return {};
    const out = {};
    for (const locale of Object.keys(data)) {
      if (data[locale] && typeof data[locale] === 'object') out[locale] = data[locale];
    }
    return out;
  })();
  const LOCALES = Object.keys(TABLES);

  let setting = AUTO;              // 用户设置：auto | 语言目录名
  let locale = DEFAULT_LOCALE;     // 解析后的实际语言
  const listeners = new Set();

  // ===== 语言推断 =====
  /** 'zh-CN' / 'zh_TW' / 'en-US' → 语言包目录名；匹配不到返回 null */
  function matchLocale(tag) {
    if (!tag) return null;
    const want = String(tag).replace(/_/g, '-').toLowerCase();
    if (!want) return null;
    const primary = want.split('-')[0];
    let similar = null;
    for (const loc of LOCALES) {
      const norm = loc.replace(/_/g, '-').toLowerCase();
      if (norm === want) return loc;                                    // 完全一致：zh-CN
      if (!similar && norm.split('-')[0] === primary) similar = loc;    // 同语系：zh-TW → zh_CN
    }
    return similar;
  }

  function browserLanguage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getUILanguage) {
        const tag = chrome.i18n.getUILanguage();   // 同步 API，无需回调
        if (tag) return tag;
      }
    } catch (_) { /* 忽略：继续用 navigator */ }
    try {
      if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    } catch (_) { /* 忽略：返回空串 */ }
    return '';
  }

  function resolveLocale() {
    if (setting && setting !== AUTO) {
      const picked = matchLocale(setting);
      if (picked) return picked;
    }
    // 浏览器语言不在语言包里时优先英文：非中英用户读英文比读中文更可能看懂
    return matchLocale(browserLanguage()) || (TABLES.en ? 'en' : DEFAULT_LOCALE);
  }

  // ===== 文案 =====
  function insertSubs(text, subs) {
    const list = Array.isArray(subs) ? subs : (subs == null ? [] : [subs]);
    if (!list.length) return String(text);
    return String(text).replace(/\$(\d+)/g, (match, idx) => {
      const i = Number(idx) - 1;
      return (i >= 0 && i < list.length) ? String(list[i]) : match;
    });
  }

  function lookup(key) {
    const table = TABLES[locale];
    const msg = table && table[key];
    return typeof msg === 'string' && msg ? msg : null;
  }

  /**
   * @param {string} key 语言包 key
   * @param {string} fallback 中文兜底文案（与 zh_CN 语言包一致）
   * @param {string[]|string} [subs] 位置参数，替换文案里的 $1/$2
   * @returns {string}
   */
  function t(key, fallback, subs) {
    return insertSubs(lookup(key) || fallback || key, subs);
  }

  // ===== 扩展页面里的静态文案 =====
  // 约定：HTML 里直接写默认（中文）文案，再挂 data-i18n 等属性做替换，
  // 这样脚本没跑起来时也不会出现 __MSG_xxx__ 这类占位符。
  const ATTR_TARGETS = [
    ['i18nTitle', 'title'],
    ['i18nAria', 'aria-label'],
    ['i18nTip', 'data-tip'],        // popup 图标按钮的 CSS 气泡提示
    ['i18nPlaceholder', 'placeholder'],
  ];
  const I18N_SELECTOR = '[data-i18n],[data-i18n-title],[data-i18n-aria],[data-i18n-tip],[data-i18n-placeholder]';

  function isElement(node) {
    return !!(node && typeof node === 'object' && node.dataset);
  }

  /** 翻译单个元素；返回是否真的写入了文案 */
  function applyNode(el) {
    const ds = el.dataset || {};
    let changed = false;

    if (ds.i18n) {
      const msg = lookup(ds.i18n);
      if (msg) { el.textContent = msg; changed = true; }
    }
    for (const [dataKey, attr] of ATTR_TARGETS) {
      const key = ds[dataKey];
      if (!key) continue;
      const msg = lookup(key);
      if (msg && el.setAttribute) { el.setAttribute(attr, msg); changed = true; }
    }
    return changed;
  }

  /**
   * 翻译一棵子树里的静态文案。
   * 只处理显式挂了 data-i18n* 的节点 —— content script 跑在用户页面里，
   * 绝不能顺手扫页面自己的 DOM，否则会误改网页内容。
   * @returns {number} 被翻译的节点数
   */
  function apply(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelectorAll !== 'function') return 0;
    let n = 0;
    if (isElement(scope) && applyNode(scope)) n++;
    scope.querySelectorAll(I18N_SELECTOR).forEach((el) => { if (applyNode(el)) n++; });
    return n;
  }

  /** 扩展页面（popup / 说明页）在 <html> 上标 data-yhi18n-page，语言变化时自动重译整页 */
  function isI18nPage() {
    try {
      const root = typeof document !== 'undefined' && document.documentElement;
      return !!(root && root.hasAttribute && root.hasAttribute('data-yhi18n-page'));
    } catch (_) { return false; }
  }

  function syncDocumentLang() {
    try {
      const root = typeof document !== 'undefined' && document.documentElement;
      if (root && root.setAttribute) root.setAttribute('lang', BCP47[locale] || locale);
    } catch (_) { /* 忽略 */ }
  }

  function refresh() {
    locale = resolveLocale();
    syncDocumentLang();
    if (isI18nPage()) apply();
    listeners.forEach((cb) => { try { cb(locale); } catch (_) { /* 单个监听器出错不影响其他 */ } });
  }

  // ===== 语言设置 =====
  /**
   * 更新当前语言。
   * @param {string} value 'auto' | 语言目录名
   * @param {{persist?: boolean}} [opts] persist=true 时写入 storage（用户在界面上切换语言）
   * @returns {string} 解析后的语言目录名
   */
  function setLanguage(value, opts) {
    const next = value === AUTO ? AUTO : (matchLocale(value) || AUTO);
    const changed = next !== setting;
    setting = next;
    if (opts && opts.persist) {
      try { chrome.storage.local.set({ [SETTING_KEY]: next }); } catch (_) { /* 忽略 */ }
    }
    if (changed) refresh();
    else { locale = resolveLocale(); syncDocumentLang(); }
    return locale;
  }

  /** 订阅语言变化（返回取消订阅函数） */
  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  // ===== 初始化 =====
  let settleReady = () => {};
  const ready = new Promise((resolve) => { settleReady = () => resolve(api); });

  function loadSetting() {
    let done = false;
    const finish = () => { if (!done) { done = true; settleReady(); } };
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { finish(); return; }
      chrome.storage.local.get([SETTING_KEY], (result) => {
        // chrome.runtime.lastError（扩展上下文失效等）时 result 为空，按 auto 处理即可
        const saved = (result && result[SETTING_KEY]) || AUTO;
        setting = saved === AUTO ? AUTO : (matchLocale(saved) || AUTO);
        refresh();
        finish();
      });
      if (chrome.storage.onChanged && chrome.storage.onChanged.addListener) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local' || !changes[SETTING_KEY]) return;
          setLanguage(changes[SETTING_KEY].newValue || AUTO);
        });
      }
    } catch (_) { finish(); }
  }

  const api = {
    t,
    apply,
    ready,
    onChange,
    setLanguage,
    getLocale: () => locale,
    getSetting: () => setting,
  };

  if (typeof globalThis !== 'undefined') globalThis.YHI18n = api;

  locale = resolveLocale();
  syncDocumentLang();
  loadSetting();
})();
