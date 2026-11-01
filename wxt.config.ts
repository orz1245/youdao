import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'zh_CN',
    permissions: ['alarms', 'storage', 'cookies', 'tabs', 'tts'],
    host_permissions: [
      'https://dict.youdao.com/*',
      'http://dict.youdao.com/*',
      'https://www.youdao.com/*',
      'http://www.youdao.com/*',
      'https://youdao.com/*',
      'http://youdao.com/*',
      'https://*.youdao.com/*',
      'http://*.youdao.com/*',
    ],
    action: {
      default_icon: {
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        128: '/icon/128.png',
      },
    },
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
  },
});
