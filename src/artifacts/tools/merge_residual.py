#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把界面英文残留清单并进语言包。

  读  design/i18n-residual.json   （字段：class / en / zh / where / note）
  写  src/lang/zh-CN.json         （扁平 {"English": "中文"}）

用法:
  python3 src/artifacts/tools/merge_residual.py            # 预演（只报告）
  python3 src/artifacts/tools/merge_residual.py --write    # 真写
  python3 src/artifacts/tools/merge_residual.py --write --overwrite   # 覆盖已有译法

规则:
  * 只吃 A / B / C 三类（缺条 / 被规则挡住 / 拼接串），en 与 zh 都要非空
  * 跳过含代码味的串（URL、扩展名、协议、CSS 选择器）
  * 默认不覆盖已有键；--overwrite 才替换
  * 写之前备份为 src/lang/zh-CN.json.bak-<时间戳>
"""
import argparse
import json
import os
import re
import shutil
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PACK = os.path.join(ROOT, 'src', 'lang', 'zh-CN.json')
RESIDUAL = os.path.join(ROOT, 'design', 'i18n-residual.json')

CODEY = re.compile(r'(://|^(?:https?|tauri|plugin):|\.(?:js|css|html|json|png|jpe?g|svg|mp4|mov|wav|mp3|pdf|docx|fountain|zip)$|'
                   r'^[.#][\w-]+|^[\w-]+\s*,\s*[.#]|=>|function\s*\(|localStorage|querySelector|addEventListener)', re.I)


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='真写入语言包（默认只预演）')
    ap.add_argument('--overwrite', action='store_true', help='覆盖已有译法')
    ap.add_argument('--classes', default='A,B,C', help='要合并的类别，逗号分隔')
    args = ap.parse_args()

    if not os.path.exists(RESIDUAL):
        sys.exit(f'缺 {RESIDUAL}（先让静态分析角色产出这份清单）')
    rows = json.load(open(RESIDUAL, encoding='utf-8'))
    if isinstance(rows, dict):
        rows = rows.get('items') or rows.get('data') or []
    want = {c.strip().upper() for c in args.classes.split(',') if c.strip()}

    pack = json.load(open(PACK, encoding='utf-8'))
    before = len(pack)

    added, replaced, skipped_same, skipped_codey, skipped_empty = [], [], [], [], []
    for r in rows:
        if not isinstance(r, dict):
            continue
        cls = str(r.get('class') or r.get('cls') or '').strip().upper()
        en = norm(str(r.get('en') or ''))
        zh = norm(str(r.get('zh') or ''))
        if cls and cls[0] not in {w[0] for w in want}:
            continue
        if not en or not zh:
            skipped_empty.append(en or zh)
            continue
        if CODEY.search(en):
            skipped_codey.append(en)
            continue
        if en in pack:
            if norm(pack[en]) == zh:
                skipped_same.append(en)
            elif args.overwrite:
                replaced.append((en, pack[en], zh))
                pack[en] = zh
            else:
                skipped_same.append(en)
            continue
        added.append((en, zh))
        pack[en] = zh

    print(f'清单条目      : {len(rows)}')
    print(f'语言包        : {before} 条 → {len(pack)} 条（+{len(added)} 新增 / {len(replaced)} 覆盖）')
    print(f'跳过·已存在   : {len(skipped_same)}')
    print(f'跳过·代码味   : {len(skipped_codey)}')
    print(f'跳过·缺 en/zh : {len(skipped_empty)}')
    for en, zh in added[:15]:
        print(f'  + {en!r} → {zh!r}')
    if len(added) > 15:
        print(f'  … 另外 {len(added) - 15} 条')
    for en, old, zh in replaced[:10]:
        print(f'  ~ {en!r}: {old!r} → {zh!r}')

    if not args.write:
        print('\n预演结束。确认无误后加 --write 写入。')
        return 0

    stamp = time.strftime('%Y%m%d-%H%M%S')
    shutil.copyfile(PACK, PACK + f'.bak-{stamp}')
    with open(PACK, 'w', encoding='utf-8') as fh:
        json.dump(pack, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')
    print(f'\n已写入 {PACK}（备份 zh-CN.json.bak-{stamp}）')
    print('下一步：')
    print('  python3 src/artifacts/tools/build_i18n.py --check-slots /Applications/Beat.app.en.bak --install-lang')
    print('  node src/artifacts/tools/patch_fat_inplace.js src/work/beat.fat src/work/beat.fat.zh src/work/zh')
    return 0


if __name__ == '__main__':
    sys.exit(main())
