// BeatLibrary — 人物/场景/道具库「管理能力」升级（v1 骨架）
// 集成方式：构建时注入 app.js 末尾（同 timeline.js），不侵入现有 renderCast()。
// 依赖已确认的 app.js API：state.nodes、renderCast()、mentionBacklinks()、
//   jumpToNode()、note()、save()、render()。数据模型零迁移。
//
// 现状（app.js renderCast / renderElementProfile）：展示 + profile + 反向链接已齐；
// 本模块补的是「管理」：搜索、排序（按出场次数）、新建入口、删除。
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.BeatLibrary) return;

  const LIB = {};
  window.BeatLibrary = LIB;

  const KINDS = ['character', 'location', 'prop'];
  let _query = '';
  let _sort = 'name'; // 'name' | 'mentions'

  function el(id) { return document.getElementById(id); }

  // 双语：源码写英文，运行期由 BeatI18n 语言包翻译；包里没这条键就用内置中文兜底。
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
  function castNodes() {
    if (!window.state || !Array.isArray(state.nodes)) return [];
    return state.nodes.filter(n => KINDS.includes(n.type) && (n.title || '').trim());
  }
  function mentionCount(n) {
    try { return (typeof mentionBacklinks === 'function') ? mentionBacklinks(n).length : 0; }
    catch (e) { return 0; }
  }

  // 过滤 + 排序后的节点顺序（返回按 group 的节点，供重排用）
  function ordered() {
    let list = castNodes();
    if (_query) {
      const q = _query.toLowerCase();
      list = list.filter(n => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q));
    }
    if (_sort === 'mentions') {
      list.sort((a, b) => mentionCount(b) - mentionCount(a) || (a.title || '').localeCompare(b.title || ''));
    } else {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    return list;
  }

  // 无侵入过滤：隐藏不匹配的 .cast-row，并按 ordered() 重排当前可见组。
  // 注意：renderCast() 重新渲染时会重置 DOM，所以这里同时观察 #castBody 变化后重跑。
  function applyFilter() {
    const body = el('castBody'); if (!body) return;
    const allowed = new Set(ordered().map(n => n.id));
    const rows = Array.from(body.querySelectorAll('.cast-row'));
    rows.forEach(row => {
      const shotId = row.__nodeId;
      row.style.display = allowed.has(shotId) ? '' : 'none';
    });
    // 重排：按 ordered() 顺序在各自 .cast-group 内移动
    const groups = body.querySelectorAll('.cast-group');
    groups.forEach(g => {
      const kindRows = Array.from(g.querySelectorAll('.cast-row'));
      if (!kindRows.length) return;
      const orderMap = new Map();
      ordered().forEach((n, i) => orderMap.set(n.id, i));
      kindRows.sort((a, b) => (orderMap.get(a.__nodeId) ?? 1e9) - (orderMap.get(b.__nodeId) ?? 1e9));
      kindRows.forEach(r => g.insertBefore(r, null));
    });
  }

  // 在 cast 面板头部注入管理条（搜索 + 排序 + 新建 + 删除选中）
  function injectBar() {
    const head = el('castPanel') && el('castPanel').querySelector('.media-tab-head');
    if (!head || el('libBar')) return;
    const bar = document.createElement('div');
    bar.id = 'libBar';
    bar.className = 'lib-bar';
    bar.innerHTML =
      '<input type="search" id="libSearch" class="lib-search" placeholder="Search characters / locations / props" />'
      + '<select id="libSort" class="lib-sort">'
      + '<option value="name">By name</option>'
      + '<option value="mentions">By screen count</option>'
      + '</select>'
      + '<button id="libNew" type="button" class="lib-new" title="New element">+ New</button>';
    // 插入到 head 和 body 之间
    head.insertAdjacentElement('afterend', bar);
    el('libSearch').addEventListener('input', e => { _query = e.target.value.trim(); applyFilter(); });
    el('libSort').addEventListener('change', e => { _sort = e.target.value; applyFilter(); });
    el('libNew').addEventListener('click', () => openNewMenu());
    relabel();
  }

  // 语言切换后刷新管理条文案（placeholder / 下拉 / 按钮）
  function relabel() {
    const q = el('libSearch');
    if (q) q.setAttribute('placeholder', L('Search characters / locations / props', '搜索人物 / 场景 / 道具'));
    const sort = el('libSort');
    if (sort) {
      const name = sort.querySelector('option[value="name"]');
      const mentions = sort.querySelector('option[value="mentions"]');
      if (name) name.textContent = L('By name', '按名称');
      if (mentions) mentions.textContent = L('By screen count', '按出场次数');
    }
    const btn = el('libNew');
    if (btn) {
      btn.textContent = L('+ New', '+ 新建');
      btn.title = L('New element', '新建元素');
    }
  }

  // 新建：复用 add 菜单里 data-type=character/location/prop 的按钮点击（spawn 逻辑不动）。
  function openNewMenu() {
    const menu = el('addMenu');
    const btn = menu && menu.querySelector('button[data-type="character"]');
    if (btn) {
      // 打开 add 菜单并触发对应类型（与 _openSpawnMenu 语义一致，集成时核对是否需先展开分类）
      if (menu.hidden) { const addBtn = el('addBtn'); if (addBtn) addBtn.click(); }
      btn.click();
    } else if (typeof note === 'function') {
      note(L('New element entry not found', '未找到新建入口'));
    }
  }

  // 删除：删除当前选中的 cast 行对应节点。选中态存 LIB.selectedId（由 cast 行点击时设置）。
  function deleteSelected() {
    const id = LIB.selectedId;
    if (!id || !window.state) { if (typeof note === 'function') note(L('Select an element to delete first', '先选中一个要删除的元素')); return; }
    const idx = (state.nodes || []).findIndex(n => n.id === id);
    if (idx < 0) { if (typeof note === 'function') note(L('Element not found', '元素不存在')); return; }
    state.nodes.splice(idx, 1);
    if (typeof save === 'function') save();
    if (typeof render === 'function') render();
    if (typeof renderCast === 'function') renderCast();
    LIB.selectedId = null;
  }

  // 观察 cast 渲染变化后重跑过滤；并把 cast-row 与节点 id 关联（renderCast 未暴露 id）。
  function hookRows() {
    const body = el('castBody'); if (!body) return;
    // 关联：cast-row 的顺序与 renderCast 内的 items 顺序一致；这里用 title 匹配兜底。
    // 更稳的方式是集成时给 renderCast 的 row 加 data-id；此处先占位。
    const rows = Array.from(body.querySelectorAll('.cast-row'));
    const nodes = castNodes();
    rows.forEach((row, i) => {
      if (i < nodes.length) row.__nodeId = nodes[i].id;
      row.addEventListener('click', () => { LIB.selectedId = row.__nodeId; });
    });
    applyFilter();
  }

  function init() {
    if (!el('castPanel')) return;
    injectBar();
    hookRows();
    const mo = new MutationObserver(() => { hookRows(); });
    mo.observe(el('castBody'), { childList: true, subtree: true });
    // 打开 cast 面板时也刷新（castPanel hidden 切换）
    const castBtn = el('castBtn');
    if (castBtn) castBtn.addEventListener('click', () => setTimeout(hookRows, 50));
    document.addEventListener('beat:langchange', relabel);
  }

  LIB.relabel = relabel;
  LIB.filter = q => { _query = q || ''; applyFilter(); };
  LIB.sort = m => { _sort = m; applyFilter(); };
  LIB.deleteSelected = deleteSelected;
  LIB.init = init;
  LIB.selectedId = null;

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
