#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全量英文残留扫描器（Beat 汉化 v2）
用真词法扫描（跳过注释、识别模板字面量/正则/字符串），从英文原件里抽出所有
字符串字面量与其源码偏移，再看它是否仍原样存在于 zh/ 产物里 —— 仍存在且像 UI 文案的
就是漏译（或本来就该保留，交人工裁决）。

用法:
  python3 scan_residual_en.py <en_web_dir> <zh_dir> <out_json>
"""
import json, os, re, sys

CJK = re.compile(r'[\u3400-\u9fff\uff00-\uffef\u3000-\u303f]')
ALPHA = re.compile(r'[A-Za-z]')

# ---- UI 短词（按钮/标签），按界面语气统一 ----
UI_WORDS = {
    'Skip': '跳过', 'Next': '下一步', 'Back': '返回', 'Done': '完成', 'Finish': '完成',
    'Cancel': '取消', 'Save': '保存', 'Close': '关闭', 'Add': '添加', 'Remove': '移除',
    'Edit': '编辑', 'Delete': '删除', 'Shot': '镜头', 'Duration': '时长', 'Focus': '重点',
    'Shots': '镜头', 'Scenes': '场景', 'Refs': '参考', 'Notes': '备注', 'Note': '备注',
    'OK': '确定', 'Yes': '是', 'No': '否', 'Apply': '应用', 'Reset': '重置',
    'Open': '打开', 'Copy': '复制', 'Paste': '粘贴', 'Duplicate': '创建副本',
    'Rename': '重命名', 'Search': '搜索', 'Retry': '重试', 'Continue': '继续',
    'Confirm': '确认', 'Discard': '放弃', 'Undo': '撤销', 'Redo': '重做',
}
# 明确保留（品牌 / 单位 / 专有名词 / 标识符样式的键）
KEEP = {
    'Beat', 'beat', 'OK', 'BTS', 'SP', 'VFX', 'TC', 'PDF', 'PNG', 'JPG', 'JPEG', 'GIF',
    'MP4', 'MOV', 'WAV', 'MP3', 'CSV', 'JSON', 'HTML', 'CSS', 'JS', 'URL', 'ID',
    'Email', 'Email…', 'fps', 'px', 'ms', 'Est.', 'Reels', 'Reel', 'AI', 'PDF…',
}
# 文案里不该翻的部分：代码/协议/文件/日志/键名
CODE_HINTS = (
    '://', 'plugin:', 'tauri:', 'http', 'bts:', 'beat:', 'invoke(', '=>', 'function',
    'document.', 'window.', 'localStorage', 'querySelector', 'classList', 'data-',
    'getElementById', 'addEventListener', 'webkit', 'webkitdirectory', 'application/',
    'image/', 'video/', 'audio/', 'text/', '.json', '.png', '.jpg', '.svg', '.css',
    '.js', '.mp4', '.mov', '.gif', '.wav', '.mp3', '.pdf', '.docx', '.xlsx', '.zip',
    'application/json', 'rgba(', 'var(--', 'cubic-bezier', 'translate', 'rotate(',
    'px ', 'px;', 'px"', 'px)', 'flex', 'grid', 'none', 'block', 'inline',
)
CODE_RE = re.compile(r'^(?:[.#][\w-]+|[\w-]+(?:\s*,\s*[.#]?[\w-]+)+)$')


def tokenize_js(src):
    """产出 (offset, quote, raw) —— raw 是源码里两个引号之间的原始切片。"""
    out = []
    i, n = 0, len(src)
    # 模板字面量栈：每层记录花括号深度
    tmpl_stack = []

    def prev_significant(j):
        k = j - 1
        while k >= 0 and src[k] in ' \t\r\n':
            k -= 1
        return src[k] if k >= 0 else ''

    while i < n:
        c = src[i]
        # 注释
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j + 1
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        # 普通字符串
        if c in '\'"':
            q = c
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == q:
                    break
                if src[j] == '\n':  # 未闭合，按行尾终止
                    break
                j += 1
            out.append((i + 1, q, src[i + 1:j]))  # 偏移指向引号内的第一个字符
            i = j + 1
            continue
        # 模板字面量
        if c == '`':
            if tmpl_stack and tmpl_stack[-1][0] == 'chunk':
                tmpl_stack.pop()
            tmpl_stack.append(['chunk', 0, i + 1])
            i += 1
            continue
        if tmpl_stack and tmpl_stack[-1][0] == 'chunk':
            st = tmpl_stack[-1]
            if c == '\\':
                i += 2
                continue
            if c == '`':
                out.append((st[2], '`', src[st[2]:i]))
                tmpl_stack.pop()
                i += 1
                continue
            if c == '$' and i + 1 < n and src[i + 1] == '{':
                out.append((st[2], '`', src[st[2]:i]))
                st[0] = 'expr'
                st[1] = 0
                i += 2
                continue
            i += 1
            continue
        if tmpl_stack and tmpl_stack[-1][0] == 'expr':
            st = tmpl_stack[-1]
            if c == '{':
                st[1] += 1
            elif c == '}':
                if st[1] == 0:
                    st[0] = 'chunk'
                    st[2] = i + 1
                    i += 1
                    continue
                st[1] -= 1
            elif c == '`':
                # 嵌套模板：直接再压一层
                tmpl_stack.append(['chunk', 0, i + 1])
                i += 1
                continue
        # 正则字面量（启发式：前一个有效字符判定）
        if c == '/':
            p = prev_significant(i)
            if p == '' or p in '(,=:[!&|?{};+-*%~^<>' or p == 'n':  # 'n' 兼顾 return
                j = i + 1
                ok = False
                while j < n:
                    if src[j] == '\\':
                        j += 2
                        continue
                    if src[j] == '\n':
                        break
                    if src[j] == '[':
                        while j < n and src[j] != ']':
                            if src[j] == '\\':
                                j += 1
                            j += 1
                    if src[j] == '/':
                        ok = True
                        break
                    j += 1
                if ok:
                    i = j + 1
                    while i < n and src[i] in 'gimsuyv':
                        i += 1
                    continue
        i += 1
    return out


def looks_ui(raw):
    """粗筛：像给人看的文案（返回分数，0 = 不是）。"""
    s = raw.strip()
    if len(s) < 2 or len(s) > 400:
        return 0
    if not ALPHA.search(s):
        return 0
    if CJK.search(s):
        return 0
    if s in KEEP:
        return 0
    low = s.lower()
    for h in ('http://', 'https://', 'tauri://', 'plugin:', 'assets/', '/vendor/'):
        if h in low:
            return 0
    if CODE_RE.match(s):
        return 0
    if s.startswith(('.', '#', '/', '{', '}', '(', ')', '[')):
        return 0
    # CSS / 样式片段
    if re.search(r'(?:\d(?:px|em|rem|%|vh|vw)\b)', s) and not re.search(r'[.!?]', s):
        return 0
    if re.search(r'[{}]', s) or s.count(';') > 1:
        return 0
    if re.match(r'^[a-z][a-z0-9-]*(?:\s*[a-z-]+)?$', s):  # 全小写单词/短语 = 多半是键或值
        return 0
    score = 0
    if ' ' in s:
        score += 2
    if re.search(r'[.!?:…]$', s):
        score += 2
    if s[0].isupper():
        score += 1
    if re.search(r'\s(?:the|a|an|your|you|to|of|and|in|is|are|this|that|it|on|for|with|from)\s', s, re.I):
        score += 3
    if s in UI_WORDS:
        score += 6
    if re.match(r'^[A-Z][a-z]+(?: [A-Za-z]+){0,4}$', s):
        score += 2
    return score


def scan_js(en_dir, zh_dir, fname):
    en = open(os.path.join(en_dir, fname), encoding='utf-8').read()
    zh = open(os.path.join(zh_dir, fname), encoding='utf-8').read()
    rows = []
    for off, q, raw in tokenize_js(en):
        score = looks_ui(raw)
        if not score:
            continue
        if raw in zh:  # 译文里还留着原文 → 可能漏译
            rows.append({
                'file': fname, 'offset': off, 'quote': q, 'raw': raw,
                'score': score, 'occ_in_en': en.count(raw), 'occ_in_zh': zh.count(raw),
            })
    return rows


def scan_html(en_dir, zh_dir, fname):
    en = open(os.path.join(en_dir, fname), encoding='utf-8').read()
    zh = open(os.path.join(zh_dir, fname), encoding='utf-8').read()
    rows = []
    # 属性
    for m in re.finditer(r'\b(placeholder|title|aria-label|alt|value|label)="([^"]*)"', en):
        raw = m.group(2)
        if looks_ui(raw):
            if raw in zh:
                rows.append({'file': fname, 'offset': m.start(2), 'quote': 'attr:' + m.group(1),
                             'raw': raw, 'score': looks_ui(raw) + 1,
                             'occ_in_en': en.count(raw), 'occ_in_zh': zh.count(raw)})
    # 去掉标签后的文本节点（用打码保持偏移不变）
    masked = re.sub(r'<[^>]*>', lambda mm: ' ' * len(mm.group(0)), en)
    for m in re.finditer(r'>?([^<>]*[A-Za-z][^<>]*)', masked):
        pass
    for m in re.finditer(r'[A-Za-z][^<>\n]*', masked):
        raw = m.group(0).strip()
        if not raw:
            continue
        lead = len(m.group(0)) - len(m.group(0).lstrip())
        off = m.start() + lead
        if looks_ui(raw) and raw in zh:
            rows.append({'file': fname, 'offset': off, 'quote': 'char',
                         'raw': raw, 'score': looks_ui(raw),
                         'occ_in_en': en.count(raw), 'occ_in_zh': zh.count(raw)})
    return rows


def dedupe(rows):
    seen, out = set(), []
    for r in rows:
        k = (r['file'], r['raw'], r['offset'])
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


if __name__ == '__main__':
    en_dir, zh_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = []
    for f in ('app.js', 'templates.js'):
        rows += scan_js(en_dir, zh_dir, f)
    rows += scan_html(en_dir, zh_dir, 'index.html')
    rows = dedupe(rows)
    rows.sort(key=lambda r: (-r['score'], r['file'], r['offset']))
    json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('candidates:', len(rows))
    from collections import Counter
    print(Counter((r['file'], r['score']) for r in rows).most_common(20))
