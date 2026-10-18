import { describe, it, expect } from 'vitest';
import { WordMatcher, normalizePossessive } from '../utils/word-matcher';
import { toHex6, hexToRgba, cacheEntry } from '../utils/storage';
import { isGoogleVoice, isEnglishVoice, resolveVoice, voiceOrder } from '../utils/voice';
import { t, setLanguage, resolveEffectiveLocale } from '../utils/i18n';
import { detectLan, interpretYoudao, extractFromNuxt } from '../utils/youdao-api';

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
