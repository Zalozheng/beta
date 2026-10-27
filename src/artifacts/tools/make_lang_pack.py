#!/usr/bin/env python3
# make_lang_pack.py — 从 strings.json 生成独立语言包 src/lang/zh-CN.json
#
#   python3 src/artifacts/tools/make_lang_pack.py [--force]
#
# 规则：
#   * 只取 source == "embedded-web" 的条目
#   * 同一个英文原文出现多次时，保留第一条中文（strings.json 的顺序即提取顺序）
#   * 额外补一条「JS 反转义后」的键（源码里是 \\' / \\" / \\\\ 这样的字面量，
#     运行期 DOM 里是真实的 ' " \），否则这些句子永远匹配不上
#   * 结果写成扁平 {"英文原文": "中文译文"}，用户可以直接编辑
#
# 已存在且带 --force 之外的参数时不覆盖（语言包是用户可编辑资产，构建不该冲掉人工修订）。
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC_STRINGS = os.path.join(ROOT, 'src', 'artifacts', 'strings.json')
OUT = os.path.join(ROOT, 'src', 'lang', 'zh-CN.json')

UNESCAPE = [
    ("\\\\'", "'"),
    ('\\\\"', '"'),
    ('\\\\\\\\', '\\'),
    ('\\\\n', '\n'),
    ('\\\\t', '\t'),
]


def js_unescape(s: str) -> str:
    out = s
    for a, b in UNESCAPE:
        out = out.replace(a, b)
    return out


def main() -> int:
    force = '--force' in sys.argv
    existing = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as fh:
            existing = json.load(fh)
        if not force:
            print(f'[lang] {OUT} 已存在（{len(existing)} 条），跳过。要重新生成加 --force')
            return 0

    with open(SRC_STRINGS, encoding='utf-8') as fh:
        rows = json.load(fh)

    pack: dict[str, str] = {}
    dropped = 0
    for r in rows:
        if r.get('source') != 'embedded-web':
            continue
        en, zh = r.get('en'), r.get('zh')
        if not isinstance(en, str) or not isinstance(zh, str):
            continue
        if not en or not zh or en == zh:
            dropped += 1
            continue
        if en not in pack:
            pack[en] = zh

    # JS 反转义变体（不覆盖已有键）
    extra = 0
    for en, zh in list(pack.items()):
        if '\\' not in en:
            continue
        un = js_unescape(en)
        if un != en and un not in pack:
            pack[un] = zh
            extra += 1

    # --force 重新生成时，人工补进去的键（新增界面文案）不能丢
    kept = 0
    for k, v in existing.items():
        if k not in pack:
            pack[k] = v
            kept += 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(pack, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')

    size = os.path.getsize(OUT)
    print(f'[lang] 写入 {OUT}')
    print(f'[lang] 条数={len(pack)}（反转义变体 {extra}，保留人工补充 {kept}），跳过 {dropped} 条空/同文，大小={size}B')
    return 0


if __name__ == '__main__':
    sys.exit(main())
