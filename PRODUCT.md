# Workbench

个人每天使用的本地桌面工作台。核心任务是捕捉灵感、安排待办、沉淀 Agent 技巧、管理 Skill 与复用提示词。
Windows 桌面为当前交付平台。单用户离线优先，SQLite 持久化，所有访问经 Rust IPC。
当前功能覆盖 ARCHITECTURE.md §11.1–11.3。v0.2 增加子任务与提醒、提示词版本、持久化对话和引用、每日小结、Skill 批量导入与远程对比、数据库备份恢复、Markdown 导出、搜索过滤、灵感日历及编辑器字号。AI 结果需用户明确应用；已保存凭据只在 Rust 与系统凭据管理器间流转。完整验收状态以 docs/PROGRESS.md 为准。
