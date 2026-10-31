export interface WordInfo {
  word: string;
  phonetic: string;
  trans: string;
  itemId?: string;
}

export interface WordbookData {
  wordInfos: Record<string, WordInfo>;
}

export interface WordCacheEntry {
  trans: string;
  at: number;
}

export type HighlightStyle = 'bg' | 'underline' | 'wavy' | 'dashed' | 'outline';

export interface Settings {
  toggle: boolean;
  ttsToggle: boolean;
  highlightBackground: string;
  highlightText: string;
  highlightStyle?: HighlightStyle;
  bubbleBackground: string;
  bubbleText: string;
  syncTime: number;
  autoSync: boolean;
  ttsVoice: string;
  uiLang: 'auto' | 'zh_CN' | 'en';
  userLoggedOut: boolean;
  loggedIn?: boolean;
  newWords?: WordbookData;
  wordCache?: Record<string, WordCacheEntry | string>;
  debugLog?: boolean;
  syncDiagnostics?: SyncDiagnosticsData;
}

export interface SyncAttempt {
  strategy: 'S1' | 'S2' | 'S3';
  endpoint: string;
  status?: number;
  ok?: boolean;
  contentType?: string;
  responseCode?: number | string;
  hasItemList?: boolean;
  itemCount?: number | null;
  parsedWordCount?: number;
  error?: string;
  page?: {
    parserVersion: string;
    htmlBytes: number;
    hasNuxtPayload: boolean;
    hasLoginMarker: boolean;
    nuxtBuildId: string;
  };
}

export interface SyncDiagnosticEntry {
  timestamp: number;
  interfaceVersion: string;
  parserVersion: string;
  trigger?: string;
  ok: boolean;
  strategy?: string;
  reason?: string;
  wordCount?: number;
  attempts: SyncAttempt[];
}

export interface SyncDiagnosticsData {
  schemaVersion: number;
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    failureRate: number;
  };
  lastAttempt?: SyncDiagnosticEntry;
  recentAttempts: SyncDiagnosticEntry[];
}

export type MessageRequest =
  | { type: 'tts'; word: string; force?: boolean }
  | { type: 'sync' }
  | { type: 'checkLogin' }
  | { type: 'openLoginPage' }
  | { type: 'delete'; wordData: { word?: string; canonical?: string } }
  | { type: 'logout' }
  | { type: 'addWord'; word: string }
  | { type: 'lookup'; word: string }
  | { type: 'count'; word?: string; words?: string[] }
  | { type: 'resetSettings' }
  | { type: 'wordsUpdated' }
  | { type: 'settingsChanged' }
  | { type: 'loginExpired'; reason?: string };

export interface CheckLoginResponse {
  ok: boolean;
  needLogin: boolean;
  loggedIn: boolean;
  userLoggedOut?: boolean;
  reason?: string;
}

export interface LookupResponse {
  ok: boolean;
  word: string;
  trans: string;
  cached?: boolean;
  reason?: string;
}

export interface GenericResponse {
  ok: boolean;
  reason?: string;
  needLogin?: boolean;
}
