import { describe, it, expect } from 'vitest';
import { WordMatcher, normalizePossessive } from '../utils/word-matcher';
import { toHex6, hexToRgba, cacheEntry, toLineColor } from '../utils/storage';
import { isGoogleVoice, isEnglishVoice, resolveVoice, voiceOrder } from '../utils/voice';
import { t, setLanguage, resolveEffectiveLocale } from '../utils/i18n';
import {
  detectLan,
  interpretYoudao,
  extractFromNuxt,
  isLoginCookie,
  checkLoginServer,
  YOUDAO_ACCOUNT_URL,
  YOUDAO_WORDLIST_URL,
} from '../utils/youdao-api';
import { isExcludedElement, isHighlightableTextNode } from '../utils/dom-filter';

describe('WordMatcher (TypeScript)', () => {
  it('normalizes possessives correctly', () => {
    expect(normalizePossessive("patient's")).toBe('patient');
    expect(normalizePossessive('patients’')).toBe('patients');
    expect(normalizePossessive("children's")).toBe('children');
    expect(normalizePossessive("don't")).toBe("don't");
  });

  it('generates grammatical variants and indexes canonical words', () => {
    const matcher = new WordMatcher();
    matcher.buildIndex(['apple', 'study', 'make', 'happy', 'quick']);

    expect(matcher.has('apple')).toBe(true);
    expect(matcher.has('apples')).toBe(true);
    expect(matcher.lookup('apples')).toBe('apple');

    expect(matcher.has('study')).toBe(true);
    expect(matcher.has('studies')).toBe(true);
    expect(matcher.has('studying')).toBe(true);
    expect(matcher.has('studied')).toBe(true);
    expect(matcher.lookup('studied')).toBe('study');

    expect(matcher.has('happier')).toBe(true);
    expect(matcher.has('happiest')).toBe(true);
    expect(matcher.has('happily')).toBe(true);
    expect(matcher.lookup('happier')).toBe('happy');

    expect(matcher.has('quickly')).toBe(true);
    expect(matcher.lookup('quickly')).toBe('quick');
  });

  it('prevents collision on non-plural bases', () => {
    const matcher = new WordMatcher();
    matcher.buildIndex(['new', 'good']);
    expect(matcher.has('news')).toBe(false);
    expect(matcher.has('goods')).toBe(false);
  });
});

describe('Storage and Color Utilities', () => {
  it('converts colors to hex6 and rgba', () => {
    expect(toHex6('#ffe464')).toBe('#ffe464');
    expect(toHex6('rgba(255, 228, 100, 0.55)')).toBe('#ffe464');
    expect(hexToRgba('#ffe464', 0.55)).toBe('rgba(255, 228, 100, 0.55)');
  });

  it('maps background presets and custom colors to high-contrast line colors', () => {
    expect(toLineColor('#ffe464')).toBe('#d97706');
    expect(toLineColor('#9be4a4')).toBe('#16a34a');
    expect(toLineColor('#f69ba4')).toBe('#e11d48');
    expect(toLineColor('#80b6f6')).toBe('#2563eb');
    expect(toLineColor('#ffbe72')).toBe('#ea580c');
    expect(toLineColor('#c2a3f7')).toBe('#9333ea');
    expect(toLineColor('#969aa0')).toBe('#4b5563');

    // 过亮自定义颜色自动调暗保证可读性
    expect(toLineColor('#ffffff')).toBe('#a6a6a6');
    // 深色自定义颜色保持原色
    expect(toLineColor('#1e293b')).toBe('#1e293b');
  });

  it('parses cache entries correctly', () => {
    expect(cacheEntry('definition')).toEqual({ trans: 'definition', at: 0 });
    expect(cacheEntry({ trans: 'meaning', at: 12345 })).toEqual({ trans: 'meaning', at: 12345 });
    expect(cacheEntry(null)).toBeNull();
  });
});

describe('Voice Selection Policy', () => {
  it('identifies Google and English voices', () => {
    expect(isGoogleVoice({ voiceName: 'Google US English' })).toBe(true);
    expect(isGoogleVoice({ voiceName: 'Microsoft David' })).toBe(false);
    expect(isEnglishVoice({ lang: 'en-US' })).toBe(true);
    expect(isEnglishVoice({ lang: 'zh-CN' })).toBe(false);
  });

  it('resolves Google voice preferred over local voice', () => {
    const voices = [
      { voiceName: 'Microsoft David', lang: 'en-US', remote: false },
      { voiceName: 'Google US English', lang: 'en-US', remote: true },
    ];
    expect(resolveVoice(voices)).toBe('Google US English');
  });

  it('sorts Google voices before system voices', () => {
    const v1 = { voiceName: 'Google US English', lang: 'en-US' };
    const v2 = { voiceName: 'Samantha', lang: 'en-US' };
    expect(voiceOrder(v1, v2)).toBeLessThan(0);
    expect(voiceOrder(v2, v1)).toBeGreaterThan(0);
  });
});

describe('i18n Utilities', () => {
  it('translates strings with placeholders for both locales', () => {
    setLanguage('zh_CN');
    expect(t('addOk', '添加成功', ['test'])).toBe('「test」已添加到有道生词本');

    setLanguage('en');
    expect(t('addOk', 'Added', ['test'])).toBe('Added “test” to your wordbook');
  });

  it('translates highlight styles correctly', () => {
    setLanguage('zh_CN');
    expect(t('styleBg')).toBe('背景高亮');
    expect(t('styleUnderline')).toBe('下划线');
    expect(t('styleWavy')).toBe('波浪线');
    expect(t('styleDashed')).toBe('虚线');
    expect(t('styleOutline')).toBe('圆角边框');

    setLanguage('en');
    expect(t('styleBg')).toBe('Background');
    expect(t('styleUnderline')).toBe('Underline');
    expect(t('styleWavy')).toBe('Wavy');
    expect(t('styleDashed')).toBe('Dashed');
    expect(t('styleOutline')).toBe('Outline');
  });
});

describe('Youdao API Parsing', () => {
  it('detects language correctly', () => {
    expect(detectLan('hello')).toBe('en');
    expect(detectLan('こんにちは')).toBe('ja');
    expect(detectLan('안녕하세요')).toBe('ko');
    expect(detectLan('你好')).toBe('zh');
  });

  it('interprets API responses correctly', () => {
    expect(interpretYoudao({ code: 0 }).ok).toBe(true);
    expect(interpretYoudao({ errorCode: 0 }).ok).toBe(true);
    const failRes = interpretYoudao({ code: -1, msg: 'login required' });
    expect(failRes.ok).toBe(false);
    expect(failRes.needLogin).toBe(true);
  });

  it('extracts word list from Nuxt SSR payload', () => {
    const mockHtml = `
      <html>
        <script>window.__NUXT__ = { data: [{ "wordList": [{"word": "abandon", "phonetic": "əˈbændən", "trans": "v. 放弃"}] }] };</script>
      </html>
    `;
    const words = extractFromNuxt(mockHtml);
    expect(words.length).toBe(1);
    expect(words[0]?.word).toBe('abandon');
    expect(words[0]?.trans).toBe('v. 放弃');
  });
});

describe('Youdao Login Authentication & Verification', () => {
  it('correctly filters login cookies and rejects tracking visitor cookies', () => {
    // Visitor cookies must NEVER be recognized as login
    expect(isLoginCookie({ name: 'OUTFOX_SEARCH_USER_ID', value: '1226147805@10.104.133.62' })).toBe(false);
    expect(isLoginCookie({ name: 'OUTFOX_SEARCH_USER_ID_NCOO', value: '123456789' })).toBe(false);
    expect(isLoginCookie({ name: 'JSESSIONID', value: 'abc123session' })).toBe(false);
    expect(isLoginCookie({ name: 'yd_tm_task', value: 'task_001' })).toBe(false);
    expect(isLoginCookie({ name: '___rl__test__cookies', value: '1730000000' })).toBe(false);
    expect(isLoginCookie({ name: 'i18n_redirected', value: 'zh' })).toBe(false);

    // Verified session cookies must be recognized as login
    expect(isLoginCookie({ name: 'DICT_SESS', value: 'v2|sample-session-token' })).toBe(true);
    expect(isLoginCookie({ name: 'DICT_LOGIN', value: '1||1730000000' })).toBe(true);
    expect(isLoginCookie({ name: 'DICT_PERS', value: 'v2|weixin||sample' })).toBe(true);
    expect(isLoginCookie({ name: 'YNOTE_SESS', value: 'sample-ynote-token' })).toBe(true);
    expect(isLoginCookie({ name: 'YNOTE_LOGIN', value: '3||sample' })).toBe(true);
    expect(isLoginCookie({ name: 'OUTFOX_CNR_MEMBER_LOGIN', value: 'member-login-token' })).toBe(true);
    expect(isLoginCookie({ name: 'OUTFOX_CNR_MEMBER', value: 'true' })).toBe(true);
    expect(isLoginCookie({ name: 'USER_ID', value: 'my_netease_id' })).toBe(true);
    expect(isLoginCookie({ name: 'S_INFO', value: 'sample-sinfo' })).toBe(true);
    expect(isLoginCookie({ name: 'NTES_SESS', value: 'sample-ntes-sess' })).toBe(true);

    // P_INFO NetEase passport cookie
    expect(isLoginCookie({ name: 'P_INFO', value: 'testuser@163.com|1730000000|0|' })).toBe(true);
    expect(isLoginCookie({ name: 'P_INFO', value: '||' })).toBe(false);
    expect(isLoginCookie({ name: 'P_INFO', value: '' })).toBe(false);
    expect(isLoginCookie(null)).toBe(false);
  });

  it('determines login status via server endpoint accurately', async () => {
    const originalFetch = globalThis.fetch;
    const originalChrome = (globalThis as any).chrome;

    try {
      // 1. When no login cookies exist in browser -> returns not logged in
      (globalThis as any).chrome = {
        cookies: {
          getAll: (_details: any, cb: any) => cb([]),
        },
      };

      const unauthResult = await checkLoginServer();
      expect(unauthResult.ok).toBe(false);
      expect(unauthResult.loggedIn).toBe(false);
      expect(unauthResult.needLogin).toBe(true);

      // 2. When valid login cookies exist and page is normal -> returns logged in
      (globalThis as any).chrome = {
        cookies: {
          getAll: (_details: any, cb: any) => cb([{ name: 'DICT_SESS', value: 'valid-sess' }]),
        },
      };

      globalThis.fetch = (async (url: any) => {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><script>window.__NUXT__={};</script></html>',
        };
      }) as any;

      const authResult = await checkLoginServer();
      expect(authResult.ok).toBe(true);
      expect(authResult.loggedIn).toBe(true);
      expect(authResult.needLogin).toBe(false);

      // 3. When login cookies exist but page is redirected to passport login page (no __NUXT__)
      globalThis.fetch = (async (url: any) => {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body><a href="https://reg.163.com/login">请登录</a></body></html>',
        };
      }) as any;

      const expiredResult = await checkLoginServer();
      expect(expiredResult.ok).toBe(false);
      expect(expiredResult.loggedIn).toBe(false);
      expect(expiredResult.needLogin).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).chrome = originalChrome;
    }
  });
});

describe('Main Content Filter (DOM Filter)', () => {
  function createMockElement(opts: {
    tag: string;
    role?: string;
    className?: string;
    isContentEditable?: boolean;
    parent?: any;
    closestResult?: any;
  }): any {
    const classes = (opts.className || '').split(/\s+/).filter(Boolean);
    const el: any = {
      nodeType: 1,
      tagName: opts.tag.toUpperCase(),
      className: opts.className || '',
      isContentEditable: !!opts.isContentEditable,
      classList: {
        contains: (cls: string) => classes.includes(cls),
      },
      getAttribute: (attr: string) => (attr === 'role' ? opts.role || null : null),
      parentElement: opts.parent || null,
      closest: (sel: string) => {
        if (opts.closestResult !== undefined) return opts.closestResult;
        if (opts.parent && opts.parent.closest) return opts.parent.closest(sel);
        return null;
      },
    };
    return el;
  }

  function createMockTextNode(text: string, parent: any): any {
    return {
      nodeType: 3,
      textContent: text,
      parentElement: parent,
    };
  }

  it('excludes navigation, headers, footers, sidebars, buttons and code blocks', () => {
    expect(isExcludedElement(createMockElement({ tag: 'nav' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'footer' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'aside' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'button' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'pre' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'code' }))).toBe(true);

    // ARIA roles
    expect(isExcludedElement(createMockElement({ tag: 'div', role: 'navigation' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'div', role: 'banner' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'div', role: 'contentinfo' }))).toBe(true);

    // Class name patterns
    expect(isExcludedElement(createMockElement({ tag: 'div', className: 'main-navbar' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'div', className: 'sidebar-widget' }))).toBe(true);
    expect(isExcludedElement(createMockElement({ tag: 'div', className: 'ad-banner' }))).toBe(true);

    // Content containers are NOT excluded
    expect(isExcludedElement(createMockElement({ tag: 'article' }))).toBe(false);
    expect(isExcludedElement(createMockElement({ tag: 'main' }))).toBe(false);
    expect(isExcludedElement(createMockElement({ tag: 'p' }))).toBe(false);
    expect(isExcludedElement(createMockElement({ tag: 'div', className: 'article-content' }))).toBe(false);
  });

  it('accepts body text paragraphs and rejects isolated UI strings', () => {
    const pEl = createMockElement({ tag: 'p' });
    const paragraphText = createMockTextNode('Consistent reading improves vocabulary comprehension.', pEl);
    expect(isHighlightableTextNode(paragraphText)).toBe(true);

    // Heading in content
    const h2El = createMockElement({ tag: 'h2' });
    const headingText = createMockTextNode('Chapter 1: Cognitive Resilience', h2El);
    expect(isHighlightableTextNode(headingText)).toBe(true);

    // Text in button or nav is rejected
    const btnEl = createMockElement({ tag: 'button' });
    const btnText = createMockTextNode('Submit word', btnEl);
    expect(isHighlightableTextNode(btnText)).toBe(false);

    // Isolated short UI string in a generic div (e.g. "Sign in") is rejected
    const uiDiv = createMockElement({ tag: 'div' });
    const uiText = createMockTextNode('Sign in', uiDiv);
    expect(isHighlightableTextNode(uiText)).toBe(false);
  });
});
