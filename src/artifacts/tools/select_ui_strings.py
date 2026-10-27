#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""选出「候选 UI 文案」字面量（精确到 offset），供人工裁决与生成 strings_v2.json。

输出 selected.json: [{file, offset, quote, raw, norm, ctx, fn, kind}]
  kind: html-frag | ui-word | sink | attr | text
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scan_residual_en import tokenize_js, CJK, ALPHA

UI_WORDS = {
    'Skip', 'Next', 'Back', 'Done', 'Finish', 'Cancel', 'Save', 'Close', 'Add', 'Remove',
    'Edit', 'Delete', 'Shot', 'Duration', 'Focus', 'Shots', 'Scenes', 'Refs', 'Notes',
    'Note', 'OK', 'Yes', 'No', 'Apply', 'Reset', 'Open', 'Copy', 'Paste', 'Duplicate',
    'Rename', 'Search', 'Retry', 'Continue', 'Confirm', 'Discard', 'Undo', 'Redo',
    'Previous', 'Preview', 'Export', 'Import', 'Load', 'Create', 'Update', 'Send',
    'Play', 'Stop', 'Show', 'Hide', 'More', 'Less', 'All', 'None', 'Select', 'Move',
    'Camera', 'Character', 'Location', 'Prop', 'Title', 'Action', 'Take', 'Zoom',
}
SINK_KEY = re.compile(r"(?:label|title|body|msg|message|hint|desc|text|name|caption|sub|note|placeholder|ariaLabel|confirmText|okText|empty|emptyText)\s*:\s*$")
SINK_ASSIGN = re.compile(r"(?:innerHTML|outerHTML|textContent|innerText|placeholder|value|\.title|aria-label|setAttribute\()\s*(?:\+?=)\s*$")
SINK_CALL = re.compile(r"(?:alert|confirm|prompt|showToast|toast|notify|showHint|say|status|setStatus)\s*\(\s*$")
CONCAT = re.compile(r"[+?:(,]\s*$")
HTML_TAG = re.compile(r"</?[a-zA-Z][a-zA-Z0-9]*[\s>/]")
ESC = re.compile(r"\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)")


def unescape(s):
    def rep(m):
        g = m.group(1)
        if g[0] == 'u' and len(g) == 5:
            return chr(int(g[1:], 16))
        if g[0] == 'x' and len(g) == 3:
            return chr(int(g[1:], 16))
        return {'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', '0': '\0'}.get(g, g)
    return ESC.sub(rep, s)


def norm(s):
    return re.sub(r'\s+', ' ', unescape(s)).strip()


def payload(raw):
    s = norm(raw)
    if len(s) < 2 or len(s) > 500:
        return 0
    if not ALPHA.search(s) or CJK.search(s):
        return 0
    if s.startswith(('http://', 'https://', 'tauri://', 'plugin:', 'data:')):
        return 0
    letters = sum(c.isalpha() or c == ' ' for c in s) / max(1, len(s))
    if letters < 0.5:
        return 0
    score = 0
    if ' ' in s:
        score += 2
    if re.search(r'[.!?:…]$', s):
        score += 2
    if s[0].isupper():
        score += 1
    if re.search(r'\s(?:the|a|an|your|you|to|of|and|in|is|are|this|that|it|on|for|with|from|not)\s', s, re.I):
        score += 3
    if s in UI_WORDS:
        score += 6
    if re.match(r'^[A-Z][a-z]+(?: [A-Za-z]{2,}){0,4}$', s):
        score += 2
    return score


FN = re.compile(r'function\s+([\w$]+)\s*\(')


def fn_of(src, off):
    seg = src[max(0, off - 30000):off]
    ms = list(FN.finditer(seg))
    return ms[-1].group(1) if ms else '?'


def scan_js(en_path, zh_text):
    src = open(en_path, encoding='utf-8').read()
    out = []
    for off, q, raw in tokenize_js(src):
        s = norm(raw)
        if not s or s in zh_text and not payload(raw):
            # fast skip for pure code strings
            pass
        sc = payload(raw)
        is_html = bool(HTML_TAG.search(s)) and '=' not in s.split('>')[0]
        is_uiword = s in UI_WORDS
        if not (sc or is_html or is_uiword):
            continue
        if s in zh_text is False:
            pass
        ctx = src[max(0, off - 1 - 140):off - 1]  # 排除紧邻的引号，让 sink 判定落在代码上
        ctxr = ctx.rstrip()
        kind = None
        if is_html and sc:
            kind = 'html-frag'
        if SINK_KEY.search(ctxr):
            kind = 'sink-key'
        if SINK_ASSIGN.search(ctxr):
            kind = 'sink-assign'
        if SINK_CALL.search(ctxr):
            kind = 'sink-call'
        if is_uiword and (CONCAT.search(ctxr) or SINK_ASSIGN.search(ctxr)):
            kind = kind or 'ui-word'
        if not kind and CONCAT.search(ctxr):
            # 拼接/调用位置上的多词文案（toast、空状态、提示）也算可见文案
            vis = re.sub(r'<[^>]*>', ' ', s)
            vis = re.sub(r'="[^"]*"', ' ', vis)
            _w = re.findall(r'[A-Za-z]{2,}', vis)
            if len(_w) >= 2 or any(w in UI_WORDS for w in _w):
                kind = 'concat'
        if not kind:
            continue
        if raw not in zh_text:
            continue  # 已经翻掉了
        out.append({'file': os.path.basename(en_path), 'offset': off, 'quote': q,
                    'raw': raw, 'norm': s, 'kind': kind, 'score': sc,
                    'fn': fn_of(src, off), 'ctx': ctxr[-40:]})
    return out


def scan_html(en_path, zh_text):
    src = open(en_path, encoding='utf-8').read()
    out = []
    for m in re.finditer(r'\b(placeholder|title|aria-label|alt|value)="([^"]*)"', src):
        raw = m.group(2)
        s = norm(raw)
        if not payload(raw):
            continue
        if raw not in zh_text:
            continue
        out.append({'file': 'index.html', 'offset': m.start(2), 'quote': 'attr:' + m.group(1),
                    'raw': raw, 'norm': s, 'kind': 'attr', 'score': payload(raw), 'fn': '', 'ctx': ''})
    masked = re.sub(r'<[^>]*>', lambda mm: ' ' * len(mm.group(0)), src)
    for m in re.finditer(r'[A-Za-z][^<>\n]*', masked):
        raw = m.group(0)
        lead = len(raw) - len(raw.lstrip())
        raw = raw.strip()
        if not payload(raw):
            continue
        if raw not in zh_text:
            continue
        out.append({'file': 'index.html', 'offset': m.start() + lead, 'quote': 'text',
                    'raw': raw, 'norm': norm(raw), 'kind': 'text', 'score': payload(raw), 'fn': '', 'ctx': ''})
    return out


if __name__ == '__main__':
    en_dir, zh_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = []
    for f in ('app.js', 'templates.js'):
        zh = open(os.path.join(zh_dir, f), encoding='utf-8').read()
        rows += scan_js(os.path.join(en_dir, f), zh)
    zh_html = open(os.path.join(zh_dir, 'index.html'), encoding='utf-8').read()
    rows += scan_html(os.path.join(en_dir, 'index.html'), zh_html)
    # 去重（同 file+offset+raw）
    seen, ded = set(), []
    for r in rows:
        k = (r['file'], r['offset'], r['raw'])
        if k in seen:
            continue
        seen.add(k)
        ded.append(r)
    json.dump(ded, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    from collections import Counter
    print('selected literals:', len(ded))
    print('by file:', Counter(r['file'] for r in ded))
    print('by kind:', Counter(r['kind'] for r in ded))
    print('unique norm:', len({r['norm'] for r in ded}))
