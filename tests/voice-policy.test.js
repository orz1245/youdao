/**
 * 发音语音策略测试
 * 直接从 service-worker.js 抽出真实的语音挑选函数来跑，保证测的是线上代码而非副本。
 * 策略：英语语音为硬门槛；谷歌英语优先（音质好），没有则回落到系统英语嗓音（离线可用）。
 *      完全没有英语语音才返回 null（不发音）。
 *
 * 为什么必须有系统兜底：Windows 的 chrome.tts 语音表以 SAPI 嗓音（Microsoft David/Zira 等）
 * 为主，Google 语音是远程源、依赖网络可达 Google。只认谷歌会导致 Windows 上「点喇叭没反应」。
 */
const fs = require('fs');
const path = require('path');

const SW = path.join(__dirname, '..', 'service-worker.js');
const src = fs.readFileSync(SW, 'utf8');

function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error('未在 service-worker.js 找到函数 ' + name);
  const end = src.indexOf('\n}', start);
  return src.slice(start, end + 2);
}

const NAMES = ['isGoogleVoice', 'isEnglishVoice', 'isLocalVoice', 'pickGoogleVoice', 'pickFallbackVoice', 'pickLocalEnglishVoice', 'resolveVoice'];
const code = NAMES.map(extract).join('\n');
const { isEnglishVoice, isLocalVoice, pickGoogleVoice, pickFallbackVoice, pickLocalEnglishVoice, resolveVoice } = new Function(
  `${code}\nreturn { ${NAMES.join(', ')} };`
)();

// 一份贴近真机的混合语音表：macOS 本地嗓音 + Windows SAPI 嗓音 + 谷歌在线语音 + 中文/日文
const SAMANTHA = { voiceName: 'Samantha', lang: 'en-US', localService: true };
const MS_DAVID = { voiceName: 'Microsoft David - English (United States)', lang: 'en-US', remote: false };
const MS_ZIRA = { voiceName: 'Microsoft Zira - English (United States)', lang: 'en-US', remote: false };
const TINGTING = { voiceName: 'Ting-Ting', lang: 'zh-CN', localService: true };
const G_ZH = { voiceName: 'Google 普通话（中国大陆）', lang: 'zh-CN', remote: true };
const G_US = { voiceName: 'Google US English', lang: 'en-US', remote: true, extensionId: 'fignfifoniblkonapihmkfakmlgkbkcf' };
const G_GB_F = { voiceName: 'Google UK English Female', lang: 'en-GB', remote: true };
const G_GB_M = { voiceName: 'Google UK English Male', lang: 'en-GB', remote: true };
const G_JA = { voiceName: 'Google 日本語', lang: 'ja-JP', remote: true };

const VOICES = [SAMANTHA, MS_DAVID, MS_ZIRA, TINGTING, G_ZH, G_US, G_GB_F, G_GB_M, G_JA];
const WIN_VOICES = [MS_DAVID, MS_ZIRA, TINGTING];          // 典型中文 Windows：只有 SAPI 嗓音
const MAC_VOICES = [SAMANTHA, TINGTING];                   // 典型 macOS：本地嗓音，无谷歌
const ONLINE_ONLY = [                                      // 无本地嗓音，只有在线英语
  { voiceName: 'Microsoft Mark - English (United States)', lang: 'en-US', remote: true },
  { voiceName: 'Amazon Polly EN-GB', lang: 'en-GB', remote: true },
];

const cases = [
  // ---- 语言门槛 ----
  ['isEnglishVoice: en-US → true', () => isEnglishVoice({ lang: 'en-US' }), true],
  ['isEnglishVoice: en-GB → true', () => isEnglishVoice({ lang: 'en-GB' }), true],
  ['isEnglishVoice: zh-CN → false', () => isEnglishVoice({ lang: 'zh-CN' }), false],
  ['isEnglishVoice: 无 lang → false', () => isEnglishVoice({}), false],
  ['isEnglishVoice: undefined → false（不抛错）', () => isEnglishVoice(undefined), false],

  // ---- 本地/在线判定（两个字段都要认）----
  ['isLocalVoice: localService:true → 本地', () => isLocalVoice({ localService: true }), true],
  ['isLocalVoice: localService:false → 在线', () => isLocalVoice({ localService: false }), false],
  ['isLocalVoice: remote:true → 在线', () => isLocalVoice({ remote: true }), false],
  ['isLocalVoice: remote:false → 本地', () => isLocalVoice({ remote: false }), true],
  ['isLocalVoice: 两字段都无 → 视为本地', () => isLocalVoice({ lang: 'en-US' }), true],

  // ---- 首选：英语谷歌 ----
  ['混合列表：自动挑 en-US 谷歌', () => pickGoogleVoice(VOICES), 'Google US English'],
  ['en-US 缺席时挑第一个英语谷歌', () => pickGoogleVoice([G_GB_F, G_GB_M, G_ZH]), 'Google UK English Female'],
  ['只有系统英语嗓音 → 无英语谷歌', () => pickGoogleVoice(WIN_VOICES), null],
  ['只有中文/日文谷歌语音 → 无英语谷歌', () => pickGoogleVoice([G_ZH, G_JA]), null],
  ['空列表 → null', () => pickGoogleVoice([]), null],
  ['非数组 → null', () => pickGoogleVoice(null), null],

  // ---- 兜底：任意英语嗓音，本地优先 ----
  ['Windows 只有 SAPI 嗓音 → 兜底挑 en-US 本地嗓音',
    () => pickFallbackVoice(WIN_VOICES), MS_DAVID.voiceName],
  ['macOS 只有本地嗓音 → 兜底挑 en-US 本地嗓音',
    () => pickFallbackVoice(MAC_VOICES), SAMANTHA.voiceName],
  ['无本地嗓音时用在线英语嗓音',
    () => pickFallbackVoice(ONLINE_ONLY), 'Microsoft Mark - English (United States)'],
  ['只有中文语音 → 兜底为 null（不发音）', () => pickFallbackVoice([TINGTING, G_ZH]), null],
  ['空列表 → 兜底为 null', () => pickFallbackVoice([]), null],
  ['非数组 → 兜底为 null', () => pickFallbackVoice(null), null],

  // ---- 重试专用：只挑本地英语嗓音 ----
  ['pickLocalEnglishVoice: 排除谷歌在线语音，只留本地嗓音',
    () => pickLocalEnglishVoice(VOICES), SAMANTHA.voiceName],
  ['pickLocalEnglishVoice: Windows 场景挑 SAPI 本地嗓音',
    () => pickLocalEnglishVoice(WIN_VOICES.concat([G_US])), MS_DAVID.voiceName],
  ['pickLocalEnglishVoice: 只有在线英语 → null（不可用于重试）',
    () => pickLocalEnglishVoice([G_US, ...ONLINE_ONLY]), null],
  ['pickLocalEnglishVoice: 只有中文本地嗓音 → null',
    () => pickLocalEnglishVoice([TINGTING]), null],
  ['pickLocalEnglishVoice: 空列表 → null', () => pickLocalEnglishVoice([]), null],
  ['pickLocalEnglishVoice: 非数组 → null', () => pickLocalEnglishVoice(null), null],

  // ---- 总入口 resolveVoice ----
  ['有谷歌英语语音 → 用谷歌', () => resolveVoice(VOICES, ''), 'Google US English'],
  ['Windows 无谷歌 → 用系统英语嗓音（关键回归点）',
    () => resolveVoice(WIN_VOICES, ''), MS_DAVID.voiceName],
  ['macOS 无谷歌 → 用系统本地嗓音（关键回归点）',
    () => resolveVoice(MAC_VOICES, ''), SAMANTHA.voiceName],
  ['指定 en-GB 谷歌语音时尊重选择', () => resolveVoice(VOICES, G_GB_F.voiceName), G_GB_F.voiceName],
  ['指定系统英语嗓音时尊重选择（不再被判为不可用）',
    () => resolveVoice(VOICES, MS_ZIRA.voiceName), MS_ZIRA.voiceName],
  ['指定已不存在的语音 → 回落', () => resolveVoice(VOICES, 'Google 已删除语音'), 'Google US English'],
  ['指定非英语语音 → 回落', () => resolveVoice(VOICES, G_ZH.voiceName), 'Google US English'],
  ['指定非英语且无谷歌 → 回落到系统英语嗓音',
    () => resolveVoice(WIN_VOICES, G_ZH.voiceName), MS_DAVID.voiceName],
  ['空语音表 → 不发音', () => resolveVoice([], ''), null],
  ['非数组 → 不发音', () => resolveVoice(null, ''), null],
];

let pass = 0, fail = 0;
const warn = console.warn;
console.warn = () => {};   // 静音预期内的回落告警

for (const [name, fn, expect] of cases) {
  let got;
  try { got = fn(); } catch (e) { got = 'THREW: ' + e.message; }
  if (got === expect) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}  期望=${expect} 实际=${got}`); }
}

console.warn = warn;
console.log(`\n=== 语音策略测试: ${pass} 通过, ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
