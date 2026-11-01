/**
 * 单词变体匹配引擎 (TypeScript 版本)
 *
 * 只生成「同一个词的语法变形」（屈折变化），以及少量含义可完全预测的派生词：
 *   - 名词复数、动词三单 / 现在分词 / 过去式：通用规则
 *   - 比较级 / 最高级、-ly 副词：只对白名单形容词生成
 *   - un- 前缀、-less 后缀：只对长度够长的词生成
 */

/**
 * 去除英语所有格撇号，归一词形：
 *   patient's  → patient      （名词所有格）
 *   patients'  → patients     （复数所有格）
 *   children's → children
 * 保留 don't / it's 等缩写（缩写不以 's 或单独 ' 结尾）。
 * 仅作用于「查询词」归一化；词典原词（canonical）不应包含这类撇号。
 */
export function normalizePossessive(word: string): string {
  if (!word || typeof word !== 'string') return word;
  return word.replace(/['\u2019]s$/i, '').replace(/['\u2019]$/, '');
}

/**
 * 校验字符串是否为合规的自然语言英语单词
 * 1. 仅包含英文字母，允许合法的单词内连字符（well-known）和所有格/缩写撇号（don't, patient's）
 * 2. 拒绝驼峰/帕斯卡代码命名（如 getElementById, useState, FooBar）
 * 3. 拒绝包含下划线、数字、代码符号的字符串（如 user_id, win10, foo_bar）
 * 4. 拒绝首尾带连字符/撇号或连续连字符的非法格式
 * 5. 过滤掉长度 < 2 的单字符（避免文章中单个字母如 a/I 频繁误触发浮窗）
 * 6. 允许全大写常规缩写（如 NASA, API）与首字母大写单词（如 Apple）经后续词典校验
 */
export function isLikelyEnglishWord(rawWord: string): boolean {
  if (!rawWord || typeof rawWord !== 'string') return false;
  const word = rawWord.trim();
  if (word.length < 2 || word.length > 45) return false;

  // 含有数字、下划线、中文/日文/韩文等非英文字符直接排除
  if (/[0-9_]/.test(word)) return false;
  if (/[\u3040-\u30ff\uac00-\ud7af\u4e00-\u9fff\u3400-\u4dbf]/.test(word)) return false;

  // 首部不得为连字符或撇号；尾部不得为连字符；尾部若为撇号仅允许复数所有格（如 s'）
  if (/^[-'\u2019]|-$/.test(word)) return false;
  if (/['\u2019]$/.test(word) && !/s['\u2019]$/i.test(word)) return false;

  // 不得有连续的连字符或撇号
  if (/[-'\u2019]{2,}/.test(word)) return false;

  // 排除驼峰与多词组合帕斯卡命名（小写字母后紧跟大写字母，如 getElement, isValid, FooBar）
  if (/[a-z][A-Z]/.test(word)) return false;

  // 基础字符集合：仅允许 ASCII 英文字母、拉丁拓展字母（如 café）、撇号和连字符
  const validCharRe = /^[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'\u2019-]*$/;
  return validCharRe.test(word);
}

/**
 * 可安全生成比较级/最高级的常见形容词。
 * 只收单音节，以及 -y / -le 结尾这类屈折规则明确的多音节形容词。
 */
export const COMPARATIVE_BASES: Set<string> = new Set([
  'big', 'small', 'tall', 'short', 'long', 'high', 'low', 'deep', 'wide', 'thin',
  'thick', 'dark', 'light', 'bright', 'fast', 'slow', 'hard', 'soft', 'warm',
  'cold', 'cool', 'hot', 'dry', 'wet', 'clean', 'cheap', 'rich', 'poor', 'young',
  'old', 'new', 'safe', 'strong', 'weak', 'sharp', 'smooth', 'rough', 'fresh',
  'full', 'kind', 'nice', 'fine', 'close', 'late', 'broad', 'steep', 'smart',
  'quick', 'tough', 'sweet', 'sour', 'bitter', 'dull', 'calm', 'proud', 'keen',
  'mild', 'brave', 'wise', 'large', 'huge', 'simple', 'gentle', 'narrow', 'clever',
  'quiet', 'common', 'early', 'easy', 'happy', 'busy', 'heavy', 'angry', 'hungry',
  'lucky', 'pretty', 'funny', 'tiny', 'lazy', 'crazy', 'noisy', 'cloudy', 'rainy',
  'sunny', 'windy', 'healthy', 'wealthy', 'silly', 'empty', 'ready', 'ugly',
  'lovely', 'friendly'
]);

/**
 * 可安全生成 -ly 副词的形容词。
 * 刻意不收 hard / late / near / like / live / low：它们加 -ly 后是另一个词。
 */
export const ADVERB_BASES: Set<string> = new Set([
  'quick', 'slow', 'soft', 'warm', 'cold', 'cool', 'bright', 'dark', 'deep',
  'wide', 'thin', 'thick', 'clean', 'clear', 'safe', 'strong', 'weak', 'sharp',
  'smooth', 'rough', 'fresh', 'full', 'kind', 'nice', 'fine', 'close', 'broad',
  'steep', 'smart', 'tough', 'sweet', 'sour', 'bitter', 'dull', 'calm', 'proud',
  'keen', 'mild', 'brave', 'wise', 'large', 'simple', 'gentle', 'narrow', 'common',
  'quiet', 'clever', 'early', 'easy', 'happy', 'busy', 'heavy', 'angry', 'hungry',
  'lucky', 'pretty', 'funny', 'lazy', 'crazy', 'noisy', 'healthy', 'wealthy',
  'silly', 'empty', 'ready', 'ugly', 'lovely', 'friendly',
  'real', 'usual', 'certain', 'careful', 'useful', 'helpful', 'powerful',
  'successful', 'beautiful', 'wonderful', 'natural', 'actual', 'final', 'general',
  'normal', 'personal', 'recent', 'silent', 'different', 'important', 'sudden',
  'perfect', 'direct', 'exact', 'polite', 'patient', 'honest', 'serious', 'curious',
  'famous', 'nervous', 'obvious', 'previous', 'various', 'anxious', 'generous',
  'dangerous', 'possible', 'terrible', 'horrible', 'comfortable', 'responsible',
  'basic', 'automatic', 'energetic', 'scientific', 'physical', 'medical', 'musical',
  'practical', 'typical', 'logical', 'technical', 'political', 'economic'
]);

/**
 * 加 -s/-es 后是另一个独立单词的词干，跳过复数/三单生成。
 */
export const NON_PLURAL_BASES: Set<string> = new Set(['new', 'good', 'due', 'custom', 'glass']);

/** 生成派生词的最短词干长度 */
export const MIN_DERIVED_BASE_LENGTH = 4;

export class WordMatcher {
  /** canonical -> original word (lowercase) */
  public wordMap: Map<string, string> = new Map();
  /** all variant forms (lowercase) */
  public variantSet: Set<string> = new Set();

  /**
   * 从单词列表构建匹配索引
   * @param words 原始单词列表
   */
  buildIndex(words: string[]): void {
    this.wordMap.clear();
    this.variantSet.clear();

    for (const word of words) {
      const lower = word.toLowerCase();
      if (this.wordMap.has(lower)) continue;
      this.wordMap.set(lower, lower);

      const variants = this.generateVariants(lower);
      for (const v of variants) {
        if (!this.variantSet.has(v)) {
          this.variantSet.add(v);
          if (!this.wordMap.has(v)) {
            this.wordMap.set(v, lower);
          }
        }
      }
    }
  }

  /**
   * 查询单词是否在生词本中，返回原词形式
   * @param word 待查单词
   * @returns 原词形式或 null
   */
  lookup(word: string): string | null {
    const lower = normalizePossessive(word).toLowerCase();
    return this.wordMap.get(lower) || null;
  }

  /**
   * 检查单词是否匹配
   */
  has(word: string): boolean {
    const lower = normalizePossessive(word).toLowerCase();
    return this.variantSet.has(lower) || this.wordMap.has(lower);
  }

  /**
   * 获取所有已索引的原词
   */
  getWords(): string[] {
    return Array.from(new Set(this.wordMap.values()));
  }

  /**
   * 获取总变体数（含原词）
   */
  size(): number {
    return this.variantSet.size;
  }

  /**
   * 生成单词的所有常见变体
   * @param word 小写原词
   */
  generateVariants(word: string): string[] {
    const variants = new Set<string>();

    // 规则1: 名词复数
    if (NON_PLURAL_BASES.has(word)) {
      // 撞词词干：不加 -s
    } else if (this.endsWithAny(word, ['s', 'x', 'z', 'ch', 'sh'])) {
      variants.add(word + 'es');
      if (!word.endsWith('s')) variants.add(word + 's');
    } else if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word.slice(0, -1) + 'ies');
      variants.add(word + 's');
    } else if (word.endsWith('fe')) {
      variants.add(word.slice(0, -2) + 'ves');
      variants.add(word + 's');
    } else if (word.endsWith('f') && !word.endsWith('ff')) {
      variants.add(word.slice(0, -1) + 'ves');
      variants.add(word + 's');
    } else {
      variants.add(word + 's');
    }

    // 规则2: 动词第三人称单数
    if (NON_PLURAL_BASES.has(word)) {
      // 撞词词干：不加 -s
    } else if (this.endsWithAny(word, ['s', 'x', 'z', 'ch', 'sh', 'o'])) {
      variants.add(word + 'es');
    } else {
      variants.add(word + 's');
    }

    // 规则3: 动词现在分词
    if (word.endsWith('e')) {
      variants.add(word.slice(0, -1) + 'ing');
      variants.add(word + 'ing');
    } else if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word + 'ing');
    } else {
      const doubled = this.maybeDoubleFinal(word);
      variants.add(doubled + 'ing');
      variants.add(word + 'ing');
    }

    // 规则4: 动词过去式 / 过去分词
    if (word.endsWith('e')) {
      variants.add(word.slice(0, -1) + 'd');
      variants.add(word + 'd');
    } else if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word.slice(0, -1) + 'ied');
      variants.add(word + 'ed');
    } else {
      const doubled = this.maybeDoubleFinal(word);
      variants.add(doubled + 'ed');
      variants.add(word + 'ed');
    }

    // 规则5: 比较级/最高级（只对白名单形容词）
    if (COMPARATIVE_BASES.has(word)) {
      this.addComparatives(variants, word);
    }

    // 规则6: -ly 副词（只对白名单形容词）
    if (ADVERB_BASES.has(word)) {
      this.addAdverb(variants, word);
    }

    // 规则7: 派生前缀/后缀（含义可预测，且词干要够长）
    if (word.length >= MIN_DERIVED_BASE_LENGTH) {
      variants.add('un' + word);
      variants.add(word + 'less');
    }

    return Array.from(variants);
  }

  addComparatives(variants: Set<string>, word: string): void {
    if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word.slice(0, -1) + 'ier');
      variants.add(word.slice(0, -1) + 'iest');
    } else if (word.endsWith('e')) {
      variants.add(word + 'r');
      variants.add(word + 'st');
    } else {
      variants.add(word + 'er');
      variants.add(word + 'est');
    }
    const doubled = this.maybeDoubleFinal(word);
    if (doubled !== word) {
      variants.add(doubled + 'er');
      variants.add(doubled + 'est');
    }
  }

  addAdverb(variants: Set<string>, word: string): void {
    if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word.slice(0, -1) + 'ily');
    } else if (word.endsWith('le')) {
      variants.add(word.slice(0, -1) + 'y');
    } else if (word.endsWith('ll')) {
      variants.add(word + 'y');
    } else if (word.endsWith('ic')) {
      variants.add(word + 'ally');
    } else {
      variants.add(word + 'ly');
    }
  }

  endsWithAny(word: string, suffixes: string[]): boolean {
    for (const s of suffixes) {
      if (word.endsWith(s)) return true;
    }
    return false;
  }

  isConsonant(ch: string | undefined): boolean {
    if (!ch) return false;
    return /[bcdfghjklmnpqrstvwxyz]/i.test(ch);
  }

  isShortAdjective(word: string): boolean {
    if (word.length < 3) return true;
    const last = word[word.length - 1];
    const prev = word[word.length - 2];
    if (!last || !prev) return false;
    return this.isConsonant(last)
      && !this.isConsonant(prev)
      && !['w', 'x', 'y'].includes(last.toLowerCase());
  }

  maybeDoubleFinal(word: string): string {
    if (word.length < 3) return word;
    const last = word[word.length - 1];
    const prev = word[word.length - 2];
    const prev2 = word[word.length - 3];
    if (!last || !prev || !prev2) return word;

    if (this.isConsonant(last)
        && !this.isConsonant(prev)
        && this.isConsonant(prev2)
        && !['w', 'x', 'y'].includes(last.toLowerCase())) {
      return word + last;
    }
    return word;
  }
}
