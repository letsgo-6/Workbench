---
name: 'Workbench 桌面工作台'
description: '海底影片、黑晶生命体与香槟金操作面的个人工作台'
colors:
  background: '#edf3f2'
  foreground: '#18363d'
  card: '#f8fbf9'
  primary: '#76571f'
  primary-foreground: '#ffffff'
  secondary: '#dfecea'
  muted: '#e5eeec'
  muted-foreground: '#506b70'
  accent: '#d9e8e5'
  border: '#c0d3d0'
  destructive: '#ad424b'
  sidebar: '#e0eae8'
  selected: '#d1e5e1'
  warning: '#8a5b21'
  sea-light: '#3aabb7'
  scene-metal: '#477780'
  scene-energy: '#bc7a25'
  surface-sheet: '#f3f8f5e8'
  surface-panel: '#f8fbf9ed'
  surface-field: '#ffffffc4'
  surface-line: '#416e6a26'
  surface-shadow: '#102c3329'
  dark-background: '#071b24'
  dark-foreground: '#e5f0ed'
  dark-card: '#102b34'
  dark-primary: '#edcc91'
  dark-primary-foreground: '#24312f'
  dark-secondary: '#1b3b44'
  dark-muted: '#17343d'
  dark-muted-foreground: '#a4bfbe'
  dark-accent: '#214650'
  dark-border: '#35565e'
  dark-destructive: '#ffa7a5'
  dark-sidebar: '#06171e'
  dark-selected: '#24454a'
  dark-warning: '#f1c682'
  dark-sea-light: '#72dde4'
  dark-scene-metal: '#9bd9dc'
  dark-scene-energy: '#ffc05a'
  dark-surface-sheet: '#09232bd6'
  dark-surface-panel: '#102b34ed'
  dark-surface-field: '#071e26b8'
  dark-surface-line: '#a6d2cf30'
  dark-surface-shadow: '#000c1659'
  film-fallback: '#123842'
  light-label-shadow: '#f7fffa99'
  dark-label-shadow: '#03161e'
typography:
  heading:
    fontFamily: 'Segoe UI, Microsoft YaHei UI, PingFang SC, sans-serif'
    fontSize: '26px'
    fontWeight: 650
    lineHeight: 1.35
    letterSpacing: '-0.025em'
  list-title:
    fontSize: '21px'
  section:
    fontSize: '17px'
    fontWeight: 650
  module-title:
    fontSize: '16px'
  capture:
    fontSize: '15px'
  body:
    fontFamily: 'Segoe UI, Microsoft YaHei UI, PingFang SC, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.65
  compact:
    fontSize: '13px'
  caption:
    fontSize: '12px'
  metadata:
    fontSize: '11px'
  shortcut:
    fontSize: '10px'
rounded:
  micro: '4px'
  small: '5px'
  field: '6px'
  control: '7px'
  label: '8px'
  node-count: '9px'
  lab-control: '10px'
  capture: '12px'
  module-shell: '14px'
spacing:
  xs: '4px'
  sm: '8px'
  control: '12px'
  card-gap: '18px'
  field: '20px'
  page: '48px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
    height: '36px'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.control}'
    height: '36px'
  button-ghost:
    textColor: '{colors.foreground}'
    rounded: '{rounded.control}'
    height: '36px'
  input:
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '4px 12px'
    height: '36px'
  node-label:
    backgroundColor: 'transparent'
    textColor: '{colors.foreground}'
    rounded: '{rounded.label}'
    padding: '4px 10px'
  node-count:
    backgroundColor: 'transparent'
    textColor: '{colors.foreground}'
    typography: '{typography.metadata}'
    rounded: '{rounded.node-count}'
    padding: '0 5px'
  node-peek:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.capture}'
    padding: '17px 12px 12px'
    width: '260px'
  material-card:
    backgroundColor: '{colors.surface-panel}'
    rounded: '{rounded.capture}'
  material-tag:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
    typography: '{typography.caption}'
    rounded: '{rounded.small}'
    padding: '1px 6px'
  module-header:
    backgroundColor: '{colors.surface-panel}'
    textColor: '{colors.foreground}'
    padding: '0 28px 0 20px'
    height: '64px'
  module-shell:
    backgroundColor: '{colors.surface-sheet}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.module-shell}'
  lab-controls:
    backgroundColor: '{colors.surface-panel}'
    rounded: '{rounded.lab-control}'
    padding: '12px'
---

# Design System: Workbench 桌面工作台

## Overview

**Creative North Star: "海底影片中的黑晶生命网络"**

工作台面向每天捕捉、整理和编辑个人内容。用户提供的鲸群海底影片贯穿主窗口各路由，深青水色与透光蓝构成环境；首页的原创黑晶生命体以有空隙的三角膜、内部暗色褶片、集中金色光簇与局部冷反光形成材料层次。深色为主要表达，浅色以海雾白和青灰阅读面适配相同影片。

用户在2026-10-22明确要求全应用采用影片配色，并解除旧“只用现有语义色”限制；本轮保留业务语义角色，增加独立的场景材质和阅读表面角色。保持用户选择的浅色/深色/系统主题，不静默改写设置。六节点构图、中文系统字体和底部输入保持固定；内容模块的阅读面安静、文字底色足够实，影片主要从模块外沿、留白与空态可见。

**Key Characteristics:**

- 单一海底影片贯穿主路由，深青与海雾白双主题、香槟金操作色。
- 原创三维黑晶网膜、内部褶片、集中金色光簇和独立相位细丝。
- 稳定六节点、可立即输入、独立HTML操作层。
- 安静半透明阅读面、清晰保存状态、静帧与程序降级路径。

依据：`src/styles/globals.css`、`sea.css`、`home.css`、`motion.css`、`workspace.css`、`materials.css`、`SeaBackdrop.tsx`、WebGL/Canvas/静态渲染器及基础控件。当前0.4.4方向见 `.impeccable/surfaces/src-features-home-homepage-tsx.md`；影片来源、参数与哈希见 `public/scene-media/README.md`；验收证据与原生/真实服务商边界见 `docs/PROGRESS.md`。

## Colors

frontmatter浅色值对应根语义变量，`dark-*`对应深色覆盖值；`film-fallback`和标签阴影色记录`sea.css`中实际使用的固定角色。业务组件继续读原语义变量；场景和阅读面使用独立角色。sidecar色带用于检查面板预览，不成为运行时令牌。

### Primary

- **古金 / 香槟金**：`primary` / `dark-primary`用于主操作、焦点和当前节点，文字使用对应的`primary-foreground`；不再把主操作与环境冷光绑定为同一蓝色。
- **琥珀组织光**：`scene-energy` / `dark-scene-energy`供场景内部晶簇、细丝光点及局部透射使用；与真实逾期、识别警告使用的`warning`区分。

### Secondary

- **透水青光**：`sea-light`用于环境联系、小地图连线和轻微悬停混色。
- **冷金属青**：`scene-metal`用于三维膜片、细丝和局部反光的基色；场景主题读取此角色，而非直接读取UI主操作色。冷光局部使用，宽泛网线退后，集中金色组织先被看见。

### Neutral

- **海雾白 / 深青海水**：`background`、`card`及`sidebar`保留原控件语义；`foreground`承担正文，`muted-foreground`承担计数、时间和辅助信息。
- **青灰层次**：`secondary`用于紧凑底色，`muted`用于低强调区域，`accent`用于悬停，`selected`用于现有控件选中状态；`border`为常规控件边界。首页标签与计数仍透明。
- **阅读片 / 面板 / 输入底**：`surface-sheet`用于模块外壳和列表、详情的阅读层；`surface-panel`用于顶栏、属性栏、弹窗、菜单、抽屉、设置区和素材卡片；`surface-field`用于搜索及指定编辑字段。通过各自透明度限制背景干扰，不要求每一层都看清影片。
- **表面边线 / 环境阴影**：`surface-line`和`surface-shadow`承担海底表面的边缘与浮起层次，不改用正文颜色制造厚重边框。
- **影片底色 / 标签护读色**：`film-fallback`在媒体不可用时保留实色背景；`light-label-shadow`与`dark-label-shadow`仅承接实际标签文字阴影，不能当卡片底色。
- **功能状态**：`warning`保留逾期待办和识别警告，`destructive`保留删除和无效状态；晶簇光不表示条目数量或虚构警报。

**The Semantic Material Rule.** UI操作、真实状态、冷金属和金色组织各自使用命名角色；材质通过局部光照、透明度与`color-mix()`形成层次。影片是用户授权的本地背景，orb/jellyfish参考只研究形态与光，不复制其像素或源码。

## Typography

**UI / Body Font:** 系统中文字体栈，见 `typography.heading` 和 `typography.body`。不加载运行时字体。

**Character:** 操作型中文界面使用紧凑、清楚的系统字。层级依靠字号、字重和留白；神经元的生命感由程序几何承担，不靠装饰性标题。

### Hierarchy

- **页面标题**：`heading` 用于素材库和工具页；`list-title` 用于列表标题，`section` 用于区段标题。
- **模块标题**：`module-title` 用于首页名称与模块顶栏；首页字重（600），模块标题沿用标题字重（650）。
- **输入与正文**：`capture` 用于快速记录；`body` 用于正文和常规控件。编辑与 Markdown 预览最大行宽（74ch），预览行高（1.9）。Markdown 内部保留既有标题层级（24 / 20 / 16px），不作为页面标题刻度。
- **紧凑正文**：`compact` 用于预览标题、列表条目及素材表单标签；`caption` 用于预览说明、素材元信息、标签与唤醒提示。
- **次级元信息**：`metadata` 用于节点计数、预览标题统计、模块副标题及模型选择器。计数使用等宽数字，不压缩为正文。
- **快捷键提示**：`shortcut` 用于键帽；窄桌面下既有快速记录辅助提示也使用此级。它不替代条目正文或操作名称。

## Layout

桌面外壳覆盖整个窗口，原生主窗口最小尺寸（980×640px，见 `src-tauri/tauri.conf.json`），CSS 最小宽度（960px），当前交付不含移动端布局。模块外壳四周留距（12px），宽高各减（24px）；窗口宽度不大于（1000px）时留距减为（8px），宽高各减（16px）。模块内容在高度（64px）的顶栏下独立滚动；顶栏保留回首页、当前模块标题、小地图、搜索、回收站和设置。

首页采用固定虚拟构图（1200×680）：灵感在中心（600, 292），素材库（264, 138）、待办（936, 138）、技巧（226, 432）、Skill（974, 432）、提示词（600, 566）。舞台按可用宽高统一缩放；为顶栏和输入区预留空间，输入增高时缩小舞台，不改变六节点的关系。中心标签在节点上方，外围标签在节点下方。

输入区底部留距（26px），居中宽度取 `min(76%, 940px, calc(100% - 304px))`（相对内容容器），最大高度（54vh）并在内部滚动；预留右下助手入口的空间。AI 抽屉打开时沿用右侧停靠，舞台与模块页共用剩余内容容器，输入区改为容器宽度90%（上限940px），不再预留已隐藏的悬浮按钮。输入框本身高度范围（52–120px），识别结果紧随输入区展开。

模块内部保留既有列表、详情和编辑预览分区：列表默认占比（34%），最小宽度（280px），详情最小宽度（360px），两者通过拖动分隔线调宽并记忆布局。编辑区的分屏为等宽两列、间距（20px）；右侧 AI 抽屉保留原文与结果预览。常规工具页沿用页面留白，窗口宽度不大于（1100px）时压缩内边距。

素材库主体由可滚动画廊与可调宽详情组成。完整作品按媒体原始比例排入最短列瀑布流，目标最小列宽（240px）、列间距（18px），单列时填满可用宽度。组件采用最小列宽（280px）的网格、间距（18px），预览比例（16:10）。详情初始宽度（520px），最小（360px），并保留左侧拖动手柄。

**The Stable Map Rule.** 首页、模块小地图和数字快捷键共享同一六节点顺序与位置关系；内容模块内部的编辑布局不因神经元场景而重排。

## Elevation & Depth

常驻内容面用有色阅读底、单像素边界和低对比阴影分层；影片位于同一主窗口最底层，不让移动图案直接干扰正文。首页原创三维三角网膜分后壳、内部组织和前壳合成：暗色片面不连续，宽泛网线退后，内部褶片切断空心笼感，金色晶簇成为焦点，冷反光只出现在局部。Canvas降级保留后膜、遮挡组织、前膜和局部透光的缓存材料。

旧整屏人工气氛层已关闭，远景和水光由用户影片提供。影片在首页通透可见，在模块外沿、留白与空态可见；正文、表单和弹窗依靠`surface-sheet`、`surface-panel`与`surface-field`保障阅读。

### Shadow Vocabulary

- **上下文菜单**：`0 8px 24px #0002`。
- **模块阅读壳**：`0 18px 56px var(--surface-shadow)`。
- **节点预览**：`0 16px 48px var(--surface-shadow)`，配合背景模糊（18px）。
- **首页输入字段**：`0 12px 40px var(--surface-shadow)`；聚焦时保留 `0 16px 48px color-mix(in srgb, var(--foreground) 10%, transparent)`，配合背景模糊（18px）。
- **素材卡片悬停**：`0 12px 28px color-mix(in srgb, var(--foreground) 9%, transparent)`。
- **标签文字护读**：垂直偏移（2px）、模糊（8px），分别使用`light-label-shadow`与`dark-label-shadow`的固定护读色；这些是文档角色名，不新增同名运行时CSS变量。
- **基础控件**：描边按钮和输入沿用控件库的轻微 `shadow-xs`，焦点环读取 `primary`。

**The Local Light Rule.** 首页悬停与事件只增强组织内部或折叠边缘的局部光照；不在膜体外增加包围选择圈、脉冲圈或均匀发亮轮廓。

**The Quiet Surface Rule.** 让影片延续空间，让足够实的阅读底承担正文对比；对话框、菜单和编辑面不追求最大透明度。

## Shapes

控件沿用紧凑圆角：键帽与微型手柄用 `micro`，素材标签用 `small`，原生文本域、选择框和预览条目用 `field`，基础按钮和输入用 `control`。节点标签及已有识别卡片用 `label`，计数胶囊专用 `node-count`，快速输入、节点预览和素材卡片用 `capture`；实验室控制组用 `lab-control`，模块阅读外壳用 `module-shell`。这些是按角色复用的值，不要求把所有矩形改成同一圆角。

首页使用不规则三维黑晶网膜与开放钟形表面；中心最大，外围在收缩相位、方向和倾斜上各有区别。透明命中区使用近圆形圆角（42%），不绘制外圈；键盘可见焦点落在文字标签上。小地图节点保持圆形，计数保留圆角但无填充；这些形状不要求内容卡片复制生命体的轮廓。

## Components

### Buttons

基础控件来自 shadcn / Radix，继续使用已有 `variant` 与 `size`。主要按钮为当前主题的古金 / 香槟金实底，描边按钮用主面与细边界，ghost 按钮在悬停时显露 `accent`。默认高度（36px），小号（32px）；模块顶栏回首页按钮同时显示文字与 Esc 键帽。焦点使用可见语义色环，禁用态降低透明度并阻止操作。

完整动效档使用统一缓动 `cubic-bezier(0.16, 1, 0.3, 1)`：支持悬停的设备上按钮轻移（1px），按下缩放至（0.965），按压时长（80ms）。AI 抽屉和上下文菜单进入（260ms），对话框进入（280ms）；简洁档不使用按钮轻移和按压缩放，关闭档和系统减少动态效果禁用动画与过渡。正文编辑不附加持续运动。

### Inputs / Fields

常规基础输入沿用细描边和可见焦点环；搜索及指定编辑字段使用`surface-field`，其余按原组件背景继承。快速记录是独立卡片输入，内边距（17px 18px 11px）；首页字段使用`surface-panel`、`surface-line`和背景模糊；聚焦时保留`primary`混色边界与原焦点阴影；辅助操作和提示位于下方。识别结果继续显示来源、置信警告和明确的应用操作，不把模型动效当作保存状态。

### Navigation

模块顶栏使用轻量文字和图标按钮，小地图尺寸（150×80px），复用首页坐标。当前节点用 `primary` 填充，其他节点用 `secondary`，连线使用`sea-light`与`border`的混色；每个节点都有独立的透明按钮、可访问名称和当前页状态。数字（0–5）依次对应灵感、素材库、待办、技巧、Skill、提示词；在可编辑控件中不抢占数字输入。模块内 Esc 按既有优先级处理选中、编辑焦点，再返回首页。

### 神经元首页与节点预览

主渲染器由一个原生WebGL1上下文和Canvas2D合成组成，无新渲染库依赖。固定960×672图集容纳中央512²与五个224²材质格；静态几何缓存三维三角表面、内部暗色褶片与金色晶簇、细丝及光点。绘制顺序为后壳、内部组织、细丝、光点、前壳；真实时间改变旋转、钟体收缩和细丝相位，Canvas继续合成枝干、真实业务光球及镜头。HTML独立提供聚焦、标签、预览和输入，既有渲染器接口与业务事件路径保持稳定。

WebGL创建/编译失败或上下文丢失时，主渲染继续使用Canvas缓存材料。关闭动效使用静态SVG：支持WebGL时从相同几何与着色器取一次图像，无持续RAF；否则使用缓存Canvas材料；Canvas也不可用时保留纯SVG与HTML操作层。销毁时释放程序、着色器、缓冲与GPU上下文。不引入运行时字体、新依赖、数据库迁移或CSP放宽。

一个`SeaBackdrop`贯穿主窗口路由，静音循环播放本地60秒海底影片；完整档正常速度，简洁档为（0.65×）。关闭动效或系统减少动态效果时只挂载静帧，不分配video元素；隐藏或最小化暂停，播放或解码失败保留静帧。媒体路径为相对打包资源，不依赖安装后Steam路径；两份可选媒体同时缺失时保留影片底色。独立快速记录小窗口使用新色板，不启动第二个影片解码器。

影片与原片静帧只进入用户本地个人构建，Git忽略，不属于项目MIT许可且不公开发布；来源、原画署名、处理参数和SHA256以`public/scene-media/README.md`为准。orb/jellyfish参考像素和源码不进入运行时；黑晶生命体由原创程序几何和光照绘制，本轮无图像生成资产。

场景保留形成、休眠、生长、唤醒四阶段；输入立即可用。休眠时点击节点先唤醒，唤醒后点击进入。指针停留（260ms）显示预览，移开（140ms）后收起；键盘焦点立即显示预览。在节点上按向下键进入首条，预览内上下键、Home / End 遍历条目，Esc / 左方向键返回节点；Enter 激活当前条目。预览宽度使用 `node-peek`，完整档以轻移（6px）、淡入和轻微清晰化进入（220ms），简洁档仅淡入。标题、数量说明和条目清晰分层，过长名称省略但保留独立操作；悬停条目内边距轻移至（12px）。节点名称和计数无常驻底板，焦点以文字标签的语义色轮廓（2px）表达。

计数及最近内容从本机数据读取，逾期待办使用 `warning`；导入目标、识别候选与活动节点复用同色增强而非额外配色。`system / full / lite / off` 由设置解析，完整档钟体相位角速度2.5rad/s，基础周期约2.51秒；横向缩放由两段正弦混合驱动，系数15%，纵向系数16%，细丝与主体错相运动。中央表面持续旋转并轻微形变。简洁档GPU时钟为完整档48%，水母幅度40%，Canvas降级时钟60%/幅度40%；移除常驻光球，降级环境时钟25%；主画面的远景由影片承担。关闭档使用静态渲染。`system` 在系统减少动态效果开启时选择 `lite`，显式档位优先；影片与CSS无论档位都直接响应该系统偏好，影片改静帧，CSS禁用动画、过渡和按钮位移。离开首页、隐藏或最小化时停绘，唤醒后无交互（10秒）降为目标（30fps）；这是实现策略，不是原生或生产性能结论。

### Cards / Containers

内容列表保留选中、星标、多选与键盘焦点状态；详情明确显示保存中、已保存和失败重试。无数据时提供新建入口；筛选无匹配时显示清除筛选，恢复当前列表。删除进入回收站，彻底删除要求确认。正文与属性按真实DOM顺序排列：主列标题和编辑器，232px辅助栏放日期、工具、标签和原有动作；详情容器≤760px时辅助栏移到正文下方，编辑器不重挂载。列表仍可调宽度，搜索有独立清空按钮，待办原有四视图使用分段选择。AI 抽屉用语义颜色与单像素边界，结果预览与原文并列，写回必须有明确操作；快速记录仍可使用独立轻量窗口。设置按外观、模型、模板、快捷键、数据、通用分组。桌面为176px分类栏与有界表单，1000px以下分类横排折行。外观中的字段按24px节奏分组。

素材卡片使用`surface-panel`与`surface-line`，以作品、名称、来源、文件数和标签分层，信息区高度（132px），内边距（12px 14px）；组件提示词入口位于底部右侧。悬停上移（3px），使用共享缓动（280ms），关闭动效或系统减少动态效果时取消位移；正在查看的素材以 `primary` 细边与标题色对应右侧详情；批量选择由复选框和外偏移3px的2px轮廓表示，两种状态互不替代。素材标签使用低强调小圆角底色，不套用节点计数胶囊。素材条保留拖动手柄、封面、删除和左右移动按钮；键盘聚焦时同样显示操作。空态、文件缺失和媒体占位提供可理解的文字入口。素材动效沿用相同设置，关闭时 GIF 使用静帧、视频不自动播放。

## Do's and Don'ts

### Do:

- **Do** 使用已建立的浅色/深色语义变量与场景、阅读表面角色，分别维护操作金、金属青与组织金。
- **Do** 保留不连续暗晶片、内部褶片、集中金色组织与局部冷反光的层次，并同步维护浅色与静态表达。
- **Do** 保持固定六节点、小地图和数字快捷键的对应关系，保留模块内部稳定的内容编辑布局。
- **Do** 为节点、预览、拖动手柄和图标按钮提供可见焦点与中文可访问名称。
- **Do** 从本机真实数据派生计数与列表，保留来源、保存状态和失败反馈。
- **Do** 沿用集中中文文案、统一图标和动效设置，并为关闭动效、媒体失败及渲染失败保留静态路径。

### Don't:

- **Don't** 复制orb/jellyfish研究媒体的像素、纹理、视频帧或源码；海底影片及其静帧仅用于用户本地个人包，不能随MIT源码或公开发布。
- **Don't** 把首页膜体退回空心几何笼、均匀青色网球、径向实心球、包围选择圈或脉冲圈；小地图的功能圆形继续保留。
- **Don't** 把首页虚拟坐标、组织轮廓或景深扩展为所有内容页面的通用构图和卡片样式，或让首页操作层穿透模块内容。
- **Don't** 用动画完成代替保存完成，也不在输入、对话框或菜单中抢占场景快捷键。
- **Don't** 把演示记录写入产品数据，或把尚未验收的性能预算表述为实测通过。
