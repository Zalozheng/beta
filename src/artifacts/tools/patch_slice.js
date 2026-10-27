// patch one thin Mach-O slice: replace brotli asset streams in place, zero-pad to the original slot
const fs=require("fs"), zlib=require("zlib");
const C=zlib.constants;
const [,, sliceIn, sliceOut, zhDir] = process.argv;
let d=fs.readFileSync(sliceIn);
const targets=[["/index.html","index.html"],["/app.js","app.js"],["/templates.js","templates.js"]];
function dec(off,len){
  try{ return zlib.brotliDecompressSync(len? d.subarray(off,off+len): d.subarray(off)); }catch(e){ return null; }
}
function exactClen(off,dlen){
  let lo=1,hi=d.length-off;
  while(lo<hi){ const mid=(lo+hi)>>1; let ok=false;
    try{ const o=zlib.brotliDecompressSync(d.subarray(off,off+mid)); ok=(o.length===dlen);}catch(e){}
    if(ok) hi=mid; else lo=mid+1; }
  return lo;
}
const log=[];
for(const [key,file] of targets){
  // find the asset name occurrence that validates as a brotli record
  let idx=-1, buf=null, clen=0;
  for(let from=0;;){
    const p=d.indexOf(Buffer.from(key),from);
    if(p<0) break;
    const off=p+key.length;
    const out=dec(off,0);
    if(out && out.length>1000){ idx=p; buf=out; clen=exactClen(off,out.length); break; }
    from=p+1;
  }
  if(idx<0){ log.push({file,error:"asset record not found"}); continue; }
  const zh=fs.readFileSync(`${zhDir}/${file}`);
  const z=zlib.brotliCompressSync(zh,{params:{[C.BROTLI_PARAM_QUALITY]:11,[C.BROTLI_PARAM_LGWIN]:22,[C.BROTLI_PARAM_SIZE_HINT]:zh.length}});
  if(z.length>clen){ log.push({file,error:`does not fit: need ${z.length} > ${clen}`}); continue; }
  const off=idx+key.length;
  z.copy(d,off);
  d.fill(0,off+z.length,off+clen);
  log.push({name:key,name_off:"0x"+idx.toString(16),data_off:"0x"+off.toString(16),
    old_br_len:clen,new_br_len:z.length,pad:clen-z.length,old_raw:buf.length,new_raw:zh.length});
}
fs.writeFileSync(sliceOut,d);
console.log(JSON.stringify(log,null,1));
