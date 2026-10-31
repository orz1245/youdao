import type { Settings, WordCacheEntry } from '../types';
import { createWriteQueue } from './storage-queue';

export const DEFAULT_SETTINGS: Settings = {
  toggle: true,
  ttsToggle: true,
  highlightBackground: '#ffe464',
  highlightText: '',
  highlightStyle: 'bg',
  bubbleBackground: '#ffffff',
  bubbleText: '',
  syncTime: 0,
  autoSync: true,
  ttsVoice: '',
  uiLang: 'auto',
  userLoggedOut: false,
};

export const WORD_CACHE_KEY = 'wordCache';
export const WORD_CACHE_MAX = 2000;
export const WORD_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

const enqueueCacheWrite = createWriteQueue();

export function isExtAlive(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

export function safeStorageGet<K extends keyof Settings>(
  keys: K[] | null,
  callback: (items: Partial<Settings>) => void
): boolean {
  if (!isExtAlive()) {
    callback({});
    return false;
  }
  try {
    chrome.storage.local.get(keys as string[] | null, (res) => {
      callback((res || {}) as Partial<Settings>);
    });
    return true;
  } catch (err) {
    callback({});
    return false;
  }
}

export function safeStorageSet(
  items: Partial<Settings>,
  callback?: () => void
): boolean {
  if (!isExtAlive()) {
    callback?.();
    return false;
  }
  try {
    chrome.storage.local.set(items, () => {
      callback?.();
    });
    return true;
  } catch (err) {
    callback?.();
    return false;
  }
}

export function cacheEntry(raw: any): WordCacheEntry | null {
  if (typeof raw === 'string') return { trans: raw, at: 0 };
  if (raw && typeof raw === 'object' && typeof raw.trans === 'string') {
    return { trans: raw.trans, at: Number(raw.at) || 0 };
  }
  return null;
}

export function getCachedMeaning(key: string): Promise<string> {
  return new Promise((resolve) => {
    if (!isExtAlive()) {
      resolve('');
      return;
    }
    chrome.storage.local.get([WORD_CACHE_KEY], (r: any) => {
      const c = (r && r[WORD_CACHE_KEY]) as Record<string, any> | undefined;
      const entry = (c && typeof c === 'object') ? cacheEntry(c[key]) : null;
      if (!entry || !entry.trans) {
        resolve('');
        return;
      }
      if (entry.at && Date.now() - entry.at > WORD_CACHE_TTL_MS) {
        resolve('');
        return;
      }
      resolve(entry.trans);
    });
  });
}

export function cacheMeaning(key: string, trans: string): Promise<void> {
  return enqueueCacheWrite(() => new Promise<void>((resolve) => {
    if (!isExtAlive()) {
      resolve();
      return;
    }
    chrome.storage.local.get([WORD_CACHE_KEY], (r: any) => {
      const prev = (r && r[WORD_CACHE_KEY]) as Record<string, any> | undefined;
      const prevRaw = (prev && typeof prev === 'object') ? prev[key] : undefined;
      if (prevRaw && typeof prevRaw === 'object' && prevRaw.trans === trans) {
        resolve();
        return;
      }

      const c: Record<string, WordCacheEntry> = {};
      if (prev && typeof prev === 'object') {
        const now = Date.now();
        for (const k of Object.keys(prev)) {
          const entry = cacheEntry(prev[k]);
          if (!entry || !entry.trans) continue;
          if (entry.at && now - entry.at > WORD_CACHE_TTL_MS) continue;
          c[k] = { trans: entry.trans, at: entry.at || now };
        }
      }

      c[key] = { trans, at: Date.now() };
      const keys = Object.keys(c);
      for (let i = 0; i < keys.length - WORD_CACHE_MAX; i++) {
        const k = keys[i];
        if (k) delete c[k];
      }
      chrome.storage.local.set({ [WORD_CACHE_KEY]: c }, () => resolve());
    });
  }));
}

export function toHex6(color: string): string {
  if (typeof color !== 'string') return '#ffffff';
  if (color.startsWith('#')) return color.slice(0, 7);
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m && m[1]) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    const r = parts[0] ?? 255;
    const g = parts[1] ?? 255;
    const b = parts[2] ?? 255;
    const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }
  return '#ffffff';
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 为下划线、波浪线、虚线和边框生成高对比度线条颜色。
 * 针对浅黄色等高明度预设，自动适配为饱满清晰的深色线，避免在浅色网页上看不清。
 */
export function toLineColor(color: string): string {
  const hex = toHex6(color).toLowerCase();
  const presetLineMap: Record<string, string> = {
    '#ffe464': '#d97706', // 琥珀黄
    '#9be4a4': '#16a34a', // 翠绿
    '#f69ba4': '#e11d48', // 玫红
    '#80b6f6': '#2563eb', // 蔚蓝
    '#ffbe72': '#ea580c', // 暖橙
    '#c2a3f7': '#9333ea', // 罗兰紫
    '#969aa0': '#4b5563', // 石板灰
  };
  if (presetLineMap[hex]) return presetLineMap[hex];

  // 针对自定义颜色：计算亮度，过亮时自动调深 30% 以确保下划线可读
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum > 165) {
    const factor = 0.65;
    const dr = Math.round(r * factor);
    const dg = Math.round(g * factor);
    const db = Math.round(b * factor);
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(dr)}${h(dg)}${h(db)}`;
  }
  return hex;
}
