#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""docs/使用手册.md → 使用手册.docx（中文排版，A4，带页眉页码）

用法:
  /Users/zalo/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3 \
    docs/md2docx.py docs/使用手册.md docs/Beat-使用手册.docx

只用 python-docx（bundled），不联网、不装包。
"""
import os
import re
import sys

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

CN_FONT = 'PingFang SC'
MONO_FONT = 'Menlo'
INK = RGBColor(0x1A, 0x1A, 0x1A)
MUTED = RGBColor(0x6B, 0x6B, 0x6B)
ACCENT = RGBColor(0x0B, 0x5C, 0xD6)


def set_cn(run, font=CN_FONT):
    run.font.name = font
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.append(rfonts)
    rfonts.set(qn('w:eastAsia'), font)
    rfonts.set(qn('w:ascii'), font)
    rfonts.set(qn('w:hAnsi'), font)


def shade(cell, hexcolor):
    tcpr = cell._tc.get_or_add_tcPr()
    sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear')
    sh.set(qn('w:fill'), hexcolor)
    tcpr.append(sh)


def add_page_number(paragraph):
    run = paragraph.add_run()
    for instr in ('begin', 'PAGE', 'end'):
        el = OxmlElement('w:fldChar') if instr != 'PAGE' else OxmlElement('w:instrText')
        if instr == 'PAGE':
            el.set(qn('xml:space'), 'preserve')
            el.text = ' PAGE '
        else:
            el.set(qn('w:fldCharType'), instr)
        run._r.append(el)
    set_cn(run, CN_FONT)
    run.font.size = Pt(8.5)
    run.font.color.rgb = MUTED


INLINE = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)')


def add_inline(paragraph, text, size=10.5, color=INK, bold=False):
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            r = paragraph.add_run(part[2:-2])
            r.bold = True
        elif part.startswith('`') and part.endswith('`'):
            r = paragraph.add_run(part[1:-1])
            set_cn(r, MONO_FONT)
            r.font.size = Pt(size - 1)
            r.font.color.rgb = RGBColor(0x9C, 0x27, 0x3A)
            continue
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            r = paragraph.add_run(part[1:-1])
            r.italic = True
        else:
            r = paragraph.add_run(part)
            r.bold = bold
        set_cn(r)
        r.font.size = Pt(size)
        r.font.color.rgb = color


def body_para(doc, text, size=10.5, space_after=6, first_indent=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(0)
    pf.line_spacing = 1.45
    if first_indent:
        pf.first_line_indent = Cm(first_indent)
    add_inline(p, text, size=size)
    return p


def bullet(doc, text, ordered=False, level=0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.75 + 0.6 * level)
    pf.first_line_indent = Cm(-0.45)
    pf.space_after = Pt(3)
    pf.line_spacing = 1.4
    mark = ('· ' if not ordered else '')
    if not ordered:
        r = p.add_run(mark)
        set_cn(r)
        r.font.size = Pt(10.5)
        r.font.color.rgb = ACCENT
    add_inline(p, text)
    return p


def code_block(doc, lines):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(0.5)
    pf.space_before = Pt(3)
    pf.space_after = Pt(8)
    pf.line_spacing = 1.15
    pPr = p._p.get_or_add_pPr()
    sh = OxmlElement('w:shd')
    sh.set(qn('w:val'), 'clear')
    sh.set(qn('w:fill'), 'F4F5F7')
    pPr.append(sh)
    for i, line in enumerate(lines):
        r = p.add_run(line + ('\n' if i < len(lines) - 1 else ''))
        set_cn(r, MONO_FONT)
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(0x2C, 0x2C, 0x2C)


def table(doc, rows):
    header, body = rows[0], rows[1:]
    t = doc.add_table(rows=1 + len(body), cols=len(header))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = True
    for j, cell_text in enumerate(header):
        cell = t.rows[0].cells[j]
        cell.text = ''
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.space_before = Pt(2)
        add_inline(p, cell_text, size=9.5, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        shade(cell, '1F2A37')
    for i, row in enumerate(body):
        for j in range(len(header)):
            cell_text = row[j] if j < len(row) else ''
            cell = t.rows[i + 1].cells[j]
            cell.text = ''
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.line_spacing = 1.25
            add_inline(p, cell_text, size=9.5)
            if i % 2 == 1:
                shade(cell, 'F7F8FA')
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def h(doc, text, level):
    sizes = {1: 19, 2: 14.5, 3: 12}
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(14 if level > 1 else 6)
    pf.space_after = Pt(6 if level > 1 else 10)
    pf.keep_with_next = True
    if level == 1:
        pf.space_before = Pt(6)
    r = p.add_run(text)
    set_cn(r)
    r.bold = True
    r.font.size = Pt(sizes.get(level, 11))
    r.font.color.rgb = ACCENT if level <= 2 else INK
    if level == 1:
        # 底部细线
        pPr = p._p.get_or_add_pPr()
        bdr = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '8')
        bottom.set(qn('w:space'), '4')
        bottom.set(qn('w:color'), '0B5CD6')
        bdr.append(bottom)
        pPr.append(bdr)
    return p


def build(md_path, out_path):
    with open(md_path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    doc = Document()
    sec = doc.sections[0]
    sec.page_height = Cm(29.7)
    sec.page_width = Cm(21.0)
    sec.top_margin = Cm(2.0)
    sec.bottom_margin = Cm(1.9)
    sec.left_margin = Cm(2.2)
    sec.right_margin = Cm(2.2)

    normal = doc.styles['Normal']
    normal.font.name = CN_FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), CN_FONT)

    # 页脚页码
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = footer.add_run('Beat 中文版 · 使用手册   —   ')
    set_cn(fr)
    fr.font.size = Pt(8.5)
    fr.font.color.rgb = MUTED
    add_page_number(footer)

    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith('```'):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            code_block(doc, buf)
            continue

        if stripped.startswith('#'):
            level = len(stripped) - len(stripped.lstrip('#'))
            h(doc, stripped.lstrip('#').strip(), level)
            i += 1
            continue

        if stripped.startswith('|') and i + 1 < n and set(lines[i + 1].strip()) <= set('|-: '):
            rows = []
            header = [c.strip() for c in stripped.strip('|').split('|')]
            rows.append(header)
            i += 2
            while i < n and lines[i].strip().startswith('|'):
                rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            table(doc, rows)
            continue

        if stripped.startswith('> '):
            p = doc.add_paragraph()
            pf = p.paragraph_format
            pf.left_indent = Cm(0.5)
            pf.space_after = Pt(8)
            pPr = p._p.get_or_add_pPr()
            bdr = OxmlElement('w:pBdr')
            left = OxmlElement('w:left')
            left.set(qn('w:val'), 'single')
            left.set(qn('w:sz'), '18')
            left.set(qn('w:space'), '8')
            left.set(qn('w:color'), '0B5CD6')
            bdr.append(left)
            pPr.append(bdr)
            add_inline(p, stripped[2:], size=10.5, color=MUTED)
            i += 1
            continue

        m = re.match(r'^(\s*)[-*]\s+(.*)$', line)
        if m:
            level = len(m.group(1)) // 2
            bullet(doc, m.group(2), level=level)
            i += 1
            continue

        m = re.match(r'^\s*\d+\.\s+(.*)$', line)
        if m:
            bullet(doc, m.group(1), ordered=True)
            i += 1
            continue

        if stripped.startswith('---'):
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(4)
            pPr = p._p.get_or_add_pPr()
            bdr = OxmlElement('w:pBdr')
            bottom = OxmlElement('w:bottom')
            bottom.set(qn('w:val'), 'single')
            bottom.set(qn('w:sz'), '4')
            bottom.set(qn('w:space'), '1')
            bottom.set(qn('w:color'), 'D8DCE3')
            bdr.append(bottom)
            pPr.append(bdr)
            i += 1
            continue

        body_para(doc, stripped)
        i += 1

    doc.save(out_path)
    return out_path


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'docs/使用手册.md'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'docs/Beat-使用手册.docx'
    os.makedirs(os.path.dirname(os.path.abspath(dst)) or '.', exist_ok=True)
    out = build(src, dst)
    print('OK ->', out, os.path.getsize(out), 'bytes')
