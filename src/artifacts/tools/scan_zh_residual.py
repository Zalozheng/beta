#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在**已汉化产物**上扫英文残留（验收用）。

和 select_ui_strings 的区别：这里扫的是 zh/ 输出，命中即「还没翻」。
输出所有含英文单词的可见文案候选，按「是否可能是 UI 文案」打分，
再由人工分成「必须翻 / 有意保留」两类。

用法: python3 scan_zh_residual.py <zh_dir> [out.json]
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_residual_en import tokenize_js, CJK, ALPHA

UI_WORDS = {
    'Skip', 'Next', 'Back', 'Done', 'Finish', 'Cancel', 'Save', 'Close', 'Add', 'Remove',
    'Edit', 'Delete', 'Shot', 'Duration', 'Focus', 'Shots', 'Scenes', 'Refs', 'Notes',
    'Note', 'OK', 'Yes', 'No', 'Apply', 'Reset', 'Open', 'Copy', 'Paste', 'Duplicate',
    'Rename', 'Search', 'Retry', 'Continue', 'Confirm', 'Discard', 'Undo', 'Redo',
}
SINK_KEY = re.compile(r"(?:label|title|body|msg|message|hint|desc|text|name|caption|sub|note|placeholder|ariaLabel)\s*:\s*$")
SINK_ASSIGN = re.compile(r"(?:innerHTML|outerHTML|textContent|innerText|placeholder|value|\.title|aria-label|setAttribute\()\s*(?:\+?=)\s*$")
SINK_CALL = re.compile(r"(?:alert|confirm|prompt|showToast|toast|notify)\s*\(\s*$")
CONCAT = re.compile(r"[+?:(,|]\s*$")
HTML = re.compile(r'<[a-zA-Z][^<>]*>')


def visible(s):
    t = re.sub(r'<[^>]*>', ' ', s)
    t = re.sub(r'="[^"]*"', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def score_of(raw):
    s = raw
    vis = visible(s)
    if not ALPHA.search(vis) or CJK.search(s):
        return 0
    words = re.findall(r'[A-Za-z]{2,}', vis)
    if not words:
        return 0
    sc = 0
    if len(words) >= 2:
        sc += 2
    if re.search(r'\s(?:the|a|an|your|you|to|of|and|in|is|are|this|that|it|on|for|with|from)\s', vis, re.I):
        sc += 3
    if any(w in UI_WORDS for w in words):
        sc += 5
    if re.search(r'[.!?:…]$', vis):
        sc += 2
    return sc


def scan_js(path, rows):
    src = open(path, encoding='utf-8').read()
    for off, q, raw in tokenize_js(src):
        sc = score_of(raw)
        if not sc:
            continue
        ctx = src[max(0, off - 1 - 120):off - 1].rstrip()
        kind = 'ctx'
        if SINK_ASSIGN.search(ctx):
            kind = 'assign'
        elif SINK_KEY.search(ctx):
            kind = 'key'
        elif SINK_CALL.search(ctx):
            kind = 'call'
        elif CONCAT.search(ctx) or HTML.search(raw):
            kind = 'concat'
        else:
            continue
        rows.append({'file': os.path.basename(path), 'offset': off, 'raw': raw,
                     'vis': visible(raw), 'score': sc, 'kind': kind})


def scan_html(path, rows):
    src = open(path, encoding='utf-8').read()
    for m in re.finditer(r'\b(placeholder|title|aria-label|alt|value)="([^"]*)"', src):
        sc = score_of(m.group(2))
        if sc:
            rows.append({'file': os.path.basename(path), 'offset': m.start(2),
                         'raw': m.group(2), 'vis': m.group(2), 'score': sc + 1,
                         'kind': 'attr:' + m.group(1)})
    masked = re.sub(r'<[^>]*>', lambda mm: ' ' * len(mm.group(0)), src)
    for m in re.finditer(r'[A-Za-z][^<>\n]*', masked):
        raw = m.group(0)
        lead = len(raw) - len(raw.lstrip())
        raw = raw.strip()
        sc = score_of(raw)
        if sc:
            rows.append({'file': os.path.basename(path), 'offset': m.start() + lead,
                         'raw': raw, 'vis': raw, 'score': sc, 'kind': 'text'})


if __name__ == '__main__':
    zh = sys.argv[1]
    rows = []
    for f in ('app.js', 'templates.js'):
        scan_js(os.path.join(zh, f), rows)
    scan_html(os.path.join(zh, 'index.html'), rows)
    seen, ded = set(), []
    for r in rows:
        k = (r['file'], r['raw'])
        if k in seen:
            continue
        seen.add(k)
        ded.append(r)
    ded.sort(key=lambda r: (-r['score'], r['file'], r['offset']))
    out = sys.argv[2] if len(sys.argv) > 2 else None
    if out:
        json.dump(ded, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('zh residual candidates:', len(ded))
    from collections import Counter
    print(Counter(r['file'] for r in ded), Counter(r['score'] for r in ded).most_common(6))
