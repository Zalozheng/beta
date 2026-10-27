# 修掉「实体/换行导致 offset 精替换落空」的残余条目（3 条），保证 build_zh.py 产物 963/963 全中文。
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ZH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "work", "zh")
REPS = [
    ("2&times; click canvas", "双击画布"),
    ("Shot: Em in dress, looking in mirror&#10;Shot: Kat getting out of bed&#10;    Costuming: white crop top&#10;    Series from stretching to shower&#10;Note: emphasize black/white early",
     "镜头：Em 穿裙子，照镜子&#10;镜头：Kat 起床&#10;    造型：白色短上衣&#10;    从伸展到沐浴的连续镜头&#10;备注：强调黑白部分"),
    ("Pick a folder where your projects will live. Each project becomes a folder\n      you can back up, copy, or move around like any other folder.",
     "选择一个存放项目的文件夹。每个项目会成为一个文件夹，\n      你可以像普通文件夹一样备份、复制或移动它。"),
]
p = os.path.join(ZH, "index.html")
s = open(p, encoding="utf-8").read()
for a, b in REPS:
    n = s.count(a)
    s = s.replace(a, b)
    print(f"residual fix: {n} × {a[:48]!r}")
open(p, "w", encoding="utf-8").write(s)
