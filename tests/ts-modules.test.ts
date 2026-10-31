import { describe, it, expect } from 'vitest';
import { WordMatcher, normalizePossessive } from '../utils/word-matcher';
import { toHex6, hexToRgba, cacheEntry, toLineColor } from '../utils/storage';
import { isGoogleVoice, isEnglishVoice, resolveVoice, voiceOrder } from '../utils/voice';
import { t, setLanguage, resolveEffectiveLocale } from '../utils/i18n';
import { detectLan, interpretYoudao, extractFromNuxt } from '../utils/youdao-api';
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
