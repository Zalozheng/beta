/* i18n 读取通道探针（只在 --probe 构建里注入，正常构建不含本文件）
 * 目的：把「哪条命令能读到库目录里的语言包、能读多少字节」一次性测出来。 */
(function () {
  'use strict';
  var LIB = '/Users/zalo/Documents/Beat Projects';
  var PACK = LIB + '/.beat-lang/zh-CN.json';
  var FS = window.__TAURI__ && window.__TAURI__.core;
  var inv = FS ? FS.invoke : null;

  function out() {
    var s = '[probe] ' + Array.prototype.join.call(arguments, ' ');
    try { inv('js_log', { msg: s }); } catch (e) {}
    try { console.log(s); } catch (e) {}
  }

  async function probe(name, args, fmt) {
    try {
      var r = await inv(name, args);
      var d;
      try { d = fmt(r); } catch (e) { d = 'fmt-error ' + e.message; }
      out(name, 'OK', d);
    } catch (e) {
      out(name, 'ERR', String((e && (e.message || e)) || e).slice(0, 180));
    }
  }

  function describe(r) {
    if (typeof r === 'string') {
      return 'string len=' + r.length + ' head=' + JSON.stringify(r.slice(0, 50)) + ' tail=' + JSON.stringify(r.slice(-50));
    }
    return typeof r + ' ' + JSON.stringify(r).slice(0, 160);
  }

  async function stat(path) {
    try { var e = await inv('dir_exists', { path: path }); out('dir_exists', path, '=', JSON.stringify(e)); }
    catch (err) { out('dir_exists ERR', String(err && err.message || err)); }
  }

  async function run() {
    out('start r3');
    var projs = null;
    try { projs = await inv('list_projects', { libraryPath: LIB }); } catch (e) { out('list_projects ERR ' + e.message); }
    out('projs=' + JSON.stringify(projs && projs[0]).slice(0, 300));
    var pp = (projs && projs[0] && (projs[0].path || projs[0].dir || projs[0].id)) || (LIB + '/nes');
    // 1) 快照读：尝试跳出项目目录去读语言包（会不会做路径校验）
    var names = ['../../.beat-lang/zh-CN.json', '../../../Documents/Beat Projects/.beat-lang/zh-CN.json',
                 '/Users/zalo/Documents/Beat Projects/.beat-lang/zh-CN.json'];
    for (var i = 0; i < names.length; i++) {
      await probe('read_snapshot', { projectPath: pp, name: names[i] }, describe);
    }
    await probe('read_snapshot', { projectPath: LIB + '/.beat-lang', name: 'zh-CN.json' }, describe);
    await probe('read_snapshot', { projectPath: LIB, name: 'zh-CN.json' }, describe);
    // 2) 分块方案可行性：读一个 49KB 的分片
    for (var k = 1; k <= 4; k++) {
      await probe('read_doc_text', { path: LIB + '/.beat-lang/parts/zh-CN.' + k + '.json' }, function (r) {
        return 'len=' + (typeof r === 'string' ? r.length : -1) + ' head=' + JSON.stringify(String(r).slice(0, 24));
      });
    }
    out('done');
  }

  if (inv) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
  }
})();
