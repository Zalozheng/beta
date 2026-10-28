// 插件双语自检：用最小 DOM 桩跑 timeline.js / library.js 里的 relabel()，
// 检查 zh-CN / en 两种语言下的真实输出（不启动 app，不依赖浏览器）。
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function makeEl(id) {
  return {
    id,
    _text: '',
    _attrs: {},
    title: '',
    classList: { toggle() {}, add() {}, remove() {} },
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    appendChild() {},
    insertAdjacentElement() {},
    style: {},
    hidden: false
  };
}

function run(file, lang, dict) {
  const els = {};
  const get = id => (els[id] = els[id] || makeEl(id));
  const doc = {
    getElementById: id => (els[id] = els[id] || makeEl(id)),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => makeEl(tag),
    head: makeEl('head'),
    body: makeEl('body')
  };
  const win = {
    BeatI18n: {
      lang,
      t: s => (lang === 'en' ? s : (dict[s] || s))
    }
  };
  const ctx = {
    window: win,
    document: doc,
    console,
    setTimeout,
    Math,
    Map,
    Set,
    JSON,
    String,
    Number,
    Array,
    Object,
    WeakMap
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  const api = win.BeatTimeline || win.BeatLibrary;
  if (!api || typeof api.relabel !== 'function') throw new Error(file + ': 没有导出 relabel()');
  api.relabel();
  return { els, api };
}

// 语言包（只取与插件相关的键，模拟真实 dict 命中）
const PACK = {
  'Storyboard': '分镜',
  'Storyboard timeline': '分镜时间轴',
  'Story order': '故事顺序',
  'Shooting order': '拍摄顺序',
  'shots': '镜',
  'Zoom out': '缩小',
  'Zoom in': '放大',
  'Close': '关闭',
  'Search characters / locations / props': '搜索人物 / 场景 / 道具',
  'By name': '按名称',
  'By screen count': '按出场次数',
  '+ New': '+ 新建',
  'New element': '新建元素'
};

let fail = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + '  got=' + JSON.stringify(got) + (ok ? '' : '  want=' + JSON.stringify(want)));
}

// --- timeline.js ---
const tlPath = path.join(ROOT, 'src', 'timeline', 'timeline.js');
{
  const { els } = run(tlPath, 'zh-CN', PACK);
  check('timeline zh 标题', els.tlTitle.textContent, '分镜时间轴');
  check('timeline zh 单位', els.tlUnit.textContent, '镜');
  check('timeline zh 顶栏按钮', els.timelineBtn.textContent, '分镜');
  check('timeline zh 关闭按钮', els.timelineCloseBtn.getAttribute('aria-label'), '关闭');
  check('timeline zh 缩放提示', els.tlZoomOut.title, '缩小');
}
{
  const { els } = run(tlPath, 'en', {});
  check('timeline en 标题', els.tlTitle.textContent, 'Storyboard timeline');
  check('timeline en 单位', els.tlUnit.textContent, 'shots');
  check('timeline en 顶栏按钮', els.timelineBtn.textContent, 'Storyboard');
  check('timeline en 关闭按钮', els.timelineCloseBtn.getAttribute('aria-label'), 'Close');
  check('timeline en 缩放提示', els.tlZoomOut.title, 'Zoom out');
}

// --- library.js ---
const libPath = path.join(ROOT, 'src', 'library', 'library.js');
{
  const { els } = run(libPath, 'zh-CN', PACK);
  check('library zh 搜索框', els.libSearch.getAttribute('placeholder'), '搜索人物 / 场景 / 道具');
  check('library zh 新建按钮', els.libNew.textContent, '+ 新建');
  check('library zh 新建提示', els.libNew.title, '新建元素');
}
{
  const { els } = run(libPath, 'en', {});
  check('library en 搜索框', els.libSearch.getAttribute('placeholder'), 'Search characters / locations / props');
  check('library en 新建按钮', els.libNew.textContent, '+ New');
  check('library en 新建提示', els.libNew.title, 'New element');
}

// 语言包缺键时走内置中文兜底（真实运行期路径）
{
  const { els } = run(tlPath, 'zh-CN', {});
  check('timeline zh 兜底（无包命中）', els.tlTitle.textContent, '分镜时间轴');
}

console.log(fail === 0 ? 'RESULT all pass' : 'RESULT ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
