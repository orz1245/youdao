/**
 * TTS 语音表缓存测试
 *
 * 背景：悬浮即发音 → speakWord 调用很频繁，而 chrome.tts.getVoices 是异步 IPC。
 * 原实现每次发音都重新取一遍语音表。现在缓存 5 分钟，本测试锁住：
 *   - TTL 内重复发音只取一次语音表（且每次都真的朗读）
 *   - 空语音表不落缓存（否则语音尚未就绪时会被"缓存空"卡住一段时间）
 * 每个用例用独立的 SW 实例（重新 new Function(code)()），因为缓存是模块级变量。
 * 运行：node tests/voice-cache.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

const store = { autoSync: false, ttsToggle: true, ttsVoice: '' };
let msgListener = null;
let getVoicesCalls = 0;
let speakCalls = 0;
/** 测试期间可切换的语音表 */
let voices = [];
/** 每次 speak 实际用的 voiceName，用于验证兜底重试换了嗓音 */
let spokenVoices = [];
/** 模拟「谷歌在线语音合成失败」（网络不可达 Google 时的表现） */
let remoteFails = false;

globalThis.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        queueMicrotask(() => {
          if (typeof keys === 'function') return cb(store);
          if (keys == null) return cb(store);
          const out = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) if (k in store) out[k] = store[k];
          cb(out);
        });
      },
      set(obj, cb) { Object.assign(store, obj); if (cb) queueMicrotask(cb); },
    },
    onChanged: { addListener() {} },
  },
  runtime: {
    onMessage: { addListener: (fn) => { msgListener = fn; } },
    lastError: null,
  },
  tabs: {
    onUpdated: { addListener() {} },
    onRemoved: { addListener() {} },
    query: (q, cb) => cb([]),
    sendMessage: () => ({ catch() {} }),
  },
  action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
  tts: {
    speak(word, opts) {
      speakCalls++;
      spokenVoices.push((opts && opts.voiceName) || '');
      // 远程（谷歌）语音合成失败会走 onEvent({type:'error'})
      if (remoteFails && opts && opts.onEvent && /google/i.test((opts && opts.voiceName) || '')) {
        opts.onEvent({ type: 'error', errorMessage: 'network' });
      }
    },
    stop() {},
    getVoices(cb) { getVoicesCalls++; cb(voices); },
  },
};
globalThis.console.warn = () => {};
globalThis.fetch = () => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve({ code: 0 }),
  text: () => Promise.resolve(''),
});

let pass = 0, failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

/** 起一个全新的 SW 实例（模块级缓存随之重置） */
const loadSW = (voiceList) => {
  voices = voiceList;
  getVoicesCalls = 0;
  speakCalls = 0;
  spokenVoices = [];
  new Function(code)();
};
/** 等若干个宏任务，让 storage/tts 的异步回调链跑完 */
const tick = () => new Promise((r) => setTimeout(r, 0));
const speak = async (word) => {
  msgListener({ type: 'tts', word }, { tab: { id: 1 } }, () => {});
  await tick();
};

// ===== 1. TTL 内只取一次语音表 =====
loadSW([{ voiceName: 'Google US English', lang: 'en-US', extensionId: 'google' }]);
check('service-worker.js 载入无异常', typeof msgListener === 'function');

await speak('apple');
await speak('banana');
await speak('cherry');
check('连续 3 次发音只调用一次 getVoices（命中缓存）',
  getVoicesCalls === 1, '实际=' + getVoicesCalls);
check('3 次发音都真的朗读了（缓存没有把 speak 吞掉）',
  speakCalls === 3, '实际=' + speakCalls);

// ===== 2. 空语音表不落缓存：每次发音都要重新取 =====
loadSW([]);
await speak('durian');
await speak('elderberry');
check('空语音表每次都会重新取（不缓存空值）',
  getVoicesCalls === 2, '实际=' + getVoicesCalls);
check('无任何语音时不朗读', speakCalls === 0, '实际=' + speakCalls);

// ===== 3. 没有谷歌英语语音时改用系统英语嗓音兜底（Windows 主要路径）=====
loadSW([{ voiceName: 'Microsoft David - English (United States)', lang: 'en-US', remote: false }]);
await speak('fig');
check('只有系统英语嗓音（非谷歌）→ 用系统嗓音朗读', speakCalls === 1, '实际=' + speakCalls);

// ===== 4. 连英语语音都没有时仍然不朗读 =====
loadSW([{ voiceName: 'Ting-Ting', lang: 'zh-CN', localService: true }, { voiceName: 'Google 日本語', lang: 'ja-JP', remote: true }]);
await speak('grape');
check('只有中文/日文语音 → 不朗读', speakCalls === 0, '实际=' + speakCalls);

// ===== 5. 在线谷歌语音合成失败 → 自动改用系统本地英语嗓音重试 =====
// 国内网络下 Google 服务不可达是常态：此时语音被识别出来了，但合成在云端做不了，
// 用户听到的还是「点喇叭没反应」。必须换本地嗓音兜底。
const GOOGLE_EN = { voiceName: 'Google US English', lang: 'en-US', remote: true };
const MS_DAVID = { voiceName: 'Microsoft David - English (United States)', lang: 'en-US', remote: false };
loadSW([GOOGLE_EN, MS_DAVID]);
remoteFails = true;
await speak('honey');
await tick();
await tick();
check('在线语音失败后改用系统本地语音重试',
  spokenVoices.length === 2 &&
  /google/i.test(spokenVoices[0]) &&
  spokenVoices[1] === MS_DAVID.voiceName,
  '实际=' + JSON.stringify(spokenVoices));
check('重试只做一层（没有无限循环）',
  speakCalls === 2, '实际=' + speakCalls);

// 没有本地英语嗓音可退时，不能靠重试刷屏
loadSW([GOOGLE_EN, { voiceName: 'Ting-Ting', lang: 'zh-CN', localService: true }]);
remoteFails = true;
await speak('jam');
await tick();
await tick();
check('无本地英语嗓音可退时只尝试一次',
  speakCalls === 1 && spokenVoices.length === 1,
  '实际 speakCalls=' + speakCalls + ' voices=' + JSON.stringify(spokenVoices));

remoteFails = false;

// ===== 5. 非英语单词跳过发音 =====
loadSW([GOOGLE_EN]);
speakCalls = 0;
await speak('clientWidth');
await speak('12345');
await speak('foo_bar');
await speak('你好');
await speak('a');
check('非英语单词/代码标识符/单字母跳过发音（不触发 chrome.tts.speak）',
  speakCalls === 0, '实际 speakCalls=' + speakCalls);

await speak('highlight');
check('合规英语单词正常发音', speakCalls === 1, '实际 speakCalls=' + speakCalls);

console.log(`\n=== 语音表缓存测试: ${pass} 通过, ${failed} 失败 ===`);
process.exit(failed ? 1 : 0);
