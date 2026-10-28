// 用 stub canvas 验证 _pdfInstallCN 的路由逻辑（CJK→栅格化，ASCII→原生文本）
const fs = require('fs');
const noop = () => {};
global.window = { BeatI18n: { t: (s) => ({ 'Shot list': '镜头表', 'Project overview': '项目概览' }[s] || s) } };
global.document = {
  createElement: () => {
    const ctx = {
      font: '', textBaseline: '', fillStyle: '',
      measureText: (s) => ({ width: s.length * 12 }),
      fillText: noop,
    };
    return { width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/png;base64,AAAA' };
  },
};
global.console = console;

const src = fs.readFileSync('src/artifacts/embedded-web/app.js', 'utf8');
const a = src.indexOf('const _CJK_RE');
const b = src.indexOf('async function _pdfUseCNFont(pdf){');
const c = src.indexOf('\n}', b) + 2;
const chunk = src.slice(a, c);

const fn = new Function('window', 'document', 'console',
  chunk + '\nreturn { _pdfInstallCN, _pdfLabel, _CJK_RE };');
const { _pdfInstallCN, _CJK_RE } = fn(global.window, global.document, console);

// stub jsPDF
const calls = { text: [], image: [], font: [] };
const pdf = {
  internal: { scaleFactor: 1 },
  setFont: (f, s) => calls.font.push([f, s]),
  setTextColor: noop,
  getFontSize: () => 11,
  text: (t, x, y, o) => calls.text.push([t, x, y, o]),
  addImage: (u, fmt, x, y, w, h) => calls.image.push({ fmt, x, y, w: Math.round(w), h: Math.round(h) }),
};

_pdfInstallCN(pdf);
pdf.setFont('helvetica', 'bold');
pdf.text('Shot list', 40, 100);                 // ASCII → 原生（且标签被翻译）
pdf.text('第一场 · 内景 · 日', 40, 130);          // CJK → 栅格化
pdf.text('Duration', 40, 160, { align: 'center' });

console.log('原生文本调用:', JSON.stringify(calls.text));
console.log('栅格化插入:', calls.image.length, JSON.stringify(calls.image));
// 期望：翻译成中文的标签、原文中文 → 栅格化；仍是 ASCII 的 → 原生文本
const ok1 = calls.text.length === 1 && calls.text[0][0] === 'Duration';
const ok2 = calls.image.length === 2 && calls.image.every(i => i.fmt === 'PNG');
const ok3 = calls.image[0].w > 0 && calls.image[0].h > 0;
console.log(ok1 ? 'PASS 纯 ASCII 行仍走原生文本（可选）' : 'FAIL 原生文本分流');
console.log(ok2 ? 'PASS 中文行（含被翻译的标签）走栅格化' : 'FAIL 栅格化分流');
console.log(ok3 ? 'PASS 图片尺寸有实际宽高' : 'FAIL 尺寸计算');
process.exit(ok1 && ok2 ? 0 : 1);
