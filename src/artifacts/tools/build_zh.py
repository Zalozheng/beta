import json,sys,os
S=json.load(open("strings.json"))
SRC="../artifacts/embedded-web/"
DST="./zh/"
os.makedirs(DST,exist_ok=True)
byfile={}
for r in S:
    if r['source']!='embedded-web': continue
    byfile.setdefault(r['file'],[]).append(r)
report={}
for f,recs in byfile.items():
    text=open(SRC+f,encoding="utf-8").read()
    orig=len(text)
    # 1) offset-precise replacements (descending) -- exact first occurrence
    done=set()
    for r in sorted(recs,key=lambda r:-int(r['offset'].split('@')[-1])):
        off=int(r['offset'].split('@')[-1])
        if text[off:off+len(r['en'])]!=r['en']:
            continue
        text=text[:off]+r['zh']+text[off+len(r['en']):]
        done.add(r['en'])
    # 2) global replacement of remaining occurrences
    extra=0
    for r in recs:
        if r['en'] in done: continue
        if len(r['en'])<4: continue
        if r['en'] in text:
            extra+=text.count(r['en'])
            text=text.replace(r['en'],r['zh'])
    path=DST+f
    os.makedirs(os.path.dirname(path) or ".",exist_ok=True)
    open(path,"w",encoding="utf-8").write(text)
    report[f]={"orig_chars":orig,"zh_chars":len(text),"offset_hits":len(done),"global_extra":extra}
print(json.dumps(report,ensure_ascii=False,indent=1))
