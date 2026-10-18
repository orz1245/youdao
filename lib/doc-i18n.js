/**
 * 说明页 / 隐私页的双语文案运行时
 *
 * 这两页是长文，翻译直接以「中英成对」的形式写在 HTML 里：
 *   <span class="i18n-zh">中文</span><span class="i18n-en">English</span>
 * 本文件只做两件事：
 *   1) 按当前语言（lib/i18n.js 解析的 uiLang，默认跟随浏览器）给 <html> 打 data-lang，
 *      CSS 据此显示对应语言的那一份；
 *   2) 接管页头的语言开关，切换后写进同一个设置 —— 和弹窗、网页高亮用的是同一份语言。
 *
 * 语言没切换时（脚本没跑、JS 被禁用）CSS 默认显示中文，页面仍然可读。
 */
(function () {
  'use strict';

  const HTML_LANG = { zh_CN: 'zh-CN', en: 'en' };

  function currentLocale() {
    if (globalThis.YHI18n && YHI18n.getLocale) {
      const loc = YHI18n.getLocale();
      if (loc) return loc;
    }
    return 'zh_CN';
  }

  function apply() {
    const locale = currentLocale();
    const root = document.documentElement;
    if (root) root.setAttribute('data-lang', HTML_LANG[locale] || HTML_LANG.zh_CN);

    document.querySelectorAll('[data-lang-set]').forEach((btn) => {
      const active = btn.getAttribute('data-lang-set') === locale;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('active', active);
    });
  }

  function applyVersion() {
    let ver = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function') {
        const m = chrome.runtime.getManifest();
        if (m && m.version) ver = m.version;
      }
    } catch (_) {}

    if (ver) {
      document.querySelectorAll('.app-version, [data-app-version]').forEach((el) => {
        el.textContent = ver;
      });
    }
  }

  function setup() {
    document.querySelectorAll('[data-lang-set]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-lang-set');
        if (globalThis.YHI18n && YHI18n.setLanguage) YHI18n.setLanguage(value, { persist: true });
        apply();
      });
    });

    apply();
    applyVersion();
    // 弹窗里改了语言、storage 又变化时，这里跟着切；ready 兜住「storage 比脚本慢」的情况
    if (globalThis.YHI18n && YHI18n.onChange) YHI18n.onChange(apply);
    if (globalThis.YHI18n && YHI18n.ready && YHI18n.ready.then) YHI18n.ready.then(apply);
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.__YHI18nDoc = { currentLocale, apply, applyVersion, setup };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
