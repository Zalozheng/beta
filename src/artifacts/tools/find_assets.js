const fs=require("fs"), zlib=require("zlib");
const d=fs.readFileSync("beat.arm64");
const START=0xa00000, END=0xce6000;
function tryBr(off){
  try{
    const out=zlib.brotliDecompressSync(d.subarray(off));
    return out;
  }catch(e){ return null; }
}
// candidate names: printable run beginning with '/' and containing a dot-suffix or path
const re=/\/[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*/g;
const region=d.toString("latin1").slice(START,END);
let m, cands=[];
while((m=re.exec(region))){
  const s=m[1===0?0:0]=m[0];
  if(!/[A-Za-z0-9]/.test(s)) continue;
  if(!/\.[A-Za-z0-9]{1,5}$/.test(s)) continue; // must end with extension
  cands.push({name:s, start:START+m.index, end:START+m.index+s.length});
}
let found=[];
for(const c of cands){
  const out=tryBr(c.end);
  if(out && out.length>0) found.push({...c, clen:null, dlen:out.length, br:true});
}
found.sort((a,b)=>a.start-b.start);
console.log("candidates:",cands.length,"verified:",found.length);
for(const f of found) console.log(f.start.toString(16), String(f.dlen).padStart(9), f.name);
