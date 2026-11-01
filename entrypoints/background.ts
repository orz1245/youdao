import { DEFAULT_SETTINGS, isExtAlive } from '../utils/storage';
import {
  syncYoudao,
  checkLoginServer,
  deleteWord,
  logoutYoudao,
  addWord,
  lookupWord,
  YOUDAO_LOGIN_URL,
  setDebugLog,
  logDebug,
} from '../utils/youdao-api';
import { speakWord } from '../utils/voice';
import { isLikelyEnglishWord } from '../utils/word-matcher';
import { t } from '../utils/i18n';
import type { MessageRequest, Settings } from '../types';

export default defineBackground(() => {
  const YH_DEBUG_KEY = 'debugLog';
  let debugLogEnabled = false;

  try {
    chrome.storage.local.get([YH_DEBUG_KEY], (r) => {
      debugLogEnabled = !!(r && r[YH_DEBUG_KEY]);
      setDebugLog(debugLogEnabled);
    });
  } catch {}

  (globalThis as any).__yhDebug = {
    get enabled() {
      return debugLogEnabled;
    },
    enable() {
      debugLogEnabled = true;
      setDebugLog(true);
      try {
        chrome.storage.local.set({ [YH_DEBUG_KEY]: true });
      } catch {}
      logDebug('调试日志已开启（storage.debugLog = true）');
    },
    disable() {
      debugLogEnabled = false;
      setDebugLog(false);
      try {
        chrome.storage.local.set({ [YH_DEBUG_KEY]: false });
      } catch {}
      logDebug('调试日志已关闭');
    },
  };

  // ===== 自动同步调度 =====
  const AUTO_SYNC_ALARM = 'youdaoDailyWordbookSync';
  const AUTO_SYNC_PERIOD_MINUTES = 24 * 60;
  const DAY_MS = AUTO_SYNC_PERIOD_MINUTES * 60 * 1000;
  let autoSyncInFlight = false;

  function ensureAutoSyncAlarm() {
    if (!chrome.alarms) return;
    chrome.alarms.get(AUTO_SYNC_ALARM, (alarm) => {
      if (!alarm) {
        chrome.alarms.create(AUTO_SYNC_ALARM, {
          delayInMinutes: AUTO_SYNC_PERIOD_MINUTES,
          periodInMinutes: AUTO_SYNC_PERIOD_MINUTES,
        });
      }
    });
  }

  function maybeAutoSync(trigger: string) {
    chrome.storage.local.get(['autoSync', 'userLoggedOut', 'syncTime'], (result: any) => {
      if (result.autoSync === false || result.userLoggedOut || autoSyncInFlight) return;
      const lastSync = Number(result.syncTime) || 0;
      if (Date.now() - lastSync < DAY_MS) return;
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
    chrome.runtime.onInstalled?.addListener(ensureAutoSyncAlarm);
    chrome.runtime.onStartup?.addListener(ensureAutoSyncAlarm);
  }

  // ===== 初始化配置 =====
  chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), (result) => {
    const patch: Partial<Settings> = {};
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      if (result[k] === undefined) {
        (patch as any)[k] = v;
      }
    }
    if (Object.keys(patch).length) {
      chrome.storage.local.set(patch);
    }
    ensureAutoSyncAlarm();
    maybeAutoSync('startup');
  });

  // ===== 辅助：保证异步响应只回一次且必回 =====
  function onceResponder(sendResponse: (res: any) => void, tag: string) {
    let replied = false;
    return function reply(message: any) {
      if (replied) return;
      replied = true;
      try {
        sendResponse(message);
      } catch (e: any) {
        console.warn('[YH] 响应失败(' + tag + '):', e && e.message);
      }
    };
  }

  function runMessageHandler(tag: string, reply: (res: any) => void, fn: () => Promise<any> | void) {
    const fail = (e: any) => {
      console.error('[YH] 处理失败(' + tag + '):', e);
      reply(t('opFailed', '⚠️ 操作失败：$1', [e && e.message ? e.message : e]));
    };
    try {
      const r = fn();
      if (r && typeof (r as any).then === 'function') {
        (r as Promise<any>).catch(fail);
      }
    } catch (e) {
      fail(e);
    }
  }

  // ===== 消息监听 =====
  chrome.runtime.onMessage.addListener((request: MessageRequest, sender, sendResponse) => {
    // 1. TTS 发音
    if (request.type === 'tts') {
      chrome.storage.local.get(['ttsToggle'], (r) => {
        if ((r.ttsToggle !== false || request.force) && request.word && isLikelyEnglishWord(request.word)) {
          speakWord(request.word);
        }
      });
      return false;
    }

    // 2. 同步生词本
    if (request.type === 'sync') {
      const reply = onceResponder(sendResponse, 'sync');
      runMessageHandler('sync', reply, () => syncYoudao(reply));
      return true;
    }

    // 3. 服务端登录态探测
    if (request.type === 'checkLogin') {
      const reply = onceResponder(sendResponse, 'checkLogin');
      chrome.storage.local.get(['userLoggedOut'], (state) => {
        if (state.userLoggedOut) {
          reply({ ok: false, needLogin: false, loggedIn: false, userLoggedOut: true });
          return;
        }
        checkLoginServer()
          .then((r) => {
            const isLogged = !!(r.ok && r.loggedIn);
            chrome.storage.local.set({ loggedIn: isLogged });
            reply({ ok: isLogged, needLogin: !isLogged, loggedIn: isLogged, reason: r.reason, userId: r.userId });
          })
          .catch((e) => {
            console.warn('[YH] 登录探测异常:', e && e.message);
            chrome.storage.local.get(['loggedIn'], (stored) => {
              const isLogged = !!stored.loggedIn;
              reply({ ok: isLogged, needLogin: !isLogged, loggedIn: isLogged, reason: '网络错误，无法探测' });
            });
          });
      });
      return true;
    }

    // 4. 打开有道登录页
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
      return true;
    }

    // 5. 删除生词
    if (request.type === 'delete') {
      const reply = onceResponder(sendResponse, 'delete');
      runMessageHandler('delete', reply, () => deleteWord(request.wordData, reply));
      return true;
    }

    // 6. 登出
    if (request.type === 'logout') {
      const reply = onceResponder(sendResponse, 'logout');
      runMessageHandler('logout', reply, () => logoutYoudao(reply));
      return true;
    }

    // 7. 添加单词
    if (request.type === 'addWord') {
      const reply = onceResponder(sendResponse, 'addWord');
      runMessageHandler('addWord', reply, () => addWord(request.word, reply));
      return true;
    }

    // 8. 查词补全释义
    if (request.type === 'lookup') {
      const reply = onceResponder(sendResponse, 'lookup');
      runMessageHandler('lookup', reply, () => lookupWord(request.word).then(reply));
      return true;
    }

    // 9. Badge 计数
    if (request.type === 'count') {
      const words = Array.isArray(request.words)
        ? request.words
        : request.word
        ? [request.word]
        : [];
      if (sender.tab && sender.tab.id) {
        countWords(sender.tab.id, words);
      }
      return false;
    }

    // 10. 重置设置
    if (request.type === 'resetSettings') {
      const reply = onceResponder(sendResponse, 'resetSettings');
      try {
        chrome.storage.local.set(DEFAULT_SETTINGS, () => reply('ok'));
      } catch (e) {
        console.error('[YH] 重置设置失败:', e);
        reply('ok');
      }
      return true;
    }

    return false;
  });

  // ===== Badge 计数维护 =====
  const wordCountMap: Record<number, Set<string>> = {};
  const tabUrlMap: Record<number, string> = {};

  chrome.tabs.onUpdated.addListener((id, info, tab) => {
    if (tab.url && tabUrlMap[id] !== tab.url) {
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

  function countWords(tabId: number, words: string[]) {
    if (!tabId || !Array.isArray(words) || !words.length) return;
    let set = wordCountMap[tabId];
    if (!set) {
      set = new Set();
      wordCountMap[tabId] = set;
    }
    let changed = false;
    for (const w of words) {
      const lower = String(w || '').toLowerCase();
      if (lower && !set.has(lower)) {
        set.add(lower);
        changed = true;
      }
    }
    if (changed) updateBadge(tabId);
  }

  function updateBadge(tabId: number) {
    const count = wordCountMap[tabId]?.size || 0;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count), tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#28a745', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});
