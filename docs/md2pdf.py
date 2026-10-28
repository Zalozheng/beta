#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""docs/使用手册.md → PDF（Pillow 直绘，A4 / 200dpi，系统中文字体 + 符号字体回退）

用法:
  /Users/zalo/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3 \
    docs/md2pdf.py docs/使用手册.md docs/Beat-使用手册.pdf

为什么不用 LibreOffice 转：本机 LibreOffice Kit 渲染输出空白页（缺 CJK 字体）。
Pillow 直接排版可以精确控制中文换行、表格与分页；
⌘ ⇧ ⌫ ▶ ✕ ＋ 等符号在 Hiragino 里缺字形，按字符级回退到 Menlo / Apple Symbols。
"""
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

DPI = 200
W, H = 1654, 2339            # A4 @ 200dpi
M_LEFT = M_RIGHT = 168
M_TOP, M_BOTTOM = 150, 140
CONTENT_W = W - M_LEFT - M_RIGHT

CN = ('/System/Library/Fonts/Hiragino Sans GB.ttc', 0)      # W3 正文
CN_B = ('/System/Library/Fonts/Hiragino Sans GB.ttc', 2)    # W6 标题/粗体
MONO = ('/System/Library/Fonts/Menlo.ttc', 0)               # 等宽 + 符号
SYM = ('/System/Library/Fonts/Apple Symbols.ttf', 0)        # 兜底符号

INK = (26, 26, 26)
MUTED = (107, 107, 107)
ACCENT = (11, 92, 214)
RULE = (216, 220, 227)
CODE_BG = (244, 245, 247)
CODE_FG = (60, 62, 66)
HEAD_BG = (31, 42, 55)
ROW_ALT = (247, 248, 250)
CODE_RED = (156, 39, 58)

MONO_SYMBOLS = set('⌘⇧⌥⌃⌫↵⋯▶✕✓✗−↗＋⤓·→←↑↓')
CJK = re.compile(r'[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]')


def pt(x):
    return int(round(x * DPI / 72.0))


_FONTS = {}


def font(spec, size_pt):
    key = (spec, size_pt)
    if key not in _FONTS:
        path, idx = spec
        _FONTS[key] = ImageFont.truetype(path, pt(size_pt), index=idx)
    return _FONTS[key]


_GLYPH = {}
_NOTDEF = {}


def _render_ch(spec, size_pt, ch):
    f = font(spec, size_pt)
    im = Image.new('L', (72, 72), 0)
    ImageDraw.Draw(im).text((10, 10), ch, font=f, fill=255)
    return im.tobytes()


def has_glyph(spec, size_pt, ch):
    key = (spec, size_pt, ch)
    if key in _GLYPH:
        return _GLYPH[key]
    nk = (spec, size_pt)
    if nk not in _NOTDEF:
        _NOTDEF[nk] = _render_ch(spec, size_pt, '\ue000')
    got = _render_ch(spec, size_pt, ch)
    ok = got != _NOTDEF[nk] and got != bytes(len(got))
    _GLYPH[key] = ok
    return ok


def pick_spec(ch, spec, size_pt):
    if ch.isspace():
        return spec
    if has_glyph(spec, size_pt, ch):
        return spec
    # 等宽里出现汉字 → 回中文；中文里出现 ⌘ ▶ → 回等宽/符号
    chain = (MONO, SYM, CN) if spec in (MONO, SYM) else (MONO, SYM, CN)
    for alt in chain:
        if alt != spec and has_glyph(alt, size_pt, ch):
            return alt
    return spec


# run = (text, spec, size_pt, color)

INLINE = re.compile(r'(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*)')


def _runs(text, size_pt, color, bold=False, mono=False):
    out = []
    for ch in text:
        spec = MONO if mono else (CN_B if bold else CN)
        s = pick_spec(ch, spec, size_pt)
        if out and out[-1][1] == s and out[-1][2] == size_pt and out[-1][3] == color:
            out[-1] = (out[-1][0] + ch, s, size_pt, color)
        else:
            out.append((ch, s, size_pt, color))
    return out


def segments(text, size_pt, color=INK):
    """解析 **粗体** / `代码` / *斜体*，返回 run 列表（已做字形回退）。"""
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4:
            out += segments(part[2:-2], size_pt, color)
            out = [(t, (CN_B if s == CN else s), sz, c) for t, s, sz, c in out]
        elif part.startswith('`') and part.endswith('`') and len(part) > 2:
            out += _runs(part[1:-1], size_pt - 0.8, CODE_RED, mono=True)
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            out += _runs(part[1:-1], size_pt, MUTED)
        else:
            out += _runs(part, size_pt, color)
    return out


def ch_w(run_ch, spec, size_pt):
    return font(spec, size_pt).getlength(run_ch)


def runs_width(runs):
    return sum(ch_w(t, s, z) for t, s, z, _c in runs)


WORD = re.compile(r'[A-Za-z0-9_\-\./:@#%&+=(){}\[\]~$\\]+')


def _units(text):
    """把一段文字切成断行单元：ASCII 连续串整体不断，中文/全角按单字。"""
    out, i = [], 0
    for m in WORD.finditer(text):
        if m.start() > i:
            out.extend((c, False) for c in text[i:m.start()])
        out.append((m.group(0), True))
        i = m.end()
    if i < len(text):
        out.extend((c, False) for c in text[i:])
    return out


def wrap(runs, max_w):
    """按宽度折行；行内元素是 (text, spec, size, color)。"""
    lines, cur, cur_w = [], [], 0.0
    for text, spec, size_pt, color in runs:
        buf = ''
        for unit, is_word in _units(text):
            w = sum(ch_w(c, spec, size_pt) for c in unit)
            if cur_w + w > max_w and (cur or buf):
                if is_word and w <= max_w:
                    if buf:
                        cur.append((buf, spec, size_pt, color))
                        buf = ''
                    lines.append(cur)
                    cur, cur_w = [], 0.0
                elif is_word:
                    # 单词本身超宽 → 逐字硬断
                    for c in unit:
                        cw = ch_w(c, spec, size_pt)
                        if cur_w + cw > max_w and (cur or buf):
                            if buf:
                                cur.append((buf, spec, size_pt, color))
                                buf = ''
                            lines.append(cur)
                            cur, cur_w = [], 0.0
                        buf += c
                        cur_w += cw
                    if buf:
                        cur.append((buf, spec, size_pt, color))
                        buf = ''
                    continue
                else:
                    if buf:
                        cur.append((buf, spec, size_pt, color))
                        buf = ''
                    lines.append(cur)
                    cur, cur_w = [], 0.0
            buf += unit
            cur_w += w
        if buf:
            cur.append((buf, spec, size_pt, color))
    if cur:
        lines.append(cur)
    return lines


def draw_runs(draw, runs, x, y):
    for text, spec, size_pt, color in runs:
        f = font(spec, size_pt)
        draw.text((x, y), text, font=f, fill=color)
        x += f.getlength(text)


def line_h(size_pt, ratio=1.62):
    return int(pt(size_pt) * ratio)


class Doc:
    def __init__(self, path):
        self.path = path
        self.pages = []
        self.new_page()

    def new_page(self):
        img = Image.new('RGB', (W, H), 'white')
        self.pages.append((img, ImageDraw.Draw(img)))
        self.img, self.draw = self.pages[-1]
        self.y = M_TOP

    def need(self, h):
        if self.y + h > H - M_BOTTOM:
            self.new_page()
            return True
        return False

    # ---------- 块 ----------
    def heading(self, text, level):
        size = {1: 25, 2: 16.5, 3: 13}.get(level, 11)
        lh = line_h(size, 1.32)
        self.y += {1: 22, 2: 26, 3: 20}.get(level, 16)
        lns = wrap(segments(text, size, ACCENT if level <= 2 else INK), CONTENT_W)
        self.need(lh * len(lns) + 26)
        for ln in lns:
            bold_ln = [(t, (CN_B if s == CN else s), z, c) for t, s, z, c in ln]
            draw_runs(self.draw, bold_ln, M_LEFT, self.y)
            self.y += lh
        if level == 1:
            self.draw.line([(M_LEFT, self.y + 8), (W - M_RIGHT, self.y + 8)], fill=ACCENT, width=3)
            self.y += 20
        elif level == 2:
            self.draw.line([(M_LEFT, self.y + 7), (M_LEFT + pt(46), self.y + 7)], fill=ACCENT, width=3)
            self.y += 15
        else:
            self.y += 9

    def para(self, text, size=10.5, color=INK, after=8):
        lh = line_h(size)
        for ln in wrap(segments(text, size, color), CONTENT_W):
            self.need(lh)
            draw_runs(self.draw, ln, M_LEFT, self.y)
            self.y += lh
        self.y += after

    def bullet(self, text, level=0, ordered=None):
        size = 10.5
        lh = line_h(size)
        indent = pt(14) + level * pt(13)
        mark_x = M_LEFT + indent
        text_x = mark_x + pt(13)
        for k, ln in enumerate(wrap(segments(text, size), CONTENT_W - indent - pt(13))):
            self.need(lh)
            if k == 0:
                if ordered is not None:
                    f = font(CN_B, size - 1.2)
                    num = str(ordered)
                    self.draw.text((mark_x, self.y + pt(0.6)), num, font=f, fill=ACCENT)
                else:
                    cy = self.y + pt(5.6)
                    self.draw.ellipse([mark_x + pt(1.6), cy, mark_x + pt(1.6) + pt(3.2), cy + pt(3.2)], fill=ACCENT)
            draw_runs(self.draw, ln, text_x, self.y)
            self.y += lh
        self.y += 3

    def quote(self, text):
        size = 10.5
        lh = line_h(size)
        lns = wrap(segments(text, size, MUTED), CONTENT_W - pt(18))
        self.need(lh * len(lns) + 14)
        top = self.y - 2
        for ln in lns:
            draw_runs(self.draw, ln, M_LEFT + pt(18), self.y)
            self.y += lh
        self.draw.line([(M_LEFT + pt(6), top), (M_LEFT + pt(6), self.y - 6)], fill=ACCENT, width=6)
        self.y += 10

    def code(self, lines):
        size = 8.8
        lh = int(pt(size) * 1.45)
        f = font(MONO, size)
        maxw = max([f.getlength(t) for t in lines] + [pt(60)])
        box_w = min(CONTENT_W, int(maxw) + pt(20))
        box_h = lh * len(lines) + pt(14)
        self.need(box_h + 12)
        top = self.y
        self.draw.rounded_rectangle([M_LEFT, top, M_LEFT + box_w, top + box_h], radius=pt(4), fill=CODE_BG)
        yy = top + pt(7)
        for t in lines:
            draw_runs(self.draw, _runs(t, size, CODE_FG), M_LEFT + pt(10), yy)
            yy += lh
        self.y = top + box_h + 10

    def rule(self):
        self.need(18)
        self.draw.line([(M_LEFT, self.y + 7), (W - M_RIGHT, self.y + 7)], fill=RULE, width=2)
        self.y += 18

    def table(self, rows):
        size = 9.4
        lh = int(pt(size) * 1.42)
        pad_x, pad_y = pt(7), pt(6)
        cols = len(rows[0])
        avail = CONTENT_W

        nat = []
        for j in range(cols):
            longest = max(
                (runs_width(segments(rows[r][j] if j < len(rows[r]) else '', size)) for r in range(len(rows))),
                default=pt(20),
            )
            nat.append(max(longest, pt(24)) + pad_x * 2)
        base = sum(nat)
        widths = [max(avail * 0.13, min(avail * 0.52, avail * n / base)) for n in nat]
        scale = avail / sum(widths)
        widths = [int(w * scale) for w in widths]
        widths[-1] = avail - sum(widths[:-1])

        cell_lines = []
        heights = []
        for i, r in enumerate(rows):
            row_cells = []
            for j in range(cols):
                txt = r[j] if j < len(r) else ''
                if i == 0:
                    runs = [(t, (CN_B if s == CN else s), z, (255, 255, 255))
                            for t, s, z, _c in segments(txt, size)]
                    runs = [(t, s, z, (255, 255, 255)) for t, s, z, _c in runs]
                    lns = wrap(runs, widths[j] - pad_x * 2)
                else:
                    lns = wrap(segments(txt, size), widths[j] - pad_x * 2)
                row_cells.append(lns)
            cell_lines.append(row_cells)
            h = max([len(lns) * lh for lns in row_cells] + [lh])
            heights.append(h + pad_y * 2)

        def draw_row(i, y0):
            x = M_LEFT
            for j in range(cols):
                w, h = widths[j], heights[i]
                if i == 0:
                    self.draw.rectangle([x, y0, x + w, y0 + h], fill=HEAD_BG)
                elif i % 2 == 0:
                    self.draw.rectangle([x, y0, x + w, y0 + h], fill=ROW_ALT)
                self.draw.rectangle([x, y0, x + w, y0 + h], outline=RULE, width=2)
                yy = y0 + pad_y
                for ln in cell_lines[i][j]:
                    draw_runs(self.draw, ln, x + pad_x, yy)
                    yy += lh
                x += w

        for i in range(len(rows)):
            if self.y + heights[i] > H - M_BOTTOM:
                self.new_page()
                if i > 0:
                    if self.y + heights[0] + heights[i] < H - M_BOTTOM:
                        draw_row(0, self.y)
                        self.y += heights[0]
            draw_row(i, self.y)
            self.y += heights[i]
        self.y += 12

    def finish(self, title):
        total = len(self.pages)
        body = font(CN, 8.6)
        for i, (img, draw) in enumerate(self.pages, 1):
            footer = f'{title}    ·    第 {i} / {total} 页'
            tw = body.getlength(footer)
            draw.text(((W - tw) / 2, H - M_BOTTOM + pt(20)), footer, font=body, fill=MUTED)
            if i > 1:
                draw.text((M_LEFT, M_TOP - pt(30)), title, font=body, fill=MUTED)
        self.pages[0][0].save(self.path, 'PDF', resolution=DPI,
                              save_all=True, append_images=[p[0] for p in self.pages[1:]])
        return total


def parse_table_row(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def build(md_path, out_path):
    with open(md_path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')

    doc = Doc(out_path)
    title = 'Beat 中文版 · 使用手册'
    i, n = 0, len(lines)
    ordered = 0

    while i < n:
        raw = lines[i]
        s = raw.strip()

        if not s:
            i += 1
            ordered = 0
            continue

        if s.startswith('```'):
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith('```'):
                buf.append(lines[i].rstrip())
                i += 1
            i += 1
            doc.code(buf)
            continue

        if s.startswith('#'):
            level = len(s) - len(s.lstrip('#'))
            text = s.lstrip('#').strip()
            first = (level == 1 and len(doc.pages) == 1 and doc.y <= M_TOP + 6)
            if first:
                size = 30
                for ln in wrap(segments(text, size, ACCENT), CONTENT_W):
                    draw_runs(doc.draw, [(t, (CN_B if sp == CN else sp), z, c) for t, sp, z, c in ln],
                              M_LEFT, doc.y)
                    doc.y += line_h(size, 1.26)
                doc.y += pt(5)
                doc.draw.line([(M_LEFT, doc.y), (W - M_RIGHT, doc.y)], fill=ACCENT, width=4)
                doc.y += 26
            else:
                doc.heading(text, level)
            i += 1
            continue

        if s.startswith('|') and i + 1 < n and set(lines[i + 1].strip()) <= set('|-: '):
            rows = [parse_table_row(s)]
            i += 2
            while i < n and lines[i].strip().startswith('|'):
                rows.append(parse_table_row(lines[i]))
                i += 1
            doc.table(rows)
            continue

        if s.startswith('> '):
            doc.quote(s[2:])
            i += 1
            continue

        if s == '---':
            doc.rule()
            i += 1
            continue

        m = re.match(r'^(\s*)[-*]\s+(.*)$', raw)
        if m:
            doc.bullet(m.group(2), level=len(m.group(1)) // 2)
            i += 1
            continue

        m = re.match(r'^\s*(\d+)\.\s+(.*)$', raw)
        if m:
            ordered = int(m.group(1))
            doc.bullet(m.group(2), ordered=ordered)
            i += 1
            continue

        doc.para(s)
        i += 1

    return out_path, doc.finish(title)


if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else 'docs/使用手册.md'
    dst = sys.argv[2] if len(sys.argv) > 2 else 'docs/Beat-使用手册.pdf'
    os.makedirs(os.path.dirname(os.path.abspath(dst)) or '.', exist_ok=True)
    out, pages = build(src, dst)
    print(f'OK -> {out}  pages={pages}  {os.path.getsize(out)} bytes')
