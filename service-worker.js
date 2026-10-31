/**
 * Service Worker - 有道生词高亮
 * 职责：消息中转、有道 API 调用、TTS、Badge 计数
 */

// ===== 日志开关 =====
// 默认静默：商店版不该往用户控制台刷同步/接口明细（其中包含完整响应体）。
// 排查问题时在扩展的 Service Worker 控制台执行 __yhDebug.enable() 打开，
// 开关写入 storage，SW 重启后依然生效；__yhDebug.disable() 关闭。
// 约定：console.warn / console.error 只留给真实的异常与降级，不接入本开关。
const YH_DEBUG_KEY = 'debugLog';
let debugLogEnabled = false;

function logDebug(...args) {
  if (debugLogEnabled) console.log('[YH]', ...args);
}

try {
  chrome.storage.local.get([YH_DEBUG_KEY], (r) => {
    debugLogEnabled = !!(r && r[YH_DEBUG_KEY]);
  });
} catch (_) { /* 无 storage 的环境（测试桩）忽略 */ }

globalThis.__yhDebug = {
  get enabled() { return debugLogEnabled; },
  enable() {
    debugLogEnabled = true;
    try { chrome.storage.local.set({ [YH_DEBUG_KEY]: true }); } catch (_) { /* ignore */ }
    logDebug('调试日志已开启（storage.debugLog = true）');
  },
  disable() {
    debugLogEnabled = false;
    try { chrome.storage.local.set({ [YH_DEBUG_KEY]: false }); } catch (_) { /* ignore */ }
    logDebug('调试日志已关闭');
  },
};

// ===== i18n =====
// SW 是经典脚本，用同步 importScripts 载入 lib/i18n-messages.js + lib/i18n.js，
// 与 popup / content script 共用同一套「用户自选语言」逻辑（含 storage 变化实时跟随）。
// 单测桩环境里没有 importScripts，下面的 t() 会退化成「浏览器语言 + 中文兜底」。
try {
  if (typeof importScripts === 'function') importScripts('lib/i18n-messages.js', 'lib/i18n.js');
} catch (err) {
  console.warn('[YH] i18n 载入失败，回退到浏览器语言：', err && err.message);
}

// fallback 一律写中文原文：语言包缺失时界面也不会出现空白或裸 key。
function t(key, fallback, subs) {
  if (globalThis.YHI18n && globalThis.YHI18n.t) {
    try { return globalThis.YHI18n.t(key, fallback, subs); } catch (_) { /* 忽略：走下面的兜底 */ }
  }
  try {
    if (chrome.i18n && chrome.i18n.getMessage) {
      const msg = chrome.i18n.getMessage(key, subs);
      if (msg) return msg;
    }
  } catch (_) { /* 忽略：走 fallback */ }
  let out = fallback || key;
  const list = Array.isArray(subs) ? subs : (subs == null ? [] : [subs]);
  list.forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
  return out;
}

/**
 * 等语言设置从 storage 读回来再生成用户可见文案。
 * SW 常被消息唤醒，冷启动时 storage 还没回到，直接 t() 会漏掉用户自选语言。
 * 单测桩里没有 YHI18n，此时同步执行，保持原有回调时序。
 */
function whenI18nReady(fn) {
  const ready = globalThis.YHI18n && globalThis.YHI18n.ready;
  if (ready && typeof ready.then === 'function') ready.then(fn);
  else fn();
}

// ===== 内联：有道生词本 HTML 解析器（SW 不支持 ESM import）=====
function _wbAddInfo(map, w) {
  if (!w || !w.word) return;
  const key = w.word.toLowerCase().trim();
  if (!key || key.length < 2) return;
  if (!map[key]) {
    map[key] = {
      word: w.word.trim(),
      phonetic: (w.phonetic || '').replace(/^\[|\]$/g, '').trim(),
      trans: (w.trans || '').trim(),
      itemId: key
    };
  }
}
function _wbObjectSlice(html, index) {
  const start = html.lastIndexOf('{', index);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) return html.slice(start, i + 1); }
  }
  return html.slice(start);
}
function _wbExtractFromJson(html) {
  const out = [];
  const re = /"(?:word|name)"\s*:\s*"([^"]{1,60})"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const word = m[1];
    const obj = _wbObjectSlice(html, m.index);
    const phon = obj.match(/"phonetic"\s*:\s*"([^"]*)"/i);
    const trans = obj.match(/"trans"\s*:\s*"([^"]*)"/i);
    out.push({ word, phonetic: phon ? phon[1] : '', trans: trans ? trans[1] : '' });
  }
  return out;
}
function _wbExtractFromHtml(html) {
  const out = [];
  const wordRe = /<([a-z][a-z0-9]*)\b[^>]*class="[^"]*(?:word|name|wb-word|item-word)[^"]*"[^>]*>([a-zA-Z][a-zA-Z'\-\s]{0,40})<\/\1>/gi;
  let m;
  while ((m = wordRe.exec(html)) !== null) {
    const word = m[2].trim();
    if (word.length < 2) continue;
    const win = html.slice(m.index, m.index + 500);
    const phon = win.match(/\[([^\]]+)\]/);
    const transMatch = win.match(/(?:trans|mean|content|translate)[^>]*>([^<]{2,200})</i)
      || win.match(/>([\u4e00-\u9fa5][^<]{1,200})</);
    out.push({ word, phonetic: phon ? phon[1] : '', trans: transMatch ? transMatch[1].trim() : '' });
  }
  return out;
}
function parseWordbookHtml(html) {
  const wordInfos = {};
  if (typeof html !== 'string' || !html.trim()) return wordInfos;
  for (const w of _wbExtractFromJson(html)) _wbAddInfo(wordInfos, w);
  for (const w of _wbExtractFromHtml(html)) _wbAddInfo(wordInfos, w);
  return wordInfos;
}
// ===== 解析器内联结束 =====

// ===== 默认设置 =====
const DEFAULT_SETTINGS = {
  toggle: true,
  ttsToggle: true,
  highlightBackground: '#ffe464',
  highlightText: '',
  bubbleBackground: '#ffffff',
  bubbleText: '',
  syncTime: 0,
  autoSync: true,
  ttsVoice: '',   // 发音语音（voiceName）；空 = 自动挑选谷歌语音
  uiLang: 'auto', // 界面语言：auto（跟随浏览器）| zh_CN | en
  userLoggedOut: false,  // 用户主动登出标记：为 true 时不再用 cookie 兜底判登录、不自动同步
};

// ===== 自动同步调度（MV3 Service Worker 不能靠常驻运行保证每天执行） =====
const AUTO_SYNC_ALARM = 'youdaoDailyWordbookSync';
const AUTO_SYNC_PERIOD_MINUTES = 24 * 60;
const DAY_MS = AUTO_SYNC_PERIOD_MINUTES * 60 * 1000;
let autoSyncInFlight = false;

/** 创建缺失的每日 Alarm；Chrome 重启后也会由 onStartup 再次确认。 */
function ensureAutoSyncAlarm() {
  if (!chrome.alarms) return;
  chrome.alarms.get(AUTO_SYNC_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(AUTO_SYNC_ALARM, {
        delayInMinutes: AUTO_SYNC_PERIOD_MINUTES,
        periodInMinutes: AUTO_SYNC_PERIOD_MINUTES
      });
    }
  });
}

/** 按设置与上次成功同步时间决定是否执行，供启动兜底和 Alarm 共用。 */
function maybeAutoSync(trigger) {
  chrome.storage.local.get(['autoSync', 'userLoggedOut', 'syncTime'], (result) => {
    if (result.autoSync === false || result.userLoggedOut || autoSyncInFlight) return;
    if (Date.now() - (result.syncTime || 0) < DAY_MS) return;
    autoSyncInFlight = true;
    syncYoudao((msg) => {
      autoSyncInFlight = false;
      logDebug(`Auto-sync (${trigger}):`, msg);
    }, `auto:${trigger}`);
  });
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === AUTO_SYNC_ALARM) maybeAutoSync('alarm');
  });
  // Alarm 可能在浏览器重启后丢失；安装/更新和启动时均补建。
  chrome.runtime.onInstalled?.addListener(ensureAutoSyncAlarm);
  chrome.runtime.onStartup?.addListener(ensureAutoSyncAlarm);
}

// ===== 初始化 =====
chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (result) => {
  // 只补「缺失」的键。整体写 DEFAULT_SETTINGS 会把用户改过的设置一起覆盖回默认值
  // —— 例如用户关掉「生词高亮」，日后版本新增一个设置键触发 needsInit，
  //    用户的选择会被无声重置。同理也会把 userLoggedOut 标记抹掉，让登出失效。
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (result[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) chrome.storage.local.set(patch);

  ensureAutoSyncAlarm();
  // 启动时仍检查一次，覆盖 Alarm 首次创建前就已经过期的旧安装。
  maybeAutoSync('startup');
});

// ===== TTS 发音（谷歌英语语音优先，系统英语语音兜底；可在 popup 中指定具体语音）=====
/** 是否谷歌语音（voiceName 或 extensionId 含 google） */
function isGoogleVoice(v) {
  return /google/i.test(v.voiceName || '') || /google/i.test(v.extensionId || '');
}

/** 是否英语语音（lang 以 en 开头）；非英语一律不读，避免把英文单词念成中文腔 */
function isEnglishVoice(v) {
  return /^en/i.test((v && v.lang) || '');
}

/**
 * 是否本地（离线）嗓音。
 * chrome.tts 的 TtsVoice 只有 remote 字段，Web Speech 的语音对象才用 localService；
 * 两个都认，避免依赖不存在的字段而把本地嗓音误判成在线。
 */
function isLocalVoice(v) {
  if (!v) return false;
  if (typeof v.localService === 'boolean') return v.localService;
  return !v.remote;
}

/**
 * 从语音表中挑出「英语谷歌」语音（首选）
 * 语言只保留英语：en-US 优先，其次其他 en；没有英语谷歌语音则返回 null
 */
function pickGoogleVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const enVoices = voices.filter(v => isGoogleVoice(v) && isEnglishVoice(v));
  if (!enVoices.length) return null;
  const enUS = enVoices.find(v => /^en[-_]us/i.test(v.lang || ''));
  return (enUS || enVoices[0]).voiceName || null;
}

/**
 * 兜底：任意英语语音（不要求谷歌）。
 * 本地嗓音优先 —— 谷歌语音是远程源，离线或网络不通时发不出声；
 * 系统嗓音（Windows 的 Microsoft David/Zira、macOS 的 Samantha）离线可用。
 * Windows 的语音表以 SAPI 嗓音为主，没有这一步就会「点喇叭没反应」。
 */
function pickFallbackVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const enVoices = voices.filter(v => isEnglishVoice(v) && v.voiceName);
  if (!enVoices.length) return null;
  const local = enVoices.filter(v => isLocalVoice(v));
  const pool = local.length ? local : enVoices;
  const enUS = pool.find(v => /^en[-_]us/i.test(v.lang || ''));
  return (enUS || pool[0]).voiceName || null;
}

/**
 * 解析本次使用的语音：
 * 1) 优先用 popup 里指定的 ttsVoice（该语音仍存在且为英语）
 * 2) 其次自动挑英语谷歌语音（en-US 优先）
 * 3) 都没有则回落到任意系统英语语音（离线也能出声）
 */
function resolveVoice(voices, preferred) {
  const list = Array.isArray(voices) ? voices : [];
  if (preferred) {
    const hit = list.find(v => v.voiceName === preferred && isEnglishVoice(v));
    if (hit) return preferred;
    console.warn(`[YH] 已选语音「${preferred}」不可用或非英语，回落到自动选择`);
  }
  return pickGoogleVoice(list) || pickFallbackVoice(list);
}

// ===== 语音表缓存 =====
// chrome.tts.getVoices 是异步 IPC，原实现每次发音都调一次（悬浮即发音 → 调用很频繁）。
// 语音表在会话内基本不变，缓存 5 分钟即可；过期后自动刷新。
const VOICES_CACHE_TTL_MS = 5 * 60 * 1000;
let voicesCache = null;
let voicesCacheAt = 0;
let voiceMissingWarned = false;   // 「没有英语谷歌语音」只提示一次，避免每次悬浮都刷屏

function getVoicesCached(callback) {
  const now = Date.now();
  if (voicesCache && (now - voicesCacheAt) < VOICES_CACHE_TTL_MS) {
    callback(voicesCache);
    return;
  }
  chrome.tts.getVoices((voices) => {
    const list = Array.isArray(voices) ? voices : [];
    // 空列表不落缓存：语音表可能尚未就绪，缓存空值会导致这段时间内一直不发音
    if (list.length) {
      voicesCache = list;
      voicesCacheAt = Date.now();
      voiceMissingWarned = false;   // 语音表变了，允许重新提示一次
    }
    callback(list);
  });
}

/** 只挑本地英语嗓音，用于远程语音失败后的兜底重试 */
function pickLocalEnglishVoice(voices) {
  return pickFallbackVoice((Array.isArray(voices) ? voices : []).filter(v => isLocalVoice(v)));
}

/**
 * 朗读单词；策略为「英语谷歌语音优先，系统英语语音兜底」，完全没有英语语音才跳过。
 *
 * opts.localOnly：只用本地英语嗓音（远程语音失败后的重试走这条路，防止反复失败循环）
 */
function speakWord(word, opts) {
  if (!chrome.tts || !chrome.tts.speak || !chrome.tts.getVoices) {
    console.error('[YH] chrome.tts 不可用：manifest permissions 缺少 "tts"，请在 chrome://extensions 重新加载插件');
    return;
  }
  const retryingLocal = !!(opts && opts.localOnly);

  chrome.storage.local.get(['ttsVoice'], (r) => {
    const preferred = r.ttsVoice || '';
    getVoicesCached((list) => {
      const voiceName = retryingLocal ? pickLocalEnglishVoice(list) : resolveVoice(list, preferred);
      if (!voiceName) {
        // 只提示一次：没有英语语音的机器上，每次悬浮都打印会淹没控制台
        if (!voiceMissingWarned) {
          voiceMissingWarned = true;
          console.warn(
            '[YH] 未找到任何英语语音，已跳过发音（请在系统中安装英语语音包：Windows 设置 → 时间和语言 → 语音 → 添加语音）。\n可用语音：',
            list.map(v => `${v.voiceName}(${v.lang}${isLocalVoice(v) ? ',本地' : ',在线'})`).join(' | ') || '（空）'
          );
        }
        return;
      }
      voiceMissingWarned = false;
      const chosen = list.find(v => v.voiceName === voiceName) || null;
      // 先停掉进行中的朗读再重播：
      // enqueue:false 在「自动发音刚触发后立即点按钮」的快速重复调用下，
      // Chrome 可能直接忽略第二次 speak → 表现为「点喇叭没反应」
      try { chrome.tts.stop(); } catch (_) { /* ignore */ }
      chrome.tts.speak(word, {
        voiceName: voiceName,
        lang: 'en-US',
        rate: 0.9,
        enqueue: false,
        // 谷歌语音为「远程源」，失败原因通过事件上报（如网络不可用、语音未就绪）
        onEvent: (ev) => {
          if (ev.type === 'error' || ev.type === 'interrupted') {
            // 远程嗓音失败最常见的原因就是网络不可达 Google（国内网络下的常态）：
            // 此时语音是被识别出来了，但合成在云端做不了，用户听到的还是「点了没反应」。
            // 换成系统本地英语嗓音重试一次，退出条件由 retryingLocal 保证只重试一层。
            //
            // 注意这里只对 error 重试，不理会 interrupted：我们自己 speak 前会 stop()，
            // 那一下必然让上一条语音产生 interrupted，拿它触发重试会造成重复朗读。
            const chosenIsRemote = !!chosen && (isGoogleVoice(chosen) || !isLocalVoice(chosen));
            if (ev.type === 'error' && !retryingLocal && chosenIsRemote) {
              const localVoice = pickLocalEnglishVoice(list);
              if (localVoice && localVoice !== voiceName) {
                console.warn(
                  `[YH] 在线语音「${voiceName}」发音失败（${ev.errorMessage || '未知原因'}），改用系统语音「${localVoice}」重试`
                );
                speakWord(word, { localOnly: true });
                return;
              }
            }
            console.warn(`[YH] 发音事件 ${ev.type}：${ev.errorMessage || ''}（语音：${voiceName}）`);
          }
        }
      }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[YH] 发音失败：', chrome.runtime.lastError.message);
        }
      });
    });
  });
}

// ===== 消息处理 =====

/**
 * 让异步消息「保证只回一次、且一定回」。
 *
 * 监听器已经 return true（承诺异步回复）。如果 handler 中途抛错、或某条分支忘了回，
 * 响应通道会直接关闭：发送端拿到 "The message port closed before a response was received"，
 * SW 控制台同时报 "A listener indicated an asynchronous response by returning true,
 * but the message channel closed before a response was received" —— 用户看到的就是这两条错误。
 */
function onceResponder(sendResponse, tag) {
  let replied = false;
  return function reply(message) {
    if (replied) return;
    replied = true;
    try { sendResponse(message); }
    catch (e) { console.warn('[YH] 响应失败(' + tag + '):', e && e.message); }
  };
}

/** 跑一个异步消息 handler：同步抛错或 Promise 拒绝都补一次兜底响应，绝不让通道静默关闭 */
function runMessageHandler(tag, reply, fn) {
  const fail = (e) => {
    console.error('[YH] 处理失败(' + tag + '):', e);
    reply(t('opFailed', '⚠️ 操作失败：$1', [e && e.message ? e.message : e]));
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') r.catch(fail);
  } catch (e) { fail(e); }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // TTS 发音
  if (request.type === 'tts') {
    chrome.storage.local.get(['ttsToggle'], (r) => {
      // force=true 用于 popup「试听」，不受悬浮发音开关限制
      if ((r.ttsToggle !== false || request.force) && request.word) {
        speakWord(request.word);
      }
    });
    return false;
  }

  // 同步生词本
  if (request.type === 'sync') {
    const reply = onceResponder(sendResponse, 'sync');
    runMessageHandler('sync', reply, () => whenI18nReady(() => syncYoudao(reply)));
    return true; // 异步响应
  }

  // 服务端登录态探测（popup 打开时主动调用，检测会话是否过期）
  if (request.type === 'checkLogin') {
    const reply = onceResponder(sendResponse, 'checkLogin');
    // 主动登出只影响扩展状态，站点 Cookie 仍可能有效。这里必须尊重该标记，
    // 否则服务端探测会把 popup 又渲染成「已登录」。
    chrome.storage.local.get(['userLoggedOut'], (state) => {
      if (state.userLoggedOut) {
        reply({ ok: false, needLogin: false, loggedIn: false, userLoggedOut: true });
        return;
      }
      checkLoginServer().then((r) => {
        const isLogged = !!(r.ok && r.loggedIn !== false);
        chrome.storage.local.set({ loggedIn: isLogged });
        reply({ ok: isLogged, needLogin: !isLogged, loggedIn: isLogged, reason: r.reason, userId: r.userId });
      }).catch((e) => {
        console.warn('[YH] 登录探测异常:', e && e.message);
        chrome.storage.local.get(['loggedIn'], (stored) => {
          const isLogged = !!stored.loggedIn;
          reply({ ok: isLogged, needLogin: !isLogged, loggedIn: isLogged, reason: '网络错误，无法探测' });
        });
      });
    });
    return true; // 异步响应
  }

  // 打开有道登录页（重新登录入口；内容脚本在页面上无法直接开 tab，转 SW 处理）
  if (request.type === 'openLoginPage') {
    const reply = onceResponder(sendResponse, 'openLoginPage');
    try {
      chrome.tabs.create({ url: YOUDAO_LOGIN_URL }, () => {
        reply({ ok: !chrome.runtime.lastError });
      });
    } catch (e) {
      console.error('[YH] 打开登录页失败:', e);
      reply({ ok: false });
    }
    return true; // 异步响应
  }

  // 删除单词
  if (request.type === 'delete') {
    const reply = onceResponder(sendResponse, 'delete');
    runMessageHandler('delete', reply, () => whenI18nReady(() => deleteWord(request.wordData, reply)));
    return true;
  }

  // 登出（清除扩展内的登录态）
  if (request.type === 'logout') {
    const reply = onceResponder(sendResponse, 'logout');
    runMessageHandler('logout', reply, () => whenI18nReady(() => logoutYoudao(reply)));
    return true;
  }

  // 添加单词
  if (request.type === 'addWord') {
    const reply = onceResponder(sendResponse, 'addWord');
    runMessageHandler('addWord', reply, () => whenI18nReady(() => addWord(request.word, reply)));
    return true;
  }

  // 查词：补全缺失的释义（本地手动添加的生词 / 生词本里缺释义的条目）
  if (request.type === 'lookup') {
    const reply = onceResponder(sendResponse, 'lookup');
    runMessageHandler('lookup', reply, () => whenI18nReady(() => lookupWord(request.word).then(reply)));
    return true;
  }

  // 单词计数（badge）：content script 会攒成一批（request.words）发来，
  // 同时兼容旧的单条形式（request.word）。
  if (request.type === 'count') {
    const words = Array.isArray(request.words)
      ? request.words
      : (request.word ? [request.word] : []);
    countWords(sender.tab && sender.tab.id, words);
    return false;
  }

  // 重置设置
  if (request.type === 'resetSettings') {
    const reply = onceResponder(sendResponse, 'resetSettings');
    try { chrome.storage.local.set(DEFAULT_SETTINGS, () => reply('ok')); }
    catch (e) { console.error('[YH] 重置设置失败:', e); reply('ok'); }
    return true;
  }

  return false;
});

// ===== 有道 API =====
// 生词本同步接口（与登录同域 www.youdao.com，credentials:'include' 自动带该域 Cookie 鉴权）
// 返回格式：{code:0, msg:"SUCCESS", data:{total:N, itemList:[{word, phonetic, trans, itemId}]}}
const YOUDAO_WORDS_URL = 'https://www.youdao.com/wordbook/webapi/words?limit=100000&offset=0';
const YOUDAO_WORDLIST_URL = 'https://www.youdao.com/webwordbook/wordlist';

// ---- 增删接口（实测确认，dict.youdao.com 域，均为 GET）----
//   添加：GET https://dict.youdao.com/wordbook/webapi/v2/ajax/add?word=hello&lan=en
//   删除：GET https://dict.youdao.com/wordbook/webapi/v2/ajax/del?word=hello
// 注意两点与旧实现的差异：
//   1) 删除由 itemId 改为按 word 删除（接口只认单词本身）
//   2) 域名是 dict.youdao.com，不是 www.youdao.com
const YOUDAO_ADD_URL = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/add';
const YOUDAO_DELETE_URL = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/del';

// ---- 查词接口（实测确认，dict.youdao.com，GET）----
//   GET https://dict.youdao.com/suggest?num=5&ver=3.0&doctype=json&cache=false&le=en&q=never
// 返回：
//   {"result":{"msg":"success","code":200},
//    "data":{"entries":[{"explain":"adv. 决不，永不；…","entry":"never"}, …],
//            "query":"never","language":"en","type":"dict"}}
// 注意 entries 是「精确匹配 + 联想词」混排 —— 查 never 会带出 nevertheless / never mind，
// 所以必须挑 entry 与查询词完全一致的那条；直接取 entries[0] 有可能把联想词的释义安到查询词上。
const YOUDAO_SUGGEST_URL = 'https://dict.youdao.com/suggest';

// 重新登录入口：直接打生词本页，未登录会被有道重定向到登录页；登录后回跳本页，
// 比凭记忆写 passport 登录地址更稳（有道登录域名会改版）。
const YOUDAO_LOGIN_URL = YOUDAO_WORDLIST_URL;
const YOUDAO_ACCOUNT_URL = 'https://dict.youdao.com/login/acc/query/accountinfo';

// ===== 同步诊断 =====
// 不保存 HTML 正文、Cookie 或词条内容，只保留接口/页面特征和结果，便于有道改版后定位问题。
const SYNC_DIAGNOSTICS_KEY = 'syncDiagnostics';
const SYNC_DIAGNOSTICS_SCHEMA_VERSION = 1;
const SYNC_INTERFACE_VERSION = 'youdao-wordbook-sync-v2';
const NUXT_PARSER_VERSION = 'nuxt-ssr-json-array-v1';
const MAX_SYNC_DIAGNOSTICS = 20;

// ===== 存储写队列 =====
// chrome.storage.local 没有事务：两个并发的「读整表 → 合并 → 写回」会互相覆盖，后写者赢。
// 把同类写操作排进同一条 promise 链，保证每次「读」都看得见上一次「写」的结果。
function createWriteQueue() {
  let chain = Promise.resolve();
  return function enqueue(task) {
    chain = chain.catch(() => {}).then(task);
    return chain;
  };
}

const enqueueDiagnosticsWrite = createWriteQueue();

function diagnosticError(error) {
  const text = String(error && error.message ? error.message : error || '未知错误');
  return text.slice(0, 240);
}

function responseMetadata(res) {
  return {
    status: Number(res && res.status) || 0,
    ok: !!(res && res.ok),
    contentType: (res && res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('content-type') : '') || ''
  };
}

function describeWordbookPage(html) {
  const text = typeof html === 'string' ? html : '';
  const build = text.match(/(?:buildId|build_id)\s*["':=]+\s*([\w.-]{1,80})/i);
  const hasLoginMarker =
    /passport|login|请登录|未登录|登录后|signin|sign_in/i.test(text) ||
    /<a[^>]*class=["'][^"']*\blogin\b[^"']*["'][^>]*>[\s\S]*?登录[\s\S]*?<\/a>/i.test(text) ||
    /window\.__NUXT__\s*=[\s\S]*?\(\s*["']{2}\s*,\s*false\b/.test(text);

  return {
    parserVersion: NUXT_PARSER_VERSION,
    htmlBytes: text.length,
    hasNuxtPayload: text.includes('__NUXT__'),
    hasLoginMarker,
    nuxtBuildId: build ? build[1] : ''
  };
}

/**
 * 以滚动窗口保存同步健康度。写入串行化，避免一次手动同步与 Alarm 同时完成时互相覆盖。
 */
function recordSyncDiagnostic(result) {
  const entry = {
    timestamp: Date.now(),
    interfaceVersion: SYNC_INTERFACE_VERSION,
    parserVersion: NUXT_PARSER_VERSION,
    ...result,
    attempts: (result.attempts || []).slice(-3)
  };
  return enqueueDiagnosticsWrite(() => new Promise((resolve) => {
    chrome.storage.local.get([SYNC_DIAGNOSTICS_KEY], (stored) => {
      const previous = stored && stored[SYNC_DIAGNOSTICS_KEY];
      const oldStats = previous && previous.stats ? previous.stats : {};
      const total = Number(oldStats.total || 0) + 1;
      const succeeded = Number(oldStats.succeeded || 0) + (entry.ok ? 1 : 0);
      const failed = Number(oldStats.failed || 0) + (entry.ok ? 0 : 1);
      const recent = [...((previous && previous.recentAttempts) || []), entry]
        .slice(-MAX_SYNC_DIAGNOSTICS);
      chrome.storage.local.set({
        [SYNC_DIAGNOSTICS_KEY]: {
          schemaVersion: SYNC_DIAGNOSTICS_SCHEMA_VERSION,
          stats: {
            total,
            succeeded,
            failed,
            failureRate: total ? Number((failed / total).toFixed(4)) : 0
          },
          lastAttempt: entry,
          recentAttempts: recent
        }
      }, resolve);
    });
  }));
}

// ===== 释义缓存 =====
// 同一个词反复悬浮时不再重复打网络。
// 结构：{ [key]: { trans, at } }，at = 写入时间戳（用于 TTL）。
// 兼容 v1 旧格式 { [key]: trans }（纯字符串）：读到按「未过期」处理，下次写入时顺带升级。
const WORD_CACHE_KEY = 'wordCache';
const WORD_CACHE_MAX = 2000;
const WORD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 天
const enqueueCacheWrite = createWriteQueue();

/** 归一化缓存条目，兼容旧版纯字符串值；无效返回 null */
function cacheEntry(raw) {
  if (typeof raw === 'string') return { trans: raw, at: 0 };   // 旧格式：无时间戳 → 视为不过期
  if (raw && typeof raw === 'object' && typeof raw.trans === 'string') {
    return { trans: raw.trans, at: Number(raw.at) || 0 };
  }
  return null;
}

/**
 * 读释义缓存
 * @returns {Promise<string>} 命中且未过期返回释义，未命中返回空串
 */
function getCachedMeaning(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([WORD_CACHE_KEY], (r) => {
      const c = r && r[WORD_CACHE_KEY];
      const entry = (c && typeof c === 'object') ? cacheEntry(c[key]) : null;
      if (!entry || !entry.trans) { resolve(''); return; }
      // 过期即视为未命中 → 触发一次重新查询（写入时会被清掉）
      if (entry.at && Date.now() - entry.at > WORD_CACHE_TTL_MS) { resolve(''); return; }
      resolve(entry.trans);
    });
  });
}

/**
 * 写释义缓存。
 * 写入串行化：多标签页同时悬浮不同生词时，并发「读-改-写」会互相覆盖、丢缓存条目
 * （现象是「刚查过的词过一会又查一次」）。
 * 淘汰：先按 TTL 丢过期条目，再按插入顺序砍到 WORD_CACHE_MAX 上限。
 */
function cacheMeaning(key, trans) {
  return enqueueCacheWrite(() => new Promise((resolve) => {
    chrome.storage.local.get([WORD_CACHE_KEY], (r) => {
      const prev = r && r[WORD_CACHE_KEY];
      const prevRaw = (prev && typeof prev === 'object') ? prev[key] : undefined;
      // 已是新格式且值相同 → 不必整表重写
      if (prevRaw && typeof prevRaw === 'object' && prevRaw.trans === trans) { resolve(); return; }

      const c = {};
      if (prev && typeof prev === 'object') {
        const now = Date.now();
        for (const k of Object.keys(prev)) {
          const entry = cacheEntry(prev[k]);
          if (!entry || !entry.trans) continue;
          if (entry.at && now - entry.at > WORD_CACHE_TTL_MS) continue;  // 过期丢弃
          // 旧格式顺带升级出时间戳，让它们也纳入 TTL
          c[k] = { trans: entry.trans, at: entry.at || now };
        }
      }

      c[key] = { trans, at: Date.now() };
      const keys = Object.keys(c);
      for (let i = 0; i < keys.length - WORD_CACHE_MAX; i++) delete c[keys[i]];
      chrome.storage.local.set({ [WORD_CACHE_KEY]: c }, resolve);
    });
  }));
}

/**
 * 查词：取单词释义。
 * 用于补全两类没有释义的生词 —— ① 本地手动添加的；② 生词本同步下来但缺释义的。
 *
 * @returns {Promise<{ok:boolean, word:string, trans:string, reason?:string, cached?:boolean}>}
 *          ok=true 表示查询本身成功（trans 可能为空 = 有道也查不到精确释义）
 */
async function lookupWord(word) {
  const raw = String(word || '').trim();
  if (!raw) return { ok: false, word: '', trans: '', reason: '单词为空' };

  const key = raw.toLowerCase();
  const cached = await getCachedMeaning(key);
  if (cached) return { ok: true, word: raw, trans: cached, cached: true };

  const url = `${YOUDAO_SUGGEST_URL}?num=5&ver=3.0&doctype=json&cache=false`
            + `&le=${detectLan(raw)}&q=${encodeURIComponent(raw)}`;
  logDebug('查词请求:', url);

  let data = null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });
    if (!res.ok) { console.warn('[YH] 查词响应(非 200):', url, res.status); return { ok: false, word: raw, trans: '', reason: 'HTTP ' + res.status }; }
    data = await res.json();
    logDebug('查词响应:', url, data);
  } catch (e) {
    console.warn('[YH] 查词异常:', url, e);
    return { ok: false, word: raw, trans: '', reason: t('reasonNetworkError', '网络错误（$1）', [e && e.message ? e.message : e]) };
  }

  const code = data && data.result && data.result.code;
  if (code !== undefined && Number(code) !== 200) {
    return { ok: false, word: raw, trans: '', reason: 'code ' + code };
  }

  const entries = data && data.data && data.data.entries;
  if (!Array.isArray(entries) || !entries.length) {
    return { ok: true, word: raw, trans: '' };   // 有道没有这个词：不算失败，只是没释义
  }

  const hit = entries.find(e => String((e && e.entry) || '').trim().toLowerCase() === key);
  const trans = hit ? String(hit.explain || '').trim() : '';
  if (trans) await cacheMeaning(key, trans);
  return { ok: true, word: raw, trans };
}

/**
 * 推断单词语种，供 add 接口的 lan 参数使用，默认 en。
 * 实测用例为 word=hello&lan=en；非英文词按字符集给出对应值。
 */
function detectLan(word) {
  const w = String(word || '');
  if (/[\u3040-\u30ff]/.test(w)) return 'ja';
  if (/[\uac00-\ud7af]/.test(w)) return 'ko';
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(w)) return 'zh';
  return 'en';
}

/**
 * 有道接口统一 GET 封装。
 *
 * 关键：fetch 的 headers 里不能手写 Cookie —— Cookie 属于禁用请求头，
 * 浏览器会静默丢弃，所以旧实现那种「手动拼 Cookie 塞进 headers」其实没有任何鉴权作用。
 * 鉴权只能靠 credentials:'include' + manifest.json 里的 host_permissions。
 *
 * @returns {Promise<{ok:boolean, reason:string, needLogin?:boolean}>}
 */
async function youdaoAjaxGet(url) {
  logDebug('请求:', url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });
    logDebug('响应状态:', url, res.status);
    if (!res.ok) {
      // 非 2xx：明确输出状态码，方便排查（如 401 未登录、403 跨域被拦）
      console.error('[YH] 接口请求失败(HTTP ' + res.status + '):', url);
      return { ok: false, reason: 'HTTP ' + res.status };
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // 解析失败往往是被重定向到登录页、返回了 HTML（登录态过期）
      console.error('[YH] 响应解析失败(可能已重定向到登录页):', url, e);
      return { ok: false, reason: t('reasonNotJson', '返回非 JSON（登录可能已过期，被重定向到登录页）'), needLogin: true };
    }
    logDebug('响应:', url, data);
    return interpretYoudao(data);
  } catch (e) {
    // 网络层异常（断网 / DNS / CORS 等）：fetch 本身 reject
    console.error('[YH] 接口请求异常:', url, e);
    return { ok: false, reason: t('reasonNetworkError', '网络错误（$1）', [e && e.message ? e.message : e]) };
  }
}

/**
 * 解析有道接口返回：不同接口分别用 code / errorCode，此处兼容两者。
 * code 缺失或为 0 视为成功。
 */
function interpretYoudao(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: t('reasonNotJson', '返回非 JSON（登录可能已过期，被重定向到登录页）'), needLogin: true };
  }
  const raw = (data.code !== undefined) ? data.code : data.errorCode;
  if (raw === undefined || Number(raw) === 0) return { ok: true, reason: '' };

  const msg = data.msg || data.message || data.error || '';
  const text = (typeof msg === 'string') ? msg : JSON.stringify(msg);
  const needLogin = /login|未登录|请先登录|not\s*logged/i.test(text);
  return { ok: false, reason: (text ? text + ' ' : '') + '(code ' + raw + ')', needLogin };
}

/**
 * 服务端登录态探测：与 popup 的 cookie 启发式互补。
 * 拉取生词本页，若被重定向到登录页（无 __NUXT__ 生词数据且含登录标记）则视为已失效。
 * 用于「增加检测登录状态」——主动、可靠地发现会话过期，而不是等添加/删除失败才暴露。
 * @returns {Promise<{ok:boolean, needLogin:boolean, reason?:string}>}
 */
async function checkLoginServer() {
  try {
    const res = await fetch(YOUDAO_ACCOUNT_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (data && typeof data === 'object') {
        const code = data.code !== undefined ? Number(data.code) : undefined;
        if (code === 0) {
          return {
            ok: true,
            needLogin: false,
            loggedIn: true,
            userId: data.userId || data.userName || data.nickname || '',
          };
        }
        if (code === 2035 || data.msg === 'NO_LOGIN' || (code !== undefined && code !== 0)) {
          return {
            ok: false,
            needLogin: true,
            loggedIn: false,
            reason: data.msg || '未登录',
          };
        }
      }
    }
  } catch (e) {
    logDebug('查询 accountinfo 异常，尝试降级探测:', e && e.message);
  }

  try {
    const res = await fetch(YOUDAO_LOGIN_URL, { method: 'GET', credentials: 'include', cache: 'no-store' });
    const text = await res.text();
    const isRedirectedToLogin =
      !text.includes('__NUXT__') &&
      /passport|login|请登录|未登录|登录后|signin|sign_in/i.test(text);
    const hasLoginButton =
      /<a[^>]*class=["'][^"']*\blogin\b[^"']*["'][^>]*>[\s\S]*?登录[\s\S]*?<\/a>/i.test(text) ||
      /<a[^>]*href=["'][^"']*(?:login|signin)[^"']*["']/i.test(text);
    const nuxtIsLoggedOut =
      /login\s*:\s*\{[^}]*isLogin\s*:\s*(?:false|\w+)[^}]*\}/.test(text) &&
      /window\.__NUXT__\s*=[\s\S]*?\(\s*["']{2}\s*,\s*false\b/.test(text);

    if (isRedirectedToLogin || hasLoginButton || nuxtIsLoggedOut) {
      return { ok: false, needLogin: true, loggedIn: false, reason: '服务端探测到登录已失效' };
    }
    return { ok: true, needLogin: false, loggedIn: true };
  } catch (e) {
    return { ok: false, needLogin: false, loggedIn: false, reason: '网络错误，无法探测' };
  }
}

/**
 * 登录失效处理：清本地登录态（保留 userLoggedOut 原值 —— 失效≠主动登出，
 * 保留它不影响用户之后点「重新登录」恢复同步），并广播给所有页面弹出重新登录提示。
 */
function markLoginExpired(reason) {
  console.warn('[YH] 登录已失效:', reason);
  chrome.storage.local.set({ loggedIn: false });
  notifyLoginExpired(reason);
}

function notifyLoginExpired(reason) {
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.url && t.url.startsWith('http')) {
        chrome.tabs.sendMessage(t.id, { type: 'loginExpired', reason: reason || '' }).catch(() => {});
      }
    }
  });
}

/**
 * 同步有道生词本（三重策略，逐级降级）
 *
 * 策略1（推荐）：抓取 www.youdao.com/webwordbook/wordlist 页面，
 *        从 Nuxt.js 服务端渲染的 window.__NUXT__ 中提取生词数据。
 *        优势：与登录同域 + credentials:'include' 自动带 Cookie + 不依赖推断的 API 路径
 *
 * 策略2（备选）：调用 www.youdao.com/wordbook/webapi/words JSON 接口
 *
 * 策略3（兜底）：调用 dict.youdao.com/wordbook/webapi/words JSON 接口（原参考项目路径）
 */
function syncYoudao(sendResponse, trigger = 'manual') {
  const attempts = [];
  const S3_URL = 'https://dict.youdao.com/wordbook/webapi/words?limit=100000&offset=0';

  // 三策略都通过 finish 收尾；加 settled 守卫，避免极端情况下重复 sendResponse
  // （响应通道已关闭后再回消息，控制台会报 "message port closed"）。
  let settled = false;
  function finish(message, result) {
    if (settled) return;
    settled = true;
    recordSyncDiagnostic({ trigger, attempts, ...result }).catch(() => {});
    sendResponse(message);
  }

  function saveSuccess(itemList, strategy) {
    saveAndRespond(itemList, (message) => finish(message, {
      ok: true,
      strategy,
      wordCount: itemList.length
    }));
  }

  /**
   * 策略1（推荐）：抓 www.youdao.com/webwordbook/wordlist 页面，
   * 从 Nuxt SSR 注入的 window.__NUXT__ 里提取生词。
   * 优势：与登录同域 + credentials:'include' 自动带 Cookie + 不依赖推断出来的 API 路径。
   */
  async function strategy1() {
    logDebug('同步请求(S1):', YOUDAO_WORDLIST_URL);

    let html;
    try {
      const res = await fetch(YOUDAO_WORDLIST_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S1):', res.status);
      html = await res.text();
      attempts.push({
        strategy: 'S1', endpoint: YOUDAO_WORDLIST_URL,
        ...responseMetadata(res), page: describeWordbookPage(html)
      });
    } catch (error) {
      attempts.push({ strategy: 'S1', endpoint: YOUDAO_WORDLIST_URL, error: diagnosticError(error) });
      return strategy2();
    }

    const page = describeWordbookPage(html);
    const isLoggedOutNuxt =
      page.hasNuxtPayload &&
      (/window\.__NUXT__\s*=[\s\S]*?\(\s*["']{2}\s*,\s*false\b/.test(html) ||
       /<a[^>]*class=["'][^"']*\blogin\b[^"']*["'][^>]*>[\s\S]*?登录[\s\S]*?<\/a>/i.test(html));

    // 登录失效：S1 页被重定向到登录页或检测到未登录状态
    if (html && ((!page.hasNuxtPayload && page.hasLoginMarker) || isLoggedOutNuxt)) {
      markLoginExpired(t('reasonSyncLoginExpired', '同步时发现登录已失效'));
      finish(t('syncLoginExpired', '⚠️ 登录已失效，请重新登录有道词典后再次同步'), {
        ok: false, strategy: 'S1', reason: 'login-expired'
      });
      return;
    }

    const words = extractFromNuxt(html);
    attempts[attempts.length - 1].parsedWordCount = words.length;
    if (words.length > 0) {
      saveSuccess(words, 'S1');
      return;
    }
    // 策略1 无数据 → 降级
    return strategy2();
  }

  /** 策略2（备选）：www.youdao.com 的 JSON 接口 */
  async function strategy2() {
    logDebug('同步请求(S2):', YOUDAO_WORDS_URL);

    let data;
    try {
      const res = await fetch(YOUDAO_WORDS_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S2):', res.status);
      data = await res.json();
      const itemList = data && data.data && data.data.itemList;
      attempts.push({
        strategy: 'S2', endpoint: YOUDAO_WORDS_URL,
        ...responseMetadata(res), responseCode: data && data.code,
        hasItemList: Array.isArray(itemList),
        itemCount: Array.isArray(itemList) ? itemList.length : null
      });
    } catch (error) {
      attempts.push({ strategy: 'S2', endpoint: YOUDAO_WORDS_URL, error: diagnosticError(error) });
      return strategy3();
    }

    // 空生词本也是一次成功同步，但未登录请求同样返回空列表，需核验真实登录状态
    if (data && Number(data.code) === 0 && Array.isArray(data.data?.itemList)) {
      if (data.data.itemList.length > 0) {
        saveSuccess(data.data.itemList, 'S2');
        return;
      }
      const loginStatus = await checkLoginServer();
      if (!loginStatus.loggedIn) {
        markLoginExpired(t('reasonSyncLoginExpired', '同步时发现登录已失效'));
        finish(t('syncLoginExpired', '⚠️ 登录已失效，请重新登录有道词典后再次同步'), {
          ok: false, strategy: 'S2', reason: 'login-expired'
        });
        return;
      }
      saveSuccess(data.data.itemList, 'S2');
      return;
    }
    return strategy3();
  }

  /** 策略3（兜底）：dict.youdao.com 的 JSON 接口（原参考项目路径） */
  async function strategy3() {
    logDebug('同步请求(S3):', S3_URL);

    let data;
    try {
      const res = await fetch(S3_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S3):', res.status);
      data = await res.json();
      const itemList = data && data.data && data.data.itemList;
      attempts.push({
        strategy: 'S3', endpoint: S3_URL,
        ...responseMetadata(res), responseCode: data && (data.code ?? data.errorCode),
        hasItemList: Array.isArray(itemList),
        itemCount: Array.isArray(itemList) ? itemList.length : null
      });
    } catch (error) {
      console.error('[YH] All strategies failed:', error);
      attempts.push({ strategy: 'S3', endpoint: S3_URL, error: diagnosticError(error) });
      finish(t('syncFailNetwork', '网络错误，请检查网络后重试'), { ok: false, strategy: 'S3', reason: 'network-error' });
      return;
    }

    if (data && (Number(data.code) === 0 || Number(data.errorCode) === 0) && Array.isArray(data.data?.itemList)) {
      if (data.data.itemList.length > 0) {
        saveSuccess(data.data.itemList, 'S3');
        return;
      }
      const loginStatus = await checkLoginServer();
      if (!loginStatus.loggedIn) {
        markLoginExpired(t('reasonSyncLoginExpired', '同步时发现登录已失效'));
        finish(t('syncLoginExpired', '⚠️ 登录已失效，请重新登录有道词典后再次同步'), {
          ok: false, strategy: 'S3', reason: 'login-expired'
        });
        return;
      }
      saveSuccess(data.data.itemList, 'S3');
      return;
    }
    // 三策略全失败
    finish(t('syncFailAll',
      '同步失败：三种方式均未获取到生词。请确认：①已在浏览器登录有道词典；②生词本不为空。可在扩展 Service Worker 控制台执行 __yhDebug.enable() 查看详细日志'), {
      ok: false, strategy: 'S3', reason: 'no-supported-word-list-payload'
    });
  }

  // 兜底：策略链本身抛未预期异常时也要有响应，避免调用方一直等
  strategy1().catch((error) => {
    console.error('[YH] 同步未预期异常:', error);
    attempts.push({ strategy: 'S1', error: diagnosticError(error) });
    finish(t('syncFailUnexpected', '同步失败：发生未预期的错误，请重试'), { ok: false, strategy: 'S1', reason: 'unexpected-error' });
  });
}

/**
 * 从 Nuxt.js 页面的 window.__NUXT__ 中提取生词列表
 * 有道生词本页面是 Nuxt.js SSR 应用，服务端会将数据注入到 window.__NUXT__
 */
function extractFromNuxt(html) {
  if (!html.includes('__NUXT__')) {
    logDebug('S1: no __NUXT__ found');
    return [];
  }
  // 安全提取：直接搜 wordList/itemList/words 的 JSON 数组（不用 eval/Function，避免 CSP 限制）
  const patterns = [
    /"wordList"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
    /"itemList"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
    /"words"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        if (Array.isArray(arr) && arr.length > 0) {
          logDebug('S1: found', arr.length, 'words');
          return arr.map(w => ({
            word: w.word || w.name || w.text || '',
            phonetic: w.phonetic || '',
            trans: w.trans || w.meaning || '',
            itemId: w.itemId || w.id || ''
          }));
        }
      } catch (e) { logDebug('S1 parse err:', e.message); }
    }
  }
  return [];
}

/**
 * 保存生词并响应
 */
function saveAndRespond(itemList, sendResponse) {
  const wordInfos = {};
  for (const w of itemList) {
    if (w.word) {
      wordInfos[w.word.toLowerCase()] = {
        word: w.word,
        phonetic: w.phonetic || '',
        trans: w.trans || '',
        itemId: w.itemId
      };
    }
  }
  const total = itemList.length;
  const uniqueCount = Object.keys(wordInfos).length;
  const dupCount = total - uniqueCount;
  let msg;
  if (dupCount <= 0) {
    msg = t('syncOk', '同步成功，共 $1 个生词', [uniqueCount]);
  } else {
    msg = t('syncOkDupes',
      '同步成功：导入 $1 条，其中 $2 条与现有生词重复，实际共 $3 个不重复单词',
      [total, dupCount, uniqueCount]);
  }

  chrome.storage.local.set({
    newWords: { wordInfos },
    syncTime: Date.now(),
    loggedIn: true,
    userLoggedOut: false   // 同步成功说明确实处于登录态，清掉主动登出标记
  }, () => {
    sendResponse(msg);
    notifyAllTabs();
  });
}

/**
 * 登出：清除扩展内的登录态
 *
 * 边界说明：
 *  - 不去删 youdao.com 的 Cookie —— 扩展无权、也不应替用户在站点上登出，
 *    只清扩展自己的状态；用户想真正退出站点请到有道网页操作。
 *  - 不删已同步的生词缓存 —— 保留后网页高亮继续生效，且下次同步是全量覆盖，
 *    不存在跨账号数据串味。想一并清空的话在这里加一句 remove('newWords') 即可。
 *  - 置 userLoggedOut: true，否则下次打开弹窗时 cookie 兜底扫描会把
 *    浏览器里仍然存在的登录 cookie 又判成已登录，登出形同虚设。
 */
function logoutYoudao(sendResponse) {
  chrome.storage.local.set({ loggedIn: false, userLoggedOut: true }, () => {
    notifyAllTabs();
    sendResponse(t('logoutDone', '已登出有道词典'));
  });
}

/**
 * 删除生词
 * GET https://dict.youdao.com/wordbook/webapi/v2/ajax/del?word=hello
 */
function deleteWord(wordData, sendResponse) {
  const { word, canonical } = wordData || {};
  // 提交原单词（保留大小写），避免与有道端存储的大小写不一致导致删除失败；
  // canonical 仅作为兜底与本地存储键。
  const target = (word || canonical || '').trim();
  if (!target) {
    sendResponse(t('deleteFailNoWord', '删除失败：缺少单词'));
    return;
  }

  const doRequest = (w) => youdaoAjaxGet(`${YOUDAO_DELETE_URL}?word=${encodeURIComponent(w)}`);

  // 先按原单词删除；若失败（非登录问题）且原词含大写，再用全小写兜底重试一次，
  // 彻底规避有道端以小写存储时的大小写不一致问题。
  doRequest(target)
    .then((r) => {
      if (!r.ok && !r.needLogin && target !== target.toLowerCase()) {
        logDebug('原单词删除失败，尝试小写重试:', target, '→', target.toLowerCase(), '(' + r.reason + ')');
        return doRequest(target.toLowerCase()).then((r2) => finishDelete(r2, target.toLowerCase()));
      }
      return finishDelete(r, target);
    })
    .catch((err) => {
      console.error('[YH] 删除请求异常:', target, err);
      sendResponse(t('deleteRequestFailed', '⚠️ 删除请求失败：$1', [err && err.message ? err.message : err]));
    });

  function finishDelete(r, usedWord) {
    logDebug('删除结果:', usedWord, r);
    // 同步更新本地存储（按 canonical 与小写形式双删，兼容历史数据）
    chrome.storage.local.get(['newWords'], (result) => {
      const wordInfos = result.newWords?.wordInfos ? { ...result.newWords.wordInfos } : {};
      const keys = [canonical, target, (canonical || '').toLowerCase(), target.toLowerCase()];
      let removed = false;
      for (const k of keys) {
        if (k && wordInfos[k]) { delete wordInfos[k]; removed = true; }
      }
      const done = () => {
        if (r.needLogin) markLoginExpired(r.reason);
        if (r.ok) {
          sendResponse(t('deleteOk', '「$1」已从有道生词本删除', [usedWord]));
        } else if (r.needLogin) {
          sendResponse(t('deleteNeedLogin', '⚠️ 有道端未删除（$1），已从本地移除，请重新登录有道词典', [r.reason]));
        } else {
          sendResponse(t('deleteFailed', '⚠️ 有道端删除失败（$1），已从本地移除；下次同步可能重新出现', [r.reason]));
        }
      };
      if (removed) {
        chrome.storage.local.set({ newWords: { wordInfos } }, () => { notifyAllTabs(); done(); });
      } else {
        done();
      }
    });
  }
}

/**
 * 添加单词到生词本
 * GET https://dict.youdao.com/wordbook/webapi/v2/ajax/add?word=hello&lan=en
 *
 * 策略：先发有道请求，再落本地 —— 本地无论如何都写入，保证页面高亮立刻生效；
 *       有道端失败时在提示文案里明确说明（避免"显示已添加但其实没进生词本"）。
 */
function addWord(word, sendResponse) {
  const raw = String(word || '').trim();
  if (!raw) {
    sendResponse(t('addFailNoWord', '添加失败：单词为空'));
    return;
  }
  const lowerWord = raw.toLowerCase();

  // 先检查是否已存在
  chrome.storage.local.get(['newWords'], (result) => {
    if (result.newWords && result.newWords.wordInfos && result.newWords.wordInfos[lowerWord]) {
      sendResponse(t('addAlreadyExists', '「$1」已在生词本中', [raw]));
      return;
    }

    const url = `${YOUDAO_ADD_URL}?word=${encodeURIComponent(lowerWord)}&lan=${detectLan(lowerWord)}`;
    // 远端入库 与 查释义 并行，避免两次往返串行等待
    Promise.all([
      youdaoAjaxGet(url),
      lookupWord(lowerWord).catch(() => ({ ok: false, trans: '' }))
    ]).then(([r, meaning]) => {
      const trans = (meaning && meaning.trans) || '';
      chrome.storage.local.get(['newWords'], (r2) => {
        const wordInfos = r2.newWords?.wordInfos ? { ...r2.newWords.wordInfos } : {};
        if (!wordInfos[lowerWord]) {
          wordInfos[lowerWord] = {
            word: raw,
            phonetic: '',
            trans,              // 查词接口补上的释义，气泡里能直接看到
            itemId: lowerWord   // 接口已按 word 删除，itemId 仅作本地键保留
          };
        } else if (trans && !wordInfos[lowerWord].trans) {
          wordInfos[lowerWord] = { ...wordInfos[lowerWord], trans };
        }
        chrome.storage.local.set({ newWords: { wordInfos } }, () => {
          notifyAllTabs();
          if (r.needLogin) markLoginExpired(r.reason);
          if (r.ok) {
            sendResponse(t('addOk', '「$1」已添加到有道生词本', [raw]));
          } else if (r.needLogin) {
            sendResponse(t('addNeedLogin', '⚠️ 「$1」仅添加到本地（$2），请重新登录有道词典', [raw, r.reason]));
          } else {
            sendResponse(t('addFailed', '⚠️ 有道端添加失败（$1），已仅添加到本地', [r.reason]));
          }
        });
      });
    })
    .catch((e) => {
      console.error('[YH] 添加生词异常:', e);
    });
  });
}

// ===== Badge 计数 =====
const wordCountMap = {};   // tabId -> Set<word>
const tabUrlMap = {};

chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (tabUrlMap[id] !== tab.url) {
    tabUrlMap[id] = tab.url;
    if (wordCountMap[id]) wordCountMap[id].clear();
    updateBadge(id);
  }
  if (info.status === 'complete') updateBadge(id);
});

chrome.tabs.onRemoved.addListener((id) => {
  delete wordCountMap[id];
  delete tabUrlMap[id];
});

/**
 * 累计某标签页命中的生词（去重），有新增才刷新 Badge。
 * 传数组是为了配合 content script 的批量上报：一页几百个高亮只发一条消息。
 */
function countWords(tabId, words) {
  if (!tabId || !Array.isArray(words) || !words.length) return;
  let set = wordCountMap[tabId];
  if (!set) set = wordCountMap[tabId] = new Set();
  let changed = false;
  for (const w of words) {
    const lower = String(w || '').toLowerCase();
    if (lower && !set.has(lower)) { set.add(lower); changed = true; }
  }
  if (changed) updateBadge(tabId);
}

function updateBadge(tabId) {
  const count = wordCountMap[tabId]?.size || 0;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// ===== 通知所有标签页刷新 =====
/** 广播给所有 http(s) 标签页，让内容脚本重新拉取词表并重绘高亮 */
function notifyAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && tab.url.startsWith('http')) {
        chrome.tabs.sendMessage(tab.id, { type: 'wordsUpdated' }).catch(() => {});
      }
    }
  });
}

// ===== 工具函数 =====
// 颜色计算（hexToRgba）与样式生成已统一到 content/：
// 配色通过 CSS 变量（--yh-*）下发，content.js 监听 storage 变化自行应用，
// 这里不再 insertCSS，避免同一套 CSS 维护三份、参数漂移。
