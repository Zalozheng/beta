const fs=require("fs"), zlib=require("zlib"), crypto=require("crypto"), path=require("path");
const d=fs.readFileSync("beat.arm64");
const OUT=process.argv[2];
const assets=[
["ab86a4","/vendor/jspdf.umd.min.js"],["ad2457","/vendor/gif.worker.js"],
["ad3886","/vendor/leaflet/images/marker-icon.png"],["ad3e6a","/app.js"],
["b5c8f3","/vendor/docx.iife.js"],["b7e410","/fonts/ibm-plex-mono-v20-latin_latin-ext-600.woff2"],
["b83dff","/style.css"],["b9af4e","/vendor/jszip.min.js"],["ba195d","/vendor/html2canvas.min.js"],
["babd55","/vendor/gif.js"],["bacd11","/vendor/mammoth.browser.min.js"],
["bcc557","/fonts/bricolage-grotesque-v9-latin_latin-ext-700.woff2"],
["bd365a","/vendor/leaflet/images/layers.png"],["bd3937","/vendor/leaflet/images/marker-shadow.png"],
["bd3bcd","/vendor/leaflet/images/marker-icon-2x.png"],
["bd459a","/fonts/familjen-grotesk-v11-latin_latin-ext-500.woff2"],
["bd896c","/fonts/ibm-plex-mono-v20-latin_latin-ext-regular.woff2"],
["bdde84","/fonts/bricolage-grotesque-v9-latin_latin-ext-600.woff2"],
["be505b","/vendor/pdf.min.js"],["bf8920","/vendor/xlsx.full.min.js"],
["c35ec2","/fonts/familjen-grotesk-v11-latin_latin-ext-600.woff2"],
["c3a25a","/vendor/leaflet/leaflet.js"],["c43e7e","/favicon.svg"],
["c44073","/vendor/leaflet/images/layers-2x.png"],["c44586","/vendor/leaflet/leaflet.css"],
["c4525e","/templates.js"],["c45cd2","/vendor/pdf.worker.min.js"],
["c85959","/fonts/familjen-grotesk-v11-latin_latin-ext-regular.woff2"],
["c89ac2","/fonts/ibm-plex-mono-v20-latin_latin-ext-500.woff2"],
["c8f162","/fonts/familjen-grotesk-v11-latin_latin-ext-700.woff2"],
["c9339c","/index.html"],
].map(([o,n])=>({start:parseInt(o,16),name:n}));
assets.sort((a,b)=>a.start-b.start);
function br(off){ return zlib.brotliDecompressSync(d.subarray(off)); }
function exactClen(off, dlen){
  // minimal prefix length that decompresses to full dlen
  let lo=1, hi=d.length-off;
  // first ensure full works
  while(lo<hi){
    const mid=(lo+hi)>>1;
    let ok=false;
    try{ const o=zlib.brotliDecompressSync(d.subarray(off, off+mid)); ok = o.length===dlen; }catch(e){ ok=false; }
    if(ok) hi=mid; else lo=mid+1;
  }
  return lo;
}
const manifest=[];
for(let i=0;i<assets.length;i++){
  const a=assets[i];
  const dataOff=a.start+a.name.length;
  const out=br(dataOff);
  const clen=exactClen(dataOff, out.length);
  const nextNameStart = (i+1<assets.length)? assets[i+1].start : dataOff+clen;
  const gap = nextNameStart-(dataOff+clen);
  const rel=a.name.replace(/^\//,"");
  const p=path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p),{recursive:true});
  fs.writeFileSync(p,out);
  manifest.push({name:a.name,file:rel,file_off:"0x"+a.start.toString(16),
    br_off:"0x"+dataOff.toString(16), br_len:clen, raw_len:out.length, gap_after:gap,
    sha256:crypto.createHash("sha256").update(out).digest("hex")});
}
console.log(JSON.stringify(manifest,null,1));
