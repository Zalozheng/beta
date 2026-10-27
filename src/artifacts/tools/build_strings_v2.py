#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成并合并 strings_v2.json —— 只收录 UI 文案残留，逐条精确 offset。

用法:
  python3 build_strings_v2.py <en_web_dir> <selected.json> <artifacts_dir> <work_dir>

产物:
  <artifacts_dir>/strings_v2.json   本轮新增条目
  <artifacts_dir>/strings.json      合并后全量（原 1004 条不动，新条目去重追加）
  <work_dir>/strings.json           合并后全量（rebuild.sh 的 build_zh.py 读这个）
"""
import json, os, re, sys, collections

def load_map(path):
    m = {}
    if not os.path.exists(path):
        return m
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if not line or line.startswith('#'):
            continue
        k, _, v = line.partition('\t')
        if not v or not k.strip():
            continue
        m[k.strip()] = v.strip()
    return m


def main(en_dir, selected_path, art_dir, work_dir):
    sel = json.load(open(selected_path, encoding='utf-8'))
    here = os.path.dirname(os.path.abspath(__file__))
    norm2zh = {}
    import glob
    for mf in sorted(glob.glob(os.path.join(here, 'zh_v2_map*.txt'))):
        part = load_map(mf)
        for k, v in part.items():
            norm2zh.setdefault(k, v)

    existing = json.load(open(os.path.join(art_dir, 'strings.json'), encoding='utf-8'))
    have = {(r['file'], r['offset']) for r in existing}
    have_en = collections.Counter((r['file'], r['en']) for r in existing)

    # 手工条目（显式 offset）：file \t offset \t raw \t zh
    manual = []
    mpath = os.path.join(here, 'zh_v2_manual.txt')
    if os.path.exists(mpath):
        for line in open(mpath, encoding='utf-8'):
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) != 4:
                continue
            f, off, raw, zh = parts
            if (f, 'char@' + off) in {(r['file'], r['offset']) for r in existing}:
                continue
            manual.append({'source': 'embedded-web', 'en': raw, 'zh': zh, 'file': f,
                           'offset': 'char@' + off})


    new, skipped, unmatched = [], [], []
    seen = set()
    for r in sel:
        zh = norm2zh.get(r['norm'])
        if not zh:
            continue
        key = (r['file'], r['offset'], r['raw'])
        if key in seen:
            continue
        seen.add(key)
        off = r['offset']
        ostamp = (('attr:' + r['quote'].split(':', 1)[1]) if r['quote'].startswith('attr:') else 'char') + '@' + str(off)
        if (r['file'], ostamp) in have:
            skipped.append((r['file'], ostamp, r['raw'][:40]))
            continue
        new.append({'source': 'embedded-web', 'en': r['raw'], 'zh': zh,
                    'file': r['file'], 'offset': ostamp})

    # 校验：每条新条目在英文原件里必须能精确命中
    bad = []
    cache = {}
    for r in new:
        f = r['file']
        if f not in cache:
            cache[f] = open(os.path.join(en_dir, f), encoding='utf-8').read()
        off = int(r['offset'].split('@')[-1])
        txt = cache[f]
        if txt[off:off + len(r['en'])] != r['en']:
            bad.append((f, off, r['en'][:50]))

    used = set(norm2zh)
    unused = [(k, v) for k, v in norm2zh.items() if k not in {r['norm'] for r in sel}]
    print('map entries:', len(norm2zh), 'matched literals:', len({(r['file'], r['offset']) for r in sel if r['norm'] in norm2zh}))
    print('new entries:', len(new), 'skipped(dup):', len(skipped), 'offset-mismatch:', len(bad))
    print('unused map keys:', len(unused))
    for b in bad[:10]:
        print('  BAD', b)
    for u in unused[:10]:
        print('  UNUSED', u[0][:60])

    for m in manual:
        txt = open(os.path.join(en_dir, m['file']), encoding='utf-8').read()
        o = int(m['offset'].split('@')[-1])
        if txt[o:o + len(m['en'])] != m['en']:
            bad.append((m['file'], o, m['en'][:50]))

    allnew = new + manual
    json.dump(allnew, open(os.path.join(art_dir, 'strings_v2.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    merged = existing + allnew
    for p in (os.path.join(art_dir, 'strings.json'), os.path.join(work_dir, 'strings.json')):
        json.dump(merged, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('manual entries:', len(manual), 'total new:', len(allnew))
    print('merged total:', len(merged))
    return 0 if not bad else 1


if __name__ == '__main__':
    sys.exit(main(*sys.argv[1:5]))
