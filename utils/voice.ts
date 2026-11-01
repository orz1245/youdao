import { isExtAlive } from './storage';
import { isLikelyEnglishWord } from './word-matcher';

export interface TtsVoiceLike {
  voiceName?: string;
  lang?: string;
  remote?: boolean;
  extensionId?: string;
  localService?: boolean;
}

export function isGoogleVoice(v: TtsVoiceLike): boolean {
  return /google/i.test(v.voiceName || '') || /google/i.test(v.extensionId || '');
}

export function isEnglishVoice(v: TtsVoiceLike): boolean {
  return /^en/i.test(v.lang || '');
}

export function isLocalVoice(v: TtsVoiceLike): boolean {
  if (!v) return false;
  if (typeof v.localService === 'boolean') return v.localService;
  return !v.remote;
}

export function pickGoogleVoice(voices: TtsVoiceLike[]): string | null {
  if (!Array.isArray(voices) || !voices.length) return null;
  const enVoices = voices.filter((v) => isGoogleVoice(v) && isEnglishVoice(v));
  if (!enVoices.length) return null;
  const enUS = enVoices.find((v) => /^en[-_]us/i.test(v.lang || ''));
  return (enUS || enVoices[0])?.voiceName || null;
}

export function pickFallbackVoice(voices: TtsVoiceLike[]): string | null {
  if (!Array.isArray(voices) || !voices.length) return null;
  const enVoices = voices.filter((v) => isEnglishVoice(v) && v.voiceName);
  if (!enVoices.length) return null;
  const local = enVoices.filter((v) => isLocalVoice(v));
  const pool = local.length ? local : enVoices;
  const enUS = pool.find((v) => /^en[-_]us/i.test(v.lang || ''));
  return (enUS || pool[0])?.voiceName || null;
}

export function resolveVoice(voices: TtsVoiceLike[], preferred?: string): string | null {
  const list = Array.isArray(voices) ? voices : [];
  if (preferred) {
    const hit = list.find((v) => v.voiceName === preferred && isEnglishVoice(v));
    if (hit) return preferred;
    console.warn(`[YH] 已选语音「${preferred}」不可用或非英语，回落到自动选择`);
  }
  return pickGoogleVoice(list) || pickFallbackVoice(list);
}

export function pickLocalEnglishVoice(voices: TtsVoiceLike[]): string | null {
  return pickFallbackVoice((Array.isArray(voices) ? voices : []).filter((v) => isLocalVoice(v)));
}

export function voiceRank(v: TtsVoiceLike): number {
  const lang = v.lang || '';
  if (/^en[-_]us/i.test(lang)) return 0;
  if (/^en/i.test(lang)) return 1;
  return 2;
}

export function voiceOrder(a: TtsVoiceLike, b: TtsVoiceLike): number {
  return (
    Number(!isGoogleVoice(a)) - Number(!isGoogleVoice(b)) ||
    voiceRank(a) - voiceRank(b) ||
    String(a.voiceName || '').localeCompare(String(b.voiceName || ''))
  );
}

const VOICES_CACHE_TTL_MS = 5 * 60 * 1000;
let voicesCache: chrome.tts.TtsVoice[] | null = null;
let voicesCacheAt = 0;
let voiceMissingWarned = false;

export function getVoicesCached(): Promise<chrome.tts.TtsVoice[]> {
  return new Promise((resolve) => {
    if (!isExtAlive() || !chrome.tts || !chrome.tts.getVoices) {
      resolve([]);
      return;
    }
    const now = Date.now();
    if (voicesCache && now - voicesCacheAt < VOICES_CACHE_TTL_MS) {
      resolve(voicesCache);
      return;
    }
    chrome.tts.getVoices((voices) => {
      const list = Array.isArray(voices) ? voices : [];
      if (list.length) {
        voicesCache = list;
        voicesCacheAt = Date.now();
        voiceMissingWarned = false;
      }
      resolve(list);
    });
  });
}

export async function speakWord(word: string, opts?: { localOnly?: boolean }): Promise<void> {
  const cleanWord = String(word || '').trim();
  if (!cleanWord || !isLikelyEnglishWord(cleanWord)) {
    return;
  }
  if (!isExtAlive() || !chrome.tts || !chrome.tts.speak || !chrome.tts.getVoices) {
    console.error('[YH] chrome.tts 不可用：缺少 tts 权限');
    return;
  }
  const retryingLocal = !!(opts && opts.localOnly);

  chrome.storage.local.get(['ttsVoice'], async (r) => {
    const preferred = String(r.ttsVoice || '');
    const list = await getVoicesCached();
    const voiceName = retryingLocal ? pickLocalEnglishVoice(list) : resolveVoice(list, preferred);

    if (!voiceName) {
      if (!voiceMissingWarned) {
        voiceMissingWarned = true;
        console.warn(
          '[YH] 未找到任何英语语音，已跳过发音。\n可用语音：',
          list.map((v) => `${v.voiceName}(${v.lang}${isLocalVoice(v) ? ',本地' : ',在线'})`).join(' | ') || '（空）'
        );
      }
      return;
    }
    voiceMissingWarned = false;
    const chosen = list.find((v) => v.voiceName === voiceName) || null;

    try {
      chrome.tts.stop();
    } catch {}

    chrome.tts.speak(
      word,
      {
        voiceName,
        lang: 'en-US',
        rate: 0.9,
        enqueue: false,
        onEvent: (ev) => {
          if (ev.type === 'error' || ev.type === 'interrupted') {
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
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('[YH] 发音失败：', chrome.runtime.lastError.message);
        }
      }
    );
  });
}
