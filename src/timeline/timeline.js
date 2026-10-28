// BeatTimeline — 分镜 timeline 拖拽预览模块（v1）
// 集成：构建时由 build_i18n.py 注入 app.js 末尾（与 i18n 同法）。
// 全部 DOM（按钮 / 面板 / CSS）在运行期动态创建，不修改 index.html，
// 因此不占 index.html 的 brotli 槽位（该槽余量只有几百字节）。
// 依赖 app.js 已有 API：_onsetShots / _onsetNode / _shotDurationNum / _onsetFmtH /
// save / render / note / jumpToNode。
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.BeatTimeline) return;

  const TL = {};
  window.BeatTimeline = TL;

  let _tlNodeId = null;
  let _tlCurrentId = null;
  let _tlZoom = 1;
  let _tlDrag = null;

  function el(id) { return document.getElementById(id); }
  function node() { return (typeof _onsetNode === 'function') ? _onsetNode() : null; }
  function shots() { const n = node(); return (n && typeof _onsetShots === 'function') ? _onsetShots(n) : []; }
  function durSecs(sh) {
    if (sh.secs && sh.secs > 0) return sh.secs;
    const d = (typeof _shotDurationNum === 'function') ? _shotDurationNum(sh.duration) : 0;
    return (typeof d === 'number' && d > 0) ? d : 30;
  }
  function fmtH(s) { return (typeof _onsetFmtH === 'function') ? _onsetFmtH(s * 1000) : String(s) + 's'; }

  // 双语：源码写英文（与 app.js 同约定），运行期交给 BeatI18n 的语言包翻译；
  // 语言包没有这条键时用内置中文兜底，切到英文则原样显示英文。
  function L(en, zh) {
    try {
      if (window.BeatI18n && typeof window.BeatI18n.t === 'function') {
        const hit = window.BeatI18n.t(en);
        if (hit && hit !== en) return hit;
        return (window.BeatI18n.lang === 'en') ? en : zh;
      }
    } catch (e) {}
    return en;
  }

  function sceneName(n, id) {
    const sc = (n.scenes || []).find(x => x.id === id);
    return (sc && sc.name) ? sc.name : L('Unassigned', '未分场');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  const TL_CSS = [
    '.timeline-pane{position:fixed;inset:0;z-index:9000;background:var(--bg,#16161a);color:var(--ink,#eee);display:flex;flex-direction:column;font:13px -apple-system,system-ui,sans-serif}',
    '.timeline-pane[hidden]{display:none}',
    '.tl-top{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1)}',
    '.tl-title{font-weight:700;font-size:15px}',
    '.tl-count-wrap{opacity:.7;font-size:12px}',
    '.tl-flex{flex:1}',
    '.tl-order-seg{display:flex;border:1px solid rgba(255,255,255,.18);border-radius:8px;overflow:hidden}',
    '.tl-order-seg button{background:none;border:0;color:inherit;padding:5px 10px;font-size:12px;cursor:pointer}',
    '.tl-order-seg button.on{background:rgba(255,255,255,.16)}',
    '.tl-playhead-wrap{height:4px;background:rgba(255,255,255,.08);position:relative}',
    '#tlPlayhead{position:absolute;left:0;top:0;bottom:0;width:0;background:#e8a33d;transition:width .15s}',
    '.tl-body{flex:1;display:flex;min-height:0;position:relative}',
    '.tl-lanes{flex:1;overflow:auto;padding:14px}',
    '.tl-lane{margin-bottom:18px}',
    '.tl-lane-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;opacity:.8}',
    '.tl-lane-name{font-weight:600}',
    '.tl-lane-n{opacity:.6}',
    '.tl-lane-track{display:flex;gap:8px;min-height:64px;padding:6px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;overflow-x:auto}',
    '.tl-shot{flex:0 0 auto;min-width:64px;height:64px;border-radius:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);display:flex;flex-direction:column;justify-content:space-between;padding:6px;cursor:grab;user-select:none;position:relative}',
    '.tl-shot.dragging{opacity:.5;cursor:grabbing}',
    '.tl-shot.done{background:rgba(80,200,120,.18);border-color:rgba(80,200,120,.4)}',
    '.tl-shot.skipped{opacity:.45;text-decoration:line-through}',
    '.tl-shot.current{outline:2px solid #e8a33d}',
    '.tl-shot-num{font-weight:700;font-size:12px}',
    '.tl-shot-dur{font-size:11px;opacity:.75}',
    '.tl-shot-take{position:absolute;right:6px;top:6px;font-size:10px;opacity:.7}',
    '.tl-preview{position:absolute;right:16px;bottom:16px;background:rgba(0,0,0,.8);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:10px 14px;font-size:12px;pointer-events:none}',
    '.lib-bar{display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.lib-search{flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:6px;color:inherit;padding:5px 8px;font-size:12px}',
    '.lib-sort{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:6px;color:inherit;font-size:12px}',
    '.lib-new{background:rgba(232,163,61,.2);border:1px solid rgba(232,163,61,.5);color:inherit;border-radius:6px;font-size:12px;padding:4px 8px;cursor:pointer}'
  ].join('\n');

  function ensureDom() {
    if (!el('beatTimelineStyle')) {
      const st = document.createElement('style');
      st.id = 'beatTimelineStyle'; st.textContent = TL_CSS;
      document.head.appendChild(st);
    }
    if (!el('timelineBtn')) {
      const bar = document.querySelector('.bar-center');
      if (bar) {
        const b = document.createElement('button');
        b.className = 'btn'; b.id = 'timelineBtn';
        b.textContent = L('Storyboard', '分镜');
        b.title = L('Storyboard timeline — drag shots to reorder, scrub to preview',
                    '分镜时间轴 — 拖动排序、滑动预览');
        const onset = el('onsetBtn');
        if (onset && onset.parentNode === bar) onset.insertAdjacentElement('afterend', b);
        else bar.appendChild(b);
      }
    }
    if (!el('timelinePane')) {
      const pane = document.createElement('div');
      pane.id = 'timelinePane'; pane.className = 'timeline-pane'; pane.hidden = true;
      pane.innerHTML =
        '<div class="tl-top">'
        + '<button class="btn btn-icon" id="timelineCloseBtn" aria-label="Close">✕</button>'
        + '<span class="tl-title" id="tlTitle">Storyboard timeline</span>'
        + '<span class="tl-count-wrap"><span id="tlCount">0</span> <span id="tlUnit">shots</span> · <span id="tlPlayPct">0/0</span></span>'
        + '<span class="tl-flex"></span>'
        + '<div class="tl-order-seg" id="tlOrderSeg">'
        + '<button data-order="story">Story order</button><button data-order="shooting">Shooting order</button></div>'
        + '<button class="btn" id="tlZoomOut" title="Zoom out">−</button><button class="btn" id="tlZoomIn" title="Zoom in">＋</button>'
        + '</div>'
        + '<div class="tl-playhead-wrap"><i id="tlPlayhead"></i></div>'
        + '<div class="tl-body"><div id="tlLanes" class="tl-lanes"></div>'
        + '<div id="tlPreview" class="tl-preview" hidden></div></div>';
      document.body.appendChild(pane);
    }
    relabel();
  }

  // 语言切换 / 首次建 DOM 后刷新所有静态文案（动态部分由 renderTimeline 重绘）
  function relabel() {
    const title = el('tlTitle');
    if (title) title.textContent = L('Storyboard timeline', '分镜时间轴');
    const unit = el('tlUnit');
    if (unit) unit.textContent = L('shots', '镜');
    const seg = el('tlOrderSeg');
    if (seg) {
      const st = seg.querySelector('[data-order="story"]');
      const sh = seg.querySelector('[data-order="shooting"]');
      if (st) st.textContent = L('Story order', '故事顺序');
      if (sh) sh.textContent = L('Shooting order', '拍摄顺序');
    }
    const close = el('timelineCloseBtn');
    if (close) close.setAttribute('aria-label', L('Close', '关闭'));
    const zout = el('tlZoomOut'); if (zout) zout.title = L('Zoom out', '缩小');
    const zin = el('tlZoomIn'); if (zin) zin.title = L('Zoom in', '放大');
    const btn = el('timelineBtn');
    if (btn) {
      btn.textContent = L('Storyboard', '分镜');
      btn.title = L('Storyboard timeline — drag shots to reorder, scrub to preview',
                    '分镜时间轴 — 拖动排序、滑动预览');
    }
  }

  function lanes() {
    const n = node(); if (!n) return [];
    const sc = n.scenes || [];
    const order = sc.map(s => s.id);
    const map = new Map();
    shots().forEach(sh => {
      const key = sh.sceneId || '(none)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(sh);
    });
    return (order.length ? order : [...map.keys()]).filter(k => map.has(k)).map(k => ({
      id: k, name: sceneName(n, k), shots: map.get(k)
    }));
  }

  function openTimeline(targetNode) {
    ensureDom();
    const n = (targetNode && targetNode.type === 'shotlist') ? targetNode : node();
    if (!n) { if (typeof note === 'function') note(L('Open a shot list first', '请先打开一个镜头表')); return; }
    if (n.locked) { if (typeof note === 'function') note(L('Shot list is locked — unlock it first', '镜头表已锁定，先解锁')); return; }
    _tlNodeId = n.id; _tlCurrentId = null;
    const pane = el('timelinePane');
    if (!pane) return;
    pane.hidden = false; document.body.classList.add('timeline-open');
    renderTimeline();
  }
  function closeTimeline() {
    const pane = el('timelinePane'); if (pane) pane.hidden = true;
    document.body.classList.remove('timeline-open');
    _tlNodeId = null; _tlDrag = null;
  }

  function renderTimeline() {
    const n = node(); if (!n || n.id !== _tlNodeId) return;
    const wrap = el('tlLanes'); if (!wrap) return;
    const ls = lanes();
    const total = shots().length;
    const cnt = el('tlCount'); if (cnt) cnt.textContent = total;
    const seg = el('tlOrderSeg');
    if (seg) {
      const st = seg.querySelector('[data-order="story"]');
      const sh = seg.querySelector('[data-order="shooting"]');
      if (st) st.classList.toggle('on', n.orderMode !== 'custom');
      if (sh) sh.classList.toggle('on', n.orderMode === 'custom');
    }
    let html = '';
    ls.forEach(lane => {
      html += '<div class="tl-lane" data-scene="' + esc(lane.id) + '">'
        + '<div class="tl-lane-head"><span class="tl-lane-name">' + esc(lane.name) + '</span>'
        + '<span class="tl-lane-n">' + lane.shots.length + ' ' + esc(L('shots', '镜')) + '</span></div>'
        + '<div class="tl-lane-track">';
      lane.shots.forEach(sh => {
        const w = Math.max(64, Math.round(durSecs(sh) * 2 * _tlZoom));
        const cls = 'tl-shot' + (sh.done ? ' done' : '') + (sh.skipped ? ' skipped' : '') + (_tlCurrentId === sh.id ? ' current' : '');
        html += '<div class="' + cls + '" data-shot="' + esc(sh.id) + '" data-scene="' + esc(sh.sceneId || '') + '" style="width:' + w + 'px">'
          + '<div class="tl-shot-num">' + (sh.shootOrder != null ? sh.shootOrder + 1 : '') + '</div>'
          + '<div class="tl-shot-dur">' + fmtH(durSecs(sh)) + '</div>'
          + '<div class="tl-shot-take">' + (sh.take ? 'T' + sh.take : '') + '</div>'
          + '</div>';
      });
      html += '</div></div>';
    });
    wrap.innerHTML = html;
    bindLaneEvents();
    updatePlayhead();
  }

  function bindLaneEvents() {
    const wrap = el('tlLanes'); if (!wrap) return;
    wrap.querySelectorAll('.tl-shot').forEach(card => {
      card.addEventListener('pointerdown', e => onShotDown(e, card));
      card.addEventListener('pointermove', e => onShotMove(e, card));
      card.addEventListener('pointerup', e => onShotUp(e, card));
      card.addEventListener('dblclick', () => {
        _tlCurrentId = card.dataset.shot; renderTimeline();
        const n = node(); if (n && typeof jumpToNode === 'function') jumpToNode(n);
      });
    });
  }

  function shotById(id) { return shots().find(s => s.id === id) || null; }

  function onShotDown(e, card) {
    _tlCurrentId = card.dataset.shot;
    _tlDrag = { shotId: card.dataset.shot, startX: e.clientX, startY: e.clientY, moved: false, fromScene: card.dataset.scene };
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
    card.classList.add('dragging');
    renderTimeline();
  }
  function onShotMove(e, card) {
    if (!_tlDrag || _tlDrag.shotId !== card.dataset.shot) return;
    const dx = e.clientX - _tlDrag.startX, dy = e.clientY - _tlDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) _tlDrag.moved = true;
    if (_tlDrag.moved) {
      const pv = el('tlPreview');
      if (pv) {
        pv.hidden = false;
        const num = card.querySelector('.tl-shot-num');
        const dur = card.querySelector('.tl-shot-dur');
        pv.textContent = L('Preview: shot ', '预览：镜头 ') + (num ? num.textContent : '') + ' · ' + (dur ? dur.textContent : '');
      }
    }
  }
  function onShotUp(e, card) {
    if (!_tlDrag || _tlDrag.shotId !== card.dataset.shot) return;
    const wasDrag = _tlDrag.moved;
    _tlDrag = null;
    card.classList.remove('dragging');
    const pv = el('tlPreview'); if (pv) pv.hidden = true;
    if (wasDrag) {
      const n = node(); const sh = shotById(card.dataset.shot);
      if (n && sh) {
        const laneId = card.dataset.scene;
        const same = n.shots.filter(x => x.sceneId === laneId);
        const max = same.reduce((m, x) => Math.max(m, x.shootOrder || 0), 0);
        sh.shootOrder = max + 1; sh.sceneId = laneId || null;
        if (typeof save === 'function') save();
        renderTimeline();
        if (typeof render === 'function') render();
      }
    }
  }

  function updatePlayhead() {
    const bar = el('tlPlayhead'); if (!bar) return;
    const total = shots().length;
    const idx = total ? shots().findIndex(s => s.id === _tlCurrentId) : -1;
    bar.style.width = total ? Math.round((idx + 1) / total * 100) + '%' : '0%';
    const pct = el('tlPlayPct'); if (pct) pct.textContent = (idx + 1) + '/' + total;
  }

  function setOrder(mode) {
    const n = node(); if (!n) return;
    n.orderMode = (mode === 'shooting') ? 'custom' : 'story';
    if (typeof save === 'function') save();
    renderTimeline();
    if (typeof render === 'function') render();
  }
  function zoomBy(d) { _tlZoom = Math.min(4, Math.max(0.5, _tlZoom + d)); renderTimeline(); }

  function init() {
    ensureDom();
    const c = el('timelineCloseBtn'); if (c) c.addEventListener('click', closeTimeline);
    const zout = el('tlZoomOut'); if (zout) zout.addEventListener('click', () => zoomBy(-0.25));
    const zin = el('tlZoomIn'); if (zin) zin.addEventListener('click', () => zoomBy(0.25));
    const seg = el('tlOrderSeg');
    if (seg) {
      const st = seg.querySelector('[data-order="story"]');
      const sh = seg.querySelector('[data-order="shooting"]');
      if (st) st.addEventListener('click', () => setOrder('story'));
      if (sh) sh.addEventListener('click', () => setOrder('shooting'));
    }
    const btn = el('timelineBtn');
    if (btn) btn.addEventListener('click', () => openTimeline(node()));
    // 界面语言切换：静态文案重贴 + 已打开的面板重绘（动态内容也一起换语言）
    document.addEventListener('beat:langchange', () => { relabel(); renderTimeline(); });
  }

  TL.open = openTimeline;
  TL.close = closeTimeline;
  TL.relabel = relabel;
  TL.render = renderTimeline;
  TL.init = init;
  TL.setOrder = setOrder;

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
