/* ============================================================================
 * Beat 摄像机模块（build-injected）
 * ----------------------------------------------------------------------------
 * 给分镜表补上两层真实拍摄需要的东西：
 *   1. 运镜（机位运动）：固定 / 推 / 拉 / 摇 / 俯仰 / 横移 / 纵深移 / 升降 / 手持 / 环绕
 *      —— 每个镜头一个类型 + 一个强度（0.2–3×），数据写在 shot.camMove / shot.camSpeed
 *   2. 切换（镜头之间怎么接）：切 / 叠化 / 划像 / 淡入淡出 + 时长
 *      —— 数据写在 shot.transition
 * 面板左侧是按场分组的镜头序列，中间是取景框实时预览，右侧只放这个镜头用得上的参数。
 * 播放时按每个镜头的时长推进，运动与转场都真的走一遍，用来判断节奏对不对。
 * 不改数据结构、不迁移：字段不存在就按默认值（固定 / 切）显示。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.BeatCamera && window.BeatCamera.__beatCamera) return;

  var LANG = function () { return (window.BeatI18n && window.BeatI18n.lang) || 'zh-CN'; };
  var L = function (en, zh) { return LANG() === 'zh-CN' ? zh : en; };

  var MOVES = [
    { id: 'static',   en: 'Static',       zh: '固定',   glyph: '⊡' },
    { id: 'push',     en: 'Push in',      zh: '推',     glyph: '⊕' },
    { id: 'pull',     en: 'Pull out',     zh: '拉',     glyph: '⊖' },
    { id: 'pan',      en: 'Pan',          zh: '摇',     glyph: '⇄' },
    { id: 'tilt',     en: 'Tilt',         zh: '俯仰',   glyph: '⇅' },
    { id: 'truck',    en: 'Truck',        zh: '横移',   glyph: '⟷' },
    { id: 'dolly',    en: 'Dolly',        zh: '纵深移', glyph: '⤢' },
    { id: 'crane',    en: 'Crane',        zh: '升降',   glyph: '↕' },
    { id: 'handheld', en: 'Handheld',     zh: '手持',   glyph: '≈' },
    { id: 'orbit',    en: 'Orbit',        zh: '环绕',   glyph: '↻' }
  ];

  var TRANSITIONS = [
    { id: 'cut',      en: 'Cut',        zh: '切',         glyph: '│' },
    { id: 'dissolve', en: 'Dissolve',   zh: '叠化',       glyph: '✕' },
    { id: 'wipe',     en: 'Wipe',       zh: '划像',       glyph: '▤' },
    { id: 'fade',     en: 'Fade',       zh: '淡入淡出',   glyph: '◐' }
  ];

  var CSS = [
    '#cameraPane{position:fixed;inset:0;background:rgba(14,15,17,.96);z-index:9800;display:flex;flex-direction:column;color:#e8e9ec;font:inherit}',
    '#cameraPane[hidden]{display:none}',
    '.cam-top{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1)}',
    '.cam-title{font-weight:600;font-size:14px;letter-spacing:.02em}',
    '.cam-sub{color:#9aa0a8;font-size:12px}',
    '.cam-sp{flex:1}',
    '.cam-body{flex:1;display:grid;grid-template-columns:280px minmax(0,1fr) 300px;min-height:0}',
    '.cam-col{overflow:auto;padding:10px 12px}',
    '.cam-col+.cam-col{border-left:1px solid rgba(255,255,255,.08)}',
    '.cam-scene{font-size:11px;color:#9aa0a8;text-transform:uppercase;letter-spacing:.08em;margin:12px 0 6px}',
    '.cam-shot{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;cursor:pointer;border:1px solid transparent}',
    '.cam-shot:hover{background:rgba(255,255,255,.06)}',
    '.cam-shot.on{background:rgba(90,200,120,.14);border-color:rgba(90,200,120,.5)}',
    '.cam-shot .n{width:26px;color:#9aa0a8;font-size:12px;font-variant-numeric:tabular-nums}',
    '.cam-shot .t{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cam-shot .mv{font-size:11px;color:#7fd39a}',
    '.cam-stage{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}',
    '.cam-frame{position:relative;width:100%;max-width:860px;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.5)}',
    '.cam-frame canvas{width:100%;height:100%;display:block}',
    '.cam-HUD{position:absolute;left:10px;bottom:8px;font:11px/1.5 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.75);text-shadow:0 1px 2px #000}',
    '.cam-HUD b{color:#7fd39a}',
    '.cam-trans{position:absolute;right:10px;top:8px;font:11px/1.4 ui-monospace,Menlo,monospace;color:rgba(255,255,255,.8);background:rgba(0,0,0,.45);padding:3px 7px;border-radius:6px}',
    '.cam-bar{display:flex;align-items:center;gap:8px;width:100%;max-width:860px}',
    '.cam-prog{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}',
    '.cam-prog i{display:block;height:100%;width:0;background:#5ac878}',
    '.cam-btn{appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e8e9ec;border-radius:8px;padding:6px 11px;font-size:12.5px;cursor:pointer}',
    '.cam-btn:hover{background:rgba(255,255,255,.12)}',
    '.cam-btn.accent{background:#2f7d4d;border-color:#3f9e63}',
    '.cam-btn.on{background:#2f7d4d;border-color:#3f9e63}',
    '.cam-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.cam-lab{font-size:11px;color:#9aa0a8;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px}',
    '.cam-row{display:flex;align-items:center;gap:8px;margin:6px 0}',
    '.cam-row label{font-size:12.5px;color:#c9ced6;min-width:52px}',
    '.cam-row input[type=range]{flex:1}',
    '.cam-row input[type=number]{width:64px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#e8e9ec;border-radius:6px;padding:4px 6px;font-size:12px}',
    '.cam-hint{font-size:11.5px;color:#8d949d;line-height:1.6;margin-top:10px}',
    '.cam-keys{font-size:11.5px;color:#8d949d;margin-top:8px}',
    '.cam-keys b{color:#c9ced6}'
  ].join('\n');

  var st = {
    open: false,
    nodeId: null,
    shots: [],
    idx: 0,
    playing: false,
    t0: 0,
    raf: 0,
    progress: 0,     // 当前镜头内的进度 0..1
    trans: 0,        // 转场进度 0..1（上一镜 → 当前镜）
    prevIdx: -1
  };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function moveOf(shot) {
    var id = (shot && (shot.camMove || shot.move)) || 'static';
    for (var i = 0; i < MOVES.length; i++) if (MOVES[i].id === id) return MOVES[i];
    // 兼容用户在 Camera Move 列里手写的文字（推/拉/摇…）
    var s = String(id).toLowerCase();
    if (/push|推/.test(s)) return MOVES[1];
    if (/pull|拉/.test(s)) return MOVES[2];
    if (/pan|摇/.test(s)) return MOVES[3];
    if (/tilt|俯仰/.test(s)) return MOVES[4];
    if (/truck|横移/.test(s)) return MOVES[5];
    if (/dolly|纵深/.test(s)) return MOVES[6];
    if (/crane|升降/.test(s)) return MOVES[7];
    if (/hand|手持/.test(s)) return MOVES[8];
    if (/orbit|环绕/.test(s)) return MOVES[9];
    return MOVES[0];
  }
  function transOf(shot) {
    var t = (shot && shot.transition) || null;
    var id = (t && t.id) || 'cut';
    for (var i = 0; i < TRANSITIONS.length; i++) if (TRANSITIONS[i].id === id) return TRANSITIONS[i];
    return TRANSITIONS[0];
  }
  function transDur(shot) {
    var t = (shot && shot.transition) || null;
    var d = t && Number(t.dur);
    return isFinite(d) && d >= 0 ? d : 0.5;
  }
  function speedOf(shot) {
    var v = Number(shot && shot.camSpeed);
    return isFinite(v) && v > 0 ? v : 1;
  }
  function durOf(shot) {
    // 优先实拍秒数 secs，其次预估时长字符串
    var s = Number(shot && shot.secs);
    if (isFinite(s) && s > 0) return s;
    try {
      if (typeof _shotDurationNum === 'function') {
        var d = _shotDurationNum(shot && shot.duration);
        if (isFinite(d) && d > 0) return d;
      }
    } catch (e) {}
    return 3;
  }
  function shotLabel(shot, i) {
    var n = (shot && (shot.shootOrder || shot.num)) || (i + 1);
    var t = ((shot && (shot.description || shot.subject)) || '').trim();
    return { num: n, text: t || L('Untitled shot', '未命名镜头') };
  }
  function paintIcons() {
    var st2 = el('beatCameraStyle');
    if (!st2) {
      st2 = document.createElement('style');
      st2.id = 'beatCameraStyle';
      st2.textContent = CSS;
      document.head.appendChild(st2);
    }
  }

  /* ---------------------------------------------------------------- 视图 --- */
  function node() {
    try { return typeof _onsetNode === 'function' ? _onsetNode() : null; } catch (e) { return null; }
  }

  function shotsOf(n) {
    if (!n) return [];
    try {
      if (typeof _onsetShots === 'function') return _onsetShots(n) || [];
    } catch (e) {}
    return (n.shots || []).slice();
  }

  function saveShot(shot, patch) {
    Object.keys(patch).forEach(function (k) { shot[k] = patch[k]; });
    try { if (typeof save === 'function') save(); } catch (e) {}
    try { if (typeof renderTimeline === 'function') renderTimeline(); } catch (e) {}
    try { if (typeof render === 'function') render(); } catch (e) {}
  }

  /* ------------------------------------------------------------ 取景框 --- */
  function drawFrame() {
    var pane = el('cameraPane');
    if (!pane) return;
    var cv = el('camCanvas');
    if (!cv) return;
    var shot = st.shots[st.idx];
    var w = cv.clientWidth || 800, h = cv.clientHeight || 450;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#07090b';
    ctx.fillRect(0, 0, w, h);

    if (!shot) {
      ctx.fillStyle = '#7c848d';
      ctx.font = '14px -apple-system,"PingFang SC",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(L('Pick a shot on the left', '在左边选一个镜头'), w / 2, h / 2);
      return;
    }

    var mv = moveOf(shot);
    var p = st.progress;
    var sp = speedOf(shot);

    // 运动模型：画面在画框里的位置/缩放，t 是 0..1 的运动进度
    var t = Math.min(1, Math.max(0, p * sp));
    var scale = 1, ox = 0, oy = 0, rot = 0;
    var amp = 0.18 * Math.min(1.6, sp);           // 运动幅度随强度放大
    if (mv.id === 'push') scale = 1 + amp * t;
    else if (mv.id === 'pull') scale = 1 + amp - amp * t;
    else if (mv.id === 'pan') ox = (t - 0.5) * w * amp * 0.9;
    else if (mv.id === 'truck') ox = (t - 0.5) * w * amp * 0.6;
    else if (mv.id === 'dolly') { scale = 1 + amp * 0.6 * t; oy = (t - 0.5) * h * amp * 0.25; }
    else if (mv.id === 'tilt') oy = (t - 0.5) * h * amp * 0.8;
    else if (mv.id === 'crane') oy = (0.5 - t) * h * amp;
    else if (mv.id === 'orbit') { rot = (t - 0.5) * 0.12; ox = Math.sin(t * Math.PI) * w * amp * 0.35; }
    else if (mv.id === 'handheld') {
      var j = (Math.sin(p * 37) + Math.sin(p * 61)) * 0.5;
      ox = j * w * 0.012 * Math.min(2, sp); oy = Math.cos(p * 43) * h * 0.012 * Math.min(2, sp); rot = j * 0.004;
    }

    // 转场：上一镜 → 这一镜
    var tr = transOf(shot);
    var trP = st.trans > 0 ? st.trans : 0;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    // 画面本体（无缩略图时用渐变底 + 大号镜头信息，保证能看清取景变化）
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#182028');
    g.addColorStop(1, '#0c1216');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + ox, h / 2 + oy);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    var bw = w * 0.72, bh = h * 0.72;
    ctx.strokeStyle = 'rgba(127,211,154,.7)';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    // 三分线
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1 / scale;
    for (var k = 1; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(-bw / 2 + bw * k / 3, -bh / 2); ctx.lineTo(-bw / 2 + bw * k / 3, bh / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw / 2, -bh / 2 + bh * k / 3); ctx.lineTo(bw / 2, -bh / 2 + bh * k / 3); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,233,236,.92)';
    ctx.font = '600 ' + Math.round(w * 0.032) + 'px -apple-system,"PingFang SC",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var lb = shotLabel(shot, st.idx);
    ctx.fillText(L('SHOT ', '镜头 ') + lb.num, 0, -Math.max(12, w * 0.012));
    ctx.font = Math.round(w * 0.02) + 'px -apple-system,"PingFang SC",sans-serif';
    ctx.fillStyle = 'rgba(200,205,212,.85)';
    ctx.fillText(lb.text.slice(0, 42), 0, Math.max(14, w * 0.026));
    ctx.restore();

    // 转场覆盖层
    if (trP > 0 && st.prevIdx >= 0) {
      if (tr.id === 'dissolve' || tr.id === 'fade') {
        ctx.fillStyle = tr.id === 'fade' ? '#000' : 'rgba(10,12,14,' + (1 - trP) + ')';
        ctx.globalAlpha = tr.id === 'fade' ? (1 - trP) : 1;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      } else if (tr.id === 'wipe') {
        ctx.fillStyle = 'rgba(6,8,10,.92)';
        ctx.fillRect(w * trP, 0, w, h);
        ctx.strokeStyle = '#5ac878';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(w * trP, 0); ctx.lineTo(w * trP, h); ctx.stroke();
      }
    }

    // 硬切：一帧闪白提示切换点
    if (trP > 0 && tr.id === 'cut' && trP > 0.75) {
      ctx.fillStyle = 'rgba(255,255,255,' + (trP - 0.75) * 0.6 + ')';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // HUD
    var hud = el('camHud');
    if (hud) {
      hud.innerHTML = '<b>' + esc(mv[LANG() === 'zh-CN' ? 'zh' : 'en']) + '</b> · ' +
        esc(shot.shot || shot.camShot || L('—', '—')) + ' · ' + durOf(shot).toFixed(1) + 's · ' +
        (speedOf(shot)).toFixed(1) + '×';
    }
    var trEl = el('camTrans');
    if (trEl) {
      trEl.textContent = (st.idx > 0 ? tr : TRANSITIONS[0])[LANG() === 'zh-CN' ? 'zh' : 'en'];
    }
    var pf = el('camProgFill');
    if (pf) pf.style.width = Math.round(Math.min(1, st.progress) * 100) + '%';
  }

  /* -------------------------------------------------------------- 播放 --- */
  function stopPlay() {
    st.playing = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
    var b = el('camPlay');
    if (b) b.textContent = '▶ ' + L('Play', '播放');
  }

  function loop(ts) {
    if (!st.playing) return;
    if (!st.t0) st.t0 = ts;
    var shot = st.shots[st.idx];
    if (!shot) { stopPlay(); return; }
    var dur = durOf(shot);
    var tr = transOf(shot);
    var trD = st.idx > 0 ? transDur(shot) : 0;
    var dt = (ts - st.t0) / 1000;

    if (dt < trD && tr.id !== 'cut') {
      st.trans = trD > 0 ? dt / trD : 1;
      st.progress = 0;
      drawFrame();
      st.raf = requestAnimationFrame(loop);
      return;
    }
    st.trans = 0;
    var p = dur > 0 ? (dt - trD) / dur : 1;
    st.progress = Math.min(1, Math.max(0, p));
    drawFrame();
    if (p >= 1) {
      if (st.idx < st.shots.length - 1) {
        st.prevIdx = st.idx;
        st.idx++;
        st.t0 = ts;
        st.progress = 0;
        st.trans = 0;
        renderList();
        renderInspector();
        st.raf = requestAnimationFrame(loop);
        return;
      }
      stopPlay();
      st.progress = 1;
      drawFrame();
      return;
    }
    st.raf = requestAnimationFrame(loop);
  }

  function togglePlay() {
    if (!st.shots.length) {
      if (typeof note === 'function') note(L('No shots in this list yet', '这个镜头表里还没有镜头'));
      return;
    }
    if (st.playing) { stopPlay(); return; }
    st.playing = true;
    st.t0 = 0;
    if (st.idx >= st.shots.length) { st.idx = 0; st.prevIdx = -1; }
    var b = el('camPlay');
    if (b) b.textContent = '❙❙ ' + L('Pause', '暂停');
    st.raf = requestAnimationFrame(loop);
  }

  function gotoShot(i, keepPlaying) {
    if (!st.shots.length) return;
    st.idx = Math.max(0, Math.min(st.shots.length - 1, i));
    st.progress = 0;
    st.trans = 0;
    st.prevIdx = st.idx > 0 ? st.idx - 1 : -1;
    st.t0 = 0;
    renderList();
    renderInspector();
    drawFrame();
    if (keepPlaying) { st.t0 = 0; st.raf = requestAnimationFrame(loop); }
  }

  /* -------------------------------------------------------------- 列表 --- */
  function renderList() {
    var box = el('camList');
    if (!box) return;
    var n = st.node || node();
    var scenes = {};
    var order = [];
    st.shots.forEach(function (s, i) {
      var sid = s.sceneId || '__none__';
      if (!scenes[sid]) { scenes[sid] = []; order.push(sid); }
      scenes[sid].push({ s: s, i: i });
    });
    var nameOf = function (sid) {
      if (sid === '__none__') return L('Unassigned', '未分场');
      var arr = (n && n.scenes) || [];
      for (var i = 0; i < arr.length; i++) if (arr[i].id === sid) return arr[i].name || L('Scene', '场');
      return L('Scene', '场');
    };
    var html = '';
    order.forEach(function (sid) {
      html += '<div class="cam-scene">' + esc(nameOf(sid)) + '</div>';
      scenes[sid].forEach(function (it) {
        var lb = shotLabel(it.s, it.i);
        var mv = moveOf(it.s);
        html += '<div class="cam-shot' + (it.i === st.idx ? ' on' : '') + '" data-i="' + it.i + '">' +
          '<span class="n">' + esc(lb.num) + '</span>' +
          '<span class="t">' + esc(lb.text) + '</span>' +
          '<span class="mv">' + esc(mv.glyph + ' ' + mv[LANG() === 'zh-CN' ? 'zh' : 'en']) + '</span>' +
          '</div>';
      });
    });
    if (!html) html = '<div class="cam-hint">' + esc(L('No shots yet — add a shot list card first.', '还没有镜头 —— 先加一张镜头表卡片。')) + '</div>';
    box.innerHTML = html;
    box.querySelectorAll('.cam-shot').forEach(function (b) {
      b.addEventListener('click', function () { gotoShot(Number(b.dataset.i)); });
    });
  }

  /* ---------------------------------------------------------- 参数面板 --- */
  function renderInspector() {
    var box = el('camInsp');
    if (!box) return;
    var shot = st.shots[st.idx];
    if (!shot) { box.innerHTML = '<div class="cam-hint">' + esc(L('Pick a shot to set its camera.', '选一个镜头来设置摄像机。')) + '</div>'; return; }

    var mv = moveOf(shot);
    var tr = transOf(shot);
    var sp = speedOf(shot);
    var td = transDur(shot);

    var moveBtns = MOVES.map(function (m) {
      return '<button class="cam-btn' + (m.id === mv.id ? ' on' : '') + '" data-move="' + m.id + '">' +
        m.glyph + ' ' + esc(m[LANG() === 'zh-CN' ? 'zh' : 'en']) + '</button>';
    }).join('');
    var transBtns = TRANSITIONS.map(function (t) {
      return '<button class="cam-btn' + (t.id === tr.id ? ' on' : '') + '" data-tr="' + t.id + '">' +
        t.glyph + ' ' + esc(t[LANG() === 'zh-CN' ? 'zh' : 'en']) + '</button>';
    }).join('');

    box.innerHTML =
      '<div class="cam-lab">' + esc(L('Camera move', '运镜')) + '</div>' +
      '<div class="cam-grid">' + moveBtns + '</div>' +
      '<div class="cam-lab">' + esc(L('Strength', '强度')) + '</div>' +
      '<div class="cam-row"><label>' + esc(sp.toFixed(1)) + '×</label>' +
      '<input type="range" id="camSpeed" min="0.2" max="3" step="0.1" value="' + sp + '"></div>' +
      '<div class="cam-lab">' + esc(L('Transition in', '入镜转场')) + '</div>' +
      '<div class="cam-grid">' + transBtns + '</div>' +
      '<div class="cam-row"><label>' + esc(L('Length', '时长')) + '</label>' +
      '<input type="range" id="camTransDur" min="0" max="3" step="0.1" value="' + td + '">' +
      '<input type="number" id="camTransDurNum" min="0" max="3" step="0.1" value="' + td + '"></div>' +
      '<div class="cam-hint">' +
      esc(L('Move handles how the camera travels through the shot; transition handles how this shot meets the one before it. Both are saved on the shot itself, so they travel with the project and into the shot-list PDF.',
             '运镜决定镜头内部摄像机怎么动，转场决定这个镜头怎么接上一个。两者都存在镜头本身上，跟着项目走，也会出现在镜头表 PDF 里。')) +
      '</div>' +
      '<div class="cam-keys"><b>' + esc(L('space', '空格')) + '</b> ' + esc(L('play/pause', '播放/暂停')) + ' · ' +
      '<b>← →</b> ' + esc(L('previous / next shot', '上一个 / 下一个镜头')) + ' · <b>Esc</b> ' + esc(L('close', '关闭')) + '</div>';

    box.querySelectorAll('[data-move]').forEach(function (b) {
      b.addEventListener('click', function () {
        saveShot(shot, { camMove: b.dataset.move });
        renderList(); renderInspector(); drawFrame();
      });
    });
    box.querySelectorAll('[data-tr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = shot.transition || {};
        saveShot(shot, { transition: { id: b.dataset.tr, dur: t.dur != null ? t.dur : 0.5 } });
        renderInspector(); drawFrame();
      });
    });
    var spd = el('camSpeed');
    if (spd) spd.addEventListener('input', function () {
      saveShot(shot, { camSpeed: Number(spd.value) });
      renderInspector(); drawFrame();
    });
    var tdn = el('camTransDur');
    var tdm = el('camTransDurNum');
    var setDur = function (v) {
      var d = Math.max(0, Math.min(3, Number(v) || 0));
      var t = shot.transition || { id: 'cut' };
      saveShot(shot, { transition: { id: t.id || 'cut', dur: d } });
      if (tdn) tdn.value = d;
      if (tdm) tdm.value = d;
      drawFrame();
    };
    if (tdn) tdn.addEventListener('input', function () { setDur(tdn.value); });
    if (tdm) tdm.addEventListener('change', function () { setDur(tdm.value); });
  }

  /* -------------------------------------------------------------- 入口 --- */
  function buildPane() {
    if (el('cameraPane')) return;
    paintIcons();
    var pane = document.createElement('div');
    pane.id = 'cameraPane';
    pane.hidden = true;
    pane.innerHTML =
      '<div class="cam-top">' +
      '<button class="btn btn-icon" id="cameraCloseBtn" aria-label="' + esc(L('Close', '关闭')) + '">✕</button>' +
      '<span class="cam-title">' + esc(L('Camera', '摄像机')) + '</span>' +
      '<span class="cam-sub" id="camSub"></span>' +
      '<span class="cam-sp"></span>' +
      '<button class="cam-btn" id="camPlay">▶ ' + esc(L('Play', '播放')) + '</button>' +
      '<button class="cam-btn" id="camPrev">←</button>' +
      '<button class="cam-btn" id="camNext">→</button>' +
      '</div>' +
      '<div class="cam-body">' +
      '<div class="cam-col" id="camList"></div>' +
      '<div class="cam-col cam-stage">' +
      '<div class="cam-frame"><canvas id="camCanvas"></canvas>' +
      '<div class="cam-trans" id="camTrans"></div>' +
      '<div class="cam-HUD" id="camHud"></div></div>' +
      '<div class="cam-bar"><div class="cam-prog"><i id="camProgFill"></i></div></div>' +
      '</div>' +
      '<div class="cam-col" id="camInsp"></div>' +
      '</div>';
    document.body.appendChild(pane);

    el('cameraCloseBtn').addEventListener('click', close);
    el('camPlay').addEventListener('click', togglePlay);
    el('camPrev').addEventListener('click', function () { gotoShot(st.idx - 1); });
    el('camNext').addEventListener('click', function () { gotoShot(st.idx + 1); });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', function () { if (st.open) drawFrame(); });
  }

  function onKey(e) {
    if (!st.open) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); gotoShot(st.idx - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); gotoShot(st.idx + 1); }
  }

  function open(n) {
    n = n || node();
    if (!n) { if (typeof note === 'function') note(L('Open a shot list first', '请先打开一个镜头表')); return; }
    buildPane();
    st.node = n;
    st.nodeId = n.id;
    st.shots = shotsOf(n);
    st.idx = 0;
    st.prevIdx = -1;
    st.progress = 0;
    st.trans = 0;
    stopPlay();
    el('cameraPane').hidden = false;
    st.open = true;
    var sub = el('camSub');
    if (sub) sub.textContent = ((n.title || L('Shot list', '镜头表')) + ' · ' + st.shots.length + ' ' + L('shots', '镜'));
    renderList();
    renderInspector();
    requestAnimationFrame(drawFrame);
  }

  function close() {
    stopPlay();
    var pane = el('cameraPane');
    if (pane) pane.hidden = true;
    st.open = false;
  }

  /* 顶栏入口：挂在「分镜」按钮旁边，打开同一个分镜表时出现 */
  function mountButton() {
    if (el('cameraBtn')) return;
    var anchor = el('timelineBtn') || el('onsetBtn');
    if (!anchor || !anchor.parentNode) return;
    var b = document.createElement('button');
    b.className = 'btn';
    b.id = 'cameraBtn';
    b.textContent = L('Camera', '摄像机');
    b.title = L('Camera moves and shot transitions — see how the sequence plays',
                '运镜与镜头切换 —— 按顺序播一遍看节奏');
    b.addEventListener('click', function () { open(node()); });
    anchor.parentNode.insertBefore(b, anchor.nextSibling);
  }

  function boot() {
    paintIcons();
    mountButton();
    // 分镜表可能在打开项目后才出现，低频补挂
    setInterval(mountButton, 1500);
    window.addEventListener('beat:langchange', function () {
      var b = el('cameraBtn');
      if (b) {
        b.textContent = L('Camera', '摄像机');
        b.title = L('Camera moves and shot transitions — see how the sequence plays',
                    '运镜与镜头切换 —— 按顺序播一遍看节奏');
      }
      var p = el('camPlay');
      if (p) p.textContent = (st.playing ? '❙❙ ' + L('Pause', '暂停') : '▶ ' + L('Play', '播放'));
      if (st.open) { renderList(); renderInspector(); drawFrame(); }
    });
  }

  window.BeatCamera = {
    __beatCamera: true,
    open: open,
    close: close,
    MOVES: MOVES,
    TRANSITIONS: TRANSITIONS,
    moveOf: moveOf,
    transOf: transOf
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
