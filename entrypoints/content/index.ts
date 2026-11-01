import './style.css';
import { WordMatcher, normalizePossessive, isLikelyEnglishWord } from '../../utils/word-matcher';
import { hexToRgba, isExtAlive, safeStorageGet, toLineColor } from '../../utils/storage';
import { isExcludedElement, isHighlightableTextNode } from '../../utils/dom-filter';
import { t, setLanguage } from '../../utils/i18n';
import type { WordInfo, Settings, MessageRequest } from '../../types';

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    let wordMatcher = new WordMatcher();
    let wordInfos: Record<string, WordInfo> = {};
    let bubbleEl: HTMLDivElement | null = null;
    let currHighlightNode: HTMLElement | null = null;
    let hideBubbleTimer: ReturnType<typeof setTimeout> | null = null;
    let settings: Partial<Settings> = {};
    const lookupTried = new Set<string>();
    let lookupTarget: string | null = null;
    let bubbleAction: 'delete' | 'add' | '' = 'delete';
    let bubbleWord: string | null = null;
    let loggedIn = false;
    let pendingReLogin = false;

    let debugLogEnabled = false;
    function logDebug(...args: any[]) {
      if (debugLogEnabled) console.log('[YH]', ...args);
    }

    let lastMouse = { x: 0, y: 0 };

    const BUBBLE_HIDE_DELAY = 260;
    const BUBBLE_HOLD_MS = 600;

    let extDead = false;
    let extDeadNotified = false;

    function checkExtAlive(): boolean {
      if (extDead) return false;
      if (isExtAlive()) return true;
      markExtDead('');
      return false;
    }

    function isInvalidationError(err: any): boolean {
      const m = (err && err.message) || String(err || '');
      return /Extension context invalidated|Receiving end does not exist|message port closed/i.test(m);
    }

    function markExtDead(reason?: string) {
      if (extDead) return;
      extDead = true;
      try {
        hideBubble();
        cancelHover();
        cancelTts();
      } catch {}
      if (!extDeadNotified) {
        extDeadNotified = true;
        console.info('[YH] 扩展已被重新加载，本页高亮已停用；刷新页面即可恢复。', reason || '');
      }
    }

    function safeSendMessage(message: MessageRequest, callback?: (res: any) => void): boolean {
      if (!checkExtAlive()) {
        callback?.(null);
        return false;
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
          const p = chrome.runtime.sendMessage(message);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        return true;
      } catch (err: any) {
        if (isInvalidationError(err)) markExtDead(err.message);
        else console.warn('[YH] 消息发送失败:', err);
        callback?.(null);
        return false;
      }
    }

    function applyStyles(s?: Partial<Settings>) {
      const root = document.documentElement;
      if (!root) return;
      s = s || {};

      const style = s.highlightStyle || 'bg';
      root.setAttribute('data-yh-style', style);

      const setOrClear = (name: string, value?: string, defaultValue?: string) => {
        if (!value || value === defaultValue) root.style.removeProperty(name);
        else root.style.setProperty(name, value);
      };

      const hlBg = s.highlightBackground || '#ffe464';
      if (hlBg === '#ffe464') {
        root.style.removeProperty('--yh-hl-bg');
        root.style.removeProperty('--yh-hl-bg-hover');
      } else {
        root.style.setProperty('--yh-hl-bg', hexToRgba(hlBg, 0.55));
        root.style.setProperty('--yh-hl-bg-hover', hexToRgba(hlBg, 0.78));
      }

      const lineColor = toLineColor(hlBg);
      root.style.setProperty('--yh-hl-line', lineColor);
      root.style.setProperty('--yh-hl-line-hover', hexToRgba(lineColor, 0.9));
      root.style.setProperty('--yh-hl-line-tint', hexToRgba(lineColor, 0.08));

      setOrClear('--yh-hl-fg', s.highlightText, '');
      setOrClear('--yh-bubble-bg', s.bubbleBackground, '#ffffff');
      setOrClear('--yh-bubble-fg', s.bubbleText, '');

      if (bubbleEl) {
        bubbleEl.classList.toggle('yh-bubble-fg-custom', !!s.bubbleText);
      }
    }

    function createHighlightSpan(displayText: string, canonical: string): HTMLSpanElement {
      const span = document.createElement('span');
      span.className = 'yh-highlight';
      span.setAttribute('data-word', canonical);
      span.setAttribute('data-display', displayText);
      span.textContent = displayText;
      return span;
    }

    const pendingCounts = new Set<string>();
    let countFlushTimer: ReturnType<typeof setTimeout> | null = null;

    function queueCount(canonical: string) {
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

    function processText(text: string): Node[] {
      const result: Node[] = [];
      const re = /([a-zA-Z]+(?:'[a-zA-Z]+)?)|([^a-zA-Z]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m[1] !== undefined) {
          const rawWord = m[1];
          if (rawWord.length < 2) {
            result.push(document.createTextNode(rawWord));
            continue;
          }
          const canonical = wordMatcher.lookup(rawWord);
          if (canonical && wordInfos[canonical]) {
            result.push(createHighlightSpan(rawWord, canonical));
            queueCount(canonical);
          } else {
            result.push(document.createTextNode(rawWord));
          }
        } else {
          result.push(document.createTextNode(m[2] || ''));
        }
      }
      return result;
    }

    function highlightNodes(nodes: Node[]) {
      for (const node of nodes) {
        const text = node.textContent;
        if (!text || !text.trim()) continue;

        const fragments = processText(text);
        const hasHighlight = fragments.some((f) => f instanceof HTMLElement && f.classList.contains('yh-highlight'));
        if (!hasHighlight) continue;

        const parent = node.parentNode;
        if (!parent) continue;

        if ((parent as HTMLElement).tagName === 'A') {
          (parent as HTMLElement).style.display = 'inline-block';
        }

        const df = document.createDocumentFragment();
        for (const frag of fragments) {
          df.appendChild(frag);
        }
        parent.replaceChild(df, node);
      }
    }

    function collectTextNodes(root: Node): Node[] {
      const nodes: Node[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (isExcludedElement(node as Element)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            return isHighlightableTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      });
      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.TEXT_NODE) nodes.push(n);
      }
      return nodes;
    }

    function doHighlight() {
      if (!document.body) return;
      const textNodes = collectTextNodes(document.body);
      highlightNodes(textNodes);
      const n = document.querySelectorAll('.yh-highlight').length;
      if (n > 0) {
        logDebug('content: 已加载', Object.keys(wordInfos).length, '个生词，本页高亮', n, '处');
      }
    }

    function isInsideHighlight(node: Node): boolean {
      const parent = node.parentElement;
      return !!(parent && parent.classList && parent.classList.contains('yh-highlight'));
    }

    function unwrapHighlight(node: Node): Text | null {
      const span = node.parentElement;
      if (!span || !span.parentNode) return null;
      const textNode = document.createTextNode(span.textContent || '');
      span.parentNode.replaceChild(textNode, span);
      return textNode;
    }

    function observeDOM() {
      const pending = new Set<Node>();
      let scheduled = false;

      const flush = () => {
        scheduled = false;
        if (!pending.size) return;
        const nodes = Array.from(pending);
        pending.clear();
        for (const node of nodes) {
          if (!node.isConnected) continue;
          try {
            if (node.nodeType === Node.TEXT_NODE) {
              const target = isInsideHighlight(node) ? unwrapHighlight(node) : node;
              if (target && target.isConnected && isHighlightableTextNode(target)) {
                highlightNodes([target]);
              }
              continue;
            }
            const textNodes = collectTextNodes(node);
            if (textNodes.length > 0) highlightNodes(textNodes);
          } catch {}
        }
      };

      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        if (typeof (window as any).requestIdleCallback === 'function') {
          (window as any).requestIdleCallback(flush, { timeout: 500 });
        } else {
          setTimeout(flush, 50);
        }
      };

      const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          if (mut.type === 'characterData') {
            const t = mut.target;
            if (t && t.nodeType === Node.TEXT_NODE && t.isConnected) pending.add(t);
            continue;
          }
          if (mut.type !== 'childList') continue;
          for (const node of Array.from(mut.addedNodes)) {
            if (!node) continue;
            if (node.nodeType === Node.TEXT_NODE) {
              if (isHighlightableTextNode(node)) pending.add(node);
              continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            const el = node as HTMLElement;
            if (isExcludedElement(el)) continue;
            if (
              el.classList &&
              (el.classList.contains('yh-bubble') ||
                el.classList.contains('yh-highlight') ||
                el.classList.contains('yh-login-banner') ||
                el.classList.contains('yh-toast') ||
                el.classList.contains('yh-confirm'))
            ) {
              continue;
            }
            pending.add(node);
          }
        }
        if (pending.size) schedule();
      });

      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          characterDataOldValue: false,
        });
      }
    }

    // ===== 轻提示与确认框 =====
    let toastEl: HTMLDivElement | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | null = null;

    function showToast(message: string, type?: 'ok' | 'warn') {
      if (!message) return;
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'yh-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = message;
      toastEl.classList.toggle('yh-toast-warn', type === 'warn');
      toastEl.style.display = 'block';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(hideToast, 4000);
    }

    function hideToast() {
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = null;
      if (toastEl) toastEl.style.display = 'none';
    }

    let activeConfirm: { el: HTMLDivElement; finish: (res: boolean) => void } | null = null;

    function showConfirm(message: string, confirmLabel: string, cancelLabel?: string): Promise<boolean> {
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

        const onOutside = (e: MouseEvent) => {
          if (!el.contains(e.target as Node)) finish(false);
        };

        const finish = (result: boolean) => {
          document.removeEventListener('mousedown', onOutside);
          if (activeConfirm && activeConfirm.el === el) activeConfirm = null;
          el.remove();
          resolve(result);
        };
        activeConfirm = { el, finish };

        cancel.addEventListener('click', () => finish(false));
        ok.addEventListener('click', () => finish(true));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') finish(false);
        });
        document.addEventListener('mousedown', onOutside);
        try {
          ok.focus();
        } catch {}
      });
    }

    function closeConfirm(result: boolean) {
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

      const speakBtn = bubbleEl.querySelector('.yh-bubble-speak');
      if (speakBtn) {
        const speakLabel = t('ariaSpeak', '发音');
        speakBtn.setAttribute('title', speakLabel);
        speakBtn.setAttribute('aria-label', speakLabel);
      }

      bubbleEl.addEventListener('mouseenter', () => cancelHideBubble());
      bubbleEl.addEventListener('mouseleave', () => scheduleHideBubble());
      bubbleEl.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement)?.closest?.('[data-action]');
        if (!btn || !bubbleEl?.contains(btn)) return;
        if (btn.getAttribute('data-action') === 'speak') handleSpeak();
        else handleBubbleAction();
      });

      document.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener(
        'scroll',
        () => {
          hideBubble();
          cancelHover();
          cancelTts();
        },
        { passive: true }
      );
      document.addEventListener(
        'mousedown',
        (e) => {
          if (bubbleEl && !bubbleEl.contains(e.target as Node)) {
            hideBubble();
            cancelHover();
            cancelTts();
          }
        },
        { passive: true }
      );
    }

    let bannerReason: string | null = null;
    let reLoginListenersBound = false;

    function showLoginBanner(reason: string) {
      hideLoginBanner();
      bannerReason = reason || '';
      const el = document.createElement('div');
      el.className = 'yh-login-banner';

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

      reloginBtn.addEventListener('click', () => {
        pendingReLogin = true;
        safeSendMessage({ type: 'openLoginPage' });
        hideLoginBanner();
      });
      closeBtn.addEventListener('click', hideLoginBanner);

      bindReLoginReturnListeners();
    }

    function onReturnFromReLogin() {
      if (!pendingReLogin) return;
      if (!checkExtAlive()) return;
      safeSendMessage({ type: 'checkLogin' }, (r) => {
        if (r && r.ok) {
          pendingReLogin = false;
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

    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let ttsTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSpokenWord: string | null = null;

    const EDGE_GUARD_PX = 8;
    function isNearViewportEdge(x: number, y: number): boolean {
      const w = document.documentElement.clientWidth || window.innerWidth || 0;
      const h = document.documentElement.clientHeight || window.innerHeight || 0;
      if (!w || !h) return false;
      return x <= EDGE_GUARD_PX || y <= EDGE_GUARD_PX || x >= w - EDGE_GUARD_PX || y >= h - EDGE_GUARD_PX;
    }

    const WORD_PICK_RE = /^[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]*$/;
    const ZERO_WIDTH_RE = /[\u200B\uFEFF\u2060]/;
    const SOFT_HYPHEN = '\u00AD';

    const BLOCK_TAGS = new Set([
      'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET',
      'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
      'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT',
      'TH', 'THEAD', 'TR', 'UL',
    ]);

    function isBlockBoundary(n: Node): boolean {
      return n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as HTMLElement).tagName);
    }

    function sanitizePickedWord(word: string | null): string | null {
      if (!word) return null;
      if (/-$/.test(word)) return null;
      if (/'$/.test(word) && !/s'$/i.test(word)) word = word.slice(0, -1);
      return word.length >= 2 ? word : null;
    }

    function lowerBoundIndex(cleanToRaw: number[], rawIndex: number): number {
      let lo = 0,
        hi = cleanToRaw.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const val = cleanToRaw[mid] ?? 0;
        if (val < rawIndex) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    const MOVE_EPSILON_PX = 4;
    let moveRafId: any = 0;
    let pendingMovePos: { x: number; y: number } | null = null;
    let lastHandledX = NaN;
    let lastHandledY = NaN;

    function handleMouseMove(e: MouseEvent) {
      lastMouse = { x: e.clientX, y: e.clientY };
      if (document.hidden) return;
      pendingMovePos = { x: e.clientX, y: e.clientY };
      if (moveRafId) return;
      moveRafId =
        typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(flushMouseMove)
          : setTimeout(flushMouseMove, 16);
    }

    function flushMouseMove() {
      moveRafId = 0;
      const pos = pendingMovePos;
      pendingMovePos = null;
      if (!pos) return;
      const dx = pos.x - lastHandledX;
      const dy = pos.y - lastHandledY;
      if (dx * dx + dy * dy < MOVE_EPSILON_PX * MOVE_EPSILON_PX) return;
      lastHandledX = pos.x;
      lastHandledY = pos.y;
      processHoverAt(pos.x, pos.y);
    }

    function isBubbleShown(): boolean {
      return !!(bubbleEl && bubbleEl.style.display === 'block');
    }

    function processHoverAt(x: number, y: number) {
      if (!checkExtAlive()) return;
      if (isNearViewportEdge(x, y)) {
        cancelHover();
        cancelTts();
        scheduleHideBubble();
        return;
      }
      const target = document.elementFromPoint(x, y);
      if (!target) {
        cancelHover();
        scheduleHideBubble();
        return;
      }

      if (bubbleEl && (target === bubbleEl || bubbleEl.contains(target))) {
        cancelHideBubble();
        cancelHover();
        return;
      }

      const hl = target.closest('.yh-highlight') as HTMLElement | null;
      if (hl) {
        cancelHideBubble();
        currHighlightNode = hl;

        const canonical = hl.getAttribute('data-word');
        const info = canonical ? wordInfos[canonical] : null;
        if (info && info.word) speakWord(info.word);

        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          if (currHighlightNode === hl) showBubble(hl);
        }, BUBBLE_HOLD_MS);
        return;
      }

      if (!isBubbleShown()) {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(showUnhighlightBubbleAtCursor, BUBBLE_HOLD_MS);
        return;
      }

      const w = getWordAtPoint(x, y);
      if (w && WORD_PICK_RE.test(w.word)) {
        const word = normalizePossessive(w.word);
        if (!isLikelyEnglishWord(word)) {
          cancelHover();
          cancelTts();
          lastSpokenWord = null;
          scheduleHideBubble();
          return;
        }
        cancelHideBubble();
        currHighlightNode = null;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          showUnhighlightBubble(word, w);
        }, BUBBLE_HOLD_MS);
        return;
      }

      cancelHover();
      cancelTts();
      lastSpokenWord = null;
      scheduleHideBubble();
    }

    function showUnhighlightBubbleAtCursor() {
      hoverTimer = null;
      if (!checkExtAlive() || document.hidden) return;
      const { x, y } = lastMouse;
      if (isNearViewportEdge(x, y)) return;
      const w = getWordAtPoint(x, y);
      if (!w || !WORD_PICK_RE.test(w.word)) return;
      if (isBubbleShown()) return;
      const word = normalizePossessive(w.word);
      if (!isLikelyEnglishWord(word)) return;
      currHighlightNode = null;
      showUnhighlightBubble(word, w);
    }

    function cancelHover() {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = null;
    }

    function cancelTts() {
      if (ttsTimer) clearTimeout(ttsTimer);
      ttsTimer = null;
    }

    function showBubble(hl: HTMLElement) {
      const canonical = hl.getAttribute('data-word');
      const info = canonical ? wordInfos[canonical] : null;
      if (!info) return;
      if (!checkExtAlive()) return;

      currHighlightNode = hl;
      bubbleAction = 'delete';
      bubbleWord = null;
      setActionButton(loggedIn ? 'delete' : 'none');

      if (!bubbleEl) return;
      const transEl = bubbleEl.querySelector('.yh-bubble-trans') as HTMLElement;
      const wordText = bubbleEl.querySelector('.yh-bubble-word-text');
      const phoneticText = bubbleEl.querySelector('.yh-bubble-phonetic');
      if (wordText) wordText.textContent = info.word || canonical || '';
      if (phoneticText) phoneticText.textContent = info.phonetic ? `[${info.phonetic}]` : '';
      renderTrans(transEl, info.trans);

      if (!info.trans && canonical) {
        requestMeaning(canonical, transEl, () => positionBubble(hl));
      }

      positionBubble(hl);
      const sw = info.word || canonical;
      if (sw && isLikelyEnglishWord(sw)) speakWord(sw);
    }

    function positionBubble(hl: HTMLElement) {
      positionBubbleRect(hl.getBoundingClientRect(), null);
    }

    function positionBubbleRect(rect: DOMRect | null, fallback: { x: number; y: number } | null) {
      if (!bubbleEl) return;
      bubbleEl.style.visibility = 'hidden';
      bubbleEl.style.display = 'block';
      const bw = bubbleEl.offsetWidth;
      const bh = bubbleEl.offsetHeight;
      bubbleEl.style.visibility = 'visible';

      const MARGIN = 8;
      let top: number, left: number;

      if (rect && (rect.width || rect.height || rect.left || rect.top || rect.bottom)) {
        left = rect.left + rect.width / 2 - bw / 2;
        left = Math.max(MARGIN, Math.min(left, window.innerWidth - bw - MARGIN));

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

      let probe = document.elementFromPoint(left + bw / 2, top + bh / 2) as HTMLElement | null;
      if (probe && probe !== bubbleEl && !bubbleEl.contains(probe)) {
        const foreign = probe.closest(
          '[class*="popup"], [class*="bubble"], [class*="tooltip"], [class*="float"], [id*="popup"], [id*="tooltip"]'
        ) as HTMLElement | null;
        if (foreign) {
          bubbleEl.style.display = 'none';
          probe = document.elementFromPoint(left + bw / 2, top + bh / 2) as HTMLElement | null;
          bubbleEl.style.display = 'block';
          if (probe && probe !== bubbleEl) {
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

    function getWordAtPoint(x: number, y: number) {
      let node: Node | null = null;
      let offset = 0;
      if ((document as any).caretRangeFromPoint) {
        const r = (document as any).caretRangeFromPoint(x, y);
        if (r) {
          node = r.startContainer;
          offset = r.startOffset;
        }
      } else if ((document as any).caretPositionFromPoint) {
        const p = (document as any).caretPositionFromPoint(x, y);
        if (p) {
          node = p.offsetNode;
          offset = p.offset;
        }
      }
      if (!node || node.nodeType !== Node.TEXT_NODE) return null;

      const ctx = collectTextAround(node, offset);
      if (!ctx || !ctx.text) return null;
      const { text, localOffset, nodeStart, nodeEnd, cleanToRaw, nodeRawStart } = ctx;

      const hit = pickWordTokenAt(text, localOffset);
      if (!hit || hit.raw.length < 2) return null;

      const word = sanitizePickedWord(hit.raw);
      if (!word) return null;

      let start: number, end: number;
      if (hit.start >= nodeStart && hit.end <= nodeEnd) {
        const rawStart = cleanToRaw[hit.start] ?? 0;
        const rawEnd = cleanToRaw[hit.end - 1] ?? 0;
        start = rawStart - nodeRawStart;
        end = rawEnd + 1 - nodeRawStart;
      } else {
        start = 0;
        end = (node.textContent || '').length;
      }

      try {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const rect = range.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return null;
        const TOL = 3;
        if (x < rect.left - TOL || x > rect.right + TOL || y < rect.top - TOL || y > rect.bottom + TOL) {
          return null;
        }
      } catch {
        return null;
      }

      return { word, node, start, end };
    }

    function pickWordTokenAt(text: string, localOffset: number) {
      const re = /[a-zA-Z\u00C0-\u024F][a-zA-Z\u00C0-\u024F'-]*/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const s = m.index;
        const e = m.index + m[0].length;
        if (localOffset >= s && localOffset <= e) {
          return { raw: m[0], start: s, end: e };
        }
      }
      return null;
    }

    function collectTextAround(node: Node, offset: number) {
      const left: string[] = [];
      const right: string[] = [];
      let stopLeft = false,
        stopRight = false;
      let cur: Node | null = node;

      while (cur) {
        if (!stopLeft) {
          for (let s = cur.previousSibling; s; s = s.previousSibling) {
            if (isBlockBoundary(s)) {
              stopLeft = true;
              break;
            }
            left.unshift(s.textContent || '');
          }
        }
        if (!stopRight) {
          for (let s = cur.nextSibling; s; s = s.nextSibling) {
            if (isBlockBoundary(s)) {
              stopRight = true;
              break;
            }
            right.push(s.textContent || '');
          }
        }
        if (stopLeft && stopRight) break;

        const parent: Node | null = cur.parentNode;
        if (!parent || parent.nodeType !== Node.ELEMENT_NODE || isBlockBoundary(parent)) break;
        cur = parent;
      }

      const before = left.join('');
      const nodeRawStart = before.length;
      const raw = before + (node.textContent || '') + right.join('');
      const rawOffset = nodeRawStart + offset;
      const rawNodeEnd = nodeRawStart + (node.textContent || '').length;

      const cleanToRaw: number[] = [];
      let text = '';
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (!ch || ZERO_WIDTH_RE.test(ch)) continue;
        cleanToRaw.push(i);
        text += ch === SOFT_HYPHEN ? '-' : ch;
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

    function getWordRect(w: { node: Node; start: number; end: number }) {
      try {
        const range = document.createRange();
        range.setStart(w.node, w.start);
        range.setEnd(w.node, w.end);
        const r = range.getBoundingClientRect();
        if (r && (r.width || r.height || r.left || r.top || r.bottom)) return r;
      } catch {}
      return null;
    }

    function displayUnhighlightBubble(base: string, trans: string, w: { node: Node; start: number; end: number }) {
      if (!bubbleEl) return;
      bubbleWord = base;
      bubbleAction = 'add';

      const wordText = bubbleEl.querySelector('.yh-bubble-word-text');
      const phoneticText = bubbleEl.querySelector('.yh-bubble-phonetic');
      if (wordText) wordText.textContent = base;
      if (phoneticText) phoneticText.textContent = '';
      setActionButton(loggedIn ? 'add' : 'none');

      const transEl = bubbleEl.querySelector('.yh-bubble-trans') as HTMLElement;
      renderTrans(transEl, trans);

      positionBubbleRect(getWordRect(w), lastMouse);
      speakWord(base);
    }

    function showUnhighlightBubble(word: string, w: { node: Node; start: number; end: number }) {
      if (!checkExtAlive()) return;
      const base = normalizePossessive(word);
      if (!isLikelyEnglishWord(base)) return;

      const canonical = wordMatcher.lookup(base);
      const key = base.toLowerCase();

      // 已在生词本（含变体匹配）：直接展示释义
      if (canonical && wordInfos[canonical] && wordInfos[canonical].trans) {
        displayUnhighlightBubble(base, wordInfos[canonical].trans, w);
        setActionButton('none');
        return;
      }

      // 已有缓存释义：直接展示
      if (wordInfos[key] && wordInfos[key].trans) {
        displayUnhighlightBubble(base, wordInfos[key].trans, w);
        return;
      }
      if (lookupTried.has(key)) {
        return;
      }

      safeSendMessage({ type: 'lookup', word: base }, (res) => {
        lookupTried.add(key);
        if (!res || !res.ok) return;
        const trans = (res && res.trans) ? String(res.trans).trim() : '';
        if (!trans) return; // 查无释义，静默忽略，不弹窗不发音
        wordInfos[key] = { word: base, phonetic: '', trans };
        if (!checkExtAlive()) return;
        displayUnhighlightBubble(base, trans, w);
      });
    }

    function handleSpeak() {
      if (!checkExtAlive()) return;
      let word = bubbleWord;
      if (!word && currHighlightNode) {
        const canonical = currHighlightNode.getAttribute('data-word');
        const info = canonical ? wordInfos[canonical] : null;
        word = info ? info.word || canonical : null;
      }
      if (!word && bubbleEl) {
        const t = bubbleEl.querySelector('.yh-bubble-word-text');
        if (t && t.textContent) word = t.textContent.trim();
      }
      if (!word) {
        console.warn('[YH] 发音按钮：未取到当前单词');
        return;
      }
      if (!isLikelyEnglishWord(word)) return;
      logDebug('发音按钮点击:', word);
      safeSendMessage({ type: 'tts', word, force: true });
    }

    function speakWord(word: string) {
      if (settings.ttsToggle === false) return;
      if (!word || word === lastSpokenWord) return;
      if (!isLikelyEnglishWord(word)) return;
      lastSpokenWord = word;
      safeSendMessage({ type: 'tts', word });
    }

    function setActionButton(mode: 'add' | 'delete' | 'none') {
      if (!bubbleEl) return;
      const btn = bubbleEl.querySelector('.yh-bubble-action') as HTMLElement | null;
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
        btn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5.5" x2="12" y2="18.5"/><line x1="5.5" y1="12" x2="18.5" y2="12"/></svg>';
      } else {
        btn.className = 'yh-bubble-btn danger yh-bubble-action';
        btn.setAttribute('data-action', 'delete');
        const delLabel = t('ariaDelete', '删除');
        btn.setAttribute('title', delLabel);
        btn.setAttribute('aria-label', delLabel);
        btn.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      }
    }

    function handleBubbleAction() {
      if (!checkExtAlive() || !loggedIn) return;
      if (bubbleAction === 'add') {
        const word = bubbleWord;
        if (!word) return;
        safeSendMessage({ type: 'addWord', word }, (msg) => {
          logDebug('添加:', word, '→', msg);
          bubbleAction = 'delete';
          setActionButton('delete');
        });
      } else {
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
      if (hideBubbleTimer) {
        clearTimeout(hideBubbleTimer);
        hideBubbleTimer = null;
      }
    }

    function requestMeaning(canonical: string, transEl: HTMLElement, onFilled?: () => void) {
      const info = wordInfos[canonical];
      if (!info || !transEl) return;

      if (info.trans) {
        renderTrans(transEl, info.trans);
        return;
      }
      if (lookupTried.has(canonical)) {
        renderTrans(transEl, '');
        return;
      }

      transEl.textContent = '';
      const loading = document.createElement('span');
      loading.className = 'yh-bubble-loading';
      loading.textContent = t('bubbleLoading', '查询中…');
      transEl.appendChild(loading);

      lookupTarget = canonical;
      safeSendMessage({ type: 'lookup', word: info.word || canonical }, (res) => {
        lookupTried.add(canonical);
        if (!res) return;
        const trans = (res && res.ok && res.trans) || '';
        if (trans && wordInfos[canonical]) {
          wordInfos[canonical]!.trans = trans;
        }
        if (lookupTarget !== canonical) return;
        if (!bubbleEl || bubbleEl.style.display === 'none') return;
        renderTrans(bubbleEl.querySelector('.yh-bubble-trans') as HTMLElement, trans);
        onFilled?.();
      });
    }

    const POS_RE = /\b(vt|vi|n|v|adj|adv|prep|conj|pron|num|art|int|interj|aux|abbr|pl|det|modal)\.\s*/gi;

    function renderTrans(container: HTMLElement | null, trans?: string) {
      if (!container) return;
      container.textContent = '';
      const text = (trans || '').trim();
      if (!text) {
        container.textContent = t('noMeaning', '（暂无释义）');
        return;
      }

      const marks: { tag: string; start: number; at: number }[] = [];
      let m: RegExpExecArray | null;
      POS_RE.lastIndex = 0;
      while ((m = POS_RE.exec(text)) !== null) {
        marks.push({ tag: m[0].trim(), start: m.index + m[0].length, at: m.index });
      }
      if (marks.length === 0) {
        container.textContent = text;
        return;
      }

      const firstMark = marks[0];
      if (firstMark && firstMark.at > 0) {
        const pre = text.slice(0, firstMark.at).replace(/[；;]+$/, '').trim();
        if (pre) addTransLine(container, '', pre);
      }
      for (let i = 0; i < marks.length; i++) {
        const cur = marks[i];
        if (!cur) continue;
        const next = marks[i + 1];
        const segEnd = next ? next.at : text.length;
        const seg = text.slice(cur.start, segEnd).replace(/[；;]+$/, '').trim();
        if (seg) addTransLine(container, cur.tag, seg);
      }
    }

    function addTransLine(container: HTMLElement, tag: string, body: string) {
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
      if (!checkExtAlive()) return;
      let canonical = currHighlightNode ? currHighlightNode.getAttribute('data-word') : null;
      if (!canonical && bubbleWord) canonical = bubbleWord.toLowerCase();

      let original = (canonical && wordInfos[canonical]?.word) || null;
      if (!original && currHighlightNode) {
        const d = currHighlightNode.getAttribute('data-display');
        if (d) original = d;
      }
      if (!original && bubbleWord) original = bubbleWord;
      if (!original && canonical) original = canonical;

      const info = canonical ? wordInfos[canonical] : null;
      if (!canonical || !original) return;

      const confirmed = await showConfirm(t('confirmDelete', '确认删除「$1」？', [original]), t('ariaDelete', '删除'));
      if (!confirmed) return;

      hideBubble();
      safeSendMessage(
        {
          type: 'delete',
          wordData: { word: original, canonical },
        },
        (msg) => {
          if (msg) {
            logDebug('删除:', msg);
            showToast(msg, /^⚠️/.test(msg) ? 'warn' : 'ok');
          }
          if (canonical) removeAllHighlights(canonical);
        }
      );
    }

    function removeAllHighlights(canonical: string) {
      const nodes = document.querySelectorAll('.yh-highlight');
      nodes.forEach((el) => {
        if (el.getAttribute('data-word') === canonical) {
          const text = document.createTextNode(el.textContent || '');
          if (el.parentNode) el.parentNode.replaceChild(text, el);
        }
      });
      if (currHighlightNode && currHighlightNode.getAttribute('data-word') === canonical) {
        currHighlightNode = null;
      }
    }

    function removeStaleHighlights() {
      document.querySelectorAll('.yh-highlight').forEach((el) => {
        const canonical = el.getAttribute('data-word');
        if (canonical && !wordInfos[canonical]) {
          const text = document.createTextNode(el.textContent || '');
          if (el.parentNode) el.parentNode.replaceChild(text, el);
        }
      });
    }

    function replaceWordInfos(nextWordInfos: Record<string, WordInfo>) {
      wordInfos = nextWordInfos || {};
      wordMatcher.buildIndex(Object.keys(wordInfos));
      removeStaleHighlights();
      doHighlight();
    }

    // ===== 监听设置变化 =====
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.debugLog) debugLogEnabled = !!changes.debugLog.newValue;

      if (changes.newWords) {
        const nv = changes.newWords.newValue as any;
        if (nv && nv.wordInfos) {
          replaceWordInfos(nv.wordInfos);
        }
      }

      if (changes.toggle) {
        if (changes.toggle.newValue === false) {
          document.querySelectorAll('.yh-highlight').forEach((el) => {
            el.outerHTML = el.textContent || '';
          });
          if (bubbleEl) bubbleEl.style.display = 'none';
          cancelHover();
          cancelTts();
        } else {
          doHighlight();
        }
      }

      if (changes.highlightBackground || changes.highlightText || changes.highlightStyle || changes.bubbleBackground || changes.bubbleText) {
        safeStorageGet(['highlightBackground', 'highlightText', 'highlightStyle', 'bubbleBackground', 'bubbleText'], applyStyles);
      }
    });

    chrome.runtime.onMessage.addListener((msg: MessageRequest) => {
      if (msg.type === 'wordsUpdated') {
        safeStorageGet(['newWords'], (r) => {
          if (r.newWords && r.newWords.wordInfos) {
            replaceWordInfos(r.newWords.wordInfos);
          }
        });
      }
      if (msg.type === 'settingsChanged') {
        safeStorageGet(
          ['toggle', 'highlightBackground', 'highlightText', 'highlightStyle', 'bubbleBackground', 'bubbleText', 'ttsToggle'],
          (r) => {
            settings = r;
            applyStyles(r);
            if (r.toggle !== false) doHighlight();
          }
        );
      }
      if (msg.type === 'loginExpired') {
        loggedIn = false;
        showLoginBanner(msg.reason || '');
      }
    });

    // ===== 初始化入口 =====
    safeStorageGet(
      [
        'toggle', 'newWords', 'highlightBackground', 'highlightText', 'highlightStyle',
        'bubbleBackground', 'bubbleText', 'ttsToggle', 'loggedIn', 'userLoggedOut', 'debugLog', 'uiLang'
      ],
      (result) => {
        settings = result;
        debugLogEnabled = !!result.debugLog;
        if (result.uiLang) setLanguage(result.uiLang);
        loggedIn = result.userLoggedOut ? false : !!result.loggedIn;

        if (result.toggle !== false && result.newWords && result.newWords.wordInfos) {
          wordInfos = result.newWords.wordInfos;
          wordMatcher.buildIndex(Object.keys(wordInfos));
          doHighlight();
        }

        createBubble();
        applyStyles(result);
        observeDOM();

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local') return;
          if (changes.uiLang && bannerReason !== null) {
            showLoginBanner(bannerReason);
          }
          if (changes.loggedIn || changes.userLoggedOut) {
            const lo = !!(changes.userLoggedOut ? changes.userLoggedOut.newValue : result.userLoggedOut);
            const li = !!(changes.loggedIn ? changes.loggedIn.newValue : result.loggedIn);
            loggedIn = lo ? false : li;
            result.userLoggedOut = lo;
            result.loggedIn = li;
          }
        });

        const rehighlight = () => {
          if (Object.keys(wordInfos).length) doHighlight();
        };
        if (document.readyState === 'complete') {
          setTimeout(rehighlight, 400);
        } else {
          window.addEventListener('load', rehighlight);
        }
      }
    );
  },
});
