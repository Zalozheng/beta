#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 selected.json 的唯一文案按长/短排序落成带序号的清单，供人工填译文。

生成:
  work/zh_list_short.tsv   (序号, 归一英文)   len<=45
  work/zh_list_long.tsv    (序号, 归一英文)   len>45
译文表格式（工具读的就是这个）:
  src/artifacts/tools/zh_v2_map_short.txt  ->  "s<序号>\t<中文>"
  src/artifacts/tools/zh_v2_map_long.txt   ->  "l<序号>\t<中文>"
"""
import json, collections, re, sys, os

sel = json.load(open(sys.argv[1], encoding='utf-8'))
by = collections.defaultdict(list)
for r in sel:
    by[r['norm']].append(r)


def visible_text(s):
    """去掉标签与属性值后剩下的人眼可见文字。"""
    t = re.sub(r'<[^>]*>', ' ', s)
    t = re.sub(r'="[^"]*"', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def bad(s):
    """只保留有人眼可见文字的东西；SVG/属性拼接/纯路径一律剔除。"""
    vis = visible_text(s)
    if len(re.findall(r'[A-Za-z]{2,}', vis)) == 0:   # 去掉标签后没有单词 → 不是文案
        return True
    if re.search(r'viewBox|stroke-width|clipPath|radialGradient|stop-opacity|text-anchor', s):
        return True
    if re.fullmatch(r'[A-Za-z]{1,3}', s) and s not in ('OK', 'Yes', 'No', 'All', 'VFX', 'SP', 'TC'):
        return True
    if re.fullmatch(r'<[^>]*>', vis):
        return True
    return False


keep = {k: v for k, v in by.items() if not bad(k)}
short = sorted(k for k in keep if len(k) <= 45)
longs = sorted(k for k in keep if len(k) > 45)
out = sys.argv[2]
open(os.path.join(out, 'zh_list_short.tsv'), 'w', encoding='utf-8').write(
    '\n'.join(f's{i}\t{k}' for i, k in enumerate(short)))
open(os.path.join(out, 'zh_list_long.tsv'), 'w', encoding='utf-8').write(
    '\n'.join(f'l{i}\t{k}' for i, k in enumerate(longs)))
print('short', len(short), 'long', len(longs))
