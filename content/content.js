/**
 * Content Script - 有道生词高亮
 * 职责：页面文本扫描、单词高亮、悬浮气泡、选中添加生词
 */

(function () {
  'use strict';

  // ===== 状态 =====
  let wordMatcher = new WordMatcher();
  let wordInfos = {};       // { lowercaseWord: { word, phonetic, trans, itemId } }
  let bubbleEl = null;
  let currHighlightNode = null;
  let hideBubbleTimer = null;
  let settings = {};
  const lookupTried = new Set();   // 已查过释义的词（无论查到与否），避免反复打网络
  let lookupTarget = null;         // 当前气泡正在等释义的词
  let bubbleAction = 'delete';     // 'delete' | 'add'：当前气泡动作按钮（高亮词=删除，未高亮词=加入生词本）
  let bubbleWord = null;           // 当前气泡对应的单词（未高亮词加入生词本用）
  let loggedIn = false;            // 有道登录态：决定是否显示添加/删除生词按钮
  let pendingReLogin = false;      // 已弹出重新登录横幅，等待用户回来后校验登录是否恢复

  /** i18n 简写：见 lib/i18n.js。fallback 恒为中文原文，取不到语言包时也不会出现空白。 */
  const t = (key, fallback, subs) =>
    (globalThis.YHI18n ? YHI18n.t(key, fallback, subs) : (fallback || key));

  // ===== 调试日志 =====
  // 与 service-worker.js 共用 storage 里的 debugLog 开关（SW 控制台 __yhDebug.enable() 一键打开）。
  // 默认静默，避免在用户控制台刷屏。
  let debugLogEnabled = false;
  function logDebug(...args) {
    if (debugLogEnabled) console.log('[YH]', ...args);
  }

  // 浮层动作按钮内联 SVG 图标
  const ICON_ADD = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
  const ICON_DEL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
  let lastMouse = { x: 0, y: 0 };  // 最近一次鼠标坐标，给取不到词矩形时兜底定位浮层

  // 允许高亮的标签
  const VALID_TAGS = new Set([
    'P', 'DIV', 'SPAN', 'A', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'B', 'STRONG', 'I', 'EM', 'Q', 'CITE', 'CODE', 'PRE', 'BUTTON', 'ARTICLE',
    'SECTION', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FIGCAPTION', 'BLOCKQUOTE',
    'LABEL', 'DT', 'DD'
  ]);

  const BUBBLE_HIDE_DELAY = 260;
  // 持续悬浮超过该时长才弹出单词解释并发音（毫秒）
  const BUBBLE_HOLD_MS = 600;

  // ===== 扩展上下文有效性守卫 =====
  // 用户在 chrome://extensions 点「重新加载」后，已打开页面里的旧 content script 会与扩展失联。
  // 此时任何 chrome.* 调用都会同步抛 "Extension context invalidated."，
  // 页面控制台会随着悬浮/点击刷出一片未捕获错误（每次交互一条）。
  // 这里统一收口：所有 chrome API 调用都走 safe* 包装，一旦发现失联就静默停用页面侧能力，
  // 并且只提示一次（不刷屏）；刷新页面即可恢复。
  let extDead = false;
  let extDeadNotified = false;

  /** 上下文是否仍然有效（注意：访问 chrome.runtime.id 本身就可能抛错） */
  function isExtAlive() {
    if (extDead) return false;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) return true;
    } catch (_) { /* 落到下面统一判为失联 */ }
    markExtDead('');
    return false;
  }

  /** 是否为「扩展上下文失效」类错误（这类属于预期，不该当 bug 报给用户） */
  function isInvalidationError(err) {
    const m = (err && err.message) || String(err || '');
    return /Extension context invalidated|Receiving end does not exist|message port closed/i.test(m);
  }

  /** 失联后的静默降级：收起浮层/菜单，并只打印一次提示 */
  function markExtDead(reason) {
    if (extDead) return;
    extDead = true;
    try { hideBubble(); removeAddMenu(); cancelHover(); cancelTts(); } catch (_) { /* ignore */ }
    if (!extDeadNotified) {
      extDeadNotified = true;
      console.info('[YH] 扩展已被重新加载，本页高亮已停用；刷新页面即可恢复。', reason || '');
    }
  }

  /**
   * 安全发消息：上下文失效时静默返回，绝不把 "Extension context invalidated." 抛到页面控制台。
   * @param {object} message
   * @param {Function} [callback] 传入时，失败/上下文失效会以 null 回调
   * @returns {boolean} 是否成功投递
   */
  function safeSendMessage(message, callback) {
    if (!isExtAlive()) { if (callback) callback(null); return false; }
    try {
      if (typeof callback === 'function') {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) { callback(null); return; }
          callback(res);
        });
      } else {
        // 无回调形式返回 Promise：补一个 catch，避免未处理的 rejection
        const p = chrome.runtime.sendMessage(message);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      return true;
    } catch (err) {
      if (isInvalidationError(err)) markExtDead(err.message);
      else console.warn('[YH] 消息发送失败:', err);
      if (callback) callback(null);
      return false;
    }
  }

  /** 安全读本地设置：上下文失效时以空对象回调，调用方逻辑自然退化为「无设置」 */
  function safeStorageGet(keys, callback) {
    if (!isExtAlive()) { if (callback) callback({}); return false; }
    try { chrome.storage.local.get(keys, callback); return true; }
    catch (err) {
      if (isInvalidationError(err)) markExtDead(err.message);
      if (callback) callback({});
      return false;
    }
  }

  // ===== 初始化 =====
  function init() {
    if (!isExtAlive()) return;   // 扩展刚被重载：这枚旧的注入实例直接静默退出
    safeStorageGet([
      'toggle', 'newWords', 'highlightBackground', 'highlightText',
      'bubbleBackground', 'bubbleText', 'ttsToggle', 'loggedIn', 'userLoggedOut', 'debugLog',
      'uiLang'
    ], function (result) {
      settings = result;
      debugLogEnabled = !!result.debugLog;
      // 界面语言（popup 里的设置）先定下来，下面的横幅/气泡文案才会用对语言
      if (globalThis.YHI18n && YHI18n.setLanguage) YHI18n.setLanguage(result.uiLang || 'auto');
      // 登录态：登出标记优先；否则以同步写入的 loggedIn 为准（未同步过则视为未登录）
      loggedIn = result.userLoggedOut ? false : !!result.loggedIn;

      // 有生词本就先高亮一次（即使后续才同步，storage.onChanged / wordsUpdated 也会再触发）
      if (result.toggle !== false && result.newWords && result.newWords.wordInfos) {
        wordInfos = result.newWords.wordInfos;
        wordMatcher.buildIndex(Object.keys(wordInfos));
        doHighlight();
      }

      createBubble();
      applyStyles(result);
      setupSelectionHandler();
      setupDblClickHandler();
      // 始终监听 DOM 变化：覆盖「先打开页面、后点同步」以及 SPA / 懒加载内容
      observeDOM();

      // 登录态变化（同步成功 / 登出）实时同步，登出后立即隐藏添加/删除按钮
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.uiLang) {
          // 横幅是已插进页面的静态 DOM，语言变了得按原原因重画一次
          if (bannerReason !== null) showLoginBanner(bannerReason);
        }
        if (changes.loggedIn || changes.userLoggedOut) {
          const lo = changes.userLoggedOut ? changes.userLoggedOut.newValue : result.userLoggedOut;
          const li = changes.loggedIn ? changes.loggedIn.newValue : result.loggedIn;
          loggedIn = lo ? false : !!li;
          result.userLoggedOut = lo;
          result.loggedIn = li;
        }
      });

      // 兜底：window.load 之后再高亮一次，捕捉图片/异步渲染才出现的文本
      const rehighlight = () => { if (Object.keys(wordInfos).length) doHighlight(); };
      if (document.readyState === 'complete') {
        setTimeout(rehighlight, 400);
      } else {
        window.addEventListener('load', rehighlight);
      }
    });
  }

  // ===== 样式应用 =====
  /**
   * 只写 CSS 变量，不在 JS 里拼 CSS 文本。
   * 结构样式与默认值统一在 content.css；这样配色只有一个来源，
   * 不会再出现「同一套样式三处各写一份、透明度对不上」的漂移。
   */
  function applyStyles(s) {
    const root = document.documentElement;
    if (!root) return;
    s = s || {};

    // 关键：用户没改过的项不要写行内变量。
    // 行内样式优先级高于 content.css 里的 @media (prefers-color-scheme: dark)，
    // 若把默认值写死成行内值，深色模式就永远覆盖不上（只能靠 !important 硬顶）。
    const setOrClear = (name, value, defaultValue) => {
      if (!value || value === defaultValue) root.style.removeProperty(name);
      else root.style.setProperty(name, value);
    };

    const hlBg = s.highlightBackground || '#ffe464';
    if (hlBg === '#ffe464') {
      root.style.removeProperty('--yh-hl-bg');
      root.style.removeProperty('--yh-hl-bg-hover');
    } else {
      // 0.55 / 0.78 两档透明度与 content.css 的默认值保持一致
      root.style.setProperty('--yh-hl-bg', hexToRgba(hlBg, 0.55));
      root.style.setProperty('--yh-hl-bg-hover', hexToRgba(hlBg, 0.78));
    }

    setOrClear('--yh-hl-fg', s.highlightText, '');
    setOrClear('--yh-bubble-bg', s.bubbleBackground, '#ffffff');
    setOrClear('--yh-bubble-fg', s.bubbleText, '');

    // 指定了气泡文字色时，强制整块统一（含子元素），与重构前行为一致
    if (bubbleEl) bubbleEl.classList.toggle('yh-bubble-fg-custom', !!s.bubbleText);
  }

  // ===== 高亮核心 =====
  function doHighlight() {
    const textNodes = collectTextNodes(document.body);
    highlightNodes(textNodes);
    const n = document.querySelectorAll('.yh-highlight').length;
    if (n > 0) {
      logDebug('content: 已加载', Object.keys(wordInfos).length, '个生词，本页高亮', n, '处');
    }
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          return isHighlightableTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  /**
   * 不触碰表单和富文本编辑器：把它们的文本拆成 span 会破坏选区、撤销栈和框架状态。
   */
  function isHighlightableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const parent = node.parentElement;
    if (!parent) return false;
    const tag = parent.tagName;
    if (!tag || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'].includes(tag)) return false;
    if (parent.isContentEditable || parent.closest('[role="textbox"], .yh-bubble, .yh-highlight, .yh-toast, .yh-confirm, .yh-add-menu, .yh-login-banner')) return false;
    return VALID_TAGS.has(tag);
  }

  function highlightNodes(nodes) {
    for (const node of nodes) {
      const text = node.textContent;
      if (!text || !text.trim()) continue;

      const fragments = processText(text);
      // 仅当确实产生了高亮 span 时才替换（修复：原 <=1 判断会漏掉"整段只有一个生词"的文本节点）
      const hasHighlight = fragments.some(f => f.classList && f.classList.contains('yh-highlight'));
      if (!hasHighlight) continue;

      const parent = node.parentNode;
      if (!parent) continue;

      // 修复 a 标签内 inline 显示问题
      if (parent.tagName === 'A') {
        parent.style.display = 'inline-block';
      }

      const df = document.createDocumentFragment();
      for (const frag of fragments) {
        df.appendChild(frag);
      }
      parent.replaceChild(df, node);
    }
  }

  // ===== 高亮计数上报（批量）=====
  // 一页可能有几百个高亮命中，逐条 sendMessage 会给 SW 造成大量唤醒与消息开销。
  // 这里按「页内去重 + 防抖合并」攒成一次批量消息，Badge 语义不变（仍是本页不重复词数）。
  const pendingCounts = new Set();
  let countFlushTimer = null;

  function queueCount(canonical) {
    if (!canonical) return;
    pendingCounts.add(canonical);
    if (countFlushTimer) return;
    countFlushTimer = setTimeout(flushCounts, 150);
  }

  function flushCounts() {
    countFlushTimer = null;
    if (!pendingCounts.size) return;
    const words = Array.from(pendingCounts);
    pendingCounts.clear();
    safeSendMessage({ type: 'count', words });
  }

  /**
   * 处理一段文本，返回节点数组（单词 span / 文本节点）
   * 分词保留所有字符（含首尾空白、标点、撇号），避免内容被篡改。
   */
  function processText(text) {
    const result = [];
    // 单词（可含撇号，如 don't）+ 非单词段，二者覆盖全文，无字符丢失
    const re = /([a-zA-Z]+(?:'[a-zA-Z]+)?)|([^a-zA-Z]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1] !== undefined) {
        const rawWord = m[1];
        // 至少 2 个字母才匹配（避免 a, I 等误匹配）
        if (rawWord.length < 2) {
          result.push(document.createTextNode(rawWord));
          continue;
        }
        const canonical = wordMatcher.lookup(rawWord);
        if (canonical && wordInfos[canonical]) {
          result.push(createHighlightSpan(rawWord, canonical));
          // 上报计数（批量：见 queueCount，避免每个高亮各发一条消息）
          queueCount(canonical);
        } else {
          result.push(document.createTextNode(rawWord));
        }
      } else {
        // 非单词段（空白/标点）原样保留
        result.push(document.createTextNode(m[2]));
      }
    }
    return result;
  }

  function createHighlightSpan(displayText, canonical) {
    const span = document.createElement('span');
    span.className = 'yh-highlight';
    span.setAttribute('data-word', canonical);
    span.setAttribute('data-display', displayText);
    span.textContent = displayText;
    return span;
  }

  // ===== DOM 变化监听 =====
  /**
   * 增量高亮。关键点：不在这里同步跑 TreeWalker。
   * 富交互页面（社交/行情/聊天）每秒可能产生成百上千次 DOM 变更，
   * 同步遍历整棵子树会让页面明显卡顿；这里只把新增节点记进集合，
   * 合并到一次空闲回调里统一处理。
   *
   * 两类变更都要收：
   *   ① childList —— React 式 element.textContent = '...'（换了新 Text 节点）；
   *   ② characterData —— Vue 式 node.data / nodeValue = '...'（原地改写，只订阅 childList 会完全看不到）。
   */
  function observeDOM() {
    const pending = new Set();
    let scheduled = false;

    const flush = () => {
      scheduled = false;
      if (!pending.size) return;
      const nodes = Array.from(pending);
      pending.clear();
      for (const node of nodes) {
        // 排队期间节点可能已被移除/替换，跳过以免做无用功
        if (!node.isConnected) continue;
        try {
          if (node.nodeType === Node.TEXT_NODE) {
            // 页面把新内容原地改写进了我们注入的高亮 span 里 → 先剥离这层包裹
            // （保留页面写入的最新文本）再重新高亮，
            // 否则 span 上残留的 data-word / data-display 会与实际文本不一致。
            const target = isInsideHighlight(node) ? unwrapHighlight(node) : node;
            if (target && target.isConnected && isHighlightableTextNode(target)) highlightNodes([target]);
            continue;
          }
          const textNodes = collectTextNodes(node);
          if (textNodes.length > 0) highlightNodes(textNodes);
        } catch (e) { /* ignore */ }
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      if (typeof requestIdleCallback === 'function') {
        // timeout 兜底：页面持续繁忙时也要在 500ms 内处理，避免高亮"迟到"
        requestIdleCallback(flush, { timeout: 500 });
      } else {
        setTimeout(flush, 50);
      }
    };

    const observer = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        // ① 原地改写：Vue 等框架更新文本走的是 node.data / nodeValue（原地改内容），
        //    产生的是 characterData 变更、不是 childList。不订阅它就完全看不到 ——
        //    表现为「页面更新后旧高亮留在错误位置、新出现的生词不被高亮」。
        if (mut.type === 'characterData') {
          const t = mut.target;
          if (t && t.nodeType === Node.TEXT_NODE && t.isConnected) pending.add(t);
          continue;
        }
        if (mut.type !== 'childList') continue;
        for (const node of mut.addedNodes) {
          if (!node) continue;
          // SPA 常用 element.textContent = '...' 更新内容，只会新增 Text 节点。
          // 直接收下，避免漏掉异步渲染的单词。
          if (node.nodeType === Node.TEXT_NODE) {
            if (isHighlightableTextNode(node)) pending.add(node);
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // 自己插入的节点不回灌，否则会自我触发形成循环
          if (node.classList && (
            node.classList.contains('yh-bubble') ||
            node.classList.contains('yh-highlight') ||
            node.classList.contains('yh-add-menu') ||
            node.classList.contains('yh-login-banner') ||
            node.classList.contains('yh-toast') ||
            node.classList.contains('yh-confirm')
          )) continue;

          pending.add(node);
        }
      }
      if (pending.size) schedule();
    });

    // characterDataOldValue 显式关掉（也是默认值）：保留旧文本快照纯属浪费内存
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: false
    });
  }

  /** 该文本节点是否落在我们注入的高亮 span 里（= 页面改写了我们包裹的内容） */
  function isInsideHighlight(node) {
    const parent = node.parentElement;
    return !!(parent && parent.classList && parent.classList.contains('yh-highlight'));
  }

  /**
   * 把被我们包裹的高亮 span 还原为纯文本节点并返回它，
   * 以便按页面写入的最新内容重新走一遍高亮（是剥离、不是丢弃内容）。
   * @param {Text} node span 内的文本节点
   * @returns {Text|null}
   */
  function unwrapHighlight(node) {
    const span = node.parentElement;
    if (!span || !span.parentNode) return null;
    const textNode = document.createTextNode(span.textContent);
    span.parentNode.replaceChild(textNode, span);
    return textNode;
  }

  // ===== 页面内提示（toast）与确认框 =====
  // 不用 alert/confirm：它们会阻塞页面、样式不可控，在内容脚本里还会打断用户的阅读/操作。
  let toastEl = null;
  let toastTimer = null;

  /**
   * 右下角轻提示，自动消失。用于「已添加到生词本」这类结果回执。
   * @param {string} message
   * @param {'ok'|'warn'} [type] warn 用于远端失败但本地已生效的情况
   */
  function showToast(message, type) {
    if (!message) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'yh-toast';
      // 读屏器友好：结果提示用 polite 播报，不打断当前朗读
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.toggle('yh-toast-warn', type === 'warn');
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastTimer = null;
    if (toastEl) toastEl.style.display = 'none';
  }

  // 同时只允许一个确认框；再次调用会先把上一个按「取消」收掉
  let activeConfirm = null;

  /**
   * 页面内确认框（替代 window.confirm）。
   * @param {string} message
   * @param {string} confirmLabel
   * @param {string} [cancelLabel]
   * @returns {Promise<boolean>}
   */
  function showConfirm(message, confirmLabel, cancelLabel) {
    closeConfirm(false);

    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'yh-confirm';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');

      const text = document.createElement('div');
      text.className = 'yh-confirm-text';
      text.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'yh-confirm-actions';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'yh-confirm-btn';
      cancel.textContent = cancelLabel || t('btnCancel', '取消');

      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'yh-confirm-btn yh-confirm-btn-danger';
      ok.textContent = confirmLabel || t('btnConfirm', '确认');

      actions.appendChild(cancel);
      actions.appendChild(ok);
      el.appendChild(text);
      el.appendChild(actions);
      document.body.appendChild(el);

      // 点浮层外部 = 取消（与原生 confirm 的「不动手就是取消」一致）。
      // 监听器在关闭时立刻摘掉，不留在 document 上。
      const onOutside = (e) => {
        if (!el.contains(e.target)) finish(false);
      };

      const finish = (result) => {
        document.removeEventListener('mousedown', onOutside);
        if (activeConfirm && activeConfirm.el === el) activeConfirm = null;
        el.remove();
        resolve(result);
      };
      activeConfirm = { el, finish };

      cancel.addEventListener('click', () => finish(false));
      ok.addEventListener('click', () => finish(true));
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(false); });
      document.addEventListener('mousedown', onOutside);
      try { ok.focus(); } catch (_) { /* ignore */ }
    });
  }

  /** 以「取消」收掉当前确认框（重复调用安全） */
  function closeConfirm(result) {
    if (!activeConfirm) return;
    const { finish } = activeConfirm;
    activeConfirm = null;
    finish(result);
  }

  // ===== 气泡 =====
  function createBubble() {
    bubbleEl = document.createElement('div');
    bubbleEl.className = 'yh-bubble';
    bubbleEl.innerHTML = `
      <div class="yh-bubble-head">
        <div class="yh-bubble-head-word">
          <span class="yh-bubble-word-text"></span>
          <button class="yh-bubble-btn yh-bubble-speak" data-action="speak">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 9v6h4l5 5V4L7 9H3z"/>
              <path d="M14 7.5a5 5 0 0 1 0 9v-2.2a2.8 2.8 0 0 0 0-4.6V7.5z"/>
              <path d="M14 4.2v2.1a8 8 0 0 1 0 11.4v2.1a10 10 0 0 0 0-15.6z"/>
            </svg>
          </button>
        </div>
        <span class="yh-bubble-phonetic"></span>
        <button class="yh-bubble-btn yh-bubble-action" data-action="delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
      <div class="yh-bubble-trans"></div>
    `;
    document.body.appendChild(bubbleEl);

    // 无障碍标签走语言包；这里用 setAttribute 而不是在 innerHTML 里拼文案
    const speakBtn = bubbleEl.querySelector('.yh-bubble-speak');
    if (speakBtn) {
      const speakLabel = t('ariaSpeak', '发音');
      speakBtn.setAttribute('title', speakLabel);
      speakBtn.setAttribute('aria-label', speakLabel);
    }

    // 事件（点击统一走事件委托：按钮元素被替换后依然有效）
    bubbleEl.addEventListener('mouseenter', () => cancelHideBubble());
    bubbleEl.addEventListener('mouseleave', () => scheduleHideBubble());
    bubbleEl.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!btn || !bubbleEl.contains(btn)) return;
      if (btn.getAttribute('data-action') === 'speak') handleSpeak();
      else handleBubbleAction();
    });

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', () => { hideBubble(); cancelHover(); cancelTts(); }, { passive: true });
    document.addEventListener('mousedown', (e) => {
      if (!bubbleEl.contains(e.target)) { hideBubble(); cancelHover(); cancelTts(); }
    }, { passive: true });
  }

  // ===== 登录失效横幅 =====
  let bannerReason = null;   // 当前横幅的原因文案，语言切换时用来重画

  function showLoginBanner(reason) {
    hideLoginBanner();
    bannerReason = reason || '';
    const el = document.createElement('div');
    el.className = 'yh-login-banner';

    // 全部用 createElement + textContent 组装：
    // reason 来自后台、文案来自语言包，都不该被拼进 HTML 字符串。
    const text = document.createElement('span');
    text.className = 'yh-banner-text';
    text.textContent = reason
      ? t('loginExpiredBannerReason', '有道登录已失效（$1），请重新登录以同步生词本', [reason])
      : t('loginExpiredBanner', '有道登录已失效，请重新登录以同步生词本');

    const reloginBtn = document.createElement('button');
    reloginBtn.className = 'yh-banner-btn';
    reloginBtn.type = 'button';
    reloginBtn.textContent = t('btnReLogin', '重新登录');

    const closeBtn = document.createElement('button');
    closeBtn.className = 'yh-banner-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('ariaClose', '关闭'));
    closeBtn.textContent = '×';

    el.appendChild(text);
    el.appendChild(reloginBtn);
    el.appendChild(closeBtn);
    document.body.appendChild(el);

    // 重新登录：开登录页 + 标记待校验
    reloginBtn.addEventListener('click', () => {
      pendingReLogin = true;
      try { safeSendMessage({ type: 'openLoginPage' }); } catch (err) { /* ignore */ }
      hideLoginBanner();
    });
    closeBtn.addEventListener('click', hideLoginBanner);

    // 回到页面后自动校验登录是否恢复。
    // 注意：监听器只绑一次（bindReLoginReturnListeners），不能写在 showLoginBanner 里 ——
    // 否则每次登录失效都会再挂一对全局监听，越积越多、回归时重复发请求。
    bindReLoginReturnListeners();
  }

  let reLoginListenersBound = false;

  /** 用户回到页面（登录完成后切回）→ 校验登录是否恢复；若恢复则重新同步 */
  function onReturnFromReLogin() {
    if (!pendingReLogin) return;
    if (!isExtAlive()) return;
    safeSendMessage({ type: 'checkLogin' }, (r) => {
      if (r && r.ok) {
        pendingReLogin = false;
        // 登录已恢复 → 重新同步生词本（SW 会写回 loggedIn 并 notifyAllTabs）
        safeSendMessage({ type: 'sync' });
      }
    });
  }

  function bindReLoginReturnListeners() {
    if (reLoginListenersBound) return;
    reLoginListenersBound = true;
    window.addEventListener('focus', onReturnFromReLogin);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onReturnFromReLogin();
    });
  }

  function hideLoginBanner() {
    const old = document.querySelector('.yh-login-banner');
    if (old) old.remove();
    bannerReason = null;
  }

  // ===== 悬浮发音/解释（分离：悬浮即发音，持续悬浮 1s 才出现解释）=====
  let hoverTimer = null;       // 1s 解释定时器
  let ttsTimer = null;        // 发音定时器
  let lastSpokenWord = null;  // 防止同一词重复发音

  /**
   * 屏幕边缘守卫：指针贴近视口边界（含滚动条区域）时不取词。
   * 否则鼠标划向窗口外/滚动条时，边缘处最后一个词会误触发悬浮气泡。
   * 用 documentElement.clientWidth/Height：它们已排除滚动条宽度，
   * 因此光标落在滚动条上同样判定为「边缘」，不会取词。
   */
  const EDGE_GUARD_PX = 8;

  function isNearViewportEdge(x, y) {
    const w = document.documentElement.clientWidth || window.innerWidth || 0;
    const h = document.documentElement.clientHeight || window.innerHeight || 0;
    if (!w || !h) return false;
    return x <= EDGE_GUARD_PX || y <= EDGE_GUARD_PX ||
           x >= w - EDGE_GUARD_PX || y >= h - EDGE_GUARD_PX;
  }

  // 取词校验：英文 + 拉丁重音（café / naïve），排除中日韩字符（取词只对英文生效）
  const WORD_PICK_RE = /^[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]*$/;

  // ② 零宽字符：肉眼不可见，但不在词元字符集里，会在中间把词切断
  //   （`mail-\u200Bballot` 只能取到 `mail-`）—— 取词前一律剔除。刻意不加 /g：
  //   带 /g 的正则用 test() 会携带 lastIndex，连续调用会忽真忽假。
  const ZERO_WIDTH_RE = /[\u200B\uFEFF\u2060]/;
  // 软连字符 U+00AD：断行点的连字符，还原成真连字符（`mail\u00ADballot` → `mail-ballot`）
  const SOFT_HYPHEN = '\u00AD';

  // 段落边界：取词向外拼接到这里为止。继续往外拼会把相邻段落粘成一个假词
  // （`<p>…mail-</p><p>ballot…</p>` 本就不是一个词）。BR 虽属行内标签，但它是硬换行，
  // 同样切断词的连续性，一并算作边界。
  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
    'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
    'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT',
    'TH', 'THEAD', 'TR', 'UL'
  ]);

  /** 是否为段落边界（元素且为块级/换行标签）。注释等非元素节点返回 false —— 透明，可继续外扩 */
  function isBlockBoundary(n) {
    return n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(n.tagName);
  }

  /**
   * ③ 词形收口：取词的最后一道闸，把「不可能是完整单词」的残片判掉。
   *
   * 1) 尾部连字符（`mail-` / `data-`）：英文单词不会以 - 结尾。它只可能来自取词被段落边界
   *    截断，或页面本来就只写了半截（代码片段 `data-`）。放行的后果是查不到释义，
   *    而且浮层已进入可添加态 —— 点「+」会把 `mail-` 这种脏词条写进生词本。
   * 2) 尾部撇号（`he said 'mail-ballot'`）：词元正则会把收尾的引号一起吃进来。但
   *    **所有格撇号必须留**（`patients'` / `James'` / `boss'`），否则 normalizePossessive
   *    无从归一、生词本匹配直接失效。判据：撇号前一个字符是 s 才当所有格保留。
   * 3) 剥完引号要重判长度：`rock 'n' roll` 的词元是 `n'`，剥掉引号只剩单字母 n，同样不该查。
   *
   * @returns {string|null} 可用的词，或 null（不弹窗、不查、不写生词本）
   */
  function sanitizePickedWord(word) {
    if (!word) return null;
    if (/-$/.test(word)) return null;
    if (/'$/.test(word) && !/s'$/i.test(word)) word = word.slice(0, -1);
    return word.length >= 2 ? word : null;
  }

  /**
   * 在单调递增的 cleanToRaw 里二分：返回「原始下标 >= rawIndex 的干净下标」，
   * 即该原始位置之前保留了多少个字符。用于零宽字符被剔除后的下标换算。
   */
  function lowerBoundIndex(cleanToRaw, rawIndex) {
    let lo = 0, hi = cleanToRaw.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cleanToRaw[mid] < rawIndex) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // —— mousemove 节流 ——
  // mousemove 每秒可触发 60~120 次，且 all_frames 下每个 iframe 各挂一份；原先每次事件都要做
  // 读 clientWidth（强制 layout）→ elementFromPoint（命中测试）→ caretRangeFromPoint（文本命中，最贵）。
  // 三层收敛：
  //   ① rAF 合并：一帧最多处理一次；
  //   ② 位移阈值：与上次「真正处理」的位置相差不足 MOVE_EPSILON_PX 就丢弃（静止/微抖时零开销）；
  //   ③ 页面不可见（切到后台标签页）时完全不处理。
  // 未高亮词的取词再推迟到 600ms 定时器到期时复核一次（见 showUnhighlightBubbleAtCursor）。
  const MOVE_EPSILON_PX = 4;
  let moveRafId = 0;            // 待处理的 rAF/定时器 id（0 = 无待处理）
  let pendingMovePos = null;    // 本帧待处理的最新坐标
  let lastHandledX = NaN;       // 上次真正处理的坐标（NaN = 尚未处理过任何移动）
  let lastHandledY = NaN;

  function handleMouseMove(e) {
    // 坐标每次都记：气泡按坐标兜底定位要用（即便这一帧被节流丢弃）
    lastMouse = { x: e.clientX, y: e.clientY };
    if (document.hidden) return;
    pendingMovePos = { x: e.clientX, y: e.clientY };
    if (moveRafId) return;
    moveRafId = (typeof requestAnimationFrame === 'function')
      ? requestAnimationFrame(flushMouseMove)
      : setTimeout(flushMouseMove, 16);
  }

  function flushMouseMove() {
    moveRafId = 0;
    const pos = pendingMovePos;
    pendingMovePos = null;
    if (!pos) return;
    // lastHandledX 只在真正处理时更新，因此慢速移动会累积位移直到超过阈值，不会漏掉取词
    const dx = pos.x - lastHandledX;
    const dy = pos.y - lastHandledY;
    if (dx * dx + dy * dy < MOVE_EPSILON_PX * MOVE_EPSILON_PX) return;
    lastHandledX = pos.x;
    lastHandledY = pos.y;
    processHoverAt(pos.x, pos.y);
  }

  /** 浮层当前是否正在展示（positionBubbleRect 显式为 block；hideBubble 显式为 none） */
  function isBubbleShown() {
    return !!(bubbleEl && bubbleEl.style.display === 'block');
  }

  function processHoverAt(x, y) {
    if (!isExtAlive()) return;   // 扩展重载后静默停用，不再弹浮层/发音
    // 屏幕边缘不取词（也不会弹气泡/发音）
    if (isNearViewportEdge(x, y)) {
      cancelHover(); cancelTts(); scheduleHideBubble(); return;
    }
    const target = document.elementFromPoint(x, y);
    if (!target) { cancelHover(); scheduleHideBubble(); return; }

    // 鼠标在浮层内：保持浮层显示，且不做任何隐藏调度
    // （否则 mousemove 会持续 scheduleHideBubble，260ms 后把浮层关掉）
    if (bubbleEl && (target === bubbleEl || bubbleEl.contains(target))) {
      cancelHideBubble();
      cancelHover();
      return;
    }

    const hl = target.closest('.yh-highlight');
    if (hl) {
      cancelHideBubble();
      currHighlightNode = hl;

      // 已高亮生词：鼠标一悬浮立即发音（不等待 600ms 气泡）
      const canonical = hl.getAttribute('data-word');
      const info = wordInfos[canonical];
      if (info && info.word) speakWord(info.word);

      // 持续悬浮超过 600ms 才出现解释气泡
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        if (currHighlightNode === hl) showBubble(hl, 'hover');
      }, BUBBLE_HOLD_MS);
      return;
    }

    // —— 不在高亮词上：未高亮词也可能要弹释义浮层 ——
    // 取词（caretRangeFromPoint）是最贵的一步，只在「浮层已显示」时才即时做 ——
    // 那时必须立刻判断「切换到新词 / 收起浮层」，延迟会看得出来。
    // 其余情况（浮层没显示）一律推迟到 600ms 定时器到期时复核一次坐标，
    // 把这项开销从「每帧一次」降到「每次悬停一次」。
    if (!isBubbleShown()) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(showUnhighlightBubbleAtCursor, BUBBLE_HOLD_MS);
      return;
    }

    const w = getWordAtPoint(x, y);
    if (w && WORD_PICK_RE.test(w.word)) {
      cancelHideBubble();
      currHighlightNode = null;   // 未高亮词：删除按钮不可用

      // 归一词形：所有格撇号去除（patients' → patients，patient's → patient）
      const word = WordMatcher.normalizePossessive(w.word);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => { showUnhighlightBubble(word, w); }, BUBBLE_HOLD_MS);
      return;
    }

    // 其它位置：收起
    cancelHover(); cancelTts(); lastSpokenWord = null; scheduleHideBubble();
  }

  /**
   * 600ms 定时器到期时按最新坐标取词（节流推迟版）。
   * 定时器只在「指针 600ms 内几乎没动」时才会走到这里，
   * 因此 lastMouse 与当初悬停的位置相差不超过阈值，取词结果依然准确。
   */
  function showUnhighlightBubbleAtCursor() {
    hoverTimer = null;
    if (!isExtAlive()) return;   // 定时器可能在扩展重载之后才到期
    if (document.hidden) return;
    const { x, y } = lastMouse;
    if (isNearViewportEdge(x, y)) return;
    const w = getWordAtPoint(x, y);
    if (!w || !WORD_PICK_RE.test(w.word)) return;
    // 等待期间浮层已被别的词占用 → 让位，交给后续 mousemove 处理
    if (isBubbleShown()) return;
    currHighlightNode = null;
    showUnhighlightBubble(WordMatcher.normalizePossessive(w.word), w);
  }

  function cancelHover() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  function cancelTts() {
    clearTimeout(ttsTimer);
    ttsTimer = null;
  }

  /**
   * 显示解释气泡
   */
  function showBubble(hl, source) {
    const canonical = hl.getAttribute('data-word');
    const info = wordInfos[canonical];
    if (!info) return;
    if (!isExtAlive()) return;   // 定时器可能在扩展重载之后才到期

    currHighlightNode = hl;
    bubbleAction = 'delete';
    bubbleWord = null;
    // 未登录：不显示删除按钮（登出后仅看释义）
    setActionButton(loggedIn ? 'delete' : 'none');

    const transEl = bubbleEl.querySelector('.yh-bubble-trans');
    bubbleEl.querySelector('.yh-bubble-word-text').textContent =
      (info.word || canonical);
    bubbleEl.querySelector('.yh-bubble-phonetic').textContent = info.phonetic ? `[${info.phonetic}]` : '';
    renderTrans(transEl, info.trans);
    // 缺释义（本地手动添加的 / 生词本同步下来没带释义的）→ 悬浮时现查一次
    if (!info.trans) requestMeaning(canonical, transEl, () => positionBubble(hl));

    positionBubble(hl);

    // 与气泡同时出现：悬浮满 600ms 后才发音（不再悬浮即发音）
    const sw = info.word || canonical;
    if (sw) speakWord(sw);
  }

  /**
   * 把气泡摆到高亮词附近
   * 定位策略：优先出现在单词下方；若下方空间不足或与其他浮层重叠，则翻转到上方。
   * z-index 使用独立的高层级，尽量避免与其他插件的浮层互相遮挡。
   */
  function positionBubble(hl) {
    positionBubbleRect(hl.getBoundingClientRect(), null);
  }

  /**
   * 浮层定位（通用版）：既支持高亮词元素（传其 getBoundingClientRect），
   * 也支持未高亮词用 Range 算出的矩形；两者都没有时回退到鼠标坐标。
   * @param {DOMRect|null} rect 目标词矩形
   * @param {{x:number,y:number}|null} fallback 鼠标兜底坐标
   */
  function positionBubbleRect(rect, fallback) {
    // 先显示以测量尺寸
    bubbleEl.style.visibility = 'hidden';
    bubbleEl.style.display = 'block';
    const bw = bubbleEl.offsetWidth;
    const bh = bubbleEl.offsetHeight;
    bubbleEl.style.visibility = 'visible';

    const MARGIN = 8;
    let top, left;

    if (rect && (rect.width || rect.height || rect.left || rect.top || rect.bottom)) {
      // 水平：以单词为中心，边界钳制
      left = rect.left + rect.width / 2 - bw / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - bw - MARGIN));

      // 垂直：优先在下方；下方放不下则翻转到上方
      const belowTop = rect.bottom + 6;
      const aboveTop = rect.top - bh - 6;
      if (belowTop + bh <= window.innerHeight - MARGIN) {
        top = belowTop;
      } else if (aboveTop >= MARGIN) {
        top = aboveTop;
      } else {
        top = Math.max(MARGIN, window.innerHeight - bh - MARGIN);
      }
    } else if (fallback) {
      left = fallback.x - bw / 2;
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - bw - MARGIN));
      top = fallback.y + 14;
      if (top + bh > window.innerHeight - MARGIN) {
        top = Math.max(MARGIN, fallback.y - bh - 14);
      }
    } else {
      bubbleEl.style.display = 'none';
      return;
    }

    // 避免与其他插件的浮层重叠：检测目标位置的元素，
    // 若被别的悬浮层占据（非本插件气泡），则水平右移错开
    let probe = document.elementFromPoint(left + bw / 2, top + bh / 2);
    if (probe && probe !== bubbleEl && !bubbleEl.contains(probe)) {
      const foreign = probe.closest('[class*="popup"], [class*="bubble"], [class*="tooltip"], [class*="float"], [id*="popup"], [id*="tooltip"]');
      if (foreign) {
        // 先隐藏自己再探测，避免探测到自身
        bubbleEl.style.display = 'none';
        probe = document.elementFromPoint(left + bw / 2, top + bh / 2);
        bubbleEl.style.display = 'block';
        if (probe && probe !== bubbleEl) {
          // 尝试向右错开一次；不行则向下
          const shifted = left + foreign.offsetWidth + MARGIN;
          if (shifted + bw <= window.innerWidth - MARGIN) {
            left = shifted;
          } else {
            top = Math.min(top + foreign.offsetHeight + MARGIN, window.innerHeight - bh - MARGIN);
          }
        }
      }
    }

    bubbleEl.style.top = top + 'px';
    bubbleEl.style.left = left + 'px';
    bubbleEl.style.display = 'block';
  }

  /**
   * 在未高亮文本里，根据鼠标坐标取出所在单词及其文本节点区间。
   * 用 caretRangeFromPoint（WebKit/Blink）或 caretPositionFromPoint（Firefox）。
   * @returns {{word:string,node:Text,start:number,end:number}|null}
   */
  function getWordAtPoint(x, y) {
    let node = null, offset = 0;
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      if (r) { node = r.startContainer; offset = r.startOffset; }
    } else if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { node = p.offsetNode; offset = p.offset; }
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;

    // 向左右相邻文本节点拼接（跨 <span>/<wbr>/注释 等边界，见 collectTextAround）
    const ctx = collectTextAround(node, offset);
    if (!ctx || !ctx.text) return null;
    const { text, localOffset, nodeStart, nodeEnd, cleanToRaw, nodeRawStart } = ctx;

    // 挑出鼠标所在的词元；单个字母的词元不值得查（也避免 n 这类噪声）
    const hit = pickWordTokenAt(text, localOffset);
    if (!hit || hit.raw.length < 2) return null;

    // ③ 词形收口：残词（mail-）与剥掉引号后的单字母 → 不弹窗、不查、不写生词本
    const word = sanitizePickedWord(hit.raw);
    if (!word) return null;

    // 词在原 node 内的起止偏移：精确区间或退化为整 node。
    // 注意 hit.start/hit.end 是「干净文本」下标，而 Range 要的是 node.textContent 的下标 ——
    // 零宽字符被剔除过，必须经 cleanToRaw 换算回去，否则定位会偏移。
    let start, end;
    if (hit.start >= nodeStart && hit.end <= nodeEnd) {
      start = cleanToRaw[hit.start] - nodeRawStart;
      end = cleanToRaw[hit.end - 1] + 1 - nodeRawStart;
    } else {
      start = 0; end = node.textContent.length;
    }

    // ★ 准确性守卫：单词的 Range 矩形必须包含鼠标坐标，
    //   否则 caretRangeFromPoint 吸附到了附近非目标位置的单词（如空白间隙）。
    try {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const rect = range.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return null;
      const TOL = 3; // 像素容差（行高/字间距边缘）
      if (x < rect.left - TOL || x > rect.right + TOL ||
          y < rect.top - TOL || y > rect.bottom + TOL) return null;
    } catch (_) { return null; }

    return { word, node, start, end };
  }

  /**
   * 在连续文本里挑出包含 localOffset 的词元。
   * Unicode 词：字母开头，后接字母/撇号/连字符（don't、state-of-the-art、café/naïve）。
   * @returns {{raw:string,start:number,end:number}|null}
   */
  function pickWordTokenAt(text, localOffset) {
    const re = /[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (localOffset >= s && localOffset <= e) return { raw: m[0], start: s, end: e };
    }
    return null;
  }

  /**
   * 以 node 为中心，拼出「同一段行内文本」的连续文本，并给出鼠标在其中的偏移。
   *
   * ① 跨边界拼接：不能只看紧邻的兄弟节点。`<span>mail-</span><span>ballot</span>` 里，
   *   鼠标所在文本节点**自己没有兄弟** —— 邻居在它父元素那一层。所以要从 node 出发
   *   逐层向外爬，每层都把左右兄弟的文本收进来，直到父级触到段落边界。
   *   碰到块级标签（含 <br>）立刻停：`<p>mail-</p><p>ballot</p>` 本就不是一个词，
   *   继续拼只会造出假词。注释等非元素节点是透明的，跳过继续外扩。
   * ② 零宽字符透明化：U+200B 这类字符不可见却不在词元字符集里，会让正则在中间断词
   *   （`mail-\u200Bballot` 只取到 `mail-`）。这里剔除它们，并留下 cleanToRaw 映射，
   *   让调用方能把「干净文本下标」换算回「原文本下标」。
   *
   * @returns {{text:string, localOffset:number, nodeStart:number, nodeEnd:number,
   *            cleanToRaw:number[], nodeRawStart:number}|null}
   *   text 连续文本（已剔除零宽字符）；localOffset 鼠标在 text 中的下标；
   *   nodeStart/nodeEnd 鼠标所在 node 在 text 中的区间；cleanToRaw 干净下标 → 原始下标；
   *   nodeRawStart 该 node 在原始拼接文本中的起点（用于把下标换算回 node.textContent）。
   */
  function collectTextAround(node, offset) {
    const left = [], right = [];
    let stopLeft = false, stopRight = false;
    let cur = node;

    while (cur) {
      if (!stopLeft) {
        for (let s = cur.previousSibling; s; s = s.previousSibling) {
          if (isBlockBoundary(s)) { stopLeft = true; break; }
          left.unshift(s.textContent || '');
        }
      }
      if (!stopRight) {
        for (let s = cur.nextSibling; s; s = s.nextSibling) {
          if (isBlockBoundary(s)) { stopRight = true; break; }
          right.push(s.textContent || '');
        }
      }
      // 两侧都已贴到段落边界：再往外只会跨过边界，必须停
      if (stopLeft && stopRight) break;

      const parent = cur.parentNode;
      if (!parent || parent.nodeType !== Node.ELEMENT_NODE || isBlockBoundary(parent)) break;
      cur = parent;
    }

    const before = left.join('');
    const nodeRawStart = before.length;
    const raw = before + node.textContent + right.join('');
    const rawOffset = nodeRawStart + offset;
    const rawNodeEnd = nodeRawStart + node.textContent.length;

    const cleanToRaw = [];
    let text = '';
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ZERO_WIDTH_RE.test(ch)) continue;          // ② 零宽字符直接消失
      cleanToRaw.push(i);
      text += (ch === SOFT_HYPHEN ? '-' : ch);       // 软连字符还原成真连字符
    }
    if (!text) return null;

    return {
      text,
      localOffset: lowerBoundIndex(cleanToRaw, rawOffset),
      nodeStart: lowerBoundIndex(cleanToRaw, nodeRawStart),
      nodeEnd: lowerBoundIndex(cleanToRaw, rawNodeEnd),
      cleanToRaw,
      nodeRawStart,
    };
  }

  /** 用单词区间造 Range 取出矩形，供浮层定位；取不到返回 null */
  function getWordRect(w) {
    try {
      const range = document.createRange();
      range.setStart(w.node, w.start);
      range.setEnd(w.node, w.end);
      const r = range.getBoundingClientRect();
      if (r && (r.width || r.height || r.left || r.top || r.bottom)) return r;
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * 未高亮单词的释义浮层：现查有道释义，并给「加入生词本」按钮。
   * 与高亮词浮层共用同一 bubbleEl，区别在动作按钮（add 而非 delete）。
   */
  function showUnhighlightBubble(word, w) {
    if (!isExtAlive()) return;   // 定时器可能在扩展重载之后才到期
    // 归一词形：去除所有格撇号（patients' → patients，patient's → patient），
    // 再走变体匹配（patients → patient）。「加入生词本」只写入归一化词形。
    const base = WordMatcher.normalizePossessive(word);
    const canonical = wordMatcher.lookup(base);
    bubbleWord = base;
    bubbleAction = 'add';
    bubbleEl.querySelector('.yh-bubble-word-text').textContent = base;
    bubbleEl.querySelector('.yh-bubble-phonetic').textContent = '';
    setActionButton(loggedIn ? 'add' : 'none');

    const transEl = bubbleEl.querySelector('.yh-bubble-trans');
    transEl.textContent = '';
    const loading = document.createElement('span');
    loading.className = 'yh-bubble-loading';
    loading.textContent = t('bubbleLoading', '查询中…');
    transEl.appendChild(loading);

    positionBubbleRect(getWordRect(w), lastMouse);

    // 与气泡同时出现：悬浮满 600ms 后才发音（不再悬浮即发音）
    speakWord(base);

    // 已在生词本（含变体匹配）：直接展示释义，不提供「加入」
    if (canonical && wordInfos[canonical]) {
      setActionButton('none');
      renderTrans(transEl, wordInfos[canonical].trans || '');
      return;
    }

    const key = base.toLowerCase();
    // 已缓存释义（首次查询成功）→ 直接展示，不重复打网络、也不误显示"暂无释义"
    if (wordInfos[key] && wordInfos[key].trans) {
      renderTrans(transEl, wordInfos[key].trans);
      return;
    }
    if (lookupTried.has(key)) {
      renderTrans(transEl, '');   // 查过没查到 →（暂无释义）
      return;
    }

    safeSendMessage({ type: 'lookup', word: base }, (res) => {
      if (!res) { lookupTried.add(key); return; }
      lookupTried.add(key);
      const trans = (res && res.ok && res.trans) || '';
      if (trans) wordInfos[key] = { word: base, phonetic: '', trans };   // 记进词表，后续悬浮直接用
      if (bubbleWord !== base) return;                              // 已切到别的词
      if (!bubbleEl || bubbleEl.style.display === 'none') return;   // 气泡已收起
      renderTrans(transEl, trans);
      positionBubbleRect(getWordRect(w), lastMouse);                // 内容变长，重新定位
    });
  }

  /** 浮层动作按钮：delete → 删除高亮词；add → 加入生词本 */
  /** 浮层喇叭按钮：对当前气泡对应的单词发音（原大小写） */
  function handleSpeak() {
    if (!isExtAlive()) return;   // 扩展重载后不再响应旧气泡上的喇叭
    // 未高亮词（加入生词本场景）：直接用 bubbleWord 原词
    let word = bubbleWord;
    // 高亮词：从 currHighlightNode 取原词（info.word 保留大小写）
    if (!word && currHighlightNode) {
      const canonical = currHighlightNode.getAttribute('data-word');
      const info = wordInfos[canonical];
      word = info ? (info.word || canonical) : null;
    }
    // 兜底：直接从气泡标题取词（覆盖 currHighlightNode/bubbleWord 均为空的时序）
    if (!word && bubbleEl) {
      const t = bubbleEl.querySelector('.yh-bubble-word-text');
      if (t && t.textContent) word = t.textContent.trim();
    }
    if (!word) { console.warn('[YH] 发音按钮：未取到当前单词'); return; }
    logDebug('发音按钮点击:', word);
    // force=true：按钮点击是明确意图，绕过「悬浮自动发音」开关
    safeSendMessage({ type: 'tts', word, force: true });
  }

  /** 悬浮满 600ms（气泡出现时）对单词发音：带开关检查与同词去重 */
  function speakWord(word) {
    if (settings.ttsToggle === false) return;
    if (!word || word === lastSpokenWord) return;
    lastSpokenWord = word;
    safeSendMessage({ type: 'tts', word });
  }

  /** 设置浮层动作按钮：mode='add'→加号(加入)，mode='delete'→垃圾桶(删除)，mode='none'→隐藏（未登录时）。图标统一中性灰，靠形状区分；悬浮显示 title 文字提示。 */
  function setActionButton(mode) {
    const btn = bubbleEl.querySelector('.yh-bubble-action');
    if (!btn) return;
    if (mode === 'none') {
      btn.style.display = 'none';
      bubbleAction = '';
      return;
    }
    btn.style.display = '';
    if (mode === 'add') {
      btn.className = 'yh-bubble-btn primary yh-bubble-action';
      btn.setAttribute('data-action', 'add');
      const addLabel = t('ariaAdd', '加入生词本');
      btn.setAttribute('title', addLabel);
      btn.setAttribute('aria-label', addLabel);
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/></svg>';
    } else {
      btn.className = 'yh-bubble-btn danger yh-bubble-action';
      btn.setAttribute('data-action', 'delete');
      const delLabel = t('ariaDelete', '删除');
      btn.setAttribute('title', delLabel);
      btn.setAttribute('aria-label', delLabel);
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    }
  }

  function handleBubbleAction() {
    if (!isExtAlive()) return;   // 扩展重载后旧气泡上的按钮不再有响应
    if (!loggedIn) return;   // 未登录：按钮已隐藏，防御性拦截
    if (bubbleAction === 'add') {
      const word = bubbleWord;
      if (!word) return;
      safeSendMessage({ type: 'addWord', word }, (msg) => {
        logDebug('添加:', word, '→', msg);
        // 添加成功后动作按钮切换为「删除」：该词已入生词本（本地无论如何都会写入），
        // 这样无需重新悬浮高亮词即可就地反悔删除，避免"删除不容易触发"。
        // 同时把 bubbleAction 一并切到 'delete'，否则点这个按钮仍会再发一次 add（旧实现的潜在 bug）。
        bubbleAction = 'delete';
        setActionButton('delete');
      });
    } else {
      // handleDelete 现在是 async（要等页面内确认框），兜一层避免未处理的 rejection
      handleDelete().catch((err) => console.warn('[YH] 删除流程异常:', err));
    }
  }

  function hideBubble() {
    if (bubbleEl) bubbleEl.style.display = 'none';
  }

  function scheduleHideBubble() {
    cancelHideBubble();
    hideBubbleTimer = setTimeout(() => hideBubble(), BUBBLE_HIDE_DELAY);
  }

  function cancelHideBubble() {
    if (hideBubbleTimer) { clearTimeout(hideBubbleTimer); hideBubbleTimer = null; }
  }

  /**
   * 懒查释义：气泡上出现的词若没有释义，向后台要一次（后台带缓存）
   * 只在「气泡仍展示同一个词」时回填，避免结果串到别的词上。
   * @param {string} canonical 小写词键
   * @param {Element} transEl 释义容器
   * @param {Function} [onFilled] 释义回填后的回调（用于重新定位气泡；按坐标定位的场景可不传）
   */
  function requestMeaning(canonical, transEl, onFilled) {
    const info = wordInfos[canonical];
    if (!info || !transEl) return;

    // 已有缓存释义 → 直接展示（查到过的词也在 lookupTried 里，必须先于它判断，否则会误显示"暂无释义"）
    if (info.trans) {
      renderTrans(transEl, info.trans);
      return;
    }

    if (lookupTried.has(canonical)) {
      renderTrans(transEl, '');   // 查过且没查到，保持「（暂无释义）」
      return;
    }

    transEl.textContent = '';
    const loading = document.createElement('span');
    loading.className = 'yh-bubble-loading';
    loading.textContent = t('bubbleLoading', '查询中…');
    transEl.appendChild(loading);

    lookupTarget = canonical;
    safeSendMessage(
      { type: 'lookup', word: info.word || canonical },
      (res) => {
        if (!res) { lookupTried.add(canonical); return; }
        lookupTried.add(canonical);

        const trans = (res && res.ok && res.trans) || '';
        if (trans) wordInfos[canonical].trans = trans;   // 记进词表，后续悬浮/高亮直接用

        if (lookupTarget !== canonical) return;                       // 已切到别的词
        if (!bubbleEl || bubbleEl.style.display === 'none') return;   // 气泡已收起
        renderTrans(bubbleEl.querySelector('.yh-bubble-trans'), trans);
        if (typeof onFilled === 'function') onFilled();                // 内容变长，重新定位
      }
    );
  }

  // ===== 解释文本渲染：按词性（n./v./adj. 等）分行显示 =====
  const POS_RE = /\b(vt|vi|n|v|adj|adv|prep|conj|pron|num|art|int|interj|aux|abbr|pl|det|modal)\.\s*/gi;

  function renderTrans(container, trans) {
    if (!container) return;
    container.textContent = '';
    const text = (trans || '').trim();
    if (!text) { container.textContent = t('noMeaning', '（暂无释义）'); return; }

    // 收集所有词性标记位置
    const marks = [];
    let m;
    POS_RE.lastIndex = 0;
    while ((m = POS_RE.exec(text)) !== null) {
      marks.push({ tag: m[0].trim(), start: m.index + m[0].length, at: m.index });
    }
    if (marks.length === 0) {
      container.textContent = text;
      return;
    }
    // 首个标记之前的残余文本
    if (marks[0].at > 0) {
      const pre = text.slice(0, marks[0].at).replace(/[；;]+$/, '').trim();
      if (pre) addTransLine(container, '', pre);
    }
    for (let i = 0; i < marks.length; i++) {
      const segEnd = (i + 1 < marks.length) ? marks[i + 1].at : text.length;
      const seg = text.slice(marks[i].start, segEnd).replace(/[；;]+$/, '').trim();
      if (seg) addTransLine(container, marks[i].tag, seg);
    }
  }

  function addTransLine(container, tag, body) {
    const line = document.createElement('div');
    line.className = 'yh-pos-line';
    if (tag) {
      const t = document.createElement('span');
      t.className = 'yh-pos-tag';
      t.textContent = tag;
      line.appendChild(t);
    }
    const b = document.createElement('span');
    b.className = 'yh-pos-text';
    b.textContent = body;
    line.appendChild(b);
    container.appendChild(line);
  }

  async function handleDelete() {
    if (!isExtAlive()) return;   // 扩展重载后不再弹确认框/发请求
    // 高亮词：canonical 取自 span 的 data-word（小写键）；
    // 未高亮词（刚加入生词本、按钮已切到"删除"）：currHighlightNode 为 null，用 bubbleWord 兜底
    let canonical = currHighlightNode ? currHighlightNode.getAttribute('data-word') : null;
    if (!canonical && bubbleWord) canonical = bubbleWord.toLowerCase();

    // 原始单词（保留大小写）：优先 info.word（同步/添加时的原词）、
    // 其次 span 上的 data-display（页面原文大小写）、再其次 bubbleWord 原词，
    // 最后才退到小写 canonical —— 保证删除提交的是原单词，避免大小写不一致导致删不掉。
    let original = (canonical && wordInfos[canonical] && wordInfos[canonical].word) || null;
    if (!original && currHighlightNode) {
      const d = currHighlightNode.getAttribute('data-display');
      if (d) original = d;
    }
    if (!original && bubbleWord) original = bubbleWord;
    if (!original && canonical) original = canonical;

    const info = canonical ? wordInfos[canonical] : null;
    if (!canonical || !original) return;

    // 用页面内确认框替代 window.confirm：不阻塞页面、样式可跟随深色模式
    const confirmed = await showConfirm(
      t('confirmDelete', '确认删除「$1」？', [original]),
      t('ariaDelete', '删除')
    );
    if (!confirmed) return;

    hideBubble();
    safeSendMessage({
      type: 'delete',
      wordData: { word: original, itemId: info ? info.itemId : undefined, canonical }
    }, (msg) => {
      if (msg) {
        logDebug('删除:', msg);
        // 文案由 service worker 给出（已本地化）；带 ⚠️ 的表示远端失败但本地已移除
        showToast(msg, /^⚠️/.test(msg) ? 'warn' : 'ok');
      }
      // 遍历移除本页所有该单词的高亮（同一词可能在页面多处出现）
      removeAllHighlights(canonical);
    });
  }

  /**
   * 移除本页所有 data-word===canonical 的高亮 span，
   * 解包为纯文本节点（避免残留高亮、也避免同步后重复包裹）。
   * @param {string} canonical 小写词键
   */
  function removeAllHighlights(canonical) {
    const nodes = document.querySelectorAll('.yh-highlight');
    nodes.forEach((el) => {
      if (el.getAttribute('data-word') === canonical) {
        const text = document.createTextNode(el.textContent);
        if (el.parentNode) el.parentNode.replaceChild(text, el);
      }
    });
    if (currHighlightNode && currHighlightNode.getAttribute('data-word') === canonical) {
      currHighlightNode = null;
    }
  }

  // ===== 选中添加生词（与双击协调：延迟出现，若随后发生双击则取消）=====
  let addMenuTimer = null;

  function setupSelectionHandler() {
    document.addEventListener('mouseup', (e) => {
      // 忽略气泡内的选择
      if (bubbleEl && bubbleEl.contains(e.target)) return;
      // 与悬浮气泡保持一致：未登录时不能展示「加入有道生词本」入口。
      if (!loggedIn) return;
      if (!isExtAlive()) return;   // 扩展重载后不再弹「加入生词本」菜单

      clearTimeout(addMenuTimer);
      // 延迟 400ms 再弹菜单：给双击留出时间，双击事件里会 removeAddMenu + clear 该定时器
      addMenuTimer = setTimeout(() => {
        const sel = window.getSelection();
        const selectedText = sel ? sel.toString().trim() : '';

        // 单击（无有效选区）不弹菜单
        if (!selectedText || selectedText.length < 2) return;
        if (!/^[\sa-zA-Z']+$/.test(selectedText)) return;

        // 若选区是单个词且已在生词本中，则不显示"添加"菜单（避免无意义操作）
        const word = WordMatcher.normalizePossessive(selectedText.trim());
        const canonical = wordMatcher.lookup(word);
        if (canonical && wordInfos[canonical]) return;

        showAddWordMenu(word, e.clientX, e.clientY);
      }, 400);
    }, { passive: true });
  }

  // ===== 双击：仅取消待弹出的"添加"菜单（释义浮层已改为悬浮即弹，双击不再单独弹）=====
  function setupDblClickHandler() {
    document.addEventListener('dblclick', (e) => {
      // 双击会带着选区触发 mouseup 的"添加"菜单定时器，这里取消它，避免双击误弹添加菜单
      if (bubbleEl && bubbleEl.contains(e.target)) return;
      clearTimeout(addMenuTimer);
      removeAddMenu();
    });
  }

  let addMenuEl = null;

  function showAddWordMenu(word, x, y) {
    removeAddMenu();

    addMenuEl = document.createElement('div');
    addMenuEl.className = 'yh-add-menu';
    // 位置随鼠标走，必须内联；其余外观全部交给 content.css 的 .yh-add-menu
    addMenuEl.style.left = `${x}px`;
    addMenuEl.style.top = `${y + 10}px`;

    const item = document.createElement('div');
    item.setAttribute('role', 'button');
    // 用 textContent 而非拼 innerHTML：word 来自页面选中文字，拼 HTML 会被注入
    item.textContent = t('addToWordbook', '添加「$1」到有道生词本', [word]);
    addMenuEl.appendChild(item);

    addMenuEl.addEventListener('click', () => {
      safeSendMessage({ type: 'addWord', word }, (msg) => {
        const text = msg || t('addedFallback', '$1 已添加', [word]);
        showToast(text, /^⚠️/.test(text) ? 'warn' : 'ok');
      });
      removeAddMenu();
    });

    document.body.appendChild(addMenuEl);

    // 点击其他地方关闭
    setTimeout(() => {
      document.addEventListener('mousedown', onDocClickForMenu, { once: true });
    }, 0);
  }

  function onDocClickForMenu(e) {
    if (addMenuEl && !addMenuEl.contains(e.target)) {
      removeAddMenu();
    }
  }

  function removeAddMenu() {
    if (addMenuEl && addMenuEl.parentNode) {
      addMenuEl.parentNode.removeChild(addMenuEl);
    }
    addMenuEl = null;
  }

  /** 移除已不在当前词表中的旧高亮，避免同步后显示过期生词。 */
  function removeStaleHighlights() {
    document.querySelectorAll('.yh-highlight').forEach((el) => {
      const canonical = el.getAttribute('data-word');
      if (canonical && !wordInfos[canonical]) {
        const text = document.createTextNode(el.textContent);
        if (el.parentNode) el.parentNode.replaceChild(text, el);
      }
    });
  }

  function replaceWordInfos(nextWordInfos) {
    wordInfos = nextWordInfos || {};
    wordMatcher.buildIndex(Object.keys(wordInfos));
    removeStaleHighlights();
    doHighlight();
  }

  // ===== 监听设置变化 =====
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    // 调试日志开关（在 SW 控制台 __yhDebug.enable() 时同步生效，无需刷新页面）
    if (changes.debugLog) debugLogEnabled = !!changes.debugLog.newValue;

    if (changes.newWords) {
      const nv = changes.newWords.newValue;
      if (nv && nv.wordInfos) {
        replaceWordInfos(nv.wordInfos);
      }
    }

    if (changes.toggle) {
      if (changes.toggle.newValue === false) {
        document.querySelectorAll('.yh-highlight').forEach(el => {
          el.outerHTML = el.textContent;
        });
        if (bubbleEl) bubbleEl.style.display = 'none';
        cancelHover();
        cancelTts();
      } else {
        doHighlight();
      }
    }

    // 高亮样式变更时重新应用
    if (changes.highlightBackground || changes.highlightText || changes.bubbleBackground || changes.bubbleText) {
      safeStorageGet([
        'highlightBackground', 'highlightText', 'bubbleBackground', 'bubbleText'
      ], applyStyles);
    }
  });

  // 监听来自 service worker 的消息（同步完成/设置变更/登录失效）
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'wordsUpdated') {
      safeStorageGet(['newWords'], (r) => {
        if (r.newWords && r.newWords.wordInfos) {
          replaceWordInfos(r.newWords.wordInfos);
        }
      });
    }
    if (msg.type === 'settingsChanged') {
      safeStorageGet([
        'toggle', 'highlightBackground', 'highlightText', 'bubbleBackground', 'bubbleText', 'ttsToggle'
      ], (r) => {
        settings = r;
        applyStyles(r);
        if (r.toggle !== false) doHighlight();
      });
    }
    // 登录失效：弹出重新登录横幅
    if (msg.type === 'loginExpired') {
      loggedIn = false;
      showLoginBanner(msg.reason || '');
    }
  });

  // 启动
  init();
})();

// ===== 工具函数（IIFE 外，供脚本作用域复用） =====
function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(255,243,205,${alpha})`;
  const h = hex.slice(1, 7);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
