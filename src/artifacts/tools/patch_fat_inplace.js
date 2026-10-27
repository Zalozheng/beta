#!/usr/bin/env node
// patch_fat_inplace.js <orig.fat> <out.fat> <zhDir>
// 就地改写 fat 二进制里的 brotli 资源槽：新流 <= 原槽长，尾部补 0x00。
// 不重组 fat（lipo -create 会改对齐导致整段挪位），保证字节级最小改动。
const fs = require("fs"), zlib = require("zlib");
const C = zlib.constants;
const [,, fatIn, fatOut, zhDir] = process.argv;

const d = Buffer.from(fs.readFileSync(fatIn));
const magic = d.readUInt32BE(0);
if (magic !== 0xcafebabe && magic !== 0xcafebabf) throw new Error("not a fat Mach-O: 0x" + magic.toString(16));
const n = d.readUInt32BE(4);
const archs = [];
for (let i = 0; i < n; i++) {
  const base = 8 + 20 * i;
  const cpu = d.readInt32BE(base), off = d.readUInt32BE(base + 8), size = d.readUInt32BE(base + 12);
  archs.push({ cpu, off, size });
}
const TARGETS = [["/index.html", "index.html"], ["/app.js", "app.js"], ["/templates.js", "templates.js"]];
const out = [];

for (const a of archs) {
  const slice = d.subarray(a.off, a.off + a.size);
  for (const [key, file] of TARGETS) {
    // 找到「键后面确实是可解 brotli 流」的那一处（串池里有同名但非资源的副本）
    let keyOff = -1, raw = null;
    for (let from = 0; ;) {
      const p = slice.indexOf(Buffer.from(key), from);
      if (p < 0) break;
      try {
        const r = zlib.brotliDecompressSync(slice.subarray(p + key.length));
        if (r.length > 1000) { keyOff = a.off + p; raw = r; break; }
      } catch (e) { /* 串池副本，跳过 */ }
      from = p + 1;
    }
    if (keyOff < 0) { out.push({ arch: a.cpu, file, error: "asset record not found" }); continue; }

    // 二分最小可解前缀 = 压缩流真实长度
    const dataOff = keyOff + key.length;
    let lo = 1, hi = d.length - dataOff;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      let ok = false;
      try { ok = zlib.brotliDecompressSync(d.subarray(dataOff, dataOff + mid)).length === raw.length; } catch (e) {}
      if (ok) hi = mid; else lo = mid + 1;
    }
    const slot = lo;

    const zh = fs.readFileSync(`${zhDir}/${file}`);
    const z = zlib.brotliCompressSync(zh, {
      params: { [C.BROTLI_PARAM_QUALITY]: 11, [C.BROTLI_PARAM_LGWIN]: 22, [C.BROTLI_PARAM_SIZE_HINT]: zh.length },
    });
    if (z.length > slot) { out.push({ arch: a.cpu, file, error: `does not fit (${z.length} > ${slot})` }); continue; }
    z.copy(d, dataOff);
    d.fill(0, dataOff + z.length, dataOff + slot);
    out.push({ arch: a.cpu === 0x1000007 ? "x86_64" : "arm64", file,
      key_off: "0x" + keyOff.toString(16), data_off: "0x" + dataOff.toString(16),
      slot, new_br_len: z.length, pad: slot - z.length, raw_len: raw.length, zh_raw_len: zh.length });
  }
}
fs.writeFileSync(fatOut, d);
console.log(JSON.stringify(out, null, 1));
