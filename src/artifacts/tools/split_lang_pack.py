#!/usr/bin/env python3
# split_lang_pack.py — 把单个语言包切成运行期能读的「分片」
#
# 为什么需要：Beat 的 Tauri capabilities 把整个 fs 插件都 ACL 掉了
#   （plugin:fs|read_text_file → "not allowed by ACL"，read_file/exists 同样被拒），
#   唯一能读到库目录文件的命令是 read_doc_text，而它硬上限 50000 字符。
#   于是：整包留在 .beat-lang/zh-CN.json（人看、人改的那份），
#        运行期读 .beat-lang/parts/zh-CN.N.json 分片再合并。
#
#   python3 src/artifacts/tools/split_lang_pack.py [--library DIR] [--pack FILE] [--max-chars N]
#
# 改完语言包后重跑本脚本（或重跑 rebuild.sh，它会自动调用）。
import argparse
import hashlib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_PACK = os.path.join(ROOT, 'src', 'lang', 'zh-CN.json')
APP_CONFIG = os.path.expanduser('~/Library/Application Support/io.beat.canvas/config.json')
DEFAULT_LIB = os.path.expanduser('~/Documents/Beat Projects')
MAX_CHARS = 45000          # 低于 read_doc_text 的 50000 字符硬上限，留余量
PREFIX_LEN = 50000


def fnv1a32(s: str) -> str:
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return '0x%08x' % h


def library_dir(cli_value=None) -> str:
    if cli_value:
        return os.path.expanduser(cli_value)
    try:
        with open(APP_CONFIG, encoding='utf-8') as fh:
            lib = json.load(fh).get('library_path')
        if lib:
            return lib
    except Exception:
        pass
    return DEFAULT_LIB


def _real_main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--library', default=None)
    ap.add_argument('--pack', default=DEFAULT_PACK)
    ap.add_argument('--max-chars', type=int, default=MAX_CHARS)
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args(argv)

    with open(args.pack, encoding='utf-8') as fh:
        raw = fh.read()
    pack = json.loads(raw)
    if not isinstance(pack, dict):
        sys.exit('[split] 语言包必须是扁平对象 {英文: 中文}')

    lib = library_dir(args.library)
    lang_dir = os.path.join(lib, '.beat-lang')
    parts_dir = os.path.join(lang_dir, 'parts')
    os.makedirs(parts_dir, exist_ok=True)

    items = list(pack.items())
    chunks, cur, cur_len = [], {}, 0
    for k, v in items:
        piece = json.dumps({k: v}, ensure_ascii=False, separators=(',', ':'))[1:-1]
        add = len(piece) + 1
        if cur and cur_len + add > args.max_chars:
            chunks.append(cur)
            cur, cur_len = {}, 0
        cur[k] = v
        cur_len += add
    if cur:
        chunks.append(cur)

    # 清掉旧分片，避免包变小后残留上次的多余片
    for name in os.listdir(parts_dir):
        if name.startswith('zh-CN.') and name.endswith('.json'):
            os.remove(os.path.join(parts_dir, name))

    files = []
    for i, ch in enumerate(chunks, 1):
        name = f'zh-CN.{i}.json'
        with open(os.path.join(parts_dir, name), 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(ch, ensure_ascii=False, separators=(',', ':')))
        files.append(name)

    manifest = {
        'lang': 'zh-CN',
        'entries': len(items),
        'parts': len(files),
        'part_files': files,
        'max_chars': args.max_chars,
        'full_sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest(),
        'prefix_len': PREFIX_LEN,
        'prefix_fnv': fnv1a32(raw[:PREFIX_LEN]),
        'source': args.pack,
        'generated': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    with open(os.path.join(parts_dir, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
        fh.write('\n')

    if not args.quiet:
        sizes = [os.path.getsize(os.path.join(parts_dir, f)) for f in files]
        print(f'[split] {args.pack} → {parts_dir}')
        print(f'[split] 条目 {len(items)}，分片 {len(files)} 个，单片刻度 {max(sizes)}B / 上限 {args.max_chars} 字符')
        print(f'[split] prefix_fnv={manifest["prefix_fnv"]} full_sha256={manifest["full_sha256"][:16]}…')
    return 0


if __name__ == '__main__':
    sys.exit(_real_main())
