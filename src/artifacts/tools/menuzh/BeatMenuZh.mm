// BeatMenuZh.mm —— Beat 2.3.2 (io.beat.canvas) 原生菜单 / 原生对话框汉化注入库
//
// 编译:
//   clang -dynamiclib -fobjc-arc -O2 -arch arm64 -arch x86_64 \
//         -mmacosx-version-min=10.15 -framework AppKit -framework Foundation \
//         -install_name @executable_path/../Frameworks/BeatMenuZh.dylib \
//         -o BeatMenuZh.dylib BeatMenuZh.mm
//
// 行为:
//   + 启动即 swizzle NSMenuItem / NSMenu / NSAlert / NSWindow 的标题设置入口，
//     在「写入前」把英文标题换成中文（muda / Tauri 建菜单走的就是这几个 API）；
//   + 启动后 60s 内每 0.5s 递归扫一遍 NSApp.mainMenu，兜住 swizzle 之前已建好的项；
//   + 命中全部写日志 /tmp/beat_menu_zh.log，计数写 /tmp/beat_menu_zh.summary。

#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>
#import <stdio.h>
#import <time.h>
#import <unistd.h>
#import <sqlite3.h>

static NSDictionary<NSString *, NSString *> *gMap = nil;
static NSSet<NSString *> *gTargets = nil;
static NSMutableSet<NSString *> *gHit = nil;
static NSArray<NSString *> *gTargetList = nil;
static NSObject *gLock = nil;
static FILE *gLogFile = NULL;

static NSDictionary<NSString *, NSString *> *gRevMap = nil;   // 中文 → 英文（切回英文时用）
static BOOL gLangEn = NO;                                     // 当前界面语言是不是英文
static double gLangAt = 0;
static sqlite3 *gLangDb = NULL;

static int gTicks = 0;
static int gDumped = 0;
static int gApply = 0;
static int gSwizzled = 0;

static const char *kLogPath = "/tmp/beat_menu_zh.log";
static const char *kSumPath = "/tmp/beat_menu_zh.summary";

#pragma mark - log

static void bz_log(NSString *msg) {
    @synchronized(gLock ?: (id)[NSNull null]) {
        if (!gLogFile) gLogFile = fopen(kLogPath, "a");
        if (!gLogFile) return;
        time_t t = time(NULL);
        struct tm tmv;
        localtime_r(&t, &tmv);
        char ts[40];
        strftime(ts, sizeof ts, "%Y-%m-%dT%H:%M:%S", &tmv);
        fprintf(gLogFile, "[%s] %s\n", ts, msg.UTF8String);
        fflush(gLogFile);
    }
}

static void bz_summary(void) {
    NSMutableArray *miss = [NSMutableArray array];
    for (NSString *k in gTargetList) {
        if (![gHit containsObject:k]) [miss addObject:k];
    }
    FILE *f = fopen(kSumPath, "w");
    if (!f) return;
    fprintf(f, "hits=%lu/%lu applied=%d swizzled=%d dumped=%d\nmissing=[%s]\n",
            (unsigned long)gHit.count, (unsigned long)gTargetList.count,
            gApply, gSwizzled, gDumped,
            [[miss componentsJoinedByString:@" | "] UTF8String]);
    fclose(f);
}

#pragma mark - 翻译

static void bz_refresh_lang(void);   // 定义在后，BZ() 先用到

static NSString *BZ(NSString *s) {
    if (s == nil || s.length == 0) return s;
    bz_refresh_lang();
    if (gLangEn) {
        // 英文界面：把上一次写进去的中文再翻回英文（切语言后扫一遍菜单即可复原）
        NSString *back = gRevMap[s];
        if (back != nil) {
            bz_log([NSString stringWithFormat:@"title(en): \"%@\" -> \"%@\"", s, back]);
            return back;
        }
        return s;
    }
    NSString *r = gMap[s];
    if (r == nil && [s hasSuffix:@"..."]) {
        // AppKit 有的项用三个点而不是 U+2026
        NSString *alt = [[s substringToIndex:s.length - 3] stringByAppendingString:@"\u2026"];
        r = gMap[alt];
        if (r != nil) {
            NSString *base = [s substringToIndex:s.length - 3];
            if ([gTargets containsObject:base]) {   // "Share..." 命中 "Share" 这一条
                @synchronized(gLock) { [gHit addObject:base]; }
            }
            s = alt;
        }
    }
    if (r == nil || [r isEqualToString:s]) return s;

    BOOL isTarget = [gTargets containsObject:s];
    if (isTarget) {
        @synchronized(gLock) { [gHit addObject:s]; }
    } else if ([s hasSuffix:@"\u2026"]) {
        // "Share…" 这类带省略号的变体，计入它的基名 "Share"
        NSString *base = [s substringToIndex:s.length - 1];
        if ([gTargets containsObject:base]) {
            @synchronized(gLock) { [gHit addObject:base]; }
        }
    }
    bz_log([NSString stringWithFormat:@"%@ \"%@\" -> \"%@\"",
           isTarget ? @"title:" : @"extra:", s, r]);
    return r;
}

#pragma mark - 界面语言探测
// 语言状态存在 WKWebView 的 localStorage（key = beat.uiLang）里，JS 侧切换即写。
// 菜单是原生对象，只能自己去看一眼：只读查询，0.5s 缓存，读不到就沿用上一次的判断。

static NSString *bz_localstorage_db(void) {
    static NSString *cached = nil;
    if (cached != nil && access(cached.fileSystemRepresentation, F_OK) == 0) return cached;
    NSString *root = [NSHomeDirectory() stringByAppendingPathComponent:
                      @"Library/WebKit/io.beat.canvas/WebsiteData"];
    NSFileManager *fm = [NSFileManager defaultManager];
    NSString *found = nil;
    NSDirectoryEnumerator *en = [fm enumeratorAtPath:root];
    for (NSString *rel in en) {
        if ([rel hasSuffix:@"LocalStorage/localstorage.sqlite3"]) {
            found = [root stringByAppendingPathComponent:rel];
            break;
        }
    }
    cached = found;
    return found;
}

static BOOL bz_read_lang_en(void) {
    NSString *db = bz_localstorage_db();
    if (db == nil) return gLangEn;
    if (gLangDb == NULL) {
        if (sqlite3_open_v2(db.fileSystemRepresentation, &gLangDb, SQLITE_OPEN_READWRITE, NULL) != SQLITE_OK) {
            if (gLangDb) { sqlite3_close(gLangDb); gLangDb = NULL; }
            return gLangEn;
        }
        sqlite3_busy_timeout(gLangDb, 150);
    }
    BOOL en = gLangEn;
    sqlite3_stmt *st = NULL;
    if (sqlite3_prepare_v2(gLangDb, "select value from ItemTable where key='beat.uiLang' limit 1", -1, &st, NULL) == SQLITE_OK) {
        if (sqlite3_step(st) == SQLITE_ROW) {
            int type = sqlite3_column_type(st, 0);
            const void *blob = sqlite3_column_blob(st, 0);
            int n = sqlite3_column_bytes(st, 0);
            NSString *val = nil;
            if (type == SQLITE_TEXT && blob) {
                val = [NSString stringWithUTF8String:(const char *)blob];
            } else if (blob && n >= 4) {
                val = [[NSString alloc] initWithBytes:blob length:n encoding:NSUTF16LittleEndianStringEncoding];
            }
            if (val != nil) en = [val isEqualToString:@"en"];
        }
        sqlite3_finalize(st);
    }
    return en;
}

static void bz_refresh_lang(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    double now = (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
    if (now - gLangAt < 0.5) return;
    gLangAt = now;
    BOOL en = bz_read_lang_en();
    if (en != gLangEn) {
        gLangEn = en;
        bz_log([NSString stringWithFormat:@"ui lang -> %@", en ? @"English" : @"简体中文"]);
    }
}

#pragma mark - 菜单树遍历

static void bz_walk(NSMenu *menu);

static void bz_fix_item(NSMenuItem *it) {
    if (it == nil) return;
    NSString *t = it.title;
    if (t.length) {
        NSString *r = BZ(t);
        if (r != t && ![r isEqualToString:t]) {
            gApply++;
            [it setTitle:r];
        }
    }
}

static void bz_walk(NSMenu *menu) {
    if (menu == nil) return;
    NSArray *items = [menu itemArray];
    for (NSMenuItem *it in items) {
        bz_fix_item(it);
        if (it.submenu) {
            NSString *st = it.submenu.title;
            if (st.length) {
                NSString *r = BZ(st);
                if (r != st && ![r isEqualToString:st]) [it.submenu setTitle:r];
            }
            bz_walk(it.submenu);
        }
    }
}

static void bz_dump(NSMenu *menu, int depth, NSMutableString *out) {
    if (menu == nil) return;
    for (NSMenuItem *it in [menu itemArray]) {
        [out appendFormat:@"%*s- %@%@\n", depth * 2, "",
                          it.title ?: @"(nil)",
                          it.isSeparatorItem ? @"  <separator>" : @""];
        if (it.submenu) bz_dump(it.submenu, depth + 1, out);
    }
}


#pragma mark - 对话框标题回环自检（仅在 /tmp/beat_menuzh_selftest 存在时执行）

static int gSelfDone = 0;

static void bz_selftest(void) {
    if (gSelfDone) return;
    if (access("/tmp/beat_menuzh_selftest", F_OK) != 0) return;
    gSelfDone = 1;
    @autoreleasepool {
        bz_log(@"----- selftest: 真实对象回环（不显示窗口）-----");

        NSSavePanel *p = [NSSavePanel savePanel];
        [p setTitle:@"Save media as"];
        bz_log([NSString stringWithFormat:@"selftest: NSSavePanel.title = \"%@\"", p.title]);

        NSAlert *a = [[NSAlert alloc] init];
        [a setMessageText:@"Export media as .zip"];
        [a setInformativeText:@"Save as Beat template"];
        bz_log([NSString stringWithFormat:@"selftest: NSAlert.messageText = \"%@\" informativeText = \"%@\"",
                a.messageText, a.informativeText]);

        NSArray *winTitles = @[ @"Beat \u2014 story planning canvas", @"Beat template" ];
        for (NSString *t in winTitles) {
            NSWindow *w = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 10, 10)
                                                      styleMask:NSWindowStyleMaskBorderless
                                                        backing:NSBackingStoreBuffered
                                                          defer:YES];
            [w setReleasedWhenClosed:NO];   // ARC 下必须关掉"close 即 release"，否则 over-release 崩溃
            [w setTitle:t];
            bz_log([NSString stringWithFormat:@"selftest: NSWindow.title = \"%@\"", w.title]);
            [w close];
        }
        bz_summary();
    }
}

static void bz_sweep(void) {
    @autoreleasepool {
        NSMenu *mm = NSApp.mainMenu;
        if (gTicks == 6) bz_selftest();
        if (mm) {
            bz_walk(mm);
            if (!gDumped && gTicks >= 4) {
                NSMutableString *o = [NSMutableString stringWithString:@"===== NSApp.mainMenu (live) ====="];
                [o appendString:@"\n"];
                bz_dump(mm, 0, o);
                bz_log(o);
                gDumped = 1;
            }
        }
        if (gTicks < 120) bz_summary();
        gTicks++;
    }
}

// 双驱动：dispatch_after 链 + NSTimer(commonModes)。任一路径被 run loop 模式饿死时另一条兜住。
static void bz_chain(void) {
    bz_sweep();
    if (gTicks < 120) {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
                       dispatch_get_main_queue(), ^{ bz_chain(); });
    }
}

@interface BZTicker : NSObject
@end

@implementation BZTicker
+ (void)tick:(NSTimer *)t {
    // 不再 120 拍后停：语言在运行时可能被切，菜单要一直跟得上
    bz_sweep();
}
@end

#pragma mark - swizzle 目标

@implementation NSMenuItem (BeatZh)
- (void)bz_setTitle:(NSString *)t { [self bz_setTitle:BZ(t)]; }
@end

@implementation NSMenu (BeatZh)
- (void)bz_setTitle:(NSString *)t { [self bz_setTitle:BZ(t)]; }

- (NSMenuItem *)bz_addItemWithTitle:(NSString *)t action:(SEL)a keyEquivalent:(NSString *)k {
    return [self bz_addItemWithTitle:BZ(t) action:a keyEquivalent:k];
}

- (NSMenuItem *)bz_insertItemWithTitle:(NSString *)t action:(SEL)a keyEquivalent:(NSString *)k atIndex:(NSInteger)i {
    return [self bz_insertItemWithTitle:BZ(t) action:a keyEquivalent:k atIndex:i];
}

- (void)bz_addItem:(NSMenuItem *)item {
    if (item != nil) {
        NSString *t = item.title;
        if (t.length) {
            NSString *r = BZ(t);
            if (r != t && ![r isEqualToString:t]) [item setTitle:r];
        }
    }
    [self bz_addItem:item];
}

- (void)bz_insertItem:(NSMenuItem *)item atIndex:(NSInteger)i {
    if (item != nil) {
        NSString *t = item.title;
        if (t.length) {
            NSString *r = BZ(t);
            if (r != t && ![r isEqualToString:t]) [item setTitle:r];
        }
    }
    [self bz_insertItem:item atIndex:i];
}
@end

@implementation NSWindow (BeatZh)
- (void)bz_setTitle:(NSString *)t { [self bz_setTitle:BZ(t)]; }
@end

@implementation NSAlert (BeatZh)
- (void)bz_setMessageText:(NSString *)t { [self bz_setMessageText:BZ(t)]; }
- (void)bz_setInformativeText:(NSString *)t { [self bz_setInformativeText:BZ(t)]; }
@end

@implementation NSApplication (BeatZh)
- (void)bz_orderFrontStandardAboutPanelWithOptions:(NSDictionary *)o {
    [self bz_orderFrontStandardAboutPanelWithOptions:o];
    for (NSWindow *w in [NSApp windows]) {
        NSString *t = w.title;
        if (t.length) {
            NSString *r = BZ(t);
            if (r != t && ![r isEqualToString:t]) [w setTitle:r];
        }
    }
}
@end

#pragma mark - 词典与安装

static void bz_build_dict(void) {
    // 32 组：strings.json source=native-menu 的 40 条（2 条为同名不译：Beat / Joao Lutz）
    gMap = @{
        // —— 应用菜单 ——
        @"About Beat":                       @"关于 Beat",
        @"Preferences\u2026":                @"偏好设置\u2026",
        @"Hide Beat":                        @"隐藏 Beat",
        @"Hide Others":                      @"隐藏其他",
        @"Show All":                         @"全部显示",
        @"Quit Beat":                        @"退出 Beat",
        // —— 文件 ——
        @"New Project\u2026":                @"新建项目\u2026",
        @"Open Project\u2026":               @"打开项目\u2026",
        @"Projects\u2026":                   @"项目\u2026",
        @"Save":                             @"保存",
        @"Reveal Project in Finder":         @"在访达中显示项目",
        @"Share":                            @"共享",
        @"Share\u2026":                      @"共享\u2026",
        // —— 导出 ——
        @"Export Beat Overview (PDF)":       @"导出 Beat 概览（PDF）",
        @"Export Storyboard (PDF)":          @"导出故事板（PDF）",
        @"Export DOCX Chapters":             @"导出 DOCX 章节",
        @"Export for AI chat development (.md)": @"导出供 AI 对话开发用（.md）",
        // —— 编辑 / 视图 ——
        @"Close Tab":                        @"关闭标签页",
        @"Find Beat\u2026":                  @"查找 Beat\u2026",
        @"Toggle Vault":                     @"切换保险库",
        @"Project Info":                     @"项目信息",
        @"Locations Map":                    @"地点地图",
        @"Zoom In":                          @"放大",
        @"Zoom Out":                         @"缩小",
        @"Debug Panel":                      @"调试面板",
        // —— 菜单栏一级标题 ——
        @"File":                             @"文件",
        @"Edit":                             @"编辑",
        @"View":                             @"视图",
        @"Window":                           @"窗口",
        @"Help":                             @"帮助",
        // —— 窗口菜单 / 其他 ——
        @"Keyboard Shortcuts":               @"键盘快捷键",
        @"Show Beat.log":                    @"打开 Beat.log",
        @"Update Extractor (yt-dlp)":        @"更新提取器（yt-dlp）",
        @"Bring All to Front":               @"全部置于顶层",
        // —— About 面板 ——
        @"Beat \u2014 story planning canvas": @"Beat —— 故事规划画布",
        // —— rfd 原生对话框 ——
        @"Save media as":                    @"媒体保存为",
        @"Export media as .zip":             @"将媒体导出为 .zip",
        @"Save as Beat template":            @"保存为 Beat 模板",
        @"Beat template":                    @"Beat 模板",

        // —— 额外：街景子窗口 App 自有按钮（DOM 侧同时做了字节补丁）——
        @"Capture snapshot":                 @"截取快照",

        // —— 额外：AppKit 自带项（系统语言为英文时出现的）——
        @"Services":                         @"服务",
        @"Start Dictation\u2026":            @"开始听写\u2026",
        @"Emoji & Symbols":                  @"表情与符号",
        @"Enter Full Screen":                @"进入全屏",
        @"Exit Full Screen":                 @"退出全屏",
        @"Minimize":                         @"最小化",
        @"Zoom":                             @"缩放",
        @"Close":                            @"关闭",
        @"Undo":                             @"撤销",
        @"Redo":                             @"重做",
        @"Cut":                              @"剪切",
        @"Copy":                             @"拷贝",
        @"Paste":                            @"粘贴",
        @"Select All":                       @"全选",
        @"Toggle Full Screen":               @"切换全屏",
        @"Fit View":                         @"适应视图",
        @"AutoFill":                         @"自动填充",
        @"Contact\u2026":                    @"联系人\u2026",
        @"Passwords\u2026":                  @"密码\u2026",
        @"Credit Card\u2026":                @"信用卡\u2026",
    };

    // 计分用的 40 条目标（其中 Beat / Joao Lutz 为同名，不计入可译集合）
    gTargetList = @[
        @"About Beat", @"Preferences\u2026", @"Hide Beat", @"Quit Beat",
        @"New Project\u2026", @"Open Project\u2026", @"Projects\u2026", @"Save",
        @"Reveal Project in Finder", @"Share",
        @"Export Beat Overview (PDF)", @"Export Storyboard (PDF)",
        @"Export DOCX Chapters", @"Export for AI chat development (.md)",
        @"Close Tab", @"Find Beat\u2026", @"Toggle Vault", @"Project Info",
        @"Locations Map", @"Zoom In", @"Zoom Out", @"Debug Panel",
        @"Window", @"Keyboard Shortcuts", @"Show Beat.log",
        @"Update Extractor (yt-dlp)",
        @"File", @"Edit", @"View", @"Help",
        @"Hide Others", @"Show All", @"Bring All to Front",
        @"Beat \u2014 story planning canvas",
        @"Save media as", @"Export media as .zip",
        @"Save as Beat template", @"Beat template",
    ];
    {
        NSMutableDictionary *rev = [NSMutableDictionary dictionaryWithCapacity:gMap.count];
        for (NSString *en in gMap) {
            NSString *zh = gMap[en];
            if (zh.length && rev[zh] == nil) rev[zh] = en;   // 同译文取第一条
        }
        gRevMap = [rev copy];
    }
    gTargets = [NSSet setWithArray:gTargetList];
    gHit = [NSMutableSet set];
    gLock = [NSObject new];
}

#define BZ_SWZ(CLS, ORIG, REPL)                                                        \
    do {                                                                               \
        Class c_ = objc_getClass(#CLS);                                                \
        Method a_ = class_getInstanceMethod(c_, @selector(ORIG));                       \
        Method b_ = class_getInstanceMethod(c_, @selector(REPL));                       \
        if (a_ && b_) {                                                                \
            method_exchangeImplementations(a_, b_);                                     \
            gSwizzled++;                                                               \
            bz_log([NSString stringWithFormat:@"swizzle ok: %s -%s", #CLS, #ORIG]);     \
        } else {                                                                       \
            bz_log([NSString stringWithFormat:@"swizzle FAIL: %s -%s (a=%p b=%p)",      \
                    #CLS, #ORIG, (void *)a_, (void *)b_]);                             \
        }                                                                              \
    } while (0)

__attribute__((constructor)) static void bz_boot(void) {
    bz_build_dict();
    bz_log(@"===== BeatMenuZh loaded =====");
    bz_log([NSString stringWithFormat:@"pid=%d bundle=%@", getpid(),
            [[NSBundle mainBundle] bundleIdentifier] ?: @"(nil)"]);

    BZ_SWZ(NSMenuItem,  setTitle:,           bz_setTitle:);
    BZ_SWZ(NSMenu,      setTitle:,           bz_setTitle:);
    BZ_SWZ(NSMenu,      addItemWithTitle:action:keyEquivalent:,
                        bz_addItemWithTitle:action:keyEquivalent:);
    BZ_SWZ(NSMenu,      insertItemWithTitle:action:keyEquivalent:atIndex:,
                        bz_insertItemWithTitle:action:keyEquivalent:atIndex:);
    BZ_SWZ(NSMenu,      addItem:,            bz_addItem:);
    BZ_SWZ(NSMenu,      insertItem:atIndex:, bz_insertItem:atIndex:);
    BZ_SWZ(NSWindow,    setTitle:,           bz_setTitle:);
    BZ_SWZ(NSAlert,     setMessageText:,     bz_setMessageText:);
    BZ_SWZ(NSAlert,     setInformativeText:, bz_setInformativeText:);
    BZ_SWZ(NSApplication, orderFrontStandardAboutPanelWithOptions:,
                          bz_orderFrontStandardAboutPanelWithOptions:);

    bz_summary();
    dispatch_async(dispatch_get_main_queue(), ^{
        bz_chain();
        NSTimer *t = [NSTimer timerWithTimeInterval:0.5
                                             target:[BZTicker class]
                                           selector:@selector(tick:)
                                           userInfo:nil
                                            repeats:YES];
        [[NSRunLoop mainRunLoop] addTimer:t forMode:NSRunLoopCommonModes];
    });
}
