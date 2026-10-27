#!/usr/bin/env node
// check_slots.js <fat|slice> <dir> —— 预检：新资源 brotli 后能否塞进原槽位
// 退出码 0 = 全部装得下，1 = 有装不下的（rebuild.sh 会在打补丁前就停下）
const fs = require("fs"), zlib = require("zlib");
const C = zlib.constants;
const [,, fatPath, dir] = process.argv;
if (!fatPath || !dir) { console.error("usage: check_slots.js <fat> <dir>"); process.exit(2); }

const d = fs.readFileSync(fatPath);
const TARGETS = [["/index.html", "index.html"], ["/app.js", "app.js"], ["/templates.js", "templates.js"]];

let slices = [];
const magic = d.readUInt32BE(0);
if (magic === 0xcafebabe || magic === 0xcafebabf) {
  const n = d.readUInt32BE(4);
  for (let i = 0; i < n; i++) {
    const b = 8 + 20 * i;
    slices.push({ name: d.readInt32BE(b) === 0x1000007 ? "x86_64" : "arm64", off: d.readUInt32BE(b + 8), size: d.readUInt32BE(b + 12) });
  }
} else {
  slices.push({ name: "single", off: 0, size: d.length });
}

let fail = 0;
for (const s of slices) {
  for (const [key, file] of TARGETS) {
    const slice = d.subarray(s.off, s.off + s.size);
    let dataOff = -1, rawLen = 0;
    for (let from = 0; ;) {
      const p = slice.indexOf(Buffer.from(key), from);
      if (p < 0) break;
      try {
        const r = zlib.brotliDecompressSync(slice.subarray(p + key.length));
        if (r.length > 1000) { dataOff = s.off + p + key.length; rawLen = r.length; break; }
      } catch (e) {}
      from = p + 1;
    }
    if (dataOff < 0) { console.log(`SKIP ${s.name} ${file} (asset record not found)`); // 只有单 slice 的样本会出现
      continue; }
    let lo = 1, hi = d.length - dataOff;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      let ok = false;
      try { ok = zlib.brotliDecompressSync(d.subarray(dataOff, dataOff + mid)).length === rawLen; } catch (e) {}
      if (ok) hi = mid; else lo = mid + 1;
    }
    const slot = lo;
    const body = fs.readFileSync(`${dir}/${file}`);
    const z = zlib.brotliCompressSync(body, {
      params: { [C.BROTLI_PARAM_QUALITY]: 11, [C.BROTLI_PARAM_LGWIN]: 22, [C.BROTLI_PARAM_SIZE_HINT]: body.length },
    });
    const fits = z.length <= slot;
    if (!fits) fail++;
    console.log(`${fits ? "OK  " : "OVER"} ${s.name.padEnd(7)} ${file.padEnd(13)} slot=${slot} new=${z.length} (${fits ? "-" : "+"}${Math.abs(slot - z.length)}) raw=${rawLen}→${body.length}`);
  }
}
console.log(fail ? `RESULT ${fail} OVER` : "RESULT all fit");
process.exit(fail ? 1 : 0);
