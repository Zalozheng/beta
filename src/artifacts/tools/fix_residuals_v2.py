#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2 收尾：多标签 HTML 片段里夹着的可见文字 —— 用整段唯一子串精确替换。

这些字面量是「标签 + 文案」混在一条字符串里（innerHTML 拼接），按 offset 整条替换
风险高（必须逐字复现标签与转义），所以改成「只换里面的可见文字」：
子串在 app.js 里唯一或命中次数已知，替换后逐条打印命中次数，0 次即报错退出。

用法: python3 fix_residuals_v2.py <zh_dir> [--check]
"""
import os
import sys

PAIRS = [
    # (文件, 原文子串, 译文子串)
    ('app.js',
     '<span></span><span></span><span>Shot</span><span>Scene</span><span>Refs</span>',
     '<span></span><span></span><span>镜头</span><span>场景</span><span>参考</span>'),
    ('app.js',
     '<span></span><span>Shot</span><span>Refs</span><span>Shot / Beat</span><span>Location</span>',
     '<span></span><span>镜头</span><span>参考</span><span>镜头 / 节拍</span><span>地点</span>'),
    ('app.js', 'class="onboard-step">Step ', 'class="onboard-step">第 '),
    ('app.js', '<span>Wrap ', '<span>杀青 '),
    ('app.js', 'doc-viewer-error">Could not preview this document:',
     'doc-viewer-error">无法预览这份文档：'),
    ('app.js', '>Paste a YouTube or Vimeo URL<', '>粘贴 YouTube 或 Vimeo 链接<'),
    ('app.js', 'data-act="cancel">Cancel<', 'data-act="cancel">取消<'),
    ('app.js', 'data-act="ok">Add<', 'data-act="ok">添加<'),
    ('app.js',
     'Room size — sets the floor and the real-world scale. (You can also drag the floor’s bottom-right corner.)',
     '房间尺寸 —— 决定地面与真实比例。（你也可以拖动地面的右下角。）'),
    ('app.js', "The video itself isn\\'t saved.", '视频本身不会保存。'),
    ('app.js', '<h2>Keyboard shortcuts</h2>', '<h2>键盘快捷键</h2>'),
    ('app.js', 'snapshot-title">Version history</h3>', 'snapshot-title">版本历史</h3>'),
    ('app.js', 'Export <span class="shotlist-menu-caret">▾</span>',
     '导出 <span class="shotlist-menu-caret">▾</span>'),
    ('app.js', r'Sequence <span class="shotlist-menu-caret">\u25be</span>',
     r'序列 <span class="shotlist-menu-caret">\u25be</span>'),
    ('app.js', 'title="Field of view for ', 'title="视场角 —— '),
    # 引导卡片的 Skip 按钮（两处实现）与项目名兜底值
    ('app.js', 'class="sp-coach-skip">Skip</button>', 'class="sp-coach-skip">跳过</button>'),
    ('app.js', "'Untitled project'", "'未命名项目'"),
    # Write 面板的工艺元素条：整组统一成中文（半英半中最难看，且这些名字只是可编辑标签）
    # 最后一批孤立文案（对话框标题、提示、确认按钮默认值、速查表行）
    ('app.js', "'Pick a folder'", "'选择文件夹'"),
    ('app.js', "'Pick a file'", "'选择文件'"),
    ('app.js', "'No address on this card yet'", "'这张卡片还没有地址'"),
    ('app.js', "'Develop the story'", "'发展故事'"),
    ('app.js', "opts.cancel || 'Cancel'", "opts.cancel || '取消'"),
    ('app.js', "opts.ok || 'OK'", "opts.ok || '确定'"),
    ('app.js', "'Claude is editing…'", "'Claude 正在编辑…'"),
    ('app.js', "'Location pinned from the photo'", "'已从照片标记地点'"),
    ('index.html', '>Undo<', '>撤销<'),
    ('index.html', '>Redo<', '>重做<'),
    ('app.js', "const WRITE_ELEMENTS_DEFAULT = ['Shot','Description','角色','道具','地点','Wardrobe','Sound','VFX','备注'];",
     "const WRITE_ELEMENTS_DEFAULT = ['镜头','描述','角色','道具','地点','服装','声音','视效','备注'];"),
]


def main(zh_dir, check_only=False):
    total, misses = 0, []
    cache = {}
    for f, a, b in PAIRS:
        p = os.path.join(zh_dir, f)
        if f not in cache:
            cache[f] = open(p, encoding='utf-8').read()
        s = cache[f]
        n = s.count(a)
        if n == 0:
            misses.append((f, a[:60]))
            continue
        cache[f] = s.replace(a, b)
        total += n
        print(f'  {n} × {a[:56]!r}')
    for f, s in cache.items():
        open(os.path.join(zh_dir, f), 'w', encoding='utf-8').write(s)
    print(f'fix_residuals_v2: {total} replacements, misses={len(misses)}')
    for m in misses:
        print('  MISS', m)
    return 0 if not misses else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else './zh'))
