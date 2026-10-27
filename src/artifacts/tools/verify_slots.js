// verify_slots.js <patched.fat> <zhDir> —— 从补丁后 fat 的两个 slice 回读三个资源，与 zh/ 逐字节比对
const fs=require("fs"),zlib=require("zlib"),crypto=require("crypto");
const [,,fat,zhDir]=process.argv;
const d=fs.readFileSync(fat);
const n=d.readUInt32BE(4); const archs=[];
for(let i=0;i<n;i++){const b=8+20*i;archs.push({cpu:d.readInt32BE(b),off:d.readUInt32BE(b+8),size:d.readUInt32BE(b+12)});}
const T=[["/index.html","index.html"],["/app.js","app.js"],["/templates.js","templates.js"]];
let pass=0,fail=0;
for(const a of archs){
  const s=d.subarray(a.off,a.off+a.size);
  for(const [key,file] of T){
    let ok=false,info="";
    for(let from=0;;){
      const p=s.indexOf(Buffer.from(key),from); if(p<0)break;
      try{ const r=zlib.brotliDecompressSync(s.subarray(p+key.length));
        if(r.length>1000){ const zh=fs.readFileSync(`${zhDir}/${file}`);
          ok=r.equals(zh); info=`len=${r.length} sha256=${crypto.createHash("sha256").update(r).digest("hex").slice(0,16)}`; break; }
      }catch(e){}
      from=p+1;
    }
    console.log((ok?"PASS":"FAIL"), a.cpu===0x1000007?"x86_64":"arm64", file, info);
    ok?pass++:fail++;
  }
}
console.log(`RESULT ${pass} PASS / ${fail} FAIL`);
process.exit(fail?1:0);
