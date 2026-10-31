/**
 * Popup 脚本 - 设置界面逻辑
 */

const $ = (sel) => document.querySelector(sel);

/** i18n 简写：见 lib/i18n.js。fallback 恒为中文原文，取不到语言包时也不会出现空白。 */
const t = (key, fallback, subs) =>
  (globalThis.YHI18n ? YHI18n.t(key, fallback, subs) : (fallback || key));

/** 设定界面语言：'auto' | 'zh_CN' | 'en'。YHI18n 缺失（测试桩）时静默跳过。 */
function applyLanguage(value) {
  if (globalThis.YHI18n && YHI18n.setLanguage) YHI18n.setLanguage(value || 'auto');
}

/**
 * 扩展上下文守卫：在 chrome://extensions 点「重新加载」后，仍然开着的弹窗会与扩展失联，
 * 此时任何 chrome.* 调用都会同步抛 "Extension context invalidated."，
 * 点任意按钮都会在弹窗控制台报一条未捕获错误。这里统一收口，失效时静默返回。
 */
function isExtAlive() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
  catch (_) { return false; }
}

/** 安全发消息：上下文失效时静默跳过，失败时回调收到 null */
function safeSendMessage(message, callback) {
  if (!isExtAlive()) { if (callback) callback(null); return false; }
  try {
    if (typeof callback === 'function') {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) { callback(null); return; }
        callback(res);
      });
    } else {
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
    return true;
  } catch (_) { if (callback) callback(null); return false; }
}

const els = {
  toggle: $('#toggle'),
  ttsToggle: $('#ttsToggle'),
  autoSync: $('#autoSync'),
  syncBtn: $('#syncBtn'),
  logoutBtn: $('#logoutBtn'),
  resetBtn: $('#resetBtn'),
  highlightBg: $('#highlightBg'),
  highlightText: $('#highlightText'),
  presets: document.querySelectorAll('.preset'),
  loginArea: $('#loginArea'),
  accountArea: $('#accountArea'),
  loginBtn: $('#loginBtn'),
  userName: $('#userName'),
  wordbookCount: $('#wordbookCount'),
  userAvatar: $('#userAvatar'),
  voiceSelect: $('#voiceSelect'),
  previewBtn: $('#previewBtn'),
  langSelect: $('#langSelect'),
  helpBtn: $('#helpBtn'),
  toastArea: $('#toastArea'),
  dialogArea: $('#dialogArea'),
};

// 版本号跟随 manifest 动态更新
try {
  const ver = typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version;
  if (ver) {
    const vEl = $('.version');
    if (vEl) vEl.textContent = `v${ver}`;
  }
} catch (_) {}

// ===== 操作结果提示 / 确认框 =====
// 不用 alert/confirm：在扩展弹窗里它们会阻塞、样式与主题无关，且弹窗失焦就可能被关掉。
let toastTimer = null;

/** 顶部/底部条状轻提示，自动消失 */
function showToast(message, type) {
  if (!els.toastArea || !message) return;
  els.toastArea.textContent = message;
  els.toastArea.classList.toggle('toast-warn', type === 'warn');
  els.toastArea.classList.add('toast-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toastArea.classList.remove('toast-show');
  }, 4000);
}

/** @returns {Promise<boolean>} */
function showConfirm(message, confirmLabel) {
  return new Promise((resolve) => {
    const area = els.dialogArea;
    if (!area) { resolve(false); return; }

    area.textContent = '';

    const card = document.createElement('div');
    card.className = 'dialog-card';

    const text = document.createElement('div');
    text.className = 'dialog-text';
    text.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.id = 'dialogCancel';
    cancel.className = 'dialog-btn';
    cancel.textContent = t('btnCancel', '取消');

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.id = 'dialogConfirm';
    ok.className = 'dialog-btn dialog-btn-danger';
    ok.textContent = confirmLabel || t('btnConfirm', '确认');

    actions.appendChild(cancel);
    actions.appendChild(ok);
    card.appendChild(text);
    card.appendChild(actions);
    area.appendChild(card);
    area.hidden = false;

    const finish = (result) => {
      area.hidden = true;
      area.textContent = '';
      resolve(result);
    };
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
  });
}

// 有道登录会话 cookie 已知名称（站点改版后可能变化，待浏览器验证）
const KNOWN_LOGIN_COOKIES = [
  'DICT_SESS', 'OUTFOX_CNR_MEMBER_LOGIN', 'YNOTE_SESS'
];

function isLoginCookie(c) {
  if (!c || !c.name) return false;
  const name = c.name.trim();
  if (KNOWN_LOGIN_COOKIES.includes(name)) {
    return Boolean(c.value && c.value.trim().length > 0);
  }
  if (name === 'P_INFO') {
    if (!c.value) return false;
    const firstPart = c.value.split('|')[0].trim();
    return Boolean(firstPart && firstPart.length > 0 && !firstPart.includes('undefined'));
  }
  return false;
}

/**
 * 读取某域下的 cookie，吞掉 host 权限缺失导致的 lastError（避免控制台报错）
 */
function readCookiesFor(url) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ url }, (cs) => {
      if (chrome.runtime.lastError) { resolve([]); return; }
      resolve(cs || []);
    });
  });
}

/**
 * 通过 cookie 判断有道登录态（严格匹配真实登录会话，排除访客标识）
 */
async function detectLoginByCookie() {
  const sources = ['https://dict.youdao.com/', 'https://www.youdao.com/', 'https://youdao.com/'];
  for (const url of sources) {
    const cookies = await readCookiesFor(url);
    if (cookies.some(isLoginCookie)) {
      return true;
    }
  }
  return false;
}

/**
 * 检测是否已登录有道
 * 优先级：① 同步成功写入的 loggedIn ② 用户主动登出标记 ③ 会话 cookie 启发式扫描
 *
 * 注意 ②：用户点了「登出」后必须让判定保持未登录，否则下次打开弹窗时
 * cookie 兜底扫描又会把浏览器里仍然存在的有道登录 cookie 判成已登录，
 * 登出就形同虚设。所以 userLoggedOut 为 true 时直接短路，不再猜。
 */
function checkLogin(callback) {
  chrome.storage.local.get(['loggedIn', 'userLoggedOut'], (s) => {
    if (s.loggedIn) { callback(true); return; }
    if (s.userLoggedOut) { callback(false); return; }
    detectLoginByCookie().then((ok) => callback(ok));
  });
}

/**
 * 按登录状态渲染「词典」卡片：
 *   未登录 → 登录按钮
 *   已登录 → 同步 + 登出
 * 三个按钮分别归属各自的容器，切换容器即可整体显隐。
 */
function renderAuthState(loggedIn) {
  els.loginArea.style.display = loggedIn ? 'none' : 'flex';
  els.accountArea.style.display = loggedIn ? 'flex' : 'none';
}

// 把与存储色一致的预设标为选中（定义在初始化之前，避免依赖声明提升）
function markActivePreset(bg) {
  els.presets.forEach(p => p.classList.toggle('active', p.dataset.bg === bg));
}

// ===== 初始化 =====
chrome.storage.local.get([
  'toggle', 'ttsToggle', 'autoSync', 'newWords', 'loggedIn', 'userLoggedOut',
  'highlightBackground', 'highlightText', 'uiLang'
], (result) => {
  // 语言先定下来再渲染：下面的卡片标题已经在 HTML 里换过，JS 动态文案都走 t()
  applyLanguage(result.uiLang);
  if (els.langSelect) els.langSelect.value = result.uiLang || 'auto';

  els.toggle.checked = result.toggle !== false;
  els.ttsToggle.checked = result.ttsToggle !== false;
  els.autoSync.checked = result.autoSync !== false;

  // 高亮颜色（统一存储 hex6）
  const savedBg = toHex6(result.highlightBackground || '#ffe464');
  els.highlightBg.value = savedBg;
  if (result.highlightText) {
    els.highlightText.value = result.highlightText;
  }
  markActivePreset(savedBg);   // 回填当前选中的预设

  // 登录态 -> 切换「登录」/「同步 + 登出」
  checkLogin((loggedIn) => {
    renderAuthState(loggedIn);
    if (loggedIn) updateAccountInfo(result);
  });

  // 主动用服务端探测校验登录态（cookie 启发式可能漏判会话过期）：
  // 以服务端结果为准刷新 UI，发现失效则展示登录入口。
  // 注意：仅当响应是带 ok 布尔的有效对象时才覆盖 cookie 渲染结果，
  // 避免旧版/桩返回非对象响应时把正确的已登录态误判为未登录。
  // 主动登出只清扩展自身的状态，浏览器仍会保留有道站点 Cookie。
  // 因此不能再用服务端探测覆盖 userLoggedOut，否则重新打开 popup 会又显示为已登录。
  if (!result.userLoggedOut) {
    safeSendMessage({ type: 'checkLogin' }, (r) => {
      if (!r || typeof r.ok !== 'boolean') return;
      if (r.ok) {
        renderAuthState(true);
        updateAccountInfo(result);
      } else {
        renderAuthState(false);
        // 兜底清掉 cookie 启发式留下的 loggedIn，避免 popup 显示不一致
        chrome.storage.local.set({ loggedIn: false });
      }
    });
  }

  loadVoices();
});

// 有道图标加载失败时退回字母头像
if (els.userAvatar) {
  els.userAvatar.addEventListener('error', () => {
    const span = document.createElement('span');
    span.className = 'user-avatar';
    span.textContent = 'Y';
    els.userAvatar.replaceWith(span);
    els.userAvatar = null;
  });
}

// 更新已登录区域：用户信息 + 生词本数量
function updateAccountInfo(result) {
  result = result || {};
  const count = (result.newWords && result.newWords.wordInfos)
    ? Object.keys(result.newWords.wordInfos).length : 0;
  els.wordbookCount.textContent = t('wordbookCount', '生词本：$1 个', [count]);
  els.userName.textContent = t('defaultAccountName', '有道词典');
}

// ===== 开关事件 =====
els.toggle.addEventListener('change', () => {
  chrome.storage.local.set({ toggle: els.toggle.checked });
  notifyContent();
});

els.ttsToggle.addEventListener('change', () => {
  chrome.storage.local.set({ ttsToggle: els.ttsToggle.checked });
});

els.autoSync.addEventListener('change', () => {
  chrome.storage.local.set({ autoSync: els.autoSync.checked });
});

// ===== 界面语言（跟随浏览器 / 中文 / English）=====
// 写盘成功后重载弹窗：语音名、生词本数量等由 JS 渲染的文案需要按新语言重算一遍。
if (els.langSelect) {
  els.langSelect.addEventListener('change', () => {
    const value = els.langSelect.value;
    applyLanguage(value);
    chrome.storage.local.set({ uiLang: value }, () => location.reload());
  });
}

// ===== 登录按钮：清掉「主动登出」标记，让下次打开弹窗恢复 cookie 兜底检测 =====
els.loginBtn.addEventListener('click', () => {
  chrome.storage.local.set({ userLoggedOut: false });
});

// ===== 登出按钮（仅在已登录状态可见）=====
els.logoutBtn.addEventListener('click', async () => {
  const ok = await showConfirm(t('confirmLogout',
    '确认登出有道词典？\n\n' +
    '· 登出后需要重新登录才能同步生词本\n' +
    '· 已同步到本地的生词会保留，网页高亮继续生效'),
    t('ariaLogout', '登出账号'));
  if (!ok) return;

  els.logoutBtn.disabled = true;
  safeSendMessage({ type: 'logout' }, (msg) => {
    els.logoutBtn.disabled = false;
    if (msg) showToast(msg);
    renderAuthState(false);
  });
});

// ===== 同步按钮（图标，悬浮 popover 提示「同步」）=====
els.syncBtn.addEventListener('click', () => {
  els.syncBtn.disabled = true;
  els.syncBtn.classList.add('syncing');   // 图标旋转表示同步中

  safeSendMessage({ type: 'sync' }, (msg) => {
    els.syncBtn.disabled = false;
    els.syncBtn.classList.remove('syncing');

    if (msg) {
      showToast(msg, /^⚠️/.test(msg) ? 'warn' : 'ok');
      // 同步成功即视为已登录：刷新条目并保证三个按钮回到正确的显隐
      chrome.storage.local.get(['newWords', 'loggedIn'], (r) => {
        renderAuthState(!!r.loggedIn);
        updateAccountInfo(r);
      });
    }
    notifyContent();
  });
});

// ===== 发音：语音列表 / 选择 / 试听 =====
/** 判断是否谷歌语音（voiceName 或 extensionId 含 google） */
function isGoogleVoice(v) {
  return /google/i.test(v.voiceName || '') || /google/i.test(v.extensionId || '');
}

/** 是否英语语音（lang 以 en 开头） */
function isEnglishVoice(v) {
  return /^en/i.test((v && v.lang) || '');
}

/** 排序权重：en-US 优先，其次其他 en */
function voiceRank(v) {
  const lang = (v && v.lang) || '';
  if (/^en[-_]us/i.test(lang)) return 0;
  if (/^en/i.test(lang)) return 1;
  return 2;
}

/** 排序：谷歌语音优先（在线音质更好），其次系统嗓音；同级 en-US 在前，最后按名称稳定排序 */
function voiceOrder(a, b) {
  return (Number(!isGoogleVoice(a)) - Number(!isGoogleVoice(b)))
    || (voiceRank(a) - voiceRank(b))
    || String(a.voiceName || '').localeCompare(String(b.voiceName || ''));
}

/**
 * 枚举可用英语语音填充下拉框（与 service-worker 的「谷歌优先 + 系统兜底」策略一致），
 * 并回填已保存的选择。
 *
 * 为什么系统嗓音要限量：macOS 的系统英语语音有 40+ 个（含 Zarvox / Bells 这类趣味音），
 * 全列进下拉框会彻底淹没可选列表。谷歌英语语音全部列出，系统嗓音只取排序后的前 N 个。
 * 想看全部或指定冷门语音的用户，把下拉框留在「自动」即可 —— 兜底逻辑不依赖这里的列表。
 */
function loadVoices() {
  // 注意：必须放在函数内。popup 初始化时就会调 loadVoices()，
  // 写成模块级 const 会在声明前被访问 → TDZ 报错。
  const SYSTEM_VOICE_LIMIT = 10;
  const sel = els.voiceSelect;
  if (!sel) return;

  if (!chrome.tts || !chrome.tts.getVoices) {
    sel.disabled = true;
    return;
  }

  chrome.tts.getVoices((voices) => {
    // 语言只保留英语：谷歌语音全部保留，系统嗓音限量
    const englishVoices = (voices || [])
      .filter(v => isEnglishVoice(v) && v.voiceName)
      .sort(voiceOrder);
    const english = englishVoices.filter(isGoogleVoice)
      .concat(englishVoices.filter(v => !isGoogleVoice(v)).slice(0, SYSTEM_VOICE_LIMIT));

    // 保留「自动」选项，其余重建
    // 谷歌语音的「Google 」前缀冗余，去掉以便在窄下拉框里完整显示
    // 「自动」选项：用 createElement 而不是 innerHTML（文案来自语言包，不拼 HTML）
    sel.textContent = '';
    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    autoOpt.textContent = t('voiceAuto', '自动（推荐）');
    sel.appendChild(autoOpt);

    for (const v of english) {
      const opt = document.createElement('option');
      opt.value = v.voiceName;
      const shortName = (v.voiceName || '').replace(/^Google\s+/i, '');
      opt.textContent = v.lang ? `${shortName}（${v.lang}）` : shortName;
      sel.appendChild(opt);
    }

    if (!englishVoices.length) {
      sel.disabled = true;
      sel.title = t('noEnglishVoiceTitle', '未检测到英语语音，发音不可用；请在系统设置中安装英语语音');
    }

    // 回填已保存的语音（若该语音不在列表中则回落到「自动」）
    chrome.storage.local.get(['ttsVoice'], (r) => {
      if (r.ttsVoice && english.some(v => v.voiceName === r.ttsVoice)) {
        sel.value = r.ttsVoice;
      } else if (r.ttsVoice) {
        chrome.storage.local.remove('ttsVoice');
      }
    });
  });
}

// 选择语音后立即保存
els.voiceSelect.addEventListener('change', () => {
  chrome.storage.local.set({ ttsVoice: els.voiceSelect.value }, () => {
    // 试听一下，方便确认选择
    preview();
  });
});

// 试听按钮
if (els.previewBtn) {
  els.previewBtn.addEventListener('click', preview);
}

function preview() {
  safeSendMessage({ type: 'tts', word: 'highlight', force: true });
}

// ===== 恢复默认 =====
els.resetBtn.addEventListener('click', async () => {
  const ok = await showConfirm(
    t('confirmReset', '确认恢复默认设置？'),
    t('btnReset', '恢复默认'));
  if (!ok) return;
  safeSendMessage({ type: 'resetSettings' }, () => {
    location.reload();
  });
});

// ===== 说明：打开内置说明页 =====
if (els.helpBtn) {
  els.helpBtn.addEventListener('click', () => {
    if (!isExtAlive()) return;
    chrome.tabs.create({ url: chrome.runtime.getURL('docs/tutorial.html') }, () => {
      if (!chrome.runtime.lastError) window.close();
    });
  });
}

// ===== 颜色预设 =====
els.presets.forEach((preset) => {
  preset.addEventListener('click', () => {
    const bg = preset.dataset.bg;   // hex6
    const text = preset.dataset.text;

    // 移除其他 active
    els.presets.forEach(p => p.classList.remove('active'));
    preset.classList.add('active');

    els.highlightBg.value = bg;
    els.highlightText.value = text || '#000000';

    // 统一存储 hex6，透明度在渲染时固定
    chrome.storage.local.set({
      highlightBackground: bg,
      highlightText: text
    }, applyStyleToAllTabs);
  });
});

// ===== 自定义颜色 =====
// 拆分背景色与文字色监听：仅改背景色时不强制覆写文字色，
// 而用户显式操作文字色拾色器时允许保存纯黑 #000000（适配深色网页底色）。
function handleCustomBgColor() {
  els.presets.forEach(p => p.classList.remove('active'));
  chrome.storage.local.set({
    highlightBackground: els.highlightBg.value
  }, applyStyleToAllTabs);
}

function handleCustomTextColor() {
  els.presets.forEach(p => p.classList.remove('active'));
  chrome.storage.local.set({
    highlightText: els.highlightText.value
  }, applyStyleToAllTabs);
}

els.highlightBg.addEventListener('input', handleCustomBgColor);
els.highlightText.addEventListener('input', handleCustomTextColor);

// ===== 工具函数 =====
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 将 hex8 / rgba / hex6 统一归一为 hex6，用于颜色输入框回填
function toHex6(color) {
  if (typeof color !== 'string') return '#ffffff';
  if (color.startsWith('#')) return color.slice(0, 7);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map(s => parseFloat(s.trim()));
    const h = (n) => Math.round(n).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  return '#ffffff';
}

// 配色变更后让内容脚本立即重应用。
// 各标签页本来就会收到 chrome.storage.onChanged（content.js 监听 --yh-* 变量），
// 这里额外通知当前活动标签页只是为了即时生效，不再让 SW 逐个标签页 insertCSS。
function applyStyleToAllTabs() {
  notifyContent();
}

function notifyContent() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'settingsChanged' }).catch(() => {});
    }
  });
}
