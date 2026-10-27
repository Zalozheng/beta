#!/usr/bin/env python3
"""Beat.zh.app Mach-O 注入器：
1) 往每个 slice 的 load commands 里插一条 LC_LOAD_DYLIB（插在 LC_CODE_SIGNATURE 之前），
   指向 @executable_path/../Frameworks/BeatMenuZh.dylib —— 双击即生效，不依赖环境变量；
2) 把 __TEXT,__const 里注入脚本的 'Capture snapshot' 就地改成 '截取快照'（16B 等长，补 4 空格）。

用法: python3 inject.py <app_binary> [--no-js]
"""
import struct
import sys
import shutil

LC_LOAD_DYLIB = 0xC
LC_CODE_SIGNATURE = 0x1D
DYLIB_PATH = b"@executable_path/../Frameworks/BeatMenuZh.dylib"
JS_OLD = b"Capture snapshot"
JS_NEW = "\u622a\u53d6\u5feb\u7167".encode("utf-8")  # 截取快照 = 12B


def build_lc(path: bytes) -> bytes:
    name = path + b"\0"
    pad = (8 - len(name) % 8) % 8
    name += b"\0" * pad
    cmdsize = 24 + len(name)
    lc = struct.pack("<II", LC_LOAD_DYLIB, cmdsize)
    lc += struct.pack("<IIII", 24, 0, 0x10000, 0x10000)  # name_off, timestamp, cur, compat
    lc += name
    assert len(lc) == cmdsize
    return lc


def first_section_off(m: bytes) -> int:
    """__TEXT 段里最小的 section file offset —— load commands 的可用上界"""
    best = None
    off = 32
    ncmds, sizeofcmds = struct.unpack_from("<II", m, 16)
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", m, off)
        if cmd == 0x19:  # LC_SEGMENT_64
            nsects = struct.unpack_from("<I", m, off + 64)[0]
            so = off + 72
            for _ in range(nsects):
                soff = struct.unpack_from("<I", m, so + 32)[0]
                if soff and (best is None or soff < best):
                    best = soff
                so += 80
        off += size
    return best


def inject_slice(m: bytearray, label: str) -> bool:
    ncmds, sizeofcmds = struct.unpack_from("<II", m, 16)
    lc = build_lc(DYLIB_PATH)

    # 找 LC_CODE_SIGNATURE
    off = 32
    cs_off = None
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", m, off)
        if cmd == LC_CODE_SIGNATURE:
            cs_off = off
            break
        off += size

    insert_at = cs_off if cs_off is not None else 32 + sizeofcmds
    limit = first_section_off(m)
    new_end = 32 + sizeofcmds + len(lc)
    if limit is None or new_end > limit:
        print(f"  [{label}] 头部空间不足: need {new_end:#x} > {limit and hex(limit)}")
        return False

    # 检查是否已注入（幂等）
    hdr = bytes(m[32:32 + sizeofcmds])
    if DYLIB_PATH in hdr:
        print(f"  [{label}] 已存在 LC_LOAD_DYLIB，跳过")
        return True

    tail = bytes(m[insert_at:32 + sizeofcmds])
    m[insert_at:insert_at + len(lc)] = lc
    m[insert_at + len(lc):insert_at + len(lc) + len(tail)] = tail
    struct.pack_into("<II", m, 16, ncmds + 1, sizeofcmds + len(lc))

    # 复核
    n2, s2 = struct.unpack_from("<II", m, 16)
    off = 32
    found = False
    for _ in range(n2):
        cmd, size = struct.unpack_from("<II", m, off)
        if cmd == LC_LOAD_DYLIB:
            noff = struct.unpack_from("<I", m, off + 8)[0]
            nm = bytes(m[off + noff:off + size]).split(b"\0")[0]
            if nm == DYLIB_PATH:
                found = True
                print(f"  [{label}] LC_LOAD_DYLIB 已插入 @ cmd[{off:#x}] cmdsize={size} ncmds={n2} sizeofcmds={s2}")
        off += size
    return found


def patch_js(m: bytearray, label: str) -> int:
    n = 0
    start = 0
    while True:
        i = m.find(JS_OLD, start)
        if i < 0:
            break
        newval = JS_NEW + b" " * (len(JS_OLD) - len(JS_NEW))  # 12 + 4 空格 = 16B
        assert len(newval) == len(JS_OLD)
        m[i:i + len(JS_OLD)] = newval
        print(f"  [{label}] 'Capture snapshot' -> '{newval.decode()}' @ slice+{i:#x}")
        n += 1
        start = i + len(JS_OLD)
    return n


def main():
    path = sys.argv[1]
    do_js = "--no-js" not in sys.argv
    data = bytearray(open(path, "rb").read())
    magic, n = struct.unpack_from(">II", data, 0)
    assert magic == 0xCAFEBABE, "不是 fat 二进制"
    slices = []
    for i in range(n):
        cput, sub, o, s, a = struct.unpack_from(">IIIII", data, 8 + 20 * i)
        slices.append((cput, o, s))

    ok = True
    js_hits = 0
    for cput, o, s in slices:
        label = "arm64" if cput == 0x0100000C else "x86_64"
        m = bytearray(data[o:o + s])
        ok = inject_slice(m, label) and ok
        if do_js:
            js_hits += patch_js(m, label)
        data[o:o + s] = m

    open(path, "wb").write(bytes(data))
    print(f"done. injected={ok} js_patched={js_hits}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
