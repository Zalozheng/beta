/* i18n 英文残留抓取探针（--miss-probe 构建注入，正常构建不含本文件）
 * 目的：把界面上「仍然显示英文」的地方全部抓出来，落进 Beat.log 的 [miss] 行。
 * 判据：文本含 2+ 个连续拉丁字母、不含中文、长度 ≤ 200，且 BeatI18n.t() 翻译后仍是原样
 *       （说明语言包里没有对应译文）。用户正文容器（.wd-body 等）与 script/style 一律跳过。
 * 抓取三次（DOM 稳定后 + 延迟），每次只输出「新增」条目，去重。 */
(function () {
  'use strict';
  if (window.__missProbeDone) return;

  var SKIP_SEL = 'script,style,noscript,canvas,svg,textarea,select,option,code,pre,kbd,samp,iframe,' +
    '.wd-body,.wd-elem-note,.n-body,.nb-body,.n-note-body,.n-body-preview,.card-body,.node-body,' +
    '.beat-body,.shot-body,.news-textarea,.info-textarea,.onset-cardpop-text,.snapshot-body,' +
    '.doc-viewer-sheet-body,.doc-viewer-body,.sl-custom,[contenteditable]';
  var EN = /[A-Za-z]{2,}/;
  var ZH = /[\u3400-\u9fff]/;
  var seen = {};

  function log(msg) {
    var line = '[miss] ' + msg;
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        window.__TAURI__.core.invoke('js_log', { msg: line });
      }
    } catch (e) {}
    try { console.log(line); } catch (e) {}
  }

  function tr(s) {
    try { if (window.BeatI18n && window.BeatI18n.t) { var v = window.BeatI18n.t(s); if (v) return v; } } catch (e) {}
    return s;
  }

  function add(s, where) {
    if (typeof s !== 'string') return;
    s = s.replace(/\s+/g, ' ').trim();
    if (!s || s.length < 2 || s.length > 200) return;
    if (!EN.test(s) || ZH.test(s)) return;      // 已含中文的跳过（多是用户内容/混排）
    var got = tr(s);
    if (got !== s && ZH.test(got)) return;      // 语言包已覆盖
    var key = where + '\u0001' + s;
    if (seen[key]) return;
    seen[key] = 1;
    log(JSON.stringify({ en: s, where: where }));
  }

  function collect() {
    var n = 0;
    // 文本节点
    try {
      var walker = document.createTreeWalker(document.body || document, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var el = node.parentElement;
        if (!el) continue;
        var tag = el.tagName;
        if (/SCRIPT|STYLE|CANVAS|TEXTAREA|SELECT|OPTION|CODE|PRE/.test(tag)) continue;
        try { if (el.closest(SKIP_SEL)) continue; } catch (e) {}
        if (node.nodeValue) add(node.nodeValue, tag + '#text');
        n++;
      }
    } catch (e) {}
    // 属性
    try {
      var attrs = ['title', 'placeholder', 'aria-label', 'alt'];
      document.querySelectorAll('body [title], body [placeholder], body [aria-label], body [alt]').forEach(function (el) {
        attrs.forEach(function (a) {
          var v = el.getAttribute(a);
          if (v) add(v, el.tagName + '@' + a);
          n++;
        });
      });
    } catch (e) {}
    log('sweep done, nodes/attrs scanned ~' + n + ', total untranslated so far ~' + Object.keys(seen).length);
  }

  function run() {
    log('start');
    setTimeout(collect, 2500);
    setTimeout(collect, 7000);
    setTimeout(collect, 15000);
    window.__collectMiss = collect;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
