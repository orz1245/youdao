/**
 * 生词高亮助手 - 正文判定与 DOM 过滤引擎
 *
 * 核心目标：让生词阅读标记严格集中于网页的「实际正文（Article / Body text）」，
 * 自动排除导航栏（nav）、页头（header）、页脚（footer）、侧边栏（aside）、
 * 代码块（code / pre）、按钮表单（button / input）、弹窗与广告分享等噪音区域。
 */

/**
 * 判定一个 Element 是否属于应被整棵树剔除的非正文容器
 */
export function isExcludedElement(el: Element | null): boolean {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;

  // 1. 原生非内容、表单交互及技术代码标签
  if (
    tag === 'SCRIPT' ||
    tag === 'STYLE' ||
    tag === 'NOSCRIPT' ||
    tag === 'TEXTAREA' ||
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'OPTION' ||
    tag === 'BUTTON' ||
    tag === 'CODE' ||
    tag === 'PRE' ||
    tag === 'KBD' ||
    tag === 'SAMP' ||
    tag === 'NAV' ||
    tag === 'FOOTER' ||
    tag === 'ASIDE' ||
    tag === 'DIALOG' ||
    tag === 'SVG' ||
    tag === 'CANVAS' ||
    tag === 'IFRAME'
  ) {
    return true;
  }

  // 2. 页面顶部网站级 header（保留 article 内可能包含的文章标题 header）
  if (tag === 'HEADER') {
    if (!el.closest('article')) return true;
  }

  // 3. 可编辑或插件内置组件
  if ((el as HTMLElement).isContentEditable) return true;
  const classList = el.classList;
  if (classList) {
    if (
      classList.contains('yh-bubble') ||
      classList.contains('yh-highlight') ||
      classList.contains('yh-toast') ||
      classList.contains('yh-confirm') ||
      classList.contains('yh-login-banner')
    ) {
      return true;
    }
  }

  // 4. ARIA 语义角色排除（导航、横幅、补充内容、工具栏、菜单、弹窗等）
  const role = el.getAttribute('role');
  if (role) {
    if (
      role === 'navigation' ||
      role === 'banner' ||
      role === 'contentinfo' ||
      role === 'complementary' ||
      role === 'menu' ||
      role === 'menubar' ||
      role === 'tablist' ||
      role === 'toolbar' ||
      role === 'search' ||
      role === 'dialog' ||
      role === 'alertdialog' ||
      role === 'tooltip'
    ) {
      return true;
    }
  }

  // 5. 常见导航、侧栏、广告、面包屑类名特征匹配
  const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  if (className) {
    if (
      /(^|\s|-)(nav|navbar|menu|sidebar|breadcrumb|pagination|site-header|site-footer|footer-links|ad|ads|advertisement|social-share|share-bar)($|\s|-)/i.test(
        className
      )
    ) {
      // 避免误伤包含正文语义的类名（例如 article-content, post-body）
      if (!/article|content|story|post|body|reading/i.test(className)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 判定一个文本节点是否属于正文阅读内容并应该被高亮
 */
export function isHighlightableTextNode(node: Node | null): boolean {
  if (!node || node.nodeType !== 3) return false;
  const text = node.textContent;
  if (!text || !text.trim()) return false;

  const parent = node.parentElement;
  if (!parent) return false;

  // 1. 直属父级及祖先排除检测
  if (isExcludedElement(parent)) return false;
  if (parent.closest('[role="textbox"], [role="button"], [contenteditable="true"]')) return false;

  // 2. 已处于高亮节点内不重复标记
  if (parent.classList && parent.classList.contains('yh-highlight')) return false;

  const parentTag = parent.tagName;

  // 3. 明确的正文排版标签：直接判定为正文
  const isDirectContentTag = /^(P|BLOCKQUOTE|H1|H2|H3|H4|H5|H6|LI|DD|DT|FIGCAPTION)$/.test(parentTag);
  if (isDirectContentTag) return true;

  // 4. 行内排版格式化标签（SPAN、A、STRONG、EM 等）：
  const isInlineFormatTag = /^(SPAN|A|B|STRONG|I|EM|Q|CITE|MARK|SMALL|SUB|SUP)$/.test(parentTag);
  if (isInlineFormatTag) {
    // 祖先链中必须包含正文上下文（如 P、ARTICLE、MAIN、[role="main"] 或正文类容器）
    const contentAncestor = parent.closest(
      'p, blockquote, article, main, [role="main"], li, dd, dt, h1, h2, h3, h4, h5, h6, .content, .post-content, .article-body, .markdown-body, .entry-content'
    );
    if (contentAncestor) return true;

    // 若无明确正文容器，具备句子级长度（>= 25 字符且有空格间隔）也归入正文流
    const trimmed = text.trim();
    if (trimmed.length >= 25 && /\s/.test(trimmed)) return true;

    return false;
  }

  // 5. 通用块级容器（DIV、TD、TH、SECTION）：
  if (parentTag === 'DIV' || parentTag === 'TD' || parentTag === 'TH' || parentTag === 'SECTION') {
    const trimmed = text.trim();
    // 过滤单字或只有一两个词的短 UI 标签（如 "Home", "Sign in", "Next"）
    if (trimmed.length < 15 || !/\s/.test(trimmed)) return false;

    // 处于主要内容区域中
    const contentAncestor = parent.closest(
      'article, main, [role="main"], .content, .post-content, .article-body, .markdown-body, .entry-content'
    );
    if (contentAncestor) return true;

    // 若具有长段落正文文本（>= 30 字符），亦属于有效正文
    if (trimmed.length >= 30) return true;
  }

  return false;
}
