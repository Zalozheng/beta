const fs = require('fs');
const noop = () => {};
global.window = global;
global.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
global.document = {
  readyState: 'complete', title: 'Beat — demo', documentElement: {}, body: {},
  createTreeWalker: () => ({ nextNode: () => null }),
  querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, classList: { add: noop, remove: noop } }),
};
global.NodeFilter = { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
global.MutationObserver = class { observe() {} disconnect() {} };
global.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
global.TextDecoder = require('util').TextDecoder;

window.__BEAT_I18N_CORE__ = {
  'Save': '保存',
  'Shot list': '镜头表',
  'Project overview': '项目概览',
  'Appears in {n} beats': '出现在 {n} 个节拍中',
  'Jump to {name}': '跳到 {name}',
  'Delete project "{q}"?': '删除项目「{q}」？',
  'Saved to Downloads — {file}': '已保存到「下载」文件夹 —— {file}',
  'Could not read *': '读取失败：{x}',
  'Could not save — retrying in*': '保存失败 — 将在 {x} 后重试',
  '   Trimmed key   ': '带空格的键',
  'Line\\nbreak key': '带转义的键',
  '~pat:Appears in {n} beats': '出现在 {n} 个节拍中',
};

const src = fs.readFileSync('src/i18n/i18n.js', 'utf8');
new Function('window', 'document', 'localStorage', 'NodeFilter', 'MutationObserver', 'Node', 'console', src)
  (window, global.document, global.localStorage, global.NodeFilter, global.MutationObserver, global.Node, console);

setTimeout(() => {
  const T = global.BeatI18n;
  if (!T) { console.error('BeatI18n 未挂上'); process.exit(1); }
  const cases = [
    ['Save', '保存'],
    ['Project overview', '项目概览'],
    ['Appears in 7 beats', '出现在 7 个节拍中'],
    ['Jump to Em', '跳到 Em'],
    ['Delete project "nes"?', '删除项目「nes」？'],
    ['Saved to Downloads — a.png', '已保存到「下载」文件夹 —— a.png'],
    ['Could not read "x.txt"', '读取失败："x.txt"'],
    ['Could not save — retrying in 3s', '保存失败 — 将在 3s 后重试'],
    ['Trimmed key', '带空格的键'],
    ['Line\nbreak key', '带转义的键'],
    ['Unmapped English', 'Unmapped English'],
  ];
  let pass = 0, fail = 0;
  for (const [en, want] of cases) {
    const got = T.t(en);
    const ok = got === want;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${JSON.stringify(en)} → ${JSON.stringify(got)}${ok ? '' : '   want ' + JSON.stringify(want)}`);
  }
  console.log(`\nentries=${T.entries} source=${T.source}  ——  ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}, 300);
