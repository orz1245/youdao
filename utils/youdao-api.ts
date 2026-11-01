import type {
  WordInfo,
  WordbookData,
  CheckLoginResponse,
  LookupResponse,
  GenericResponse,
  SyncAttempt,
  SyncDiagnosticsData,
  SyncDiagnosticEntry,
} from '../types';
import { getCachedMeaning, cacheMeaning, isExtAlive } from './storage';
import { createWriteQueue } from './storage-queue';
import { t } from './i18n';

export const YOUDAO_WORDS_URL = 'https://www.youdao.com/wordbook/webapi/words?limit=100000&offset=0';
export const YOUDAO_WORDLIST_URL = 'https://www.youdao.com/webwordbook/wordlist';
export const YOUDAO_ADD_URL = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/add';
export const YOUDAO_DELETE_URL = 'https://dict.youdao.com/wordbook/webapi/v2/ajax/del';
export const YOUDAO_SUGGEST_URL = 'https://dict.youdao.com/suggest';
export const YOUDAO_LOGIN_URL = YOUDAO_WORDLIST_URL;
export const YOUDAO_ACCOUNT_URL = 'https://dict.youdao.com/login/acc/query/accountinfo';
export const S3_URL = 'https://dict.youdao.com/wordbook/webapi/words?limit=100000&offset=0';

export const KNOWN_LOGIN_COOKIE_NAMES = new Set([
  'DICT_SESS',
  'DICT_LOGIN',
  'DICT_PERS',
  'DICT_UT',
  'YNOTE_SESS',
  'YNOTE_LOGIN',
  'OUTFOX_CNR_MEMBER_LOGIN',
  'OUTFOX_CNR_MEMBER',
  'USER_ID',
  'P_INFO',
  'S_INFO',
  'NTES_SESS',
  'NETEASE_WDA_UID',
]);

export const VISITOR_COOKIE_NAMES = new Set([
  'OUTFOX_SEARCH_USER_ID',
  'OUTFOX_SEARCH_USER_ID_NCOO',
  'JSESSIONID',
  'yd_tm_task',
  '___rl__test__cookies',
  'i18n_redirected',
]);

export function isLoginCookie(c: { name: string; value?: string } | null | undefined): boolean {
  if (!c || !c.name) return false;
  const name = c.name.trim();

  // 1. 明确排除访客跟踪/临时会话 Cookie
  if (VISITOR_COOKIE_NAMES.has(name)) {
    return false;
  }

  // 2. 严格匹配网易/有道登录凭证白名单
  if (KNOWN_LOGIN_COOKIE_NAMES.has(name)) {
    if (!c.value) return false;
    const val = c.value.trim();
    if (!val || val === '""') return false;

    // P_INFO 格式通常为 username|timestamp|...，未登录或失效时可能为 "||" 或空
    if (name === 'P_INFO') {
      const firstPart = val.split('|')[0]?.trim();
      return Boolean(firstPart && firstPart.length > 0 && !firstPart.includes('undefined'));
    }

    return true;
  }

  return false;
}

export async function detectLoginByCookie(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.cookies || !chrome.cookies.getAll) return false;

  // 1. 优先按 domain 查询 .youdao.com 下的所有 cookie
  try {
    const domainCookies = await new Promise<chrome.cookies.Cookie[]>((resolve) => {
      chrome.cookies.getAll({ domain: 'youdao.com' }, (cs) => {
        if (chrome.runtime?.lastError) resolve([]);
        else resolve(cs || []);
      });
    });
    if (domainCookies.some(isLoginCookie)) {
      return true;
    }
  } catch {}

  // 2. 补漏：针对各端具体 URL 查询
  const sources = [
    'https://dict.youdao.com/',
    'https://www.youdao.com/',
    'https://youdao.com/',
    'https://c.youdao.com/',
    'https://note.youdao.com/',
  ];
  for (const url of sources) {
    try {
      const cookies = await new Promise<chrome.cookies.Cookie[]>((resolve) => {
        chrome.cookies.getAll({ url }, (cs) => {
          if (chrome.runtime?.lastError) resolve([]);
          else resolve(cs || []);
        });
      });
      if (cookies.some(isLoginCookie)) {
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

export const SYNC_DIAGNOSTICS_KEY = 'syncDiagnostics';
export const SYNC_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const SYNC_INTERFACE_VERSION = 'youdao-wordbook-sync-v2';
export const NUXT_PARSER_VERSION = 'nuxt-ssr-json-array-v1';
export const MAX_SYNC_DIAGNOSTICS = 20;

const enqueueDiagnosticsWrite = createWriteQueue();

let debugLogEnabled = false;
export function setDebugLog(enabled: boolean) {
  debugLogEnabled = enabled;
}
export function logDebug(...args: any[]) {
  if (debugLogEnabled) console.log('[YH]', ...args);
}

export function detectLan(word: string): string {
  const w = String(word || '');
  if (/[\u3040-\u30ff]/.test(w)) return 'ja';
  if (/[\uac00-\ud7af]/.test(w)) return 'ko';
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(w)) return 'zh';
  return 'en';
}

export function diagnosticError(error: any): string {
  const text = String(error && error.message ? error.message : error || '未知错误');
  return text.slice(0, 240);
}

export function responseMetadata(res: Response) {
  return {
    status: Number(res.status) || 0,
    ok: !!res.ok,
    contentType: res.headers?.get('content-type') || '',
  };
}

export function describeWordbookPage(html: string) {
  const text = typeof html === 'string' ? html : '';
  const build = text.match(/(?:buildId|build_id)\s*["':=]+\s*([\w.-]{1,80})/i);
  return {
    parserVersion: NUXT_PARSER_VERSION,
    htmlBytes: text.length,
    hasNuxtPayload: text.includes('__NUXT__'),
    hasLoginMarker: /passport|login|请登录|未登录|登录后|signin|sign_in/i.test(text),
    nuxtBuildId: build && build[1] ? build[1] : '',
  };
}

export function recordSyncDiagnostic(result: Partial<SyncDiagnosticEntry>): Promise<void> {
  const entry: SyncDiagnosticEntry = {
    timestamp: Date.now(),
    interfaceVersion: SYNC_INTERFACE_VERSION,
    parserVersion: NUXT_PARSER_VERSION,
    ok: !!result.ok,
    attempts: (result.attempts || []).slice(-3),
    ...result,
  };

  return enqueueDiagnosticsWrite(() => new Promise((resolve) => {
    if (!isExtAlive()) {
      resolve();
      return;
    }
    chrome.storage.local.get([SYNC_DIAGNOSTICS_KEY], (stored) => {
      const previous = stored && (stored[SYNC_DIAGNOSTICS_KEY] as SyncDiagnosticsData);
      const oldStats = previous && previous.stats ? previous.stats : { total: 0, succeeded: 0, failed: 0, failureRate: 0 };
      const total = Number(oldStats.total || 0) + 1;
      const succeeded = Number(oldStats.succeeded || 0) + (entry.ok ? 1 : 0);
      const failed = Number(oldStats.failed || 0) + (entry.ok ? 0 : 1);
      const recent = [...((previous && previous.recentAttempts) || []), entry].slice(-MAX_SYNC_DIAGNOSTICS);

      chrome.storage.local.set(
        {
          [SYNC_DIAGNOSTICS_KEY]: {
            schemaVersion: SYNC_DIAGNOSTICS_SCHEMA_VERSION,
            stats: {
              total,
              succeeded,
              failed,
              failureRate: total ? Number((failed / total).toFixed(4)) : 0,
            },
            lastAttempt: entry,
            recentAttempts: recent,
          },
        },
        () => resolve()
      );
    });
  }));
}

export function interpretYoudao(data: any): GenericResponse {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: t('reasonNotJson', '返回非 JSON（登录可能已过期，被重定向到登录页）'), needLogin: true };
  }
  const raw = data.code !== undefined ? data.code : data.errorCode;
  if (raw === undefined || Number(raw) === 0) return { ok: true, reason: '' };

  const msg = data.msg || data.message || data.error || '';
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
  const needLogin = /login|未登录|请先登录|not\s*logged/i.test(text);
  return { ok: false, reason: (text ? text + ' ' : '') + '(code ' + raw + ')', needLogin };
}

export async function youdaoAjaxGet(url: string): Promise<GenericResponse> {
  logDebug('请求:', url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    logDebug('响应状态:', url, res.status);
    if (!res.ok) {
      console.error('[YH] 接口请求失败(HTTP ' + res.status + '):', url);
      return { ok: false, reason: 'HTTP ' + res.status };
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch (e) {
      console.error('[YH] 响应解析失败(可能已重定向到登录页):', url, e);
      return { ok: false, reason: t('reasonNotJson', '返回非 JSON（登录可能已过期，被重定向到登录页）'), needLogin: true };
    }
    logDebug('响应:', url, data);
    return interpretYoudao(data);
  } catch (e: any) {
    console.error('[YH] 接口请求异常:', url, e);
    return { ok: false, reason: t('reasonNetworkError', '网络错误（$1）', [e && e.message ? e.message : e]) };
  }
}

export async function checkLoginServer(): Promise<CheckLoginResponse> {
  // 1. 如果本地没有任何有效登录 Cookie，说明肯定未登录
  const hasCookie = await detectLoginByCookie();
  if (!hasCookie) {
    return { ok: false, needLogin: true, loggedIn: false, reason: '未登录' };
  }

  // 2. 本地有登录 Cookie 时，向服务端复核是否已被重定向到登录页
  try {
    const res = await fetch(YOUDAO_LOGIN_URL, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (res.ok) {
      const text = await res.text();
      const isRedirectedToLogin =
        !text.includes('__NUXT__') &&
        /passport|login|请登录|未登录|登录后|signin|sign_in/i.test(text);
      if (isRedirectedToLogin) {
        return { ok: false, needLogin: true, loggedIn: false, reason: '服务端探测到登录已失效' };
      }
    }
  } catch (e: any) {
    logDebug('登录探测网络异常:', e && e.message);
  }

  return { ok: true, needLogin: false, loggedIn: true };
}

export function notifyLoginExpired(reason?: string) {
  if (!isExtAlive() || !chrome.tabs) return;
  chrome.tabs.query({}, (tabs) => {
    for (const t of tabs) {
      if (t.id && t.url && t.url.startsWith('http')) {
        chrome.tabs.sendMessage(t.id, { type: 'loginExpired', reason: reason || '' }).catch(() => {});
      }
    }
  });
}

export function markLoginExpired(reason?: string) {
  console.warn('[YH] 登录已失效:', reason);
  if (isExtAlive()) {
    chrome.storage.local.set({ loggedIn: false });
  }
  notifyLoginExpired(reason);
}

export function notifyAllTabs() {
  if (!isExtAlive() || !chrome.tabs) return;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && tab.url.startsWith('http')) {
        chrome.tabs.sendMessage(tab.id, { type: 'wordsUpdated' }).catch(() => {});
      }
    }
  });
}

export async function lookupWord(word: string): Promise<LookupResponse> {
  const raw = String(word || '').trim();
  if (!raw) return { ok: false, word: '', trans: '', reason: '单词为空' };

  const key = raw.toLowerCase();
  const cached = await getCachedMeaning(key);
  if (cached) return { ok: true, word: raw, trans: cached, cached: true };

  const url = `${YOUDAO_SUGGEST_URL}?num=5&ver=3.0&doctype=json&cache=false&le=${detectLan(raw)}&q=${encodeURIComponent(raw)}`;
  logDebug('查词请求:', url);

  let data: any = null;
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    if (!res.ok) {
      console.warn('[YH] 查词响应(非 200):', url, res.status);
      return { ok: false, word: raw, trans: '', reason: 'HTTP ' + res.status };
    }
    data = await res.json();
    logDebug('查词响应:', url, data);
  } catch (e: any) {
    console.warn('[YH] 查词异常:', url, e);
    return { ok: false, word: raw, trans: '', reason: t('reasonNetworkError', '网络错误（$1）', [e && e.message ? e.message : e]) };
  }

  const code = data?.result?.code;
  if (code !== undefined && Number(code) !== 200) {
    return { ok: false, word: raw, trans: '', reason: 'code ' + code };
  }

  const entries = data?.data?.entries;
  if (!Array.isArray(entries) || !entries.length) {
    return { ok: true, word: raw, trans: '' };
  }

  const hit = entries.find((e: any) => String(e?.entry || '').trim().toLowerCase() === key);
  const trans = hit ? String(hit.explain || '').trim() : '';
  if (trans) await cacheMeaning(key, trans);
  return { ok: true, word: raw, trans };
}

export function extractFromNuxt(html: string): WordInfo[] {
  if (!html.includes('__NUXT__')) {
    logDebug('S1: no __NUXT__ found');
    return [];
  }
  const patterns = [
    /"wordList"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
    /"itemList"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
    /"words"\s*:\s*(\[[\s\S]*?\])(?=\s*(?:,|}|\)\s*;))/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      try {
        const arr = JSON.parse(m[1]);
        if (Array.isArray(arr) && arr.length > 0) {
          logDebug('S1: found', arr.length, 'words');
          return arr.map((w: any) => ({
            word: w.word || w.name || w.text || '',
            phonetic: w.phonetic || '',
            trans: w.trans || w.meaning || '',
            itemId: w.itemId || w.id || '',
          }));
        }
      } catch (e: any) {
        logDebug('S1 parse err:', e.message);
      }
    }
  }
  return [];
}

export function saveAndRespond(itemList: WordInfo[], sendResponse: (msg: string) => void) {
  const wordInfos: Record<string, WordInfo> = {};
  for (const w of itemList) {
    if (w.word) {
      wordInfos[w.word.toLowerCase()] = {
        word: w.word,
        phonetic: w.phonetic || '',
        trans: w.trans || '',
        itemId: w.itemId,
      };
    }
  }
  const total = itemList.length;
  const uniqueCount = Object.keys(wordInfos).length;
  const dupCount = total - uniqueCount;
  let msg: string;
  if (dupCount <= 0) {
    msg = t('syncOk', '同步成功，共 $1 个生词', [uniqueCount]);
  } else {
    msg = t(
      'syncOkDupes',
      '同步成功：导入 $1 条，其中 $2 条与现有生词重复，实际共 $3 个不重复单词',
      [total, dupCount, uniqueCount]
    );
  }

  chrome.storage.local.set(
    {
      newWords: { wordInfos },
      syncTime: Date.now(),
      loggedIn: true,
      userLoggedOut: false,
    },
    () => {
      sendResponse(msg);
      notifyAllTabs();
    }
  );
}

export function syncYoudao(sendResponse: (msg: string) => void, trigger: string = 'manual') {
  const attempts: SyncAttempt[] = [];
  let settled = false;

  function finish(message: string, result: Partial<SyncDiagnosticEntry>) {
    if (settled) return;
    settled = true;
    recordSyncDiagnostic({ trigger, attempts, ...result }).catch(() => {});
    sendResponse(message);
  }

  function saveSuccess(itemList: WordInfo[], strategy: 'S1' | 'S2' | 'S3') {
    saveAndRespond(itemList, (message) =>
      finish(message, {
        ok: true,
        strategy,
        wordCount: itemList.length,
      })
    );
  }

  async function strategy1() {
    logDebug('同步请求(S1):', YOUDAO_WORDLIST_URL);
    let html = '';
    try {
      const res = await fetch(YOUDAO_WORDLIST_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S1):', res.status);
      html = await res.text();
      attempts.push({
        strategy: 'S1',
        endpoint: YOUDAO_WORDLIST_URL,
        ...responseMetadata(res),
        page: describeWordbookPage(html),
      });
    } catch (error) {
      attempts.push({ strategy: 'S1', endpoint: YOUDAO_WORDLIST_URL, error: diagnosticError(error) });
      return strategy2();
    }

    const page = describeWordbookPage(html);
    if (html && !page.hasNuxtPayload && page.hasLoginMarker) {
      markLoginExpired(t('reasonSyncLoginExpired', '同步时发现登录已失效'));
      finish(t('syncLoginExpired', '⚠️ 登录已失效，请重新登录有道词典后再次同步'), {
        ok: false,
        strategy: 'S1',
        reason: 'login-expired',
      });
      return;
    }

    const words = extractFromNuxt(html);
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt) {
      lastAttempt.parsedWordCount = words.length;
    }
    if (words.length > 0) {
      saveSuccess(words, 'S1');
      return;
    }
    return strategy2();
  }

  async function strategy2() {
    logDebug('同步请求(S2):', YOUDAO_WORDS_URL);
    let data: any = null;
    try {
      const res = await fetch(YOUDAO_WORDS_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S2):', res.status);
      data = await res.json();
      const itemList = data?.data?.itemList;
      attempts.push({
        strategy: 'S2',
        endpoint: YOUDAO_WORDS_URL,
        ...responseMetadata(res),
        responseCode: data?.code,
        hasItemList: Array.isArray(itemList),
        itemCount: Array.isArray(itemList) ? itemList.length : null,
      });
    } catch (error) {
      attempts.push({ strategy: 'S2', endpoint: YOUDAO_WORDS_URL, error: diagnosticError(error) });
      return strategy3();
    }

    // 空生词本也是一次成功同步：必须落库清空旧缓存，不能继续降级后报失败。
    if (data && Number(data.code) === 0 && Array.isArray(data.data?.itemList)) {
      saveSuccess(data.data.itemList, 'S2');
      return;
    }
    return strategy3();
  }

  async function strategy3() {
    logDebug('同步请求(S3):', S3_URL);
    let data: any = null;
    try {
      const res = await fetch(S3_URL, { credentials: 'include', cache: 'no-store' });
      logDebug('同步响应(S3):', res.status);
      data = await res.json();
      const itemList = data?.data?.itemList;
      attempts.push({
        strategy: 'S3',
        endpoint: S3_URL,
        ...responseMetadata(res),
        responseCode: data?.code ?? data?.errorCode,
        hasItemList: Array.isArray(itemList),
        itemCount: Array.isArray(itemList) ? itemList.length : null,
      });
    } catch (error) {
      console.error('[YH] All strategies failed:', error);
      attempts.push({ strategy: 'S3', endpoint: S3_URL, error: diagnosticError(error) });
      finish(t('syncFailNetwork', '网络错误，请检查网络后重试'), { ok: false, strategy: 'S3', reason: 'network-error' });
      return;
    }

    if (data && (Number(data.code) === 0 || Number(data.errorCode) === 0) && Array.isArray(data.data?.itemList)) {
      saveSuccess(data.data.itemList, 'S3');
      return;
    }

    finish(
      t(
        'syncFailAll',
        '同步失败：三种方式均未获取到生词。请确认：①已在浏览器登录有道词典；②生词本不为空。可在扩展 Service Worker 控制台执行 __yhDebug.enable() 查看详细日志'
      ),
      { ok: false, strategy: 'S3', reason: 'no-supported-word-list-payload' }
    );
  }

  strategy1().catch((error) => {
    console.error('[YH] 同步未预期异常:', error);
    attempts.push({ strategy: 'S1', endpoint: YOUDAO_WORDLIST_URL, error: diagnosticError(error) });
    finish(t('syncFailUnexpected', '同步失败：发生未预期的错误，请重试'), {
      ok: false,
      strategy: 'S1',
      reason: 'unexpected-error',
    });
  });
}

export function logoutYoudao(sendResponse: (msg: string) => void) {
  chrome.storage.local.set({ loggedIn: false, userLoggedOut: true }, () => {
    notifyAllTabs();
    sendResponse(t('logoutDone', '已登出有道词典'));
  });
}

export function deleteWord(
  wordData: { word?: string; canonical?: string },
  sendResponse: (msg: string) => void
) {
  const { word, canonical } = wordData || {};
  const target = (word || canonical || '').trim();
  if (!target) {
    sendResponse(t('deleteFailNoWord', '删除失败：缺少单词'));
    return;
  }

  const doRequest = (w: string) => youdaoAjaxGet(`${YOUDAO_DELETE_URL}?word=${encodeURIComponent(w)}`);

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

  function finishDelete(r: GenericResponse, usedWord: string) {
    logDebug('删除结果:', usedWord, r);
    chrome.storage.local.get(['newWords'], (result: any) => {
      const stored = result.newWords as WordbookData | undefined;
      const wordInfos = stored?.wordInfos ? { ...stored.wordInfos } : {};
      const keys = [canonical, target, (canonical || '').toLowerCase(), target.toLowerCase()];
      let removed = false;
      for (const k of keys) {
        if (k && wordInfos[k]) {
          delete wordInfos[k];
          removed = true;
        }
      }
      const done = () => {
        if (r.needLogin) markLoginExpired(r.reason);
        if (r.ok) {
          sendResponse(t('deleteOk', '「$1」已从有道生词本删除', [usedWord]));
        } else if (r.needLogin) {
          sendResponse(t('deleteNeedLogin', '⚠️ 有道端未删除（$1），已从本地移除，请重新登录有道词典', [r.reason || '']));
        } else {
          sendResponse(t('deleteFailed', '⚠️ 有道端删除失败（$1），已从本地移除；下次同步可能重新出现', [r.reason || '']));
        }
      };
      if (removed) {
        chrome.storage.local.set({ newWords: { wordInfos } }, () => {
          notifyAllTabs();
          done();
        });
      } else {
        done();
      }
    });
  }
}

export function addWord(word: string, sendResponse: (msg: string) => void) {
  const raw = String(word || '').trim();
  if (!raw) {
    sendResponse(t('addFailNoWord', '添加失败：单词为空'));
    return;
  }
  const lowerWord = raw.toLowerCase();

  chrome.storage.local.get(['newWords'], (result: any) => {
    const stored = result.newWords as WordbookData | undefined;
    if (stored?.wordInfos && stored.wordInfos[lowerWord]) {
      sendResponse(t('addAlreadyExists', '「$1」已在生词本中', [raw]));
      return;
    }

    const url = `${YOUDAO_ADD_URL}?word=${encodeURIComponent(lowerWord)}&lan=${detectLan(lowerWord)}`;
    Promise.all([
      youdaoAjaxGet(url),
      lookupWord(lowerWord).catch(() => ({ ok: false, trans: '', word: lowerWord })),
    ])
      .then(([r, meaning]) => {
        const trans = meaning?.trans || '';
        chrome.storage.local.get(['newWords'], (r2: any) => {
          const stored2 = r2.newWords as WordbookData | undefined;
          const wordInfos = stored2?.wordInfos ? { ...stored2.wordInfos } : {};
          if (!wordInfos[lowerWord]) {
            wordInfos[lowerWord] = {
              word: raw,
              phonetic: '',
              trans,
              itemId: lowerWord,
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
              sendResponse(t('addNeedLogin', '⚠️ 「$1」仅添加到本地（$2），请重新登录有道词典', [raw, r.reason || '']));
            } else {
              sendResponse(t('addFailed', '⚠️ 有道端添加失败（$1），已仅添加到本地', [r.reason || '']));
            }
          });
        });
      })
      .catch((e) => {
        console.error('[YH] 添加生词异常:', e);
      });
  });
}
