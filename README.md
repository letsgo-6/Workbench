# Workbench 个人工作台

把零散想法，变成有迹可循的行动。

Workbench 是一个离线优先的 **Windows 桌面工作台**，把灵感、待办、Agent 技巧、Skills 和提示词放在一起。从快速捕捉一个念头，到整理知识、安排任务、复用 AI 工作流，都可以在同一个本地空间完成。

[下载 v0.2.0 预览版](https://github.com/letsgo-6/Workbench/releases/tag/v0.2.0) · [功能与验证状态](docs/STATUS.md) · [架构说明](docs/ARCHITECTURE.md) · [MIT License](LICENSE)

![Workbench 今日主页：快速记录、今日待办、今日灵感与最近内容](docs/images/home.png)

_主页截图使用专门创建的示例数据，来自实际运行的 v0.2.0 界面。安装后的内容默认为空。_

## 它能帮你做什么

| 场景        | 功能                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| 随手记录    | 全局快捷键呼出快速记录窗；灵感按天整理，支持标签、星标、日历和转为待办。             |
| 推进任务    | 今日与日期视图、优先级、顺延、单层子任务进度、提醒；AI 拆解先编辑建议，再确认创建。  |
| 沉淀经验    | 保存 Agent 技巧、Markdown 笔记与来源，按工具组织，跨模块搜索。                       |
| 管理 Skills | 导入 `SKILL.md`、解析 frontmatter、文件夹批量导入、抓取 GitHub 链接并对比更新。      |
| 复用提示词  | 识别 `{{变量}}`，填写后复制；保存版本、查看差异、回滚，最多保留 50 份。              |
| 连接 AI     | 配置 OpenAI 兼容服务，流式对话、`@` 引用本地条目、润色/总结/归类与每日小结。         |
| 掌握数据    | SQLite 本地存储、回收站、JSON 导入/导出、Markdown 文件夹导出、每日数据库备份与恢复。 |

## 本地优先，写入由你确认

- 不配置 AI 也能使用本地记录、任务、搜索和导入导出。
- AI 请求会把你选择的内容发送给所配置的服务商；没有内置免费模型或服务端账号。
- 已保存的 API Key 由 Rust 存入系统凭据管理器，前端只获取掩码；JSON 备份不包含 Key。
- AI 结果先预览，点击替换、插入、应用或确认创建后才写入；编辑器内替换支持 `Ctrl+Z` 撤销。
- 内容默认保存在 `%APPDATA%\com.workbench.app`。JSON 导出采用 `formatVersion=1/schemaVersion=2`，支持导入 `schemaVersion=1` 的旧备份。

## 开始使用

从 [Releases](https://github.com/letsgo-6/Workbench/releases/tag/v0.2.0) 下载 Windows x64 安装包。启动后直接记录内容；需要 AI 时，在「设置 → 模型配置」中填写 Base URL、模型 ID 和自己的 Key。

| 操作                  | 默认快捷键                        |
| --------------------- | --------------------------------- |
| 全局快速记录          | `Alt+Space`，冲突时可在设置中更改 |
| 搜索与命令面板        | `Ctrl+K`                          |
| AI 助手               | `Ctrl+J`                          |
| 快速记录为灵感 / 待办 | `Enter` / `Ctrl+Enter`            |
| 关闭快速记录窗        | `Esc`                             |

搜索支持 `tag:统计 type:prompt is:starred 关键词`。浅色、深色和系统主题，以及编辑器字号，都可在设置中调整。

## 从源码运行

当前构建与验证平台为 Windows x64。需要 Node.js 24 LTS、pnpm 11、Rust MSVC、Visual Studio 2022 C++ 工具及 Windows SDK、WebView2。

PowerShell：

```powershell
git clone https://github.com/letsgo-6/Workbench.git
Set-Location Workbench
pnpm install --frozen-lockfile
pnpm dev
```

建议把工程放在英文、不受云盘同步影响的路径。已有完整 Windows SDK 时，脚本会使用 VS 开发者环境；缺少 SDK 时，可以通过项目提供的脚本准备项目内 SDK：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/bootstrap-sdk.ps1
```

检查与打包：

```powershell
pnpm check
pnpm build
```

安装包生成于 `src-tauri/target/release/bundle/nsis/`。`scripts/run.ps1` 只为当前构建进程注入工具链环境，不修改全局系统变量。

技术栈：Tauri 2、Rust、SQLite WAL、React 19、TypeScript、Vite、CodeMirror、TanStack Query。

## 当前状态

v0.2.0 为预览版。已验证 30 项前端测试、88 项 Rust 测试，以及 59 组原生功能检查；一万条混合数据的搜索测试均低于 200ms。这些是本机执行结果，详见 [验证状态](docs/STATUS.md)。

完整验收仍有未完成项：启动样本 4.344 / 2.264 秒，超过 2 秒目标；安装版系统通知、真实 AI 服务商等仍需实测。当前未验证 macOS、Linux 和移动端。

欢迎通过 [Issues](https://github.com/letsgo-6/Workbench/issues) 提交问题和建议。贡献前请运行相应检查，并避免上传数据库、备份或凭据。

## 许可证

[MIT](LICENSE)。第三方依赖遵循各自的许可证；复制或生成的 UI 源码归属见 [第三方声明](THIRD_PARTY_NOTICES.md)。
