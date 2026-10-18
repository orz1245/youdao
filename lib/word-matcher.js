/**
 * 单词变体匹配引擎
 *
 * 只生成「同一个词的语法变形」（屈折变化），以及少量含义可完全预测的派生词：
 *   - 名词复数、动词三单 / 现在分词 / 过去式：通用规则
 *   - 比较级 / 最高级、-ly 副词：只对白名单形容词生成
 *   - un- 前缀、-less 后缀：只对长度够长的词生成
 *
 * 为什么要白名单：高亮工具里「错高亮」比「漏高亮」伤得多 —— 用户看到的是错误信息。
 * 原实现对每个词都套所有规则，于是 use→user、read→reader、carry→carrier、
 * over→moreover、play→display 全部会被当成变体匹配上，实际是无关的词。
 * 现在改为「有把握才生成」，代价是少匹配一小部分派生词。
 */

/**
 * 去除英语所有格撇号，归一词形：
 *   patient's  → patient      （名词所有格）
 *   patients'  → patients     （复数所有格）
 *   children's → children
 * 保留 don't / it's 等缩写（缩写不以 's 或单独 ' 结尾）。
 * 仅作用于「查询词」归一化；词典原词（canonical）不应包含这类撇号。
 * @param {string} word
 * @returns {string}
 */
function normalizePossessive(word) {
  if (!word || typeof word !== 'string') return word;
  return word.replace(/['\u2019]s$/i, '').replace(/['\u2019]$/, '');
}

/**
 * 可安全生成比较级/最高级的常见形容词。
 * 只收单音节，以及 -y / -le 结尾这类屈折规则明确的多音节形容词。
 */
const COMPARATIVE_BASES = new Set([
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
 * 刻意不收 hard / late / near / like / live / low：它们加 -ly 后是另一个词
 * （hardly、lately、nearly、likely、lively、lowly），高亮出来会误导用户。
 */
const ADVERB_BASES = new Set([
  'quick', 'slow', 'soft', 'warm', 'cold', 'cool', 'bright', 'dark', 'deep',
  'wide', 'thin', 'thick', 'clean', 'clear', 'safe', 'strong', 'weak', 'sharp',
  'smooth', 'rough', 'fresh', 'full', 'kind', 'nice', 'fine', 'close', 'broad',
  'steep', 'smart', 'tough', 'sweet', 'sour', 'bitter', 'dull', 'calm', 'proud',
  'keen', 'mild', 'brave', 'wise', 'large', 'simple', 'gentle', 'narrow', 'common',
  'quiet', 'clever', 'early', 'easy', 'happy', 'busy', 'heavy', 'angry', 'hungry',
  'lucky', 'pretty', 'funny', 'lazy', 'crazy', 'noisy', 'healthy', 'wealthy',
  'silly', 'empty', 'ready', 'ugly', 'lovely', 'friendly',
  // 派生后缀明确、-ly 含义稳定的多音节形容词
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
 * （new→news、good→goods、due→dues、custom→customs、glass→glasses）
 * 这些词本身不是动词，不会损失合法的三单匹配。
 */
const NON_PLURAL_BASES = new Set(['new', 'good', 'due', 'custom', 'glass']);

/** 生成派生词的最短词干长度：太短的词加前缀/后缀容易撞上无关词（it→unit、on→iron） */
const MIN_DERIVED_BASE_LENGTH = 4;

class WordMatcher {
  constructor() {
    /** @type {Map<string, string>} canonical -> original word (lowercase) */
    this.wordMap = new Map();
    /** @type {Set<string>} all variant forms (lowercase) */
    this.variantSet = new Set();
  }

  /**
   * 从单词列表构建匹配索引
   * @param {string[]} words - 原始单词列表
   */
  buildIndex(words) {
    this.wordMap.clear();
    this.variantSet.clear();

    for (const word of words) {
      const lower = word.toLowerCase();
      if (this.wordMap.has(lower)) continue;
      this.wordMap.set(lower, lower);

      // 生成所有变体形式
      const variants = this.generateVariants(lower);
      for (const v of variants) {
        if (!this.variantSet.has(v)) {
          this.variantSet.add(v);
          // 变体映射回原词（只记录第一个）
          if (!this.wordMap.has(v)) {
            this.wordMap.set(v, lower);
          }
        }
      }
    }
  }

  /**
   * 查询单词是否在生词本中，返回原词形式
   * @param {string} word - 待查单词
   * @returns {string|null} 原词形式或 null
   */
  lookup(word) {
    const lower = normalizePossessive(word).toLowerCase();
    return this.wordMap.get(lower) || null;
  }

  /**
   * 检查单词是否匹配
   * @param {string} word
   * @returns {boolean}
   */
  has(word) {
    const lower = normalizePossessive(word).toLowerCase();
    return this.variantSet.has(lower) || this.wordMap.has(lower);
  }

  /**
   * 获取所有已索引的原词
   * @returns {string[]}
   */
  getWords() {
    // 只返回原始词（canonical），去重
    return Array.from(new Set(this.wordMap.values()));
  }

  /**
   * 获取总变体数（含原词）
   * @returns {number}
   */
  size() {
    return this.variantSet.size;
  }

  /**
   * 生成单词的所有常见变体
   * @param {string} word - 小写原词
   * @returns {string[]} 变体列表
   */
  generateVariants(word) {
    const variants = new Set();

    // 规则1: 名词复数
    if (NON_PLURAL_BASES.has(word)) {
      // 撞词词干：不加 -s（见 NON_PLURAL_BASES）
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
      // 撞词词干：不加 -s（见 NON_PLURAL_BASES）
    } else if (this.endsWithAny(word, ['s', 'x', 'z', 'ch', 'sh', 'o'])) {
      variants.add(word + 'es');
    } else {
      variants.add(word + 's');
    }

    // 规则3: 动词现在分词
    if (word.endsWith('e')) {
      // e 结尾词两种形式都生成（make→making 去e；use→using 去e 均成立）
      variants.add(word.slice(0, -1) + 'ing');
      variants.add(word + 'ing');
    } else if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      // 辅音 + y：study -> studying（y 保留）
      variants.add(word + 'ing');
    } else {
      // 双写末尾辅音（CVC 结构）+ 不双写兜底（覆盖 visit/open 等非末音节重读词）
      const doubled = this.maybeDoubleFinal(word);
      variants.add(doubled + 'ing');
      variants.add(word + 'ing');
    }

    // 规则4: 动词过去式 / 过去分词
    if (word.endsWith('e')) {
      // 去 e：make -> made；保留 e：use -> used（两种都生成以覆盖不规则情况）
      variants.add(word.slice(0, -1) + 'd');
      variants.add(word + 'd');
    } else if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      // 辅音 + y：study -> studied（y 变 ied）
      variants.add(word.slice(0, -1) + 'ied');
      variants.add(word + 'ed');
    } else {
      const doubled = this.maybeDoubleFinal(word);
      variants.add(doubled + 'ed');
      variants.add(word + 'ed');
      // CVC 不双写兜底（如 like 无末尾辅音双写需求，但仍保证 word+ed）
    }

    // 规则5: 比较级/最高级（只对白名单形容词）
    // 通用地给每个词加 -er 会造出大量「另一个词」：use→user、read→reader、
    // carry→carrier、run→runner、win→winner……所以改为白名单。
    if (COMPARATIVE_BASES.has(word)) {
      this.addComparatives(variants, word);
    }

    // 规则6: -ly 副词（只对白名单形容词）
    // 排除 hard/late/near/like/live/low —— 它们的 -ly 形式是独立含义的词。
    if (ADVERB_BASES.has(word)) {
      this.addAdverb(variants, word);
    }

    // 规则7: 派生前缀/后缀（含义可预测，且词干要够长）
    // 只保留 un- 与 -less。原实现还有 dis-/in-/im-/ir-/il-/non-，
    // 但它们的撞词率太高：cover→discover、play→display、form→inform、
    // on→iron、age→image —— 都是含义无关的词，不该当成变体。
    if (word.length >= MIN_DERIVED_BASE_LENGTH) {
      variants.add('un' + word);
      variants.add(word + 'less');
    }

    return Array.from(variants);
  }

  /**
   * 生成白名单形容词的比较级/最高级。
   * 白名单本身已经保证了词性，这里只需处理拼写规则；
   * 顺手生成的不规范拼写（big→biger）不会是真实单词，不会造成误高亮。
   * @param {Set<string>} variants
   * @param {string} word 小写原词
   */
  addComparatives(variants, word) {
    if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      // happy → happier / happiest
      variants.add(word.slice(0, -1) + 'ier');
      variants.add(word.slice(0, -1) + 'iest');
    } else if (word.endsWith('e')) {
      // large → larger / largest
      variants.add(word + 'r');
      variants.add(word + 'st');
    } else {
      variants.add(word + 'er');
      variants.add(word + 'est');
    }
    // 单音节 CVC 双写：big → bigger / biggest
    const doubled = this.maybeDoubleFinal(word);
    if (doubled !== word) {
      variants.add(doubled + 'er');
      variants.add(doubled + 'est');
    }
  }

  /**
   * 生成白名单形容词的 -ly 副词。
   * @param {Set<string>} variants
   * @param {string} word 小写原词
   */
  addAdverb(variants, word) {
    if (word.endsWith('y') && this.isConsonant(word[word.length - 2])) {
      variants.add(word.slice(0, -1) + 'ily');     // happy → happily
    } else if (word.endsWith('le')) {
      variants.add(word.slice(0, -1) + 'y');       // simple → simply
    } else if (word.endsWith('ll')) {
      variants.add(word + 'y');                    // full → fully
    } else if (word.endsWith('ic')) {
      variants.add(word + 'ally');                 // basic → basically
    } else {
      variants.add(word + 'ly');                   // quick → quickly、real → really
    }
  }

  /** 辅助：检查是否以任一结尾结尾 */
  endsWithAny(word, suffixes) {
    for (const s of suffixes) {
      if (word.endsWith(s)) return true;
    }
    return false;
  }

  /** 辅助：是否为辅音字母 */
  isConsonant(ch) {
    return /[bcdfghjklmnpqrstvwxyz]/.test(ch);
  }

  /** 辅助：判断是否可能需要双写末尾辅音（CVC 结构且非 w/x/y 结尾） */
  isShortAdjective(word) {
    if (word.length < 3) return true;
    const last = word[word.length - 1];
    const prev = word[word.length - 2];
    return this.isConsonant(last)
      && !this.isConsonant(prev)
      && !['w', 'x', 'y'].includes(last);
  }

  /** 辅助：可能双写末尾字母（严格 CVC：倒数第 3 位必须为辅音，排除 read/wait 等双元音词） */
  maybeDoubleFinal(word) {
    if (word.length < 3) return word;
    const last = word[word.length - 1];
    const prev = word[word.length - 2];
    const prev2 = word[word.length - 3];

    // CVC 结构，末尾是单个辅音，且不是 w/x/y
    if (this.isConsonant(last)
        && !this.isConsonant(prev)
        && this.isConsonant(prev2)
        && !['w', 'x', 'y'].includes(last)) {
      return word + last;
    }
    return word;
  }
}

// 导出供 content script 使用
if (typeof globalThis !== 'undefined') {
  globalThis.WordMatcher = WordMatcher;
  WordMatcher.normalizePossessive = normalizePossessive;
}
