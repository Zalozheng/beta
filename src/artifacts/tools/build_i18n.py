#!/usr/bin/env python3
# build_i18n.py — 英文原版前端 → 运行时双语构建目录（src/work/zh/）
#
#   python3 src/artifacts/tools/build_i18n.py [--check-slots APP] [--install-lang]
#
# 流程（不再把英文源码静态换成中文）：
#   1. 读英文源码：src/artifacts/embedded-web/{index.html,app.js,templates.js}
#   2. 作者信息抹除：注释/界面里残留的作者名一律换掉，产物 0 命中
#   3. 生成核心词典：从 src/lang/zh-CN.json 里挑 400~600 条高频 UI，构建时内嵌
#   4. 注入：window.__BEAT_I18N_CORE__ + src/i18n/i18n.js 追加到 app.js 末尾
#   5. 写 src/work/zh/，并做 brotli 尺寸预检（超槽位直接失败，不改槽）
#   6. --install-lang 时把完整语言包复制到库目录 .beat-lang/zh-CN.json
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC_WEB = os.path.join(ROOT, 'src', 'artifacts', 'embedded-web')
SRC_I18N = os.path.join(ROOT, 'src', 'i18n', 'i18n.js')
SRC_PACK = os.path.join(ROOT, 'src', 'lang', 'zh-CN.json')
WORK = os.path.join(ROOT, 'src', 'work')
OUT = os.path.join(WORK, 'zh')
LIB_DIR = os.path.expanduser('~/Documents/Beat Projects')
LANG_DIR = os.path.join(LIB_DIR, '.beat-lang')

FILES = ['index.html', 'app.js', 'templates.js']
CORE_MIN, CORE_MAX = 400, 600
CORE_TARGET = 560

# 作者信息抹除：注释里的 "Joao's call"、界面里的 "Made by Lutz" 都不该跟着分发出去。
SCRUB = [
    (re.compile(r'Joao\s+Lutz', re.I), 'the beat team'),
    (re.compile(r"Joao[’']s"), "the team's"),
    (re.compile(r'Joao'), 'the team'),
    (re.compile(r'Lutz'), 'the team'),
    (re.compile(r'joaolutz', re.I), 'beatteam'),
]
AUTHOR_RE = re.compile(r'joao|lutz', re.I)


def scrub_author(text: str):
    hits = len(AUTHOR_RE.findall(text))
    if hits:
        for rx, rep in SCRUB:
            text = rx.sub(rep, text)
    return text, hits


def load_pack():
    if not os.path.exists(SRC_PACK):
        sys.exit(f'[i18n] 缺语言包 {SRC_PACK}，先跑 make_lang_pack.py')
    with open(SRC_PACK, encoding='utf-8') as fh:
        pack = json.load(fh)
    return {k: v for k, v in pack.items() if isinstance(k, str) and isinstance(v, str) and k and v}


def html_text_nodes(markup: str):
    """粗略取 index.html 里的可见文本节点（去标签、反转义）。"""
    out = set()
    for m in re.finditer(r'>([^<>]{1,200})<', markup):
        t = html.unescape(m.group(1)).strip()
        if t:
            out.add(t)
    for m in re.finditer(r'(?:placeholder|title|aria-label|alt)="([^"]{1,200})"', markup):
        out.add(html.unescape(m.group(1)).strip())
    return out


def pick_core(pack, corpus_files):
    """核心词典：静态界面文本优先，其余按在源码里出现的频次补齐。"""
    corpus = '\n'.join(corpus_files.values())
    static = html_text_nodes(corpus_files['index.html'])

    usable = {}
    for k, v in pack.items():
        if len(k) > 48 or '\n' in k or '${' in k or k.startswith('http'):
            continue
        usable[k] = v

    scored = []
    for k, v in usable.items():
        # 出现次数：源码里作为字面量/文本出现的频次，越高越像常用 UI
        score = corpus.count(k)
        bonus = 1000 if k in static else 0
        scored.append((bonus + score, -len(k), k, v))
    scored.sort(reverse=True)

    core = {}
    for _, _, k, v in scored:
        if len(core) >= CORE_TARGET:
            break
        core[k] = v
    return core


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check-slots', metavar='APP', help='构建前对着 app 的 fat 二进制做槽位尺寸预检')
    ap.add_argument('--install-lang', action='store_true', help='把完整语言包装到库目录 .beat-lang/')
    ap.add_argument('--probe', action='store_true', help='额外注入 i18n.probe.js（诊断用，正常构建别开）')
    args = ap.parse_args()

    pack = load_pack()
    with open(SRC_I18N, encoding='utf-8') as fh:
        i18n_src = fh.read()

    src = {}
    for name in FILES:
        with open(os.path.join(SRC_WEB, name), encoding='utf-8') as fh:
            src[name] = fh.read()

    # 1) 作者抹除
    scrub_hits = 0
    for name in FILES:
        src[name], hits = scrub_author(src[name])
        scrub_hits += hits

    # 2) 核心词典
    core = pick_core(pack, src)
    if not (CORE_MIN <= len(core) <= CORE_MAX):
        sys.exit(f'[i18n] 核心词典条数 {len(core)} 不在 {CORE_MIN}~{CORE_MAX} 区间')

    # 3) 注入
    core_js = 'window.__BEAT_I18N_CORE__ = ' + json.dumps(core, ensure_ascii=False, separators=(',', ':')) + ';\n'
    banner = ('\n/* ===================== beat-i18n (build-injected) =====================\n'
              ' * 运行期界面翻译：英文源码 + 语言包，见 src/i18n/i18n.js\n'
              ' * 核心词典 ' + str(len(core)) + ' 条内嵌在此，完整包在库目录 .beat-lang/zh-CN.json\n'
              ' * ==================================================================== */\n')
    if 'window.__BEAT_I18N_CORE__' in src['app.js']:
        sys.exit('[i18n] app.js 里已经有注入过的核心词典，源文件被污染了')
    probe = ''
    if args.probe:
        with open(os.path.join(ROOT, 'src', 'i18n', 'i18n.probe.js'), encoding='utf-8') as fh:
            probe = '\n/* ---- probe (diagnostic build) ---- */\n' + fh.read()
    src['app.js'] = src['app.js'] + banner + core_js + i18n_src + probe + '\n'

    os.makedirs(OUT, exist_ok=True)
    for name in FILES:
        with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fh:
            fh.write(src[name])

    # 4) 残余作者信息复核
    left = 0
    for name in FILES:
        left += len(AUTHOR_RE.findall(src[name]))
    if left:
        sys.exit(f'[i18n] 抹除后仍有 {left} 处作者名，检查 SCRUB 规则')

    # 5) 语言包落地
    if args.install_lang:
        os.makedirs(LANG_DIR, exist_ok=True)
        dst = os.path.join(LANG_DIR, 'zh-CN.json')
        shutil.copyfile(SRC_PACK, dst)
        print(f'[i18n] 语言包 → {dst} ({len(pack)} 条)')
        # read_doc_text 有 50000 字符上限，整包全尺寸推不进去：切分片给运行期读
        splitter = os.path.join(ROOT, 'src', 'artifacts', 'tools', 'split_lang_pack.py')
        subprocess.run([sys.executable, splitter, '--pack', SRC_PACK, '--library', LIB_DIR], check=True)

    report = {
        'core_entries': len(core),
        'pack_entries': len(pack),
        'scrubbed': scrub_hits,
        'out': OUT,
        'files': {n: os.path.getsize(os.path.join(OUT, n)) for n in FILES},
    }
    with open(os.path.join(WORK, 'i18n_build.json'), 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
    print('[i18n] 构建目录:', OUT)
    print('[i18n] 核心词典 %d 条 / 完整语言包 %d 条 / 抹除作者名 %d 处' % (len(core), len(pack), scrub_hits))
    for n in FILES:
        print('  %-14s %8d B' % (n, report['files'][n]))

    # 6) 槽位尺寸预检
    if args.check_slots:
        checker = os.path.join(ROOT, 'src', 'artifacts', 'tools', 'check_slots.js')
        fat = os.path.join(WORK, 'beat.fat')
        if not os.path.exists(fat):
            sys.exit(f'[i18n] 缺 {fat}，先由 rebuild.sh 取出 fat 二进制')
        r = subprocess.run(['node', checker, fat, OUT], capture_output=True, text=True)
        sys.stdout.write(r.stdout)
        sys.stderr.write(r.stderr)
        if r.returncode != 0:
            sys.exit('[i18n] 槽位预检失败：资源放不进原槽位（削减核心词典或改文案，别改槽）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
