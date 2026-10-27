/* ============================================================================
 * Beat 运行时界面翻译模块  (i18n.js)
 * ----------------------------------------------------------------------------
 * 设计：英文原版前端 + 运行时 DOM 翻译。源码永远是英文，语言只是显示层，
 * 因此同一份 app.js 可以随时在中/英之间切换，不需要重建二进制。
 *
 * 语言包（独立文件，用户可自行编辑）：
 *   ~/Documents/Beat Projects/.beat-lang/zh-CN.json      {"English": "中文"}
 * 读取顺序：
 *   1) window.__TAURI__.fs.readTextFile(path)            —— fs 插件 JS API
 *   2) invoke('plugin:fs|read_text_file', { path })      —— fs 插件命令
 *   3) invoke('read_doc_text', { path })                 —— Beat 自带命令
 *   4) window.__BEAT_I18N_CORE__                          —— 构建时注入的核心词典
 * 任何一步拿不到就落到下一步，最终一定有一套可用词典，绝不会把界面弄成空白。
 *
 * 对外 API：
 *   window.BeatI18n = { lang, setLang(l), t(s), apply(root), restore(root), reloadPack() }
 * ========================================================================== */
(function () {
  'use strict';

  if (window.BeatI18n && window.BeatI18n.__beatI18n) return;   // 幂等，重复注入只认第一份

  var LS_KEY      = 'beat.uiLang';
  var DEFAULT_LANG = 'zh-CN';
  var MAX_TEXT_LEN = 400;
  var READ_CAP = 50000;          // read_doc_text 的硬上限（字符），超出会被静默截断          // 超过这个长度的文本不动（多半是用户正文/长段落）
  var DEBOUNCE_MS  = 60;
  var PACK_DIR     = '.beat-lang';
  var PACK_FILE    = 'zh-CN.json';
  var ATTRS        = ['placeholder', 'title', 'aria-label', 'alt'];

  // 不翻译的容器：脚本/样式/画布/表单控件/代码块 + 用户自己写的正文容器。
  // 正文容器宁可多排除，也不能把用户写的东西换掉。
  var SKIP_SEL = [
    'script', 'style', 'noscript', 'canvas', 'svg', 'textarea', 'select', 'option',
    'code', 'pre', 'kbd', 'samp', 'iframe', 'video', 'audio', 'math', '[translate="no"]',
    '[data-i18n-skip]', '[contenteditable=""]', '[contenteditable="true"]',
    '.wd-body', '.wd-elem-note', '.n-body', '.nb-body', '.n-note-body', '.n-body-preview',
    '.card-body', '.node-body', '.beat-body', '.shot-body',
    '.shootday-notes', '.news-textarea', '.info-textarea', '.onset-cardpop-text',
    '.snapshot-body', '.doc-viewer-sheet-body', '.doc-viewer-body', '.sl-custom'
  ].join(',');

  var state = {
    lang: DEFAULT_LANG,
    dict: Object.create(null),
    source: 'none',        // 'file' | 'core' | 'none'
    packPath: '',
    ready: false,
    translated: 0
  };

  var origText = new WeakMap();     // 文本节点 -> 英文原文
  var origAttr = new WeakMap();     // 元素    -> { attr: 英文原文 }
  var writing = false;              // 自己改 DOM 时关上观察器，避免自激循环
  var observer = null;
  var debounceTimer = null;
  var started = false;

  /* ---------------------------------------------------------------- 日志 --- */
  function log(msg) {
    var line = '[i18n] ' + msg;
    try {
      if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
        window.__TAURI__.core.invoke('js_log', { msg: line });
      }
    } catch (e) {}
    try { console.log(line); } catch (e) {}
  }

  /* -------------------------------------------------------------- 词典 IO --- */
  function tauriInvoke(cmd, args) {
    if (!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)) return null;
    return window.__TAURI__.core.invoke(cmd, args);
  }

  function decodeText(v) {
    if (typeof v === 'string') return v;
    if (v instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(v));
    if (v && v.buffer instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(v.buffer, v.byteOffset || 0, v.byteLength));
    if (Array.isArray(v)) return new TextDecoder('utf-8').decode(new Uint8Array(v));
    return null;
  }

  // 依次试几条读取通道。返回 { text, via, truncated } 或 null。
  //
  // 实测（见 reverse chain：fs 探针）：
  //   * plugin:fs|* 全部被 Tauri capabilities ACL 拒绝（read_text_file / read_file / exists 都一样）
  //   * read_doc_text 能用，但硬上限 50000 字符，超出会被静默截断
  // 所以：fs 通道留着（将来 scope 放开就是全保真）；实际靠 read_doc_text + 分片。
  function clip(s) { return s === null || s === undefined ? s : s; }

  async function readViaFs(path) {
    try {
      if (!(window.__TAURI__ && window.__TAURI__.fs && window.__TAURI__.fs.readTextFile)) { log('fs API unavailable'); return null; }
      var txt = await window.__TAURI__.fs.readTextFile(path);
      if (typeof txt === 'string' && txt.length > 2) return { text: txt, via: 'fs.readTextFile', truncated: false };
      log('fs.readTextFile empty');
    } catch (e) {
      log('fs.readTextFile failed: ' + ((e && (e.message || e)) + '').slice(0, 160));
    }
    return null;
  }

  async function readViaDocText(path) {
    try {
      var txt = await tauriInvoke('read_doc_text', { path: path });
      if (typeof txt !== 'string') return null;   // 文件不存在时命令返回非字符串，静默当没有
      if (txt.length === 0) return null;
      return { text: txt, via: 'read_doc_text', truncated: txt.length >= READ_CAP };
    } catch (e) {
      log('read_doc_text failed ' + path + ': ' + ((e && (e.message || e)) + '').slice(0, 160));
    }
    return null;
  }

  async function readFullFile(path) {
    var got = await readViaFs(path);
    if (got) return got;
    return await readViaDocText(path);
  }

  // 语言包可能在哪：库目录优先，其次家目录下的默认库路径。
  async function candidatePaths() {
    var out = [];
    var lib = '';
    try {
      if (typeof storage !== 'undefined' && storage && storage.libraryPath) lib = await storage.libraryPath();
    } catch (e) {}
    if (!lib) {
      try { lib = await tauriInvoke('library_path', {}); } catch (e) {}
    }
    if (lib) out.push(joinPath(lib, PACK_DIR, PACK_FILE));
    var home = '';
    try {
      if (window.__TAURI__ && window.__TAURI__.path && window.__TAURI__.path.homeDir) {
        home = await window.__TAURI__.path.homeDir();
      }
    } catch (e) {}
    if (home) {
      var alt = joinPath(home, 'Documents', 'Beat Projects', PACK_DIR, PACK_FILE);
      if (out.indexOf(alt) < 0) out.push(alt);
    }
    return out;
  }

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var seg = arguments[i];
      if (seg === undefined || seg === null || seg === '') continue;
      parts.push(String(seg));
    }
    if (!parts.length) return '';
    var head = parts.shift().replace(/\/+$/, '');
    return [head].concat(parts.map(function (s) { return s.replace(/^\/+/, '').replace(/\/+$/, ''); })).join('/');
  }

  // 与 tools/split_lang_pack.py 里的 fnv1a32 对齐：只用来判断「整包改过没有」
  function fnv1a32(str) {
    var h = 0x811C9DC5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;   // 必须 imul：普通乘法过 2^53 会丢精度
    }
    return '0x' + ('00000000' + h.toString(16)).slice(-8);
  }

  function mergeInto(dict, obj) {
    var n = 0;
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k) && typeof obj[k] === 'string') { dict[k] = obj[k]; n++; }
    }
    return n;
  }

  // 分片加载：整包超过 read_doc_text 上限时走这里。
  // parts/manifest.json 记录片数与「前 50000 字符指纹」，指纹不一致说明用户改过整包但没重切。
  async function loadFromParts(packPath, prefixText) {
    var partsDir = joinPath(dirName(packPath), 'parts');
    var man = await readViaDocText(joinPath(partsDir, 'manifest.json'));
    if (!man) { log('parts manifest unreadable at ' + partsDir); return 0; }
    var meta;
    try { meta = JSON.parse(man.text); } catch (e) { log('parts manifest bad JSON: ' + ((e && e.message) || e)); return 0; }
    if (!meta || !meta.parts || !meta.part_files) { log('parts manifest incomplete'); return 0; }
    if (prefixText && meta.prefix_fnv && fnv1a32(prefixText) !== meta.prefix_fnv) {
      log('WARN 语言包已改动但分片是旧的：重跑 tools/split_lang_pack.py（当前用旧分片）');
    }
    var dict = Object.create(null), total = 0;
    for (var i = 0; i < meta.part_files.length; i++) {
      var one = await readViaDocText(joinPath(partsDir, meta.part_files[i]));
      if (!one) { log('part missing: ' + meta.part_files[i]); return 0; }
      try { total += mergeInto(dict, JSON.parse(one.text)); }
      catch (e) { log('part bad JSON ' + meta.part_files[i] + ': ' + ((e && e.message) || e)); return 0; }
    }
    if (!total) { log('parts merged but empty'); return 0; }
    state.dict = dict;
    state.source = 'file+parts';
    state.packPath = packPath;
    state.packCount = total;
    log('pack loaded via parts dir=' + partsDir + ' files=' + meta.part_files.length + ' entries=' + total);
    return total;
  }

  function dirName(p) {
    var i = String(p).lastIndexOf('/');
    return i <= 0 ? '/' : String(p).slice(0, i);
  }

  async function loadPack() {
    var paths = [];
    try { paths = await candidatePaths(); } catch (e) {}
    for (var i = 0; i < paths.length; i++) {
      var got = await readFullFile(paths[i]);
      if (!got) continue;
      if (got.truncated) {
        // 整包比 read_doc_text 的上限长 —— 走分片
        log('pack longer than read cap (' + got.text.length + ' chars) at ' + paths[i] + ' → parts');
        if (await loadFromParts(paths[i], got.text)) return;
        continue;
      }
      try {
        var obj = JSON.parse(got.text);
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          var n = mergeInto(state.dict, obj);
          if (n > 0) {
            state.source = 'file';
            state.packPath = paths[i];
            state.packCount = n;
            log('pack loaded via ' + got.via + ' path=' + paths[i] + ' entries=' + n);
            return;
          }
          log('pack via ' + got.via + ' parsed but empty');
        }
      } catch (e) {
        log('pack parse failed at ' + paths[i] + ': ' + ((e && e.message || e) + '').slice(0, 120));
      }
    }
    var core = window.__BEAT_I18N_CORE__;
    if (core && typeof core === 'object') {
      var m = 0;
      for (var key in core) if (Object.prototype.hasOwnProperty.call(core, key) && typeof core[key] === 'string') { state.dict[key] = core[key]; m++; }
      state.source = 'core';
      state.packCount = m;
      log('falling back to embedded core dict entries=' + m);
    } else {
      state.source = 'none';
      state.packCount = 0;
      log('no dictionary available — UI stays English');
    }
  }

  /* ---------------------------------------------------------------- 翻译 --- */
  function lookup(s) {
    if (!s) return null;
    var v = state.dict[s];
    if (typeof v === 'string' && v && v !== s) return v;
    // 连续空白归一化再试一次（HTML 折行会把空格压成一个）
    var collapsed = s.replace(/\s+/g, ' ');
    if (collapsed !== s) {
      v = state.dict[collapsed];
      if (typeof v === 'string' && v && v !== collapsed) return v;
    }
    return null;
  }

  function inTranslatableContext(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !el.closest) return false;
    try { return !el.closest(SKIP_SEL); } catch (e) { return true; }
  }

  function setText(node, value) {
    writing = true;
    try { node.nodeValue = value; } finally { writing = false; }
  }

  function applyTextNode(node) {
    if (state.lang === 'en') return 0;
    var raw = node.nodeValue;
    if (!raw) return 0;
    var trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_TEXT_LEN) return 0;
    if (trimmed.indexOf('\n') >= 0) return 0;
    if (!inTranslatableContext(node)) return 0;
    if (origText.has(node) && origText.get(node) === raw) return 0;   // 已经是译文
    var zh = lookup(trimmed);
    if (!zh) return 0;
    var at = raw.indexOf(trimmed);
    if (at < 0) return 0;
    if (!origText.has(node)) origText.set(node, raw);
    if (state._samples && state._samples.length < 3) state._samples.push(trimmed + ' → ' + zh);
    setText(node, raw.slice(0, at) + zh + raw.slice(at + trimmed.length));
    return 1;
  }

  function applyAttrs(el) {
    if (state.lang === 'en') return 0;
    if (!el.getAttribute) return 0;
    var n = 0;
    for (var i = 0; i < ATTRS.length; i++) {
      var name = ATTRS[i];
      var val = el.getAttribute(name);
      if (!val || val.length > MAX_TEXT_LEN) continue;
      var trimmed = val.trim();
      if (!trimmed || trimmed.indexOf('\n') >= 0) continue;
      if (!inTranslatableContext(el)) continue;
      var zh = lookup(trimmed);
      if (!zh) continue;
      if (val === zh) continue;                     // 已经是译文，别再记一遍原文
      var store = origAttr.get(el);
      if (!store) { store = Object.create(null); origAttr.set(el, store); }
      if (store[name] === undefined) store[name] = val;
      writing = true;
      try { el.setAttribute(name, zh); } finally { writing = false; }
      n++;
    }
    return n;
  }

  // 一个子树整趟走完：文本节点 + 需要翻译的属性
  function applyTree(root) {
    if (!root || state.lang === 'en' || state.source === 'none') return 0;
    var n = 0;
    if (root.nodeType === 3) { n += applyTextNode(root); return n; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return 0;
    if (root.nodeType === 1) n += applyAttrs(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          var tag = node.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'CANVAS' ||
              tag === 'CODE' || tag === 'PRE' || tag === 'SELECT' || tag === 'OPTION') return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 3) n += applyTextNode(node);
      else if (node.nodeType === 1) n += applyAttrs(node);
    }
    return n;
  }

  function restoreTree(root) {
    if (!root) return 0;
    var n = 0;
    var scope = (root.nodeType === 9 ? root.documentElement : root);
    if (!scope) return 0;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    var node = scope;
    while (node) {
      if (node.nodeType === 3 && origText.has(node)) {
        var orig = origText.get(node);
        if (node.nodeValue !== orig) setText(node, orig);
        origText['delete'](node);
        n++;
      } else if (node.nodeType === 1 && origAttr.has(node)) {
        var store = origAttr.get(node);
        for (var k in store) {
          writing = true;
          try { node.setAttribute(k, store[k]); } finally { writing = false; }
          n++;
        }
        origAttr['delete'](node);
      }
      node = walker.nextNode();
    }
    return n;
  }

  /* ------------------------------------------------------------ 观察器 --- */
  function scheduleApply(nodes) {
    if (state.lang === 'en') return;
    if (debounceTimer) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      var n = 0;
      var list = pendingNodes;
      pendingNodes = [];
      for (var i = 0; i < list.length; i++) {
        var nd = list[i];
        if (!nd || !nd.isConnected) continue;
        n += applyTree(nd);
      }
      if (n) { state.translated += n; }
    }, DEBOUNCE_MS);
  }

  var pendingNodes = [];

  function startObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (muts) {
      if (writing || state.lang === 'en') return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          if (m.target && m.target.nodeType === 3) pendingNodes.push(m.target);
        } else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var added = m.addedNodes[j];
            if (added.nodeType === 3) pendingNodes.push(added.parentElement || added);
            else if (added.nodeType === 1) pendingNodes.push(added);
          }
        } else if (m.type === 'attributes') {
          if (m.target && m.target.nodeType === 1) pendingNodes.push(m.target);
        }
        if (pendingNodes.length > 400) break;
      }
      if (pendingNodes.length) scheduleApply();
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  /* -------------------------------------------------------------- 标题 --- */
  function applyTitle() {
    if (state.lang === 'en') return;
    var cur = document.title;
    if (!cur) return;
    // 应用会自己改标题（换项目、换视图）：cur != 我们上次写进去的值 => 是新标题
    if (state._origTitle === undefined || cur !== state._lastSetTitle) {
      if (cur !== state._origTitle) state._origTitle = cur;
      state._lastSetTitle = cur;
    }
    var zh = lookup(String(state._origTitle).trim());
    if (zh && document.title !== zh) {
      writing = true;
      try { document.title = zh; } finally { writing = false; }
      state._lastSetTitle = zh;
    }
  }

  function restoreTitle() {
    if (state._origTitle !== undefined) {
      writing = true;
      try { document.title = state._origTitle; } finally { writing = false; }
    }
  }


  /* ------------------------------------------------------- 无头自检 --- */
  // 这台机器上没法点界面（没有可交互的图形会话），所以要有一份能从日志里读的
  // 自检：库目录里放 .beat-lang/selftest.txt（内容 run），下次启动就把设置页打开、
  // 读语言下拉的值、连切两次语言、点一下更新按钮，全程写进 beat.log。测完删文件即可。
  function hasCJK(s) {
    var m = String(s || '').match(/[\u4e00-\u9fff]/g);
    return m ? m.length : 0;
  }

  async function beatSelfTest(lib) {
    if (!lib) return;
    var got = await readViaDocText(joinPath(lib, PACK_DIR, 'selftest.txt'));
    if (!got || String(got.text).trim() !== 'run') return;
    log('selftest: start');
    try {
      var hadOpen = (typeof openPrefsPanel === 'function');
      log('selftest: openPrefsPanel=' + hadOpen);
      if (hadOpen) { openPrefsPanel(); await new Promise(function (r) { setTimeout(r, 150); }); }
      var panel = document.getElementById('prefsPanel');
      log('selftest: prefsPanel exists=' + !!panel + ' hidden=' + (panel ? panel.hidden : 'n/a'));
      var sec = document.getElementById('prefsLangSection');
      var sel = document.getElementById('prefUiLang');
      log('selftest: langSection=' + !!sec + ' select=' + !!sel +
          ' value=' + (sel ? sel.value : 'n/a') + ' options=' + (sel ? sel.options.length : 0) +
          ' beatLang=' + state.lang);
      var upd = document.getElementById('prefsUpdateCheckBtn');
      var proj = (typeof PROJECT_URL !== 'undefined') ? PROJECT_URL : '(undefined)';
      log('selftest: updateBtn=' + (upd ? JSON.stringify(String(upd.textContent).trim()) : 'missing') + ' url=' + proj);
      var cjkZh = hasCJK(document.body ? document.body.innerText : '');
      log('selftest: bodyCJK(zh)=' + cjkZh + ' translated=' + state.translated);
      setLang('en');
      await new Promise(function (r) { setTimeout(r, 120); });
      var cjkEn = hasCJK(document.body ? document.body.innerText : '');
      log('selftest: switched en → bodyCJK=' + cjkEn + ' translated=0 title=' + JSON.stringify(document.title));
      setLang('zh-CN');
      await new Promise(function (r) { setTimeout(r, 120); });
      var cjkBack = hasCJK(document.body ? document.body.innerText : '');
      log('selftest: switched back zh-CN → bodyCJK=' + cjkBack);
      if (upd) {
        log('selftest: dispatching click on update button → expect Rust 打开 ' + proj);
        upd.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        // 同一个调用（openExternal 走的就是 reveal_path），单独再打一次，确认命令本身成功
        await new Promise(function (r) { setTimeout(r, 200); });
        try {
          await tauriInvoke('reveal_path', { path: proj });
          log('selftest: reveal_path(ok) → ' + proj);
        } catch (e) {
          log('selftest: reveal_path FAILED ' + ((e && (e.message || e)) + ''));
        }
      }
      if (hadOpen && typeof closePrefsPanel === 'function') closePrefsPanel();
    } catch (e) {
      log('selftest error: ' + ((e && e.message) || e));
    }
    log('selftest: done');
  }

  /* ---------------------------------------------------------------- API --- */
  function apply(root) {
    if (state.lang === 'en') { log('lang=en translated=0 (English source is already on screen)'); return 0; }
    var target = root || document.body || document.documentElement;
    state._samples = [];
    var n = applyTree(target);
    applyTitle();
    state.translated += n;
    log('lang=' + state.lang + ' translated=' + n + ' dict=' + Object.keys(state.dict).length + ' src=' + state.source +
        (n ? ' sample=[' + state._samples.join(' | ') + ']' : ''));
    return n;
  }

  function restore(root) {
    var target = root || document.body || document.documentElement;
    var n = restoreTree(target);
    restoreTitle();
    if (n) log('restored ' + n + ' originals');
    return n;
  }

  function setLang(l) {
    var next = (l === 'en') ? 'en' : 'zh-CN';
    var prev = state.lang;
    state.lang = next;
    try { localStorage.setItem(LS_KEY, next); } catch (e) {}
    if (next === 'en') {
      restore();
      state.translated = 0;
      log('lang=en translated=0');
    } else {
      state.translated = 0;
      apply();
    }
    if (prev !== next) {
      try { document.dispatchEvent(new CustomEvent('beat:langchange', { detail: { lang: next } })); } catch (e) {}
    }
    return next;
  }

  async function reloadPack() {
    state.dict = Object.create(null);
    await loadPack();
    if (state.lang !== 'en') { restore(); apply(); }
    return { source: state.source, entries: Object.keys(state.dict).length, path: state.packPath };
  }

  function t(s) {
    if (state.lang === 'en') return s;
    return lookup(s) || s;
  }

  window.BeatI18n = {
    __beatI18n: true,
    get lang() { return state.lang; },
    get source() { return state.source; },
    get entries() { return Object.keys(state.dict).length; },
    get packPath() { return state.packPath; },
    setLang: setLang,
    t: t,
    apply: apply,
    restore: restore,
    reloadPack: reloadPack
  };

  /* ------------------------------------------------------------- 启动 --- */
  state.lang = (function () {
    try {
      var v = localStorage.getItem(LS_KEY);
      return (v === 'en' || v === 'zh-CN') ? v : DEFAULT_LANG;
    } catch (e) { return DEFAULT_LANG; }
  })();

  async function boot() {
    if (started) return;
    started = true;
    await loadPack();
    state.ready = true;
    var stored = null;
    try { stored = localStorage.getItem(LS_KEY); } catch (e) {}
    log('boot lang=' + state.lang + ' stored=' + String(stored) + ' dict=' + Object.keys(state.dict).length +
        ' src=' + state.source + (state.packPath ? ' path=' + state.packPath : ''));
    if (state.lang === 'en') { log('lang=en translated=0'); }
    else { apply(); }
    startObserver();
    // 首屏之后还要补几趟：列表/卡片是异步渲染的，观察器兜不住的先手补两次。
    setTimeout(function () { if (state.lang !== 'en') apply(); }, 400);
    setTimeout(function () { if (state.lang !== 'en') apply(); }, 1500);
    setTimeout(function () {
      var lib = '';
      try { if (typeof storage !== 'undefined' && storage && storage.libraryPath) { storage.libraryPath().then(function (p) { beatSelfTest(p); }).catch(function () {}); return; } } catch (e) {}
      beatSelfTest(lib);
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
