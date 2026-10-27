// Beat starter templates. Plain data, loaded before app.js as a classic script.
// (The global is still named window.BTS_TEMPLATES for backward compatibility.)
window.BTS_TEMPLATES = [
  {
    id: 'blank',
    name: '空白画布',
    description: '从零开始。边想边加节拍。',
    beats: []
  },
  {
    id: 'three-act',
    name: '三幕结构',
    description: '3 个节拍：铺垫、对抗、解决。',
    beats: [
      { title: '设置',         body: '介绍世界、人物、现状与激励事件。' },
      { title: '对抗', body: '主角面对不断升级的障碍。赌注升高。中点反转。' },
      { title: '解决',    body: '高潮。余波。新的平衡。' }
    ]
  },
  {
    id: 'heros-journey',
    name: "英雄之旅",
    description: "12 个阶段（Campbell / Vogler）。神话故事、长片、小说。",
    beats: [
      { title: '平凡世界',         body: '主角在日常生活里。建立他缺少什么。' },
      { title: '冒险的召唤',      body: '离开熟悉世界的召唤。问题或挑战出现。' },
      { title: '拒绝召唤',    body: '犹豫、恐惧、怀疑。主角抗拒。' },
      { title: '遇见导师',     body: '从引路人那里获得智慧或训练。' },
      { title: '跨越第一道门槛', body: '主角下定决心，进入特殊世界。' },
      { title: '考验、盟友、敌人', body: '新的规则、新的关系、最初的挑战。' },
      { title: '接近最深的洞穴', body: '为最核心的磨难做准备。' },
      { title: '磨难',                 body: '迄今最大的危机。死亡与重生的时刻。' },
      { title: '奖赏',                 body: '夺得奖赏。庆祝。获得新的认知。' },
      { title: '归途',          body: '开始返回。新的赌注，最后的诱惑。' },
      { title: '复活',           body: '最终高潮。主角在最高层次上受到考验。' },
      { title: '带着灵药归来', body: '主角焕然一新地回到家乡，并带回有价值的东西。' }
    ]
  },
  {
    id: 'fifteen-beats',
    name: '十五节拍',
    description: '15 个节拍。常见的商业片结构，从开场画面到收尾画面。',
    beats: [
      { title: '开场画面',      body: "「之前」的快照。基调、情绪、世界。" },
      { title: '主题问题',       body: '有人把故事真正要讲的东西说出口。' },
      { title: '设置',              body: '介绍主角与世界。埋下需要解决的问题。' },
      { title: '打破日常',     body: '把主角踢出原有世界的那件事。' },
      { title: '犹豫',         body: '我该去吗？最后的抗拒时刻。' },
      { title: '下定决心',         body: '主角做出决定，迈入新世界。' },
      { title: '第二条线',      body: '承载主题的一段关系或支线。' },
      { title: '兑现承诺',   body: '观众真正想看的部分。前提被兑现。' },
      { title: '中点',           body: '虚假的胜利或虚假的失败。赌注的形状改变。' },
      { title: '压力升级',    body: '外部力量逼近。内部裂缝显现。' },
      { title: '最低点',      body: '谷底。一次死亡，字面或隐喻皆可。' },
      { title: '清算',      body: '主角与失去共处，直到某处开始转变。' },
      { title: '新的想法',       body: '出路出现，主角付诸行动。' },
      { title: '高潮',             body: '所有线索汇聚。问题得到回答。' },
      { title: '收尾画面',      body: "「之后」的快照。展现世界发生了怎样的变化。" }
    ]
  },
  {
    id: 'pixar-spine',
    name: '皮克斯故事骨架',
    description: "6 个节拍。亲切易懂，适用于任何叙事。",
    beats: [
      { title: '从前……',          body: '建立日常。' },
      { title: '每一天……',                 body: '展现正常的节奏。' },
      { title: '直到有一天……',             body: '有什么打破了日常。' },
      { title: '因此……',           body: '第一个后果。' },
      { title: '因此……',           body: '第二个后果 —— 升级。' },
      { title: '直到最终……',             body: '高潮与新的平衡。' }
    ]
  },
  {
    id: 'story-circle',
    name: "Dan Harmon 的故事圈",
    description: "8 个节拍。简化版英雄之旅 —— 适合单集。",
    beats: [
      { title: '你',     body: '建立主角在舒适区中的样子。' },
      { title: '需求',    body: '他想要某样东西。' },
      { title: '开始',      body: '他进入一个陌生的处境。' },
      { title: '搜索',  body: '他适应、挣扎。' },
      { title: '查找',    body: '他得到了想要的。' },
      { title: '条次',    body: '但他为此付出沉重代价。' },
      { title: '回归',  body: '他回到熟悉的处境。' },
      { title: '更改',  body: '已更改。' }
    ]
  },
  {
    id: 'treatment',
    name: '项目书（章节）',
    description: '一份按幻灯片排布的纪录片／品牌提案：封面、梗概、人物、故事、视觉语言、参考、声音、结语。每个部分都是一个分组。',
    context: '用于影片／品牌片的项目书。每个分组就是最终文档的一页／一节。',
    groups: [
      { name: '封面',           role: 'cover' },
      { name: '梗概',        role: 'section' },
      { name: '人物',   role: 'section' },
      { name: '故事',       role: 'section' },
      { name: '视觉语言', role: 'section' },
      { name: '参考',      role: 'reference' },
      { name: '声音',          role: 'section' },
      { name: '结语',        role: 'section' }
    ],
    beats: [
      { type: 'title',   role: 'cover',   group: 0, title: '项目标题', body: '用一句话说明这是什么。' },
      { type: 'thought', role: 'concept', group: 1, title: '摘要', body: '用一段话讲清这部作品 —— 前提、基调、为什么是现在。' },
      { type: 'thought', role: 'concept', group: 2, title: '他们是谁', body: '人物／对象。简介、声音、魅力所在。' },
      { type: 'thought', role: 'concept', group: 3, title: '我们讲的故事', body: '弧线。我们从哪里开始，落到哪里。' },
      { type: 'thought', role: 'concept', group: 4, title: '观感', body: '配色、镜头、光线、质感、画面参考。' },
      { type: 'thought', role: 'mood',    group: 5, title: '参考板', body: '把剧照、画面和灵感放在这里。' },
      { type: 'thought', role: 'concept', group: 6, title: '声音与音乐', body: '配乐方向、同期声、旁白方式。' },
      { type: 'thought', role: 'concept', group: 7, title: '结语思考', body: '那句让他们想要动手去做的话。' }
    ]
  },
  {
    id: 'production',
    name: '制作时间线',
    description: '一条按顺序排列阶段的时间线分组：筹备、拍摄、剪辑、完成。',
    context: '以有序阶段时间轴排布的制作计划。',
    groups: [ { name: '时间线', role: 'timeline' } ],
    beats: [
      { type: 'beat', role: 'step', group: 0, title: '前期筹备', body: '勘景、选角、排期、器材、许可。' },
      { type: 'beat', role: 'step', group: 0, title: '拍摄', body: '主拍摄期。镜头表、拍摄日、地点。' },
      { type: 'beat', role: 'step', group: 0, title: '编辑', body: '初剪、粗剪、精剪、锁定画面。' },
      { type: 'beat', role: 'step', group: 0, title: '完成', body: '调色、混音、图形、交付。' }
    ]
  },
  {
    id: 'references',
    name: '参考板',
    description: '两个准备好的参考分组，用于剧照和灵感 —— 纯情绪／视觉研究。',
    context: '一块视觉参考板。每个分组是一个参考主题。',
    groups: [
      { name: '视觉参考', role: 'reference' },
      { name: '基调与氛围',       role: 'mood' }
    ],
    beats: [
      { type: 'thought', role: 'caption', group: 0, title: '视觉方向', body: '把画面、照片、配色放这里。' },
      { type: 'thought', role: 'caption', group: 1, title: '情绪', body: '我们追求的感觉。' }
    ]
  }
];
