# 施工补充决策

## 批次 3 决策（2026-10-19）

- 用户授权继续 §11.3；前两批尚未通过的启动指标和真实环境待验项继续保留。只新增 `0002_v02.sql`，不修改 `0001_init.sql`；产品版本升为 0.2.0。
- JSON `formatVersion=1` 不变，导出 `schemaVersion=2`。新增 `promptVersions`、`aiConversations`、`aiMessages`，保留原始字段与软删除。v1 导入先严格校验旧形状，再补空历史表及 `remind_at/reminded_at=null`；提交时检查外键，合并版本历史后仍保留每提示词最新 50 份。
- 子任务只支持一层，不提供移动层级。父任务删除时只级联当时未删除的子任务，恢复时只恢复同一次删除的子任务；更早独立删除的子任务仍留在回收站。父任务在回收站中代表整组，硬删除清理子任务标签与索引。
- 提醒未填明确时间但有截止日期时，后台按本地日期与 `todo.defaultRemindTime` 计算。新增 `todo.remindersEnabled=true` 设置用于整体关闭提醒，不增加数据库列。每条通知成功提交后才标记已提醒；修改截止日期或明确提醒时间会重置标记。后台每 30 秒检查，错误只记录固定诊断。
- 使用清单内的 notification 2 插件。通知点击由 Rust `on_action` 处理，验证待办 UUID 后显示主窗口并导航；主窗口只新增请求及检查通知权限的最小权限。Windows 通知要求安装版，且点击回调存在平台限制，依据 [Tauri 通知文档](https://v2.tauri.app/plugin/notification/) 和锁定的 notification 2.7.0 源码，不把便携版的回调单元检查当成系统通知验收。
- 版本在编辑会话结束时先 flush，再按正文与系统提示去重保存；普通自动保存不写版本。回滚保留当前版本并另存恢复结果；界面以 CodeMirror 事务应用正文，保留编辑历史。
- 对话 ID 由 Rust 生成 UUID v7。前端只发送当前用户消息和引用 ID，历史与引用正文由后端读取，总输入受字符上限限制；历史引用已删除时跳过，当前选中的失效引用报错。只保存成功完成且已脱敏的助手回答；取消或失败不把半截内容记作完成回答。对话删除为软删除，JSON 完整备份保留其消息。
- 自动备份使用每日一个 `workbench-YYYYMMDD.db`；“立即备份”安全刷新当天快照，只保留最近 7 个日快照，预导入和恢复前快照不参与日快照轮换。恢复写入 `pendingRestore`，重启后验证完整性、版本和外键，保存当前库的恢复前快照，再在开库前替换数据库。
- Markdown 导出只含未删除的业务内容，系统模板除外；按指定树输出合法 frontmatter，合并原有 Skill 元数据。已有文件与重名目录自动加序号，不覆盖文件。Skill 扫描深度以所选根目录为 0，读取至第 5 层，跳过符号链接、`.git`、`node_modules`；导入确认时重新读取并按未删除 Skill 名称去重。
- 原生验收在专用临时数据目录执行，测试启动前保存原 bootstrap 原始字节，结束后恢复。数据目录切换只用于隔离测试，不修改产品路径解析规则；密钥仍由原生 keyring 保存，随机测试凭据在结束时删除。AI 服务以本地模拟单独标明，真实公开 GitHub 内容拉取另记证据。
- 扩展既有三栏和暖白/松绿视觉体系，不重新设计页面。版本与远程内容使用 diff 确认，AI 拆解使用可编辑表格；日历、引用、备份均放在对应现有操作入口。

## 批次 2 决策（2026-10-19）

- 用户明确授权在批次 1 基础上继续批次 2；原有首次启动性能未达标记录继续保留并回归，不阻止本次已授权的功能施工。
- 在现有干净工程内继续开发，保留批次 1 提交作为回退点；不迁移工程、数据库或用户凭据。
- 按清单启用 keyring 3 原生平台特性、Tauri 桌面插件、tokio-util、wiremock 和 diff。直接使用传递依赖的 CodeMirror state/view/commands 与 log 时，将其列为直接依赖，原因是事务历史隔离、选区定位、撤销检查和受控日志 API 需要显式导入。
- 新输入的 Key 只在密码输入框和本次 IPC 参数中短暂存在；保存成功立即清空。已保存 Key 没有读取 IPC，只返回安全掩码；短 Key 不展示可拼回原文的前后缀。诊断不记录输入 DTO、请求头、请求体或原始网络错误。
- 自动验收使用 wiremock 与随机测试凭据，和真实供应商调用分开记录。Browser plugin not available；原生 WebView 验收沿用现有 Playwright 能力，不安装替代浏览器运行时。
- reqwest 禁用默认特性后显式开启 `system-proxy`，以保留系统代理探测；`none` 调用 `no_proxy()`，自定义 HTTP(S) 代理禁止 URL 内携带账号、密码或查询参数。参考 [reqwest ClientBuilder](https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html)。代理变更重建客户端，已进行的请求沿用原客户端。
- 遵循本项目要求的 OpenAI 兼容 Chat Completions 协议，未改为供应商专用接口；按 [OpenAI 官方流式事件文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events) 读取 `delta.content`，忽略扩展字段。禁止重定向，Authorization 标记敏感，不记录原始 reqwest 错误；对供应商错误与跨 delta 的凭据回显脱敏。
- AI 草稿与结果分开。点击替换/插入才提交 CodeMirror `input.ai` 事务，并隔离撤销历史；原文已变化时拒绝应用。未打开的条目写回提供撤销，撤销只恢复正文，保留用户期间修改的其他字段。
- 灵感没有独立 title 列。用户勾选并应用建议标题时，通过同一 CodeMirror 事务在正文前插入 Markdown 标题，保留原正文并支持撤销；其他模块应用到其标题/名称字段。
- 系统模板按 `template_key` 补齐且不覆盖用户编辑。合并跨安装备份时按该 key 匹配本地模板 ID，避免唯一键冲突；普通实体依旧按 id 和 `updated_at` 合并。导入成功后涉及的 provider 凭据均需重新填写；失败回滚数据库并恢复原凭据。当前没有修改 Schema 版本。
- 托盘先创建图标，主界面加载后从 `zh-CN.ts` 提供中文菜单文本，避免第二份翻译源。窗口状态只恢复位置、尺寸、最大化，排除 quick 与可见性。快捷键用先注册新键、成功持久化、再释放旧键的顺序；启动失败仅保留状态。依据 [Tauri 全局快捷键](https://v2.tauri.app/plugin/global-shortcut/)、[单实例](https://v2.tauri.app/plugin/single-instance/)、[窗口状态](https://v2.tauri.app/plugin/window-state/)、[托盘](https://v2.tauri.app/learn/system-tray/) 文档。
- 原生自动化通过测试进程注册专用热键以重现真实 Windows 占用，通过向测试自己的 Workbench 主窗口发送关闭事件验证驻留；不会替用户修改全局系统设置。测试结束恢复原代理、默认模型与快捷键，清除自己的条目和凭据。
- 批次 1 回归发现 tinykeys 不识别保存格式中的 `Ctrl` 别名。新增真实 KeyboardEvent 失败复现后，在绑定边界归一化为 `Control`（以及 Super/Meta 别名）；后端以解析后的 hotkey ID 检查冲突。保留复现日志与回归测试，不能只以按钮可点代替键盘验收。
- 生命周期回归暴露 Tauri WebView 先于 setup 完成的启动竞态：输入已显示时 `AppState` 仍可能不存在。两个入口增加 `app_ready` 握手，后端完成数据状态与桌面初始化后才允许挂载交互界面；测试保留未修复时的启动与错误证据。可交互计时仍从进程发起启动算起。

## 批次 1 决策（历史记录）

- 2026-10-19：依 §3 在 C:\dev\workbench 建立工程，原文档保留；不把依赖和 Rust 构建缓存放入 OneDrive。
- 当前已有 Node 24.20.0 LTS、pnpm 11.25.0、Rust 1.99.0 MSVC 与 VS2022 C++ 工具链。使用现有受支持的 Node LTS，不另装 Node 22。
- 按包注册表 latest 稳定版及指定主要版本约束解析依赖，lockfile 锁定。reqwest 已到 0.13，TLS 特性按新版本使用 rustls。
- @types/react、@types/react-dom、@types/node 为 TypeScript 编译必需的类型开发依赖；shadcn 生成组件所需的 Radix/cva 为 UI 清单隐含依赖。
- 批次 1 不启用后续批次插件；仅保留已规定的 Schema、quick 占位窗口。待办新建先使用可编辑的默认标题以符合标题必填约束；未编辑的新条目离开时清除。
- 本次从零初始化 Git；批次结束保存提交，使自动生成 DTO 可追溯。
- pnpm 11 在当前 Windows 权限下向全局 store/projects 建目录符号链接报 EPERM；项目内 store + hoisted linker 避免依赖管理员或开发者模式，不修改全局系统权限。
- 依赖版本来自 npm / crates.io 官方注册表；采用文档明确指定的 React 19、TypeScript 5、React Router 7、ESLint 9 系列的最新稳定小版本，其余取施工时稳定版本并锁定。
- VS2022 有 MSVC，但本机未安装 Windows SDK，普通终端也未注入 MSVC 环境。使用微软官方 NuGet 的 `Microsoft.Windows.SDK.CPP` 与 `.x64` 10.0.26100.9169，项目私有缓存搭配 `scripts/toolchain.ps1`，不改全局 PATH / 注册表。来源：[微软 SDK NuGet 主页](https://www.nuget.org/packages/Microsoft.Windows.SDK.CPP.x64)。
- shadcn CLI 生成了错误的 `cn` 模块导入，已更正为项目的 `@/lib/utils`，移除误装的 cn 包。控件仅对导入路径和关闭按钮中文文案做必要修改。
- 五个 feature 保留独立 lazy 页面、API 文件、Rust DTO / repo / command；重复的列表、详情表单和自动保存放入 `features/content` 共享，避免复制五套实现。
- Tauri NSIS 缓存首次解压报权限错误。用 PowerShell 解压同一官方 ZIP，并校验 SHA1：ZIP `DB14F8AF2EA346B786C6AE19343F61AAF5E09B8E`、NSIS.exe `6D45D4E8CCF18FE1FDAC9164058F356102A2ECF2`、Tauri 插件 `75197FEE3C6A814FE035788D1C34EAD39349B860`，与 [Tauri 官方源码](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/mod.rs) 一致，再完成打包。
- 原生验收通过现有 Playwright 连接本机 WebView2 的 CDP；没有模拟后端。发布版用于最终验收，避免 Vite 重启遗留的 SharedWorker 与当前测试工具连接兼容问题。调试端口只由测试进程环境变量开启，正常启动不开放。
- 一万条数据的原查询采用 FTS 与五表 UNION 联接，被优化器变成反复扫描，短词查询实测 12.5s。改为 FTS 单次扫描 + 各实体主键关联查询 updated_at，保留 trigram / LIKE 语义与 schema；release 实测 17–49ms。性能回归测试保留，release 下断言 <200ms。
- Vite / Tailwind 只扫描前端源文件，忽略 Rust target、SDK 与 pnpm store，避免构建中间文件锁冲突。
- 原生测试工具的 `waitForFunction` 轮询未等待异步谓词，Promise 本身被视作命中；改为在测试进程中逐次 await 页面真实 IPC 返回值，保存、重启和标签验证均据此重新执行。
- 发现并修复标签改名后的缓存回写问题：详情首次挂载强制读取最新数据，只有刷新完成后才初始化草稿；编辑期间的刷新继续保留本地草稿。回归覆盖旧缓存不可进入新编辑器、改名后的编辑与筛选。
- 启动计时分解发现较慢的首次样本主要发生在 WebView CDP 端口就绪前，不能归因为 React 渲染。按 [Tauri 官方发布优化配置](https://v2.tauri.app/concept/size/) 启用单 codegen unit、LTO、大小优化与符号移除后重测；原始超时记录保留，不能用后续较快样本覆盖这一事实。
