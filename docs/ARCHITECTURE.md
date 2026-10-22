# Workbench 个人 AI 工作台 —— 代码架构与分批实施方案

## 0.5.0 六类目标整理与单轮过程（2026-10-22）

基于框架 `0023780` 按 Phase 1/2/3 实施；渲染器、背景、依赖与 schema 不变，仍为 commands → services → repo。

- 首页输入框目标顺序：idea/todo/skill/prompt/tip/material；有可用模型时 Enter 定向整理，Tab 循环目标，Ctrl+Enter 直接存灵感。无模型只提供灵感/待办手动保存。输入前缀可同步目标，提交时 target > prefix > model；Rust 仍剥离前缀，并独立保存 target/forced，使显式目标支持最多十条同类结果，旧前缀接口保留单条。
- `capture_analyze_stream(input, onEvent)` 使用请求窗口 Channel 传递阶段、正文 delta、可选 reasoning。只有该流式路径启用 AiService::run_with_reasoning；普通动作/旧 capture_analyze 丢弃推理。两个文本流分别跨增量脱敏，共用输出大小限制，服务层不依赖 Tauri。
- 提示规则追加到用户模板消息之后，模板编辑继续有效。归一化继续以原文范围恢复正文/链接/日期；明确目标只决定类型，低置信度字段仍需确认。Skill/素材空标题链接先预览，由现有 link_fetch_title 补标题，不在自动保存路径联网。
- `useCaptureProcess` 只保存当前一轮内存状态；步骤有相对耗时，推理和原始 JSON 折叠展示，部分 JSON 仅展示 type/title。结束关闭确认后清空，运行收起不取消；输入取消/离开首页才取消请求。runId 保护所有增量和保存/撤销回写，不将过程发入对话、备份或日志。
- `capture.defaultTarget`（EntityType，默认 idea）替代 capture.smartDefault，继续用 setting 表；旧键不读不导出，导入旧备份时忽略。用户手动选择与前缀同步高于默认设置；无模型只映射到可手动目标。

验收与真实服务商边界见 PROGRESS；决定见 DECISIONS。下方为历史架构截面。

## 0.4.1 视觉迭代（2026-10-22）

渲染协议、命令和分层不变。主渲染器使用四层原创程序表面缓存与环境粒子；静态SVG一次性嵌入相同生成表面，在Canvas不可用时退回纯SVG轮廓。motion根状态覆盖Portal与实验室；off无持续绘制。移除外围选择圈，键盘焦点在HTML标签；inactive页面不泄露首页标签。具体实现与证据以PROGRESS和DESIGN当前记录为准。下方0.4.0为导航功能基线。

## 0.4.0 批次 B 已实施扩展（2026-10-21）

基线为 0.3.0 `24a46ef`，当前首页与导航以本节和 PLAN-v0.3 §9–15 为准；下方 A/原架构是历史截面。未新增依赖或迁移，0001/0002/0003 均保持原样。

- AppShell 常驻挂载（按代码块延迟加载）HomeStage，非首页隐藏、inert 并暂停渲染；子路由使用 64px ModuleHeader、小地图与搜索/回收站/设置入口。Sidebar 与其折叠状态已删除。原列表/详情与素材库布局保留，AI 悬浮按钮/抽屉沿用原实现。
- `features/home/scene/types.ts` 是唯一渲染协议；controller 管理 forming/dormant/growing/awake、出生信号、daily/always/never、逐枝 ambient 与逾期 pulse。HTML NodeOverlay/NodePeek 管理命中、标签、数量、260/140ms 预览、键盘焦点与路由，不访问 Canvas 内部。全局数字/Esc 优先级在 lib/keymap.ts；导航统一 flush 自动保存、预加载、镜头与过场，过场期间的新导航意图保留最后一次。
- mountRenderer 在 HTML 提交后的 RAF 才初始化，异步加载原创 Canvas 2D 主渲染器；off 或加载/mount 失败使用静态 SVG。主渲染器只绘制、计时与发 RendererSignal，DPR≤2，10秒无交互降为30fps，页面/原生窗口不可见时取消RAF。原生关闭到托盘与 show_main 发出 main-window-visibility，前端查询窗口真实状态，弥补 WebView2 隐藏时 document.hidden 仍为 false 的差异。场景颜色由 readSceneTheme 读取既有五种语义变量，并观察主题切换。
- useSmartCapture/CapturePreview/CaptureFallback 路径移到 `features/capture`；HomeComposer（导出仍名 QuickInput，保留旧测试入口）复用业务逻辑。Zustand 保存本次运行所选的可用 Key 配置，providerId 仅随分析请求发送，不修改默认服务商。bus.ts 发布类型化生命周期事件，HomeEvents 处理光粒、thinking、光球/反向/落入、通知去重与离开期间的新建反馈。聚合数量在相关光球全部到达后刷新；关闭动效则立即更新。
- `home_overview` 替代并删除 `dashboard_get` 与 Dashboard DTO。命令读取本地日期边界，repo/home 聚合六类数量、逾期数、近七天新增与三条最新内容；不装载素材文件或每个条目的标签。前端使用 `['home']` 查询与 data-changed 协调失效。每日小结入口迁到灵感池工具栏和命令面板。
- `#/__lab/neuron` 仅 DEV 注册，独立舞台用同一渲染器接口测试阶段、节点状态、事件、主题、强度与主/静态切换，`scene-metrics` 是只读的帧率诊断 DOM 事件。生产构建没有实验室路由或页面模块；参考媒体不进入 dist。

| IPC | 输入 | 返回/职责 |
| --- | --- | --- |
| home_overview | 无 | HomeOverview：today、六个 HomeNode，每个含 count/overdue/recent7/latest |
| settings_set | key=`home.intro`，value=daily/always/never | 使用既有 setting 表，默认 daily，不新增迁移 |
| capture_analyze | 既有 providerId 字段 | 使用本次运行选择的可用配置，Rust 原文/链接/日期规则不变 |

`wb.home.introDate` 是本机 localStorage 界面状态，只在 awake 后写入，不进数据库和备份；重播清除该值。appearance.motion 保持 system/full/lite/off，系统减少动画映射到 lite，素材库与首页共享设置。

## 0.3.0 批次 A 已实施扩展（2026-10-21）

本节记录在 `d30fa9b` 上按 `PLAN-v0.3.md` 实施的增量；下方保留原架构基线。神经元首页、导航替换等批次 B 内容尚未实施，今日页与侧栏继续使用。

- 唯一新迁移 `0003_materials.sql`：material、material_asset，以及支持六类实体的 entity_tag。EntityType::Material 统一参与通用星标、标签、搜索、回收站、批量操作、命令面板、AI @ 引用和上下文。FTS 内容含标题、备注、提示词、链接、原文件名；AI 上下文仅文本。
- 分层保持 commands → services → repo。commands/materials.rs 提供素材 CRUD、原生文件路径导入、raw bytes 剪贴板导入、缩略图 raw IPC、排序/封面/删除和存储统计；services/assets.rs 负责文件校验、流式落盘、失败回收、30 天保留、七天孤立文件维护与目录复制；repo/materials.rs 只做 SQL，列表批量装载标签及文件，避免逐条查询。services/capture 不引用 Tauri。
- 原件为 assets/YYYY/MM/<UUID>.<ext>，派生 WebP 为 assets/thumbs/<UUID>.webp。DTO 内相对路径在命令边界经过 owned_path 校验、恢复保留文件后转为绝对路径，WebView 经限定到当前 assets 目录的 asset protocol 读取。所有可写路径拒绝符号链接/Windows reparse point；不接受 SVG。
- 文件复制先写临时同目录文件，流式限量/计算 SHA-256，sync 后改名，然后一次事务写记录。文件操作锁协调完整备份、文件删除、恢复读取和数据目录切换。目录切换复制完整 assets（含保留区），逐文件校验，数据库快照就绪后才切换 bootstrap。
- JSON 仍为 formatVersion=1，新增 schemaVersion=3 与 materials/materialAssets 两个数据集合；旧 schema=1/2 自动补空素材集合。完整包 `.wbbackup` 为 ZIP：manifest(formatVersion=2/schemaVersion=3)、data.json、全部被引用原件与缩略图，含独立文件 SHA 映射；不含 `_purged/`。ZIP 预检与流式解包均有路径、数量、体积及压缩比限制，文件就绪后才应用数据事务。每日七份数据库快照不复制 assets；恢复时优先找回保留文件。
- 前端 `/materials/:id?`，tab=works/components；作品瀑布流每页 60 项，组件网格，详情沿用 useAutosave。文件导入使用 WebView 原生路径事件；粘贴图片使用二进制 IPC；缩略图在 WebView canvas 生成，失败保留原件并显示回退。Windows 缩略图排序额外提供指针手柄以兼容 Tauri 原生拖入处理。
- `appearance.motion` 枚举 system/full/lite/off，system 跟随 prefers-reduced-motion。共享播放池限制同时播放最多四个视频（含详情手动播放的名额），视口阈值 0.6；lite 仅悬停播放视频，off 显示 GIF 静帧且不自动播放视频。没有加入批次 B 的 home.intro 设置或渲染器。
- 组件提示词复用变量表单；复制写系统剪贴板，发送仅填入 Zustand 的 AI composerText，不启动请求。CaptureItem 添加 materialKind/materialPrompt，正文与链接仍按原文核验；默认模板按历史 SHA 有条件升级。Rust DTO 继续由 ts-rs 生成并提交。

完整差异与兼容测试入口见 DECISIONS，验收与真实环境边界见 PROGRESS。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 日期 | 2026-10-18 |
| 依据 | 《PRD：个人 AI 工作台》v1.0 |
| 读者 | Codex（施工方）、产品负责人 |
| 建议存放位置 | 仓库内 `docs/ARCHITECTURE.md` |

---

## 0. 给 Codex 的工作约定（必读）

1. **先通读全文再动手**。本文档是唯一的架构依据；与 PRD 有出入时以本文档为准（本文档已对 PRD 做了取舍和细化）。
2. **按批次施工**：共 3 个批次（第 11 节）。每次只做当前批次范围内的内容，**不要提前实现后续批次的功能**，但必须遵守为后续批次预留的结构（表结构、目录、接口命名）。
3. **不得引入清单外的依赖**（第 2 节）。确有必要时，在 `docs/DECISIONS.md` 中记录理由后再引入。
4. **质量门禁必须全部通过**才算批次完成（第 9.3 节）。不要用 `#[allow(...)]`、`// @ts-ignore`、`any`、跳过测试等方式绕过检查。
5. 每个批次结束时更新 `docs/PROGRESS.md`：已完成项、未完成项及原因、已知问题、手动验收结果。
6. 遇到本文档未覆盖的细节：优先选择**更简单、更易测试**的实现，并记录在 `docs/DECISIONS.md`。
7. 所有用户可见文案为简体中文，且**集中放在 `src/i18n/zh-CN.ts`**，组件中不写硬编码中文字符串（注释除外）。

---

## 1. 关键技术决策

| # | 决策 | 理由 |
| --- | --- | --- |
| D1 | 桌面框架 Tauri 2，Rust 后端 | 体积小、原生全局快捷键/托盘/凭据支持（PRD §6、§7） |
| D2 | 前端 React 19 + TypeScript + Vite，多页面入口（`index.html` 主窗口、`quick.html` 快速记录窗） | 快速记录窗独立、轻量，唤起更快 |
| D3 | **所有数据访问和网络请求都在 Rust 端**；前端只通过 `invoke` 调用命令 | API Key 永不进入前端；避免 CORS；单一数据出口 |
| D4 | SQLite 使用 `rusqlite`（`bundled` 特性），**不使用** `tauri-plugin-sql` | 迁移、事务、FTS 维护都需要在 Rust 内完成；bundled 自带 FTS5 |
| D5 | 全文搜索使用 FTS5 + **`trigram` 分词器**；查询词少于 3 个字符时回退到 `LIKE` | 默认 `unicode61` 分词器无法切分中文；trigram 支持中文子串匹配 |
| D6 | 服务端状态用 TanStack Query，纯 UI 状态用 Zustand | 统一缓存与失效；PRD 建议的 Zustand 用于 UI 状态 |
| D7 | Rust DTO 通过 `ts-rs` 自动生成 TS 类型，生成文件提交到仓库 | 前后端类型单一来源，避免手写不一致 |
| D8 | AI 流式输出使用 Tauri 2 的 `ipc::Channel<T>` 推送增量，而非全局事件 | 按请求隔离、有序、无需手动过滤 |
| D9 | 编辑器使用 CodeMirror 6（`@uiw/react-codemirror`），预览使用 `react-markdown` | 选区坐标、事务式替换（支持撤销）都需要 CM6 的底层 API |
| D10 | 主键 UUID v7（字符串），时间戳为 Unix 毫秒（UTC，`INTEGER`），本地日期字段为 `TEXT 'YYYY-MM-DD'` | v7 有序、利于索引；为未来同步保留基础 |
| D11 | 内容更新采用**整对象替换**（PUT 语义），星标/完成等单字段操作提供独立命令 | 自动保存天然提交整对象；避免 null/缺省歧义 |
| D12 | 每个变更类命令执行成功后，Rust 端向所有窗口广播 `data-changed` 事件 | 快速记录窗写入后主窗口立即刷新（验收 #1） |

**PRD 待确认问题的默认决策**（如有不同意见，修改此处后再施工）：

1. 应用名与图标：暂用 `Workbench`，标识符 `com.workbench.app`。名称集中在 `tauri.conf.json` 与 `src/i18n/zh-CN.ts` 的 `app.name`，图标先用占位图（`pnpm tauri icon` 生成）。
2. 数据库加密：v1 **不加密**，只保护 API Key。数据库打开逻辑集中在 `db::open()`，日后可切换 `rusqlite` 的 `bundled-sqlcipher` 特性。
3. 多设备同步：v1 不做。UUID v7 + `created_at/updated_at/deleted_at`（软删除）已满足未来增量同步的基础，**不预先加** `version/device_id`，需要时通过迁移添加。

---

## 2. 技术栈与依赖清单

> 版本原则：使用施工时各库**最新稳定版**，主版本号不低于下表，并由 lockfile 锁定。

### 2.1 前端（`package.json`）

| 类别 | 依赖 |
| --- | --- |
| 基础 | `react@19`、`react-dom@19`、`typescript@5`、`vite`、`@vitejs/plugin-react` |
| Tauri | `@tauri-apps/api@2`、`@tauri-apps/cli@2`（dev）、`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-opener`、`@tauri-apps/plugin-clipboard-manager`；批次 3 增加 `@tauri-apps/plugin-notification` |
| 路由 | `react-router@7`（使用 Hash 路由） |
| 状态 | `@tanstack/react-query@5`、`zustand@5` |
| UI | `tailwindcss@4`、`@tailwindcss/vite`、shadcn/ui（按需生成到 `src/components/ui`，依赖 Radix）、`lucide-react`、`sonner`（toast）、`cmdk`（命令面板）、`react-resizable-panels` |
| 列表 | `@tanstack/react-virtual` |
| 编辑器 | `@uiw/react-codemirror`、`@codemirror/lang-markdown`、`@codemirror/language-data` |
| Markdown 渲染 | `react-markdown`、`remark-gfm`、`rehype-highlight`（**不启用** `rehype-raw`，禁止渲染原始 HTML） |
| 工具 | `diff`（jsdiff）、`date-fns`、`tinykeys`、`clsx`、`tailwind-merge` |
| 开发 | `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/user-event`、`eslint@9`（flat config）、`typescript-eslint`、`eslint-plugin-react-hooks`、`prettier`、`prettier-plugin-tailwindcss` |

包管理器：**pnpm**。Node 22 LTS。

### 2.2 后端（`src-tauri/Cargo.toml`）

| 类别 | 依赖 |
| --- | --- |
| Tauri | `tauri@2`（features: `tray-icon`）、`tauri-build@2` |
| 插件 | `tauri-plugin-global-shortcut`、`tauri-plugin-single-instance`、`tauri-plugin-dialog`、`tauri-plugin-opener`、`tauri-plugin-clipboard-manager`、`tauri-plugin-window-state`、`tauri-plugin-log`；批次 3 增加 `tauri-plugin-notification` |
| 数据库 | `rusqlite`（features: `bundled`） |
| 序列化 | `serde`（derive）、`serde_json`、`serde_yaml_ng`（解析 frontmatter） |
| 错误 | `thiserror` |
| 基础 | `uuid`（features: `v7`）、`chrono`、`regex`、`once_cell`（或 std `LazyLock`）、`parking_lot` |
| 密钥 | `keyring@3`（features: `windows-native`、`apple-native`）—— **注意：不开启平台特性时 keyring 会静默使用内存 mock 存储，务必开启** |
| 网络 | `reqwest@0.12`（`default-features = false`，features: `json`、`stream`、`rustls-tls-native-roots`）、`tokio`（features: `rt`、`time`、`sync`、`macros`）、`tokio-util`（`CancellationToken`）、`futures-util`、`html-escape` |
| 类型导出 | `ts-rs` |
| 开发 | `wiremock`（模拟 OpenAI 兼容服务）、`tempfile` |

---

## 3. 开发环境准备（产品负责人执行一次）

1. **项目目录放在纯英文路径、且不在 OneDrive 同步目录内**，例如 `D:\dev\workbench`。原因：`node_modules`、`src-tauri/target` 体积巨大，OneDrive 同步会严重拖慢构建并导致文件锁定；部分构建工具对非 ASCII 路径支持不佳。
2. 安装：Rust stable（MSVC 工具链）、Visual Studio Build Tools（勾选"使用 C++ 的桌面开发"）、Node 22 LTS、pnpm（`npm i -g pnpm`）。Windows 11 已自带 WebView2。
3. 验证：`rustc -V`、`cargo -V`、`node -v`、`pnpm -v` 均可输出版本。

---

## 4. 总体架构

### 4.1 分层

```text
┌──────────────────────── WebView（React）────────────────────────┐
│  pages / features（各模块 UI）                                    │
│      │ 使用                                                       │
│  hooks（TanStack Query 查询/变更）  stores（Zustand UI 状态）      │
│      │                                                            │
│  lib/api/*（类型化 invoke 封装，唯一调用后端的地方）               │
└──────┬────────────────────────────────────────▲──────────────────┘
       │ invoke(command, { input })             │ data-changed 事件 / AI Channel
┌──────▼────────────────────────────────────────┴── Rust（Tauri）──┐
│  commands/*   薄层：参数校验 → 调用 service/repo → 发事件 → 映射错误│
│      │                                                            │
│  services/*   业务逻辑：AI、密钥、导入导出、Skill 解析、链接抓取…   │
│      │                                                            │
│  repo/*       纯 SQL，只接收 &Connection / &Transaction，可单测     │
│      │                                                            │
│  db           连接、PRAGMA、迁移                                  │
│  desktop/*    托盘、全局快捷键、窗口管理                           │
└───────────────────────────────────────────────────────────────────┘
        │ SQLite 文件            │ OS 凭据管理器         │ HTTPS → 用户配置的 AI 地址
```

**依赖方向严格单向**：`commands → services → repo → db`。`repo` 不得依赖 `tauri`；`services` 除 AI 流式输出需要 `Channel` 外不依赖 `tauri`。

### 4.2 进程与窗口模型

| 窗口 label | 入口 | 说明 |
| --- | --- | --- |
| `main` | `index.html` | 主界面。关闭时若开启"驻留托盘"则隐藏而非退出 |
| `quick` | `quick.html` | 快速记录小窗。**应用启动时即创建并隐藏**，快捷键只做 show/hide，保证 < 300ms |

- 应用单实例（`tauri-plugin-single-instance`）：第二次启动时显示并聚焦已有主窗口。
- 系统托盘：左键单击显示主窗口；菜单项：显示主窗口 / 快速记录 / 退出。

### 4.3 数据变更广播

```text
任意窗口调用变更命令 ──► Rust 写库（事务内同步维护 FTS）──► app.emit("data-changed", payload)
                                                              │
                         所有窗口 lib/events.ts 监听 ◄────────┘
                         └► queryClient.invalidateQueries(对应 key + dashboard + search + trash)
```

`payload = { entity: "idea" | "todo" | "tip" | "skill" | "prompt" | "tag" | "provider" | "setting" | "all", op: "create" | "update" | "delete" | "restore" | "purge" | "import" }`

---

## 5. 目录结构

```text
workbench/
├── docs/
│   ├── ARCHITECTURE.md          # 本文档
│   ├── PROGRESS.md              # 每批次进度与验收记录
│   └── DECISIONS.md             # 施工中的补充决策
├── index.html                   # 主窗口入口 HTML
├── quick.html                   # 快速记录窗入口 HTML
├── package.json / pnpm-lock.yaml
├── vite.config.ts               # 多页面：build.rollupOptions.input = { main, quick }
├── tsconfig.json / tsconfig.node.json
├── eslint.config.js / .prettierrc / components.json(shadcn)
├── tests/fixtures/
│   └── template_cases.json      # {{变量}} 解析/渲染的共享用例，前后端测试共用
├── src/
│   ├── main.tsx                 # 主窗口挂载
│   ├── quick.tsx                # 快速记录窗挂载（只引入必要依赖）
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx           # createHashRouter，路由组件 lazy 加载
│   │   ├── providers.tsx        # QueryClient、主题、Toaster、全局快捷键
│   │   └── layout/
│   │       ├── AppShell.tsx     # 左导航 + 中列表 + 右详情（可拖拽调宽）+ AI 抽屉
│   │       ├── Sidebar.tsx
│   │       └── ThreePane.tsx    # 通用三栏容器：list / detail 插槽
│   ├── features/
│   │   ├── dashboard/           # 今日
│   │   ├── ideas/
│   │   ├── todos/
│   │   ├── tips/
│   │   ├── skills/
│   │   ├── prompts/
│   │   ├── search/              # CommandPalette（Ctrl+K）
│   │   ├── trash/               # 回收站
│   │   ├── settings/            # 外观/标签/模型/AI 模板/快捷键/数据/通用
│   │   ├── ai/                  # 批次 2：AiDrawer、SelectionToolbar、BatchBar、DiffView、ResultView、useAiRun
│   │   └── quick-capture/       # 快速记录窗 UI
│   │   # 每个 feature 内部约定：
│   │   #   XxxPage.tsx  XxxList.tsx  XxxDetail.tsx  hooks.ts（Query 封装）  components/
│   ├── components/
│   │   ├── ui/                  # shadcn 生成组件，尽量不改
│   │   ├── editor/              # MarkdownEditor、MarkdownPreview、EditorPane（编辑/预览/分屏）
│   │   └── common/              # TagInput、StarButton、ConfirmDialog、EmptyState、SaveIndicator、MultiSelectList…
│   ├── lib/
│   │   ├── api/                 # 每个领域一个文件：ideas.ts、todos.ts…；invoke 的唯一出口
│   │   ├── ipc.ts               # invoke 包装：统一错误转换为 AppError
│   │   ├── events.ts            # data-changed 监听 → 失效查询
│   │   ├── query-keys.ts
│   │   ├── template.ts          # {{变量}} 解析与渲染（与 Rust 实现共用测试用例）
│   │   ├── date.ts              # 本地日期工具、按天分组
│   │   ├── highlight.ts         # 搜索关键词高亮
│   │   ├── keymap.ts            # 应用内快捷键注册
│   │   └── utils.ts             # cn() 等
│   ├── stores/                  # Zustand：ui.ts（AI 抽屉开关、多选状态、列表视图模式等）、theme.ts
│   ├── i18n/
│   │   ├── zh-CN.ts             # 全部文案（含错误码 → 中文提示）
│   │   └── index.ts             # t(key, params) 类型安全取值
│   ├── types/bindings/          # ts-rs 生成，禁止手改
│   └── styles/globals.css       # Tailwind + 主题 CSS 变量
└── src-tauri/
    ├── Cargo.toml / build.rs / tauri.conf.json
    ├── .cargo/config.toml       # [env] TS_RS_EXPORT_DIR = { value = "../src/types/bindings", relative = true }
    ├── capabilities/
    │   ├── main.json            # 主窗口权限
    │   └── quick.json           # 快速记录窗最小权限
    ├── migrations/
    │   ├── 0001_init.sql        # 批次 1
    │   └── 0002_v02.sql         # 批次 3
    ├── templates/               # 批次 2：内置 AI 操作默认模板（*.md，include_str! 嵌入）
    ├── icons/
    └── src/
        ├── main.rs              # 仅调用 lib::run()
        ├── lib.rs               # Builder：插件、State、setup、invoke_handler 注册
        ├── error.rs             # AppError / ErrorCode
        ├── state.rs             # AppState
        ├── paths.rs             # 数据目录解析（bootstrap.json）
        ├── events.rs            # emit_data_changed()
        ├── db/
        │   ├── mod.rs           # Db：open()、with_conn()、with_tx()
        │   └── migrate.rs       # 基于 PRAGMA user_version 的迁移
        ├── domain/              # 实体与 DTO（derive Serialize/Deserialize/TS）
        │   ├── common.rs        # EntityType、EntityRef、Page<T>、Tag
        │   ├── idea.rs todo.rs tip.rs skill.rs prompt.rs provider.rs settings.rs search.rs ai.rs
        ├── repo/
        │   ├── common.rs        # 软删除、星标、标签关联等通用 SQL
        │   ├── ideas.rs todos.rs tips.rs skills.rs prompts.rs tags.rs
        │   ├── search.rs        # FTS 索引维护与查询
        │   ├── trash.rs dashboard.rs settings.rs providers.rs
        ├── services/
        │   ├── template.rs      # {{变量}} 解析/渲染
        │   ├── skill_parse.rs   # frontmatter 解析
        │   ├── link_meta.rs     # 抓取网页标题
        │   ├── export.rs / import.rs
        │   ├── secrets.rs       # 批次 2：keyring 封装
        │   └── ai/              # 批次 2
        │       ├── mod.rs       # AiService：http client、进行中请求表
        │       ├── client.rs    # chat/completions、/models
        │       ├── sse.rs       # SSE 增量解析（纯函数，可单测）
        │       ├── actions.rs   # 内置操作注册表
        │       ├── context.rs   # 把条目拼装为模型输入、长度截断
        │       └── parse.rs     # JSON/标签块的容错提取
        ├── commands/            # 每领域一个文件，函数名 = 命令名
        │   ├── ideas.rs todos.rs tips.rs skills.rs prompts.rs tags.rs search.rs trash.rs
        │   ├── dashboard.rs settings.rs app.rs data.rs providers.rs ai.rs
        └── desktop/
            ├── tray.rs
            ├── shortcut.rs      # 全局快捷键注册/重注册/冲突报告
            └── windows.rs       # quick 窗显示/隐藏、主窗口关闭行为
```

---

## 6. 后端设计（Rust）

### 6.1 AppState 与数据库访问

```rust
pub struct AppState {
    pub db: Db,                 // 内部 Arc<parking_lot::Mutex<rusqlite::Connection>>
    pub paths: AppPaths,        // data_dir、db_path、backups_dir
    pub ai: AiService,          // 批次 2
    pub secrets: SecretStore,   // 批次 2
}

impl Db {
    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> AppResult<T>) -> AppResult<T>;
    pub fn with_tx<T>(&self, f: impl FnOnce(&Transaction) -> AppResult<T>) -> AppResult<T>;
}
```

- 打开连接后设置：`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`
- 单连接 + 互斥锁即可（单用户）。**锁内禁止 `.await`**。
- 数据库类命令声明为 `#[tauri::command(async)]` 的同步函数（在线程池执行，不阻塞主线程）；网络类命令声明为 `async fn`。
- 每个变更命令只开一个事务；FTS 维护在同一事务内完成。

### 6.2 错误模型

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError { /* 各变体，内部可携带 source */ }

// 序列化给前端的形状（ts-rs 导出）
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorPayload { pub code: ErrorCode, pub message: String, pub detail: Option<String> }
```

`ErrorCode` 枚举（前端在 `zh-CN.ts` 中把 code 映射为中文提示，`message` 仅作开发诊断）：

| code | 含义 |
| --- | --- |
| `NOT_FOUND` / `VALIDATION` / `CONFLICT` | 通用 |
| `DB` / `IO` / `INTERNAL` | 内部错误 |
| `SECRET_STORE` | 凭据管理器读写失败 |
| `SHORTCUT_CONFLICT` / `SHORTCUT_INVALID` | 快捷键被占用 / 格式非法 |
| `NETWORK` / `TIMEOUT` | 网络不可达 / 超时 |
| `AI_NO_PROVIDER` / `AI_NO_KEY` | 未配置模型 / 未填写 Key |
| `AI_AUTH`（401/403） / `AI_ENDPOINT`（404） / `AI_RATE_LIMIT`（429） / `AI_PROVIDER`（其他非 2xx） / `AI_BAD_RESPONSE`（无法解析） | AI 调用 |
| `IMPORT_INVALID` | 导入文件格式/版本不符 |

规则：非测试代码禁止 `unwrap()/expect()`（启动阶段不可恢复的错误除外，需注释说明）；错误日志中禁止出现 API Key、Authorization 头和完整请求体。

### 6.3 迁移机制

- `migrations/*.sql` 通过 `include_str!` 嵌入，按序号排列于一个静态数组。
- 启动时读取 `PRAGMA user_version`，在单个事务中依次执行未应用的迁移，并设置新的 `user_version`。
- 迁移失败：先把原库复制为 `backups/pre-migrate-<时间戳>.db`，再返回错误并在界面提示；不得留下半迁移状态。
- 单元测试：空库执行全部迁移；对每个迁移检查幂等保护（重复启动不重复执行）。

### 6.4 数据库 Schema

#### `0001_init.sql`（批次 1）

```sql
-- 通用约定：id 为 UUID v7 字符串；*_at 为 Unix 毫秒(UTC)；本地日期为 'YYYY-MM-DD'
-- origin_type/origin_id：转化来源（如由某条灵感转化而来）

CREATE TABLE idea (
  id          TEXT PRIMARY KEY,
  content_md  TEXT    NOT NULL DEFAULT '',
  date        TEXT    NOT NULL,
  is_starred  INTEGER NOT NULL DEFAULT 0,
  origin_type TEXT,
  origin_id   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX idx_idea_list ON idea(deleted_at, date DESC, created_at DESC);

CREATE TABLE todo (
  id           TEXT PRIMARY KEY,
  title        TEXT    NOT NULL,
  note_md      TEXT    NOT NULL DEFAULT '',
  due_date     TEXT,
  priority     INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)),   -- 1高 2中 3低
  status       TEXT    NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  completed_at INTEGER,
  parent_id    TEXT REFERENCES todo(id) ON DELETE CASCADE,                -- 批次 3 启用子任务
  sort_order   REAL    NOT NULL DEFAULT 0,
  is_starred   INTEGER NOT NULL DEFAULT 0,
  origin_type  TEXT,
  origin_id    TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
);
CREATE INDEX idx_todo_list   ON todo(deleted_at, status, due_date);
CREATE INDEX idx_todo_parent ON todo(parent_id);

CREATE TABLE tip (
  id          TEXT PRIMARY KEY,
  title       TEXT    NOT NULL DEFAULT '',
  content_md  TEXT    NOT NULL DEFAULT '',
  tools       TEXT    NOT NULL DEFAULT '[]',     -- JSON 字符串数组
  source_url  TEXT,
  is_starred  INTEGER NOT NULL DEFAULT 0,
  origin_type TEXT,
  origin_id   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX idx_tip_list ON tip(deleted_at, updated_at DESC);

CREATE TABLE skill (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL DEFAULT '',
  description TEXT    NOT NULL DEFAULT '',
  source_type TEXT    NOT NULL DEFAULT 'md' CHECK (source_type IN ('md', 'url', 'both')),
  content_md  TEXT,                              -- 保存原文（含 frontmatter）
  url         TEXT,
  platforms   TEXT    NOT NULL DEFAULT '[]',     -- JSON 字符串数组
  rating      INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  note        TEXT    NOT NULL DEFAULT '',
  is_starred  INTEGER NOT NULL DEFAULT 0,
  origin_type TEXT,
  origin_id   TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
CREATE INDEX idx_skill_list ON skill(deleted_at, updated_at DESC);

CREATE TABLE prompt (
  id                 TEXT PRIMARY KEY,
  title              TEXT    NOT NULL DEFAULT '',
  body               TEXT    NOT NULL DEFAULT '',
  system_prompt      TEXT,                        -- 可选系统提示；内置 AI 模板使用
  variables          TEXT    NOT NULL DEFAULT '[]',  -- 保存时由后端从 body 解析
  category           TEXT    NOT NULL DEFAULT '',
  target_model       TEXT,
  use_count          INTEGER NOT NULL DEFAULT 0,
  is_system_template INTEGER NOT NULL DEFAULT 0,
  template_key       TEXT UNIQUE,                 -- 内置模板对应的 AI 操作 key
  is_starred         INTEGER NOT NULL DEFAULT 0,
  origin_type        TEXT,
  origin_id          TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);
CREATE INDEX idx_prompt_list ON prompt(deleted_at, is_system_template, updated_at DESC);

CREATE TABLE tag (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color      TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE entity_tag (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('idea', 'todo', 'tip', 'skill', 'prompt')),
  entity_id   TEXT NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_type, entity_id, tag_id)
);
CREATE INDEX idx_entity_tag_tag ON entity_tag(tag_id);

-- API Key 不在此表，存于系统凭据管理器
CREATE TABLE ai_provider (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  base_url    TEXT    NOT NULL,
  model       TEXT    NOT NULL,
  temperature REAL    NOT NULL DEFAULT 0.7,
  max_tokens  INTEGER,
  is_default  INTEGER NOT NULL DEFAULT 0,
  sort_order  REAL    NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL            -- JSON
);

CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id   UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'trigram'
);
```

#### `0002_v02.sql`（批次 3）

```sql
ALTER TABLE todo ADD COLUMN remind_at   INTEGER;   -- 提醒时间
ALTER TABLE todo ADD COLUMN reminded_at INTEGER;   -- 已提醒时间，防重复

CREATE TABLE prompt_version (
  id            TEXT PRIMARY KEY,
  prompt_id     TEXT NOT NULL REFERENCES prompt(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  system_prompt TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_prompt_version ON prompt_version(prompt_id, created_at DESC);

CREATE TABLE ai_conversation (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  provider_id TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE ai_message (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content         TEXT NOT NULL,
  refs            TEXT NOT NULL DEFAULT '[]',   -- @ 引用的 EntityRef JSON 数组
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_ai_message_conv ON ai_message(conversation_id, created_at);
```

### 6.5 领域与 DTO 约定

- 所有 DTO：`#[derive(Serialize, Deserialize, TS)]`、`#[serde(rename_all = "camelCase")]`、`#[ts(export)]`。
- **`i64` 时间戳必须标注 `#[ts(type = "number")]`**（ts-rs 默认把 i64 导出为 `bigint`）。
- JSON 数组列（`tools`、`platforms`、`variables`）在 repo 层转换为 `Vec<String>`，前端看不到 JSON 字符串。
- 公共类型：

```rust
pub enum EntityType { Idea, Todo, Tip, Skill, Prompt }          // serde: lowercase
pub struct EntityRef { pub entity_type: EntityType, pub id: String }
pub struct Page<T> { pub items: Vec<T>, pub total: u32 }        // offset/limit 分页，limit 默认 50
pub struct Tag { pub id: String, pub name: String, pub color: Option<String> }
pub struct Origin { pub entity_type: EntityType, pub id: String }
```

- 每个实体返回对象都带 `tags: Vec<Tag>` 与 `origin: Option<Origin>`。
- 写入输入（例：`IdeaInput { content_md, date, tags: Vec<String> }`）中标签用**名称**传递，repo 内部 upsert 标签并重建关联。
- 字段校验（在 command 层统一做）：文本字段单个上限 1 MB；待办标题必填且 ≤ 500 字；URL 必须是 `http/https`；日期必须匹配 `YYYY-MM-DD`；评分 1–5。

### 6.6 Repository 约定

- 函数签名形如 `pub fn create(tx: &Transaction, input: &IdeaInput, now: i64, today: &str) -> AppResult<Idea>`。**时间与"今天"由调用方传入**，以便测试。
- 列表查询默认 `deleted_at IS NULL`。
- `repo/common.rs` 提供按 `EntityType` 参数化的：`soft_delete`、`restore`、`hard_delete`、`set_starred`、`set_tags`、`load_tags_for(ids)`（批量加载，避免 N+1）。
- 软删除父待办时，同时软删除其子待办。
- 硬删除时同时删除 `entity_tag` 关联与 `search_index` 行。

### 6.7 全文搜索（`repo/search.rs`）

**索引维护**（应用层维护，不使用触发器）：

| 实体 | title 列 | body 列 |
| --- | --- | --- |
| idea | 正文首行（去掉 Markdown 标记，≤ 80 字） | content_md |
| todo | title | note_md |
| tip | title | content_md + tools |
| skill | name | description + content_md + note + url |
| prompt | title | body + category |

- `tags` 列为该条目标签名用空格拼接。
- 每个写路径（创建/更新/改标签/恢复）调用 `search::upsert(tx, ref)`：先删除旧行，再写新行；软删除和硬删除调用 `search::remove`；标签改名/删除时对受影响条目重建索引；导入后调用 `search::rebuild_all(tx)`。
- **内置 AI 模板（`is_system_template = 1`）不进入索引。**

**查询**：

1. 将输入按空白切分为关键词（最多 5 个）。
2. 若全部关键词长度 ≥ 3 个字符：`search_index MATCH '"kw1" AND "kw2"'`（关键词中的 `"` 转义为 `""`），按 `bm25()` 排序。
3. 否则：对每个关键词 `(title LIKE ? OR body LIKE ? OR tags LIKE ?)` 用 AND 连接（需转义 `%`、`_`），按实体 `updated_at` 排序。1 万条规模下全表扫描可满足 < 200ms。
4. 返回 `SearchHit { entity_type, id, title, snippet, updated_at }`，每类最多 `limit_per_type`（默认 8）条。`snippet` 在 Rust 中按**字符**（非字节）截取首个命中位置前后约 40 字。关键词高亮由前端完成。
5. 性能测试：`#[ignore]` 测试插入 1 万条混合中英文数据，断言查询 < 200ms（release 模式手动运行 `cargo test --release -- --ignored`）。

### 6.8 IPC 命令清单

规则：命令名 `领域_动作`（snake_case）；**除 `State`/`AppHandle`/`Channel` 外，最多一个业务参数，命名为 `input`**（前端统一 `invoke(name, { input })`，避免大小写映射问题）；变更类命令成功后调用 `events::emit_data_changed`。

**批次 1**

| 命令 | 输入 → 输出 |
| --- | --- |
| `app_info` | → `{ version, dataDir, dbPath }` |
| `settings_get_all` / `settings_set` | → `Settings` / `{ key, value }` → `Settings` |
| `tag_list` / `tag_rename` / `tag_delete` / `tag_set_color` | 标签管理（`tag_list` 返回含使用次数） |
| `idea_list` | `{ dateFrom?, dateTo?, tag?, starredOnly?, offset, limit }` → `Page<Idea>` |
| `idea_get` / `idea_create` / `idea_update` / `idea_set_starred` / `idea_delete` | 常规 CRUD（delete 为软删除） |
| `idea_convert` | `{ id, target: "todo" \| "tip" \| "prompt" }` → `EntityRef`（新条目的 origin 指向该灵感） |
| `todo_list` | `{ view: "today" \| "next7" \| "all" \| "done", tag?, offset, limit }` → `Page<Todo>` |
| `todo_get` / `todo_create` / `todo_update` / `todo_toggle_done` / `todo_delete` | 常规 |
| `tip_list` | `{ tool?, tag?, starredOnly?, offset, limit }` → `Page<Tip>` |
| `tip_get` / `tip_create` / `tip_update` / `tip_set_starred` / `tip_delete` | 常规 |
| `skill_list` / `skill_get` / `skill_create` / `skill_update` / `skill_set_starred` / `skill_delete` | 常规 |
| `skill_parse_markdown` | `{ content }` → `{ name?, description?, hasFrontmatter }` |
| `skill_read_md_file` | `{ path }` → `{ content, parsed }`（仅允许 `.md`，≤ 1 MB） |
| `skill_export_md` / `skill_export_folder` | `{ id, path }` / `{ id, dir }` → 写出的文件路径 |
| `link_fetch_title` | `{ url }` → `Option<String>`（async，5 秒超时） |
| `prompt_list` | `{ category?, tag?, starredOnly?, systemOnly?, offset, limit }`（默认不含系统模板） |
| `prompt_get` / `prompt_create` / `prompt_update` / `prompt_set_starred` / `prompt_delete` | 常规（系统模板禁止删除） |
| `prompt_record_use` / `prompt_categories` | 使用次数 +1 / 已有分类列表 |
| `entity_bulk_delete` / `entity_bulk_add_tags` | `{ refs }` / `{ refs, tags }` |
| `dashboard_get` | → `{ today, todos, ideas, recentTips, recentSkills, recentPrompts }` |
| `search_query` | `{ q, limitPerType? }` → `SearchHit[]` |
| `trash_list` / `trash_restore` / `trash_purge` / `trash_empty` | 回收站 |

**批次 2**

| 命令 | 说明 |
| --- | --- |
| `provider_list` | → `ProviderView[]`（含 `hasKey: bool`、`keyHint: "sk-…abcd"`，**永不返回完整 Key**） |
| `provider_save` | `{ id?, name, baseUrl, model, temperature, maxTokens?, apiKey?: string \| null }`：`apiKey` 缺省=不变，空字符串=清除，非空=写入凭据管理器 |
| `provider_delete` / `provider_set_default` | 删除时同步删除凭据 |
| `provider_test` | `{ providerId?, baseUrl, model, apiKey? }` → `{ ok, latencyMs, error? }`（支持保存前用表单中的 Key 测试） |
| `provider_fetch_models` | 同上 → `string[]` |
| `ai_run_action` | `{ requestId, action, providerId?, input: { kind: "text", text } \| { kind: "entities", refs } , extra? }` + `onEvent: Channel<AiStreamEvent>` |
| `ai_chat` | `{ requestId, providerId?, messages: ChatMessage[] }` + `onEvent` |
| `ai_cancel` | `{ requestId }` |
| `ai_template_list` / `ai_template_reset` | 内置模板列表 / 恢复默认（编辑使用 `prompt_update`） |
| `data_export_json` / `data_import_json` | `{ path }` / `{ path, mode: "merge" \| "overwrite" }` → `ImportReport` |
| `data_open_dir` / `data_change_dir` | 打开数据目录 / 迁移数据目录（需重启） |
| `shortcut_update` | `{ action, accelerator }`：重新注册全局快捷键，失败返回 `SHORTCUT_CONFLICT` |
| `window_show_main` | 显示并聚焦主窗口 |

**批次 3**：见第 11.3 节。

**智能整理（v0.2.1）**：详细约定见 [ADDENDUM-smart-capture.md](ADDENDUM-smart-capture.md)。

| 命令 | 输入 → 输出 |
| --- | --- |
| `capture_analyze` | `{ requestId, providerId?, text }` → `CapturePreview`；只分析，不写库 |
| `capture_commit` | `{ items: CaptureItem[] }` → `{ refs, createdAt }`；一次事务保存五类条目 |
| `capture_undo` | `{ refs, createdAt }` → `{ removed, skipped }`；彻底删除未编辑的本批条目 |

### 6.9 内置 AI 模板与模板语法

- 变量语法 `{{name}}`：正则 `\{\{\s*([^{}\n]+?)\s*\}\}`，变量名去除首尾空白，按首次出现顺序去重；支持中文变量名；未填写的变量渲染时保留原样（前端提示）。
- Rust（`services/template.rs`）与 TS（`lib/template.ts`）各实现一份，**两边测试都读取 `tests/fixtures/template_cases.json`** 保证行为一致。用例至少覆盖：空白、重复变量、中文名、相邻变量、未闭合花括号、多行。
- 内置模板存于 `prompt` 表，`is_system_template = 1`、`category = "系统模板"`、`template_key = 操作 key`。启动时 `seed_system_templates()`：缺失的模板用 `templates/*.md` 默认内容补齐，**已存在的不覆盖**（保留用户修改）。"恢复默认"仅覆盖该条。
- 模板可用变量：`{{input}}`（单段文本）、`{{items}}`（多条目拼装文本）、`{{existing_tags}}`（已有标签，最多 200 个，逗号分隔）、`{{today}}`。

### 6.10 AI 服务（批次 2）

**调用**

- `POST {base_url}/chat/completions`，`base_url` 去掉末尾 `/`；请求体 `{ model, messages, stream: true, temperature, max_tokens? }`（`max_tokens` 为空则不发送；不发送 `stream_options` 等非通用字段）。
- Key 读取：`SecretStore::get(provider_id)`，仅在构造请求头时使用，不写日志、不回传前端。
- `reqwest::Client` 缓存在 `AiService` 中；代理设置变化时重建。代理模式：`system`（reqwest 默认行为）/ `none`（`no_proxy()`）/ `custom`（`Proxy::all(url)`）。
- 超时：连接 10 秒；首个数据块 60 秒；数据块间空闲 60 秒（对每次 `stream.next()` 使用 `tokio::time::timeout`）。

**SSE 解析（`sse.rs`，纯函数 + 单测）**

- 维护字节缓冲，按行切分（兼容 `\r\n`），累计 `data:` 行，遇空行派发一个事件；流结束时冲刷剩余数据。
- `data: [DONE]` 结束；每个事件 JSON 取 `choices[0].delta.content`；忽略 `reasoning_content` 等扩展字段；事件 JSON 中出现 `error` 字段时按错误处理。
- 单测：一个 JSON 被拆成多个网络块、多个事件在同一块、`\r\n`、空 delta、`[DONE]`、错误事件。

**错误映射**：401/403 → `AI_AUTH`；404 → `AI_ENDPOINT`（提示"请检查 Base URL，通常以 /v1 结尾"）；429 → `AI_RATE_LIMIT`；其他非 2xx → `AI_PROVIDER`（`detail` 取响应体 `error.message`，最多 500 字）；超时 → `TIMEOUT`；连接失败 → `NETWORK`。

**流事件与取消**

```rust
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiStreamEvent {
    Started { model: String },
    Delta { text: String },
    Done { finish_reason: Option<String> },
    Cancelled,
    Error { error: AppErrorPayload },
}
```

- `AiService` 持有 `Mutex<HashMap<String, CancellationToken>>`；`ai_cancel` 触发 token，流循环 `tokio::select!` 监听后发送 `Cancelled`。请求结束（任何路径）都要从表中移除。
- 测试连接：非流式请求，`messages=[{role:user, content:"ping"}]`、`max_tokens=16`，返回耗时与错误。
- 拉取模型：`GET {base_url}/models`，读取 `data[].id` 并排序。

**内置操作注册表（`actions.rs`）**

| key | 名称 | 输入 | 输出类型 | 入口 | 批次 |
| --- | --- | --- | --- | --- | --- |
| `polish` | 润色优化 | 选区文本 / 单条 | `rewrite` | 选区工具栏、右键菜单 | 2 |
| `shorten` | 精简 | 同上 | `rewrite` | 同上 | 2 |
| `expand` | 扩写 | 同上 | `rewrite` | 同上 | 2 |
| `summarize` | 总结要点 | 单条 / 多条 | `markdown` | 右键、批量栏 | 2 |
| `categorize` | 归类整理 | 多条灵感/技巧 | `markdown` | 批量栏 | 2 |
| `merge_note` | 合并为一篇笔记 | 多条灵感 | `markdown` | 批量栏 | 2 |
| `title_tags` | 生成标题与标签 | 单条 | `json`：`{ title, tags[] }` | 详情页 AI 菜单 | 2 |
| `extract_tip` | 提炼技巧卡片 | 原始文本 | `tip_card`（Markdown，首行 `# 标题`） | 技巧页"AI 提炼"、灵感右键 | 2 |
| `optimize_prompt` | 优化提示词 | 提示词正文 | `rewrite` + 修改说明（输出用 `<optimized>`、`<changes>` 标签包裹） | 提示词详情 | 2 |
| `skill_describe` | 生成 Skill 简介与标签 | Skill 内容 | `json`：`{ description, tags[] }` | Skill 详情 | 2 |
| `breakdown_todos` | 拆解待办 | 一段描述 | `json`：`[{ title, note?, dueDate?, priority? }]` | 待办页 | 3 |
| `daily_summary` | 每日小结 | 当天灵感 + 待办完成情况 | `markdown` | 今日页 | 3 |
| `smart_capture` | 智能整理 | 今日页输入原文 | `CapturePreview`（由 capture 服务校验） | 今日页快速输入，不进入 AI 菜单 | 0.2.1 |

- `context.rs`：多条目拼装为 `### 条目 N（类型 · 日期）\n内容\n\n`；总长度上限默认 24,000 字符，超限按比例截断各条目并在末尾注明"（部分内容已截断）"，前端同时提示。
- `parse.rs`：JSON 输出容错提取——去除 ```` ```json ```` 围栏、截取首个 `{…}`/`[…]` 后再解析；失败时前端展示原文并提供"重新生成"。

### 6.11 密钥存储（批次 2，`services/secrets.rs`）

- `keyring::Entry::new("com.workbench.app", &format!("ai-provider:{id}"))`。
- 提供 `set/get/delete/has`；`keyHint` 由后端计算（前 3 位 + `…` + 后 4 位）。
- 不提供"显示已保存 Key"功能；用户需要修改时重新输入。前端输入框保存成功后立即清空。
- 导出 JSON **不包含** Key；导入后的 provider 显示"需重新填写 Key"。

### 6.12 桌面集成（批次 2，`desktop/`）

- **全局快捷键**：`tauri-plugin-global-shortcut`，在 `setup` 中从设置读取 `shortcut.quickCapture`（默认 `Alt+Space`）注册；仅响应 `ShortcutState::Pressed`。注册失败（被系统或 PowerToys 等占用）时**不得崩溃**：记录状态，在设置页显示冲突提示并建议改用 `Ctrl+Alt+Space` 等。修改快捷键时先注册新的，成功后再注销旧的。
- **quick 窗口**：`decorations: false`、`alwaysOnTop: true`、`skipTaskbar: true`、`resizable: false`、`visible: false`、居中、约 560×120。快捷键触发：可见则隐藏；否则 `show()` + `set_focus()` + 向该窗口发送 `quick-shown` 事件（前端收到后清空并聚焦输入框）。失去焦点（`WindowEvent::Focused(false)`）时自动隐藏。
- **主窗口关闭**：`CloseRequested` 时若 `general.closeToTray = true`，`prevent_close()` 并隐藏；托盘"退出"调用 `app.exit(0)`。
- **主题**：前端切换主题时同时调用窗口 `setTheme` 使原生标题栏一致。

### 6.13 导入导出与数据目录（批次 2）

**JSON 备份格式**

```json
{
  "app": "workbench",
  "formatVersion": 1,
  "schemaVersion": 1,
  "exportedAt": 1792300000000,
  "data": {
    "ideas": [], "todos": [], "tips": [], "skills": [], "prompts": [],
    "tags": [], "entityTags": [], "aiProviders": [], "settings": {}
  }
}
```

- 导出包含软删除条目（完整备份），按表原始字段导出（不含 `search_index`、不含 Key）。
- 导入流程：校验 `app`、`formatVersion`、`schemaVersion ≤ 当前`（否则 `IMPORT_INVALID`）→ 用 `VACUUM INTO` 把当前库备份到 `backups/pre-import-<时间戳>.db` → 单事务执行：
  - `overwrite`：清空所有业务表后插入；
  - `merge`：按 `id` upsert，`updated_at` 较新者胜出；标签按名称合并（同名不同 id 时以本地 id 为准并重映射关联）。
  - 最后 `search::rebuild_all`，返回 `ImportReport { inserted, updated, skipped }`，广播 `data-changed { entity: "all", op: "import" }`。
- 前端两种模式都需要二次确认；`overwrite` 需输入"确认覆盖"。

**数据目录**

- `app_config_dir()/bootstrap.json` 记录 `{ "dataDir": "..." }`，缺省为 `app_data_dir()`。数据库文件 `workbench.db`，备份目录 `backups/`。
- 更改目录：`VACUUM INTO` 新目录 → 写 `bootstrap.json` → 提示并调用 `app.restart()`。旧文件保留，由用户自行删除。

### 6.14 回收站

- 启动时及每 24 小时清理 `deleted_at < now - 30 天` 的条目（硬删除 + 关联 + 索引）。
- `trash_list` 跨模块返回 `{ ref, title, deletedAt }`，按删除时间倒序。

---

## 7. 前端设计

### 7.1 路由与布局

| 路由 | 页面 |
| --- | --- |
| `#/` | 今日 |
| `#/ideas/:id?` | 灵感 |
| `#/todos/:id?` | 待办（`?view=today\|next7\|all\|done`） |
| `#/tips/:id?` | Agent 技巧 |
| `#/skills/:id?` | Skill 库 |
| `#/prompts/:id?` | 提示词库 |
| `#/trash` | 回收站 |
| `#/settings/:section?` | 设置 |

- 选中条目 id 放在 URL 中，刷新后保持。路由组件全部 `lazy()` 加载，保证冷启动 < 2 秒。
- `AppShell`：左侧导航（固定宽度，可折叠为图标）+ `ThreePane`（列表/详情，`react-resizable-panels`，宽度存 localStorage）+ 右侧 AI 抽屉（批次 2，`Ctrl+J` 开关）。

### 7.2 数据获取

- `lib/api/*.ts` 是唯一调用 `invoke` 的地方，例如：

```ts
export const ideasApi = {
  list: (input: IdeaListQuery) => ipc<Page<Idea>>('idea_list', input),
  update: (input: IdeaUpdateInput) => ipc<Idea>('idea_update', input),
  // ...
};
// lib/ipc.ts：ipc(cmd, input) => invoke(cmd, { input })，catch 后统一转为 AppError（含 code）
```

- `features/*/hooks.ts` 用 TanStack Query 封装：列表用 `useInfiniteQuery`（offset 分页），详情用 `useQuery`，变更用 `useMutation`。**不在 onSuccess 中手动失效**，统一依赖 `data-changed` 事件（`lib/events.ts`），避免两套失效逻辑。
- Query key 规范（`lib/query-keys.ts`）：`[entity, 'list', params]`、`[entity, 'detail', id]`、`['dashboard']`、`['search', q]`、`['trash']`、`['tags']`、`['settings']`、`['providers']`。

### 7.3 编辑器与自动保存

- `EditorPane`：编辑 / 预览 / 分屏三种模式（偏好存 localStorage）。
- `MarkdownEditor`：封装 CM6，对外暴露 `EditorHandle { getSelection(), replaceRange(from, to, text), insertAfterSelection(text), focus() }`。**AI 替换必须通过 CM 事务完成（`view.dispatch({ changes, userEvent: 'input.ai' })`），确保 `Ctrl+Z` 可撤销**（验收 #5）。
- `MarkdownPreview`：`react-markdown + remark-gfm + rehype-highlight`；链接点击通过 `opener` 插件在系统浏览器打开；不渲染原始 HTML。
- `useAutosave(entityId, draft, save)`：
  - 停止输入 1000ms 后保存；状态 `idle | saving | saved | error` 由 `SaveIndicator` 展示；
  - 切换条目、组件卸载、窗口 `blur`、`beforeunload` 时立即 flush；
  - **草稿只在条目 id 变化时用服务端数据初始化**；编辑中收到该条目的刷新数据时不得覆盖本地草稿（避免 `data-changed` 回流打断输入）。
- 新建条目：点击"新建"立即创建空记录并选中；离开时若内容仍为空则硬删除（不进回收站）。

### 7.4 列表通用能力

- 使用 `@tanstack/react-virtual` 虚拟滚动；滚动到底加载下一页。
- 多选（`stores/ui.ts` 的 `selection`）：`Ctrl+点击` 切换、`Shift+点击` 连选、`Esc` 清除。多选时顶部显示批量栏：批次 1 提供"删除""添加标签"；批次 2 增加 AI 操作。
- 删除后 toast 提供"撤销"（调用 `trash_restore`）。

### 7.5 各模块要点

| 模块 | 要点 |
| --- | --- |
| 今日 | 顶部日期 + 快速输入框：默认存为灵感，`Tab` 切换灵感/待办（`preventDefault`），`Enter` 保存；从这里创建的待办 `dueDate = 今天`。今日待办 = 未完成且 `dueDate ≤ 今天` + 今天完成的；`dueDate < 今天` 的显示"顺延 · 原定 MM-DD"标记。今日灵感按时间倒序。最近 7 天新增技巧/Skill/提示词各 3 条。v0.2.1 有可用模型时的智能整理见 [ADDENDUM-smart-capture.md](ADDENDUM-smart-capture.md)，无模型保留原行为 |
| 灵感 | 按 `date` 分组（"今天/昨天/MM-DD 星期X"），星标条目在顶部单独分组；右键菜单：星标、转为待办/技巧/提示词、删除；详情显示"来源"与"已转化为"链接 |
| 待办 | 视图切换 today / next7 / all / done；字段：标题、备注（Markdown）、截止日期、优先级、标签；勾选完成带过渡动画；优先级用颜色标识 |
| Agent 技巧 | 工具多选：预设 Claude Code / Cursor / ChatGPT / Codex + 自定义（存设置 `tips.customTools`）；按工具分组（一条技巧可出现在多个分组）/ 按标签筛选；列表与卡片视图切换 |
| Skill 库 | 新建时可"粘贴 Markdown""导入 .md 文件"（对话框或拖拽，Tauri `onDragDropEvent` 获取路径 → `skill_read_md_file`）"填写链接"；解析 frontmatter 后自动填充名称和简介（仅在字段为空时填充）；URL 输入框失焦且名称为空时调用 `link_fetch_title` 填充，失败不提示错误；GitHub 地址优先用路径推断名称（`SKILL.md` 取上级目录名）；保存时名称仍为空则用 URL 主机+路径兜底；操作：复制内容、打开链接、导出 `.md`（无 frontmatter 时补写 `name/description`）、导出 Skill 文件夹（`<名称>/SKILL.md`，名称做文件名清洗：去除 `<>:"/\|?*`、Windows 保留名加后缀） |
| 提示词 | 编辑时实时显示识别到的变量；"使用"对话框：每个变量一个输入框 → 实时预览 → 复制（调用 `prompt_record_use`）；批次 2 增加"发送给 AI 助手"；系统模板单独分组，可编辑不可删除，有"恢复默认" |
| 搜索 | `Ctrl+K` 打开 `cmdk` 面板；输入防抖 150ms；结果按模块分组，标题与片段中高亮关键词；无输入时展示命令：新建灵感/待办/技巧/Skill/提示词、打开设置、切换主题、打开回收站 |
| 设置 | 批次 1：外观（主题）、标签管理；批次 2：模型配置、AI 模板、快捷键、数据、通用（驻留托盘、网络代理） |

### 7.6 AI 交互（批次 2，`features/ai/`）

- `useAiRun()`：生成 `requestId`，创建 `Channel<AiStreamEvent>`，调用 `ai_run_action` / `ai_chat`，维护 `status: idle | streaming | done | cancelled | error` 与累计文本；提供 `stop()`（调用 `ai_cancel`）、`regenerate()`。组件卸载时自动取消。
- **触发入口**：
  - `SelectionToolbar`：编辑器有非空选区时，在选区上方（`view.coordsAtPos`）浮出：润色 / 精简 / 扩写 / 更多；
  - 列表条目右键菜单与详情页"AI"下拉菜单；
  - 多选批量栏：总结 / 归类整理 / 合并为笔记；
  - AI 抽屉内自由对话。
- **结果展示**（在 AI 抽屉中，或在详情区上方的结果面板中）：
  - `rewrite` → `DiffView`：左右对比与行内对比两种模式，使用 jsdiff `diffWords` 并传入 `Intl.Segmenter('zh', { granularity: 'word' })`（不可用时退回 `diffChars`）；`optimize_prompt` 使用 `diffLines` 并在下方展示修改说明。按钮：**替换原文 / 插入到下方 / 另存为新条目 / 复制 / 重新生成**；
  - `markdown` → `ResultView`（渲染 Markdown）：**另存为新灵感 / 插入到下方 / 复制 / 重新生成**；
  - `json` → 结构化预览（例如标题 + 可勾选的标签），"应用"后写入当前编辑草稿；
  - `tip_card` → 预览，"保存为技巧"。
- **绝不自动覆盖**：任何写回都需用户点击。"替换原文"在编辑器打开时走 CM 事务（可撤销）；对未打开编辑器的整条内容替换，调用更新命令后 toast 提供"撤销"（恢复替换前内容）。
- 流式输出过程中显示"停止生成"按钮；错误按 `code` 显示中文提示，`AI_NO_PROVIDER`/`AI_NO_KEY` 提供"去设置"按钮。
- AI 抽屉顶部可临时切换模型配置（不改变默认配置）。批次 2 的对话仅保存在内存，批次 3 持久化。

### 7.7 快速记录窗（批次 2，`quick.tsx`）

- 只引入：React、`@tauri-apps/api`、`lib/api/ideas|todos`、少量样式；**不引入** CodeMirror、react-markdown、TanStack Query 等重依赖。
- 单行自增高输入框（最多约 5 行）。`Enter` 存为灵感，`Ctrl+Enter` 存为待办（`dueDate = 今天`），`Shift+Enter` 换行，`Esc` 隐藏窗口。保存成功后清空并隐藏；保存失败保留内容并显示错误。
- 底部一行提示：`Enter 灵感 · Ctrl+Enter 待办 · Esc 关闭`。

### 7.8 主题、快捷键、文案

- 主题：`light | dark | system`，通过 `<html class="dark">` + CSS 变量实现；`system` 监听 `prefers-color-scheme`；设置变更经 `data-changed { entity: "setting" }` 同步到 quick 窗口。CodeMirror 主题读取同一套 CSS 变量。
- 应用内快捷键（`lib/keymap.ts` 基于 `tinykeys`，可在设置中自定义，批次 2 提供自定义界面）：`Ctrl+K` 命令面板、`Ctrl+N` 在当前模块新建、`Ctrl+J` 开关 AI 抽屉、`Ctrl+F` 聚焦列表筛选。输入框内不触发单字母快捷键。
- 文案：`zh-CN.ts` 导出嵌套对象，`t('ideas.empty')` 有类型提示；错误提示 ``t(`errors.${code}`)``。

### 7.9 设置项（`setting` 表，JSON 值）

| key | 默认值 | 批次 |
| --- | --- | --- |
| `appearance.theme` | `"system"` | 1 |
| `tips.customTools` | `[]` | 1 |
| `general.closeToTray` | `true` | 2 |
| `shortcut.quickCapture` | `"Alt+Space"` | 2 |
| `shortcut.inApp` | `{ "palette": "Ctrl+K", "newItem": "Ctrl+N", "aiDrawer": "Ctrl+J" }` | 2 |
| `network.proxy` | `{ "mode": "system", "url": null }` | 2 |
| `ai.maxInputChars` | `24000` | 2 |
| `editor.fontSize` | `14` | 3 |
| `backup.autoEnabled` / `backup.keep` | `true` / `7` | 3 |
| `todo.defaultRemindTime` | `"09:00"` | 3 |
| `capture.smartDefault` | `true`（布尔） | 0.2.1 |
| `capture.autoSave` | `false`（布尔） | 0.2.1 |

后端提供 `Settings` 强类型结构（含默认值），未知 key 拒绝写入。

### 7.10 安全配置

- `tauri.conf.json` CSP：`default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost`。
- `capabilities/main.json` 只授予必需权限（core 默认、dialog open/save、opener 打开 URL、clipboard 写入、window 显示/隐藏/主题）；`quick.json` 仅授予 core 默认与 window hide。
- 不内置任何统计上报；网络请求只发往用户配置的 AI 地址与用户主动填写的链接。

---

## 8. 关键流程

### 8.1 快速记录（验收 #1）

```text
用户按 Alt+Space
 → Rust shortcut handler：quick.show() + set_focus() + emit_to("quick", "quick-shown")
 → quick 窗口聚焦输入框；用户输入后 Enter
 → invoke idea_create → 写库 + FTS → emit data-changed{idea, create}
 → quick 窗口隐藏；主窗口 events.ts 失效 ['idea'] 与 ['dashboard'] → 今日灵感立即出现
```

### 8.2 选区润色并替换（验收 #5）

```text
编辑器选中文字 → SelectionToolbar「润色」
 → useAiRun.start({ action: 'polish', input: { kind: 'text', text } })
 → Rust：读取默认 provider + Key → 渲染 polish 模板 → 流式请求
 → Channel: Started → Delta… → Done
 → DiffView 实时展示（Done 之前仅显示结果文本，Done 后计算对比）
 → 点击「替换原文」→ EditorHandle.replaceRange(from, to, result)（CM 事务）
 → useAutosave 1 秒后保存；Ctrl+Z 可撤销并再次自动保存
```

### 8.3 多条归类整理（验收 #6）

```text
灵感列表多选 5 条 → 批量栏「归类整理」
 → ai_run_action({ action: 'categorize', input: { kind: 'entities', refs } })
 → Rust context.rs 读取条目并拼装 {{items}} → 流式返回 Markdown
 → ResultView →「另存为新灵感」→ idea_create（content = 结果）
```

---

## 9. 编码规范与质量门禁

### 9.1 通用

- TypeScript `strict: true`、`noUncheckedIndexedAccess: true`；禁止 `any`（必要时 `unknown` + 类型守卫）。
- 组件文件 ≤ 300 行，超出拆分；业务逻辑放 hooks/lib，不写在 JSX 里。
- Rust：`cargo clippy --all-targets -- -D warnings` 零警告；模块公开函数写简短文档注释。
- 注释说明"为什么"，不复述代码。
- 不提交生成的构建产物；`src/types/bindings/` 例外（需提交）。

### 9.2 脚本（`package.json`）

```json
{
  "dev": "tauri dev",
  "build": "tauri build",
  "gen:types": "cargo test --manifest-path src-tauri/Cargo.toml export_bindings",
  "lint": "eslint . && prettier --check .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "check:rust": "cargo fmt --manifest-path src-tauri/Cargo.toml --check && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml",
  "check": "pnpm gen:types && pnpm lint && pnpm typecheck && pnpm test && pnpm check:rust"
}
```

### 9.3 批次完成定义（Definition of Done）

1. `pnpm check` 全部通过，且 `git status` 中 `src/types/bindings/` 无未提交变更（类型已同步）。
2. `pnpm build` 能产出 Windows 安装包。
3. 本批次"验收清单"逐项手动验证，结果写入 `docs/PROGRESS.md`。
4. 前序批次的验收项回归通过。

---

## 10. 测试策略

| 层 | 工具 | 必测内容 |
| --- | --- | --- |
| Rust repo | `cargo test` + 内存库（`Connection::open_in_memory()` + 全部迁移） | 各实体 CRUD、软删除/恢复/清理、标签 upsert 与关联、待办 today/next7 视图边界（含顺延）、FTS 维护（创建/更新/改标签/删除后可/不可搜到）、中文 ≥3 字与 <3 字两种查询路径、导入导出往返一致（验收 #8） |
| Rust services | `cargo test` | 模板解析/渲染（共享 fixture）、frontmatter 解析（有/无/损坏 frontmatter、多行 description）、文件名清洗、SSE 解析、JSON 容错提取 |
| Rust AI 集成 | `wiremock` | 流式成功、401/404/429/500 映射、首块超时、取消；断言请求头含 `Authorization` 且日志不含 Key |
| 前端 lib | `vitest` | `template.ts`（共享 fixture）、日期分组、关键词高亮、Diff 适配 |
| 前端组件 | `vitest` + Testing Library + `@tauri-apps/api/mocks` 的 `mockIPC` | 快速输入框 Tab/Enter 行为、提示词使用对话框变量替换（验收 #3）、quick 窗口键盘行为、自动保存防抖与 flush |
| 手动 | 验收清单 | 全局快捷键、托盘、凭据管理器、真实 AI 服务 |

验收 #7 的自动化辅助：测试中保存一个带 Key 的 provider 后，读取数据库文件字节与 `bootstrap.json`、日志文件，断言不包含 Key 字符串。

---

## 11. 分批实施计划

共 **3 个批次**：批次 1 + 批次 2 = MVP（v0.1），批次 3 = v0.2。

### 11.1 批次 1：工程骨架 + 本地数据层 + 五大内容模块 + 搜索（离线完整可用）

**任务**

1. 工程初始化：Tauri 2 + React + Vite 多页面（`quick.html` 先放占位页面）、Tailwind 4、shadcn/ui、ESLint/Prettier、Vitest；Rust 依赖、`ts-rs` 导出流程、`.cargo/config.toml`；`docs/PROGRESS.md`、`docs/DECISIONS.md`。
2. 后端基础：`error.rs`、`state.rs`、`paths.rs`（bootstrap.json）、`db`（PRAGMA、迁移 `0001_init.sql`）、`events.rs`、设置读写与默认值、回收站定时清理。
3. 前端基础：`AppShell`/`ThreePane`/`Sidebar`、Hash 路由 + lazy、QueryClient、`lib/ipc.ts`、`lib/events.ts`、主题（浅/深/跟随系统）、`i18n`、toast、确认对话框。
4. 通用组件：`TagInput`（自动补全 + 新建）、`EditorPane`/`MarkdownEditor`/`MarkdownPreview`、`useAutosave`、虚拟列表 + 多选 + 批量栏（删除/加标签）、`SaveIndicator`、`EmptyState`。
5. 五个内容模块完整 CRUD（按 7.5 节）：灵感（含转化）、待办（含视图与顺延）、技巧（含工具分组与卡片视图）、Skill（含 md 导入/拖拽/frontmatter/链接标题/导出）、提示词（含变量识别与使用对话框、使用次数、分类）。
6. 今日页（不含 AI 每日小结）。
7. 全文搜索：索引维护 + `Ctrl+K` 命令面板（搜索 + 快捷命令）+ 关键词高亮。
8. 回收站页面；设置页：外观、标签管理。

**验收清单**

- [ ] 冷启动到可交互 < 2 秒（release 构建）。
- [ ] 五个模块均可新建、编辑（1 秒自动保存）、删除进回收站、从回收站恢复、彻底删除。
- [ ] 标签可新建、自动补全、按标签筛选；标签改名后搜索结果随之更新。
- [ ] 今日页快速输入：`Tab` 切换类型，`Enter` 保存；昨日未完成待办显示"顺延"。
- [ ] 灵感按天分组；星标置顶；"转为待办"后待办详情显示来源链接。
- [ ] **（PRD 验收 #2）** 导入带 frontmatter 的 `SKILL.md`，名称和简介自动填入。
- [ ] **（PRD 验收 #3）** 带 `{{topic}}` 的提示词，使用时出现表单，复制结果中变量被正确替换，使用次数 +1。
- [ ] **（PRD 验收 #9）** `Ctrl+K` 输入中文/英文关键词（含 2 字中文词）能跨模块搜到并高亮。
- [ ] 浅色/深色/跟随系统切换正常。
- [ ] 断网状态下以上功能全部可用（链接标题抓取除外，且失败不影响保存）。
- [ ] 强制结束进程后重开，最后 1 秒前的编辑不丢失。

### 11.2 批次 2：AI 能力 + 桌面集成 + 数据管理（完成 MVP）

**任务**

1. `services/secrets.rs`（keyring）；`ai_provider` 仓储与命令；设置页"模型配置"：增删改、默认配置、Key 掩码输入、测试连接（展示具体失败原因）、拉取模型列表、网络代理设置。
2. `services/ai/`：client、SSE、取消、错误映射、`actions.rs` 注册表（批次 2 的 10 个操作）、`context.rs`、`parse.rs`；`templates/*.md` 默认模板与 `seed_system_templates()`；设置页"AI 模板"：查看/编辑/恢复默认（编辑复用提示词编辑器）。
3. 前端 `features/ai/`：`useAiRun`、AI 抽屉（自由对话、临时切换模型、停止生成）、`SelectionToolbar`、右键菜单与详情 AI 菜单、批量栏 AI 操作、`DiffView`、`ResultView`、JSON 结果预览、技巧卡片预览；提示词"发送给 AI 助手"。
4. 桌面集成：quick 窗口完整实现、全局快捷键（含自定义与冲突提示）、托盘、关闭驻留托盘、单实例、窗口状态记忆。
5. 数据管理：JSON 导出/导入（合并/覆盖、导入前自动备份、二次确认）、打开数据目录、更改数据目录。
6. 设置页补全：快捷键（全局 + 应用内）、数据、通用。

**验收清单**

- [ ] **（PRD 验收 #1）** 在其他应用中按快捷键，300ms 内弹出快速记录窗；回车后主界面"今日灵感"立即出现该条；`Ctrl+Enter` 存为今日待办；`Esc` 关闭。
- [ ] 关闭主窗口后托盘驻留，快捷键仍可用；托盘"退出"后进程结束；快捷键被占用时设置页给出提示且应用不崩溃。
- [ ] **（PRD 验收 #4）** 配置 OpenAI 兼容服务（如 DeepSeek、硅基流动）后"测试连接"成功；错误 Key 提示"API Key 无效"；错误地址提示检查 Base URL；超时有明确提示。
- [ ] 重启应用后已保存的 Key 仍可用（证明写入了系统凭据管理器而非内存）。
- [ ] **（PRD 验收 #5）** 选中文字执行"润色"，流式显示，可对比原文，"替换原文"后内容更新，`Ctrl+Z` 可撤销；生成中可"停止生成"。
- [ ] **（PRD 验收 #6）** 多选 5 条灵感执行"归类整理"，得到结构化 Markdown，可另存为新灵感。
- [ ] "优化提示词"以 diff 展示修改并附修改说明；"生成标题与标签"优先复用已有标签；"提炼技巧卡片"可直接保存为技巧；"生成 Skill 简介"可应用到字段。
- [ ] 修改某内置模板后效果生效；"恢复默认"后还原。
- [ ] **（PRD 验收 #7）** 在数据库文件、`bootstrap.json`、日志中搜索不到 API Key 明文。
- [ ] **（PRD 验收 #8）** 导出 JSON → 覆盖导入空数据 → 全部数据（含标签关系、星标、软删除条目）完整恢复；合并导入不产生重复。
- [ ] 批次 1 全部验收项回归通过。

### 11.3 批次 3：v0.2 全部功能 + PRD 中的 P1 项

**任务**

1. 迁移 `0002_v02.sql`。
2. **待办**：单层子任务（详情内添加/勾选，列表显示进度 `2/5`，父任务软删除级联）；提醒（`remind_at` 字段 + 日期时间选择；Rust 后台每 30 秒检查到期且未提醒的待办，通过 `tauri-plugin-notification` 发系统通知，点击通知打开该待办；仅设截止日期时按 `todo.defaultRemindTime` 提醒，可在设置中关闭）；AI 拆解待办（`breakdown_todos` → 可编辑预览表格 → 确认后批量创建）。
3. **提示词版本**：在"编辑会话结束"（切换条目/离开页面/窗口失焦）且正文与最新版本不同时生成版本，另有"保存为版本"按钮；每条最多保留 50 个版本；版本列表 + 与当前内容 diff + 回滚（回滚本身也生成一个新版本）。命令：`prompt_version_list`、`prompt_version_create`、`prompt_version_restore`。
4. **AI 对话历史与 `@` 引用**：对话持久化（`ai_conversation_list/get/rename/delete`，`ai_chat` 接收可选 `conversationId`，自动以首条消息生成标题）；输入框键入 `@` 弹出条目搜索（复用 `search_query`），选中后以标签形式显示；发送时后端读取引用条目内容拼装为上下文（受 `ai.maxInputChars` 限制）。
5. **每日小结**：今日页按钮 → `daily_summary` → 结果可保存为一条灵感。
6. **Skill**：文件夹批量导入（`skill_scan_folder`：递归最多 5 层，跳过 `node_modules`、`.git`，识别文件名为 `SKILL.md` 的文件 → 预览列表，按名称标记"已存在" → `skill_import_batch`）；链接内容拉取（`skill_fetch_remote`：GitHub `blob` 地址转换为 `raw.githubusercontent.com`，≤ 1 MB，与本地内容不同时以 diff 确认后覆盖）。
7. **自动备份**：启动时及每 24 小时用 `VACUUM INTO` 备份到 `backups/workbench-YYYYMMDD.db`，保留最近 7 份；设置页列出备份、"立即备份"、"从备份恢复"（写入 `bootstrap.json` 的 `pendingRestore`，重启后、打开数据库前替换文件）。命令：`backup_list`、`backup_now`、`backup_restore`。
8. **Markdown 文件夹导出**（`data_export_markdown`）：`灵感/YYYY-MM-DD.md`（按天合并）、`待办.md`、`Agent技巧/<标题>.md`、`Skills/<名称>/SKILL.md`、`提示词/<标题>.md`；每个文件带 frontmatter（tags、created、updated）；文件名清洗与重名加序号。
9. **搜索过滤语法**：`tag:xxx`、`type:idea|todo|tip|skill|prompt`、`is:starred`，可与关键词组合；在命令面板中显示语法提示。
10. **灵感日历视图**：月历显示每日灵感数量（`idea_calendar({ month })`），点击某天筛选。
11. **编辑器字体大小**设置。

**验收清单**

- [ ] 子任务增删改、进度显示、父任务删除级联与恢复正确。
- [ ] 设置 1 分钟后的提醒，到点收到系统通知，点击后打开对应待办；不重复提醒。
- [ ] AI 拆解出的待办可在预览中编辑后批量创建。
- [ ] 提示词修改后产生版本，可对比、回滚；连续自动保存不会产生大量版本。
- [ ] AI 对话重启后仍在；`@` 引用两条灵感后提问，回答体现了引用内容。
- [ ] 每日小结可生成并保存为灵感。
- [ ] 选择包含多个 `SKILL.md` 的文件夹可批量导入；GitHub `blob` 链接可拉取原文。
- [ ] 自动备份按日生成且只保留 7 份；从备份恢复后数据正确。
- [ ] Markdown 导出的文件夹可被 Obsidian 正常打开，frontmatter 合法。
- [ ] `tag:xxx type:prompt 关键词` 过滤结果正确。
- [ ] 日历视图点击某天只显示当天灵感。
- [ ] 批次 1、2 全部验收项回归通过。

### 11.4 后续（v0.3+，不在本次施工范围，仅需保持架构可扩展）

- Anthropic 原生接口：在 `services/ai/client.rs` 中抽象 `ProviderKind`（当前仅 `OpenAiCompatible`），`ai_provider` 表届时通过迁移新增 `kind` 列。
- Ollama 预设：本质是 OpenAI 兼容地址 `http://localhost:11434/v1`，届时只需在新增配置时提供预设模板。
- 数据库加密：替换为 `bundled-sqlcipher`，密钥存入凭据管理器。
- 云同步：基于 `updated_at` / `deleted_at` 做增量同步，需要时迁移添加 `device_id`。

---

## 12. 给 Codex 的分批任务提示词（复制使用）

**批次 1**

```text
请完整阅读仓库中的 docs/ARCHITECTURE.md（这是本项目的唯一架构依据），然后实施「11.1 批次 1」的全部任务。
要求：
1. 严格遵循第 0 节工作约定、第 5 节目录结构、第 6 节后端设计、第 7 节前端设计，只使用第 2 节列出的依赖。
2. 不要实现批次 2、3 的功能，但表结构、目录与命名要与文档一致。
3. 按第 10 节编写测试；完成后运行 pnpm check 直到全部通过，并确认 pnpm build 成功。
4. 在 docs/PROGRESS.md 中逐项记录批次 1 验收清单的结果；文档未覆盖的决定记录到 docs/DECISIONS.md。
5. 最后输出：完成情况摘要、未完成项及原因、需要我手动验证的项目。
```

**批次 2**

```text
请阅读 docs/ARCHITECTURE.md、docs/PROGRESS.md、docs/DECISIONS.md，在批次 1 的基础上实施「11.2 批次 2」的全部任务。
要求同批次 1，另外特别注意：
- API Key 只能存在系统凭据管理器中，前端永远拿不到完整 Key，日志中不得出现 Key（见 6.11、10 节验收 #7 的自动化测试）。
- 所有 AI 结果不得自动覆盖原内容；编辑器内替换必须走 CodeMirror 事务以支持撤销（见 7.3、7.6）。
- 全局快捷键注册失败不能导致崩溃（见 6.12）。
- 完成后回归批次 1 的验收清单。
```

**批次 3**

```text
请阅读 docs/ARCHITECTURE.md、docs/PROGRESS.md、docs/DECISIONS.md，实施「11.3 批次 3」的全部任务。
要求同前；数据库变更只能通过新增迁移 0002_v02.sql 完成，不得修改 0001_init.sql；
JSON 导出/导入需同步支持新增的表（prompt_version、ai_conversation、ai_message），formatVersion 保持 1、schemaVersion 升为 2，并能导入 schemaVersion=1 的旧备份。
完成后回归批次 1、2 的验收清单。
```

---

## 附录 A：内置 AI 模板编写要求（`src-tauri/templates/`）

每个模板为一个 `.md` 文件，结构如下（由 `actions.rs` 解析为 `system_prompt` 与 `body`）：

```text
---system---
你是用户的个人写作与知识整理助手。始终使用简体中文回答，除非原文是其他语言。
---user---
请润色下面的文字……
{{input}}
```

| 操作 | 输出要求 |
| --- | --- |
| `polish` / `shorten` / `expand` | 只输出改写后的正文，不加任何解释、引号或前后缀；保留原有 Markdown 结构与语言 |
| `summarize` | Markdown 无序列表，3–7 条要点 |
| `categorize` | 按主题分组的 Markdown：`## 主题名` + 要点列表，每条后注明来源条目序号 |
| `merge_note` | 一篇结构完整的 Markdown 笔记（标题、小节），去重合并 |
| `title_tags` | 只输出 JSON：`{"title": "...", "tags": ["..."]}`，3–5 个标签，优先从 `{{existing_tags}}` 中选择 |
| `extract_tip` | Markdown：首行 `# 标题`，随后 `## 适用场景`、`## 操作步骤`、`## 示例` |
| `optimize_prompt` | `<optimized>改写后的提示词</optimized><changes>修改说明列表</changes>`；按角色、任务、约束、输出格式的结构改写；保留原有 `{{变量}}` |
| `skill_describe` | 只输出 JSON：`{"description": "≤100 字中文简介", "tags": ["..."]}` |
| `breakdown_todos`（批次 3） | 只输出 JSON 数组：`[{"title": "...", "note": "...", "dueDate": "YYYY-MM-DD 或 null", "priority": 1-3}]`，基准日期 `{{today}}` |
| `daily_summary`（批次 3） | Markdown：今日完成、今日灵感要点、明日建议，总长 ≤ 300 字 |

## 附录 B：今日待办查询定义

```sql
-- :today 为本地日期 'YYYY-MM-DD'；:day_start/:day_end 为今天 0 点与次日 0 点的 Unix 毫秒
SELECT * FROM todo
WHERE deleted_at IS NULL AND parent_id IS NULL
  AND (
        (status = 'todo' AND due_date IS NOT NULL AND due_date <= :today)
     OR (status = 'done' AND completed_at >= :day_start AND completed_at < :day_end)
  )
ORDER BY status = 'done', due_date < :today DESC, priority, sort_order, created_at;
-- due_date < :today 且未完成 → 前端显示「顺延 · 原定 MM-DD」
-- next7：status='todo' AND due_date BETWEEN :today AND :today+6
-- all：status='todo'（无截止日期的排在最后）；done：status='done' ORDER BY completed_at DESC
```
