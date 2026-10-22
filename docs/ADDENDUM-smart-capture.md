# 补充施工方案：今日页「智能整理」（Smart Capture）

| 项目         | 内容                                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| 文档版本     | v1.0                                                                           |
| 日期         | 2026-10-20                                                                     |
| 基线         | Workbench v0.2.0，提交 `679100e`，工程目录 `C:\dev\workbench`                  |
| 依据         | `docs/ARCHITECTURE.md`、`docs/DECISIONS.md` 与 v0.2.0 实际源码                 |
| 建议存放位置 | `docs/ADDENDUM-smart-capture.md`                                               |
| 目标版本     | 0.2.1（只新增功能，**不改数据库 Schema**，JSON 备份的 `schemaVersion` 保持 2） |

---

## 0. 给 Codex 的工作约定

1. 先读 `docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/PROGRESS.md`，再读本文。本文与 ARCHITECTURE 冲突时，**以本文为准，但只限本功能范围**。
2. 只做一个批次，范围就是本文。**不引入新依赖**，不新增迁移文件，不修改已有迁移。
3. 沿用现有分层：`commands → services → repo`；`services/capture/` 不依赖 `tauri`，保证能单测。
4. 用户可见文案全部放在 `src/i18n/zh-CN.ts`，Rust DTO 通过 `ts-rs` 生成类型，`src/types/bindings/` 的变更要提交。
5. 已有测试必须继续通过。如果因为接口变化必须修改已有测试，只能修改 mock 数据，不能删除断言，并在 `docs/DECISIONS.md` 写明原因。
6. 完成标准：`pnpm check` 全部通过，`pnpm build` 产出安装包，第 8 节验收清单逐项写入 `docs/PROGRESS.md`。

---

## 1. 功能定义与已确认的产品决策

**一句话描述**：用户在今日页的快速输入框里随手输入一段话，AI 自动判断它属于「灵感 / 待办 / Agent 技巧 / Skill / 提示词」中的哪一类（一段话里有多件事时可以拆成多条），提取各模块需要的字段，并**从文字中识别日期和时间、填入对应字段**，用户确认后保存到对应模块。

| #   | 决策（产品负责人已确认）                      | 落地方式                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | 默认先确认再保存；设置中可改为「直接保存」    | 默认在输入框下方显示**识别结果卡片**，按 Enter 全部保存。设置 `capture.autoSave = true` 且结果可靠时直接保存，并弹出带「撤销」的提示（§4.5）                                                                  |
| Q2  | 没配置 API Key 或 AI 调用失败时，退回手动方式 | 没有可用模型时不显示智能模式，保持现有 Tab 切换灵感/待办。AI 调用失败时**保留输入内容**，提供「存为灵感 / 存为待办 / 重试」（§4.4）                                                                           |
| Q3  | 让 AI 从文字中识别日期，识别到后填入对应字段  | 待办：截止日期 `dueDate`，有具体时间时同时填提醒时间 `remindAt`。灵感：原文说明想法发生在过去某天（如"昨天想到"）时填 `date`，否则为今天。日期先由 **Rust 规则解析器**确定性计算，AI 的推算只作为兜底（§3.4） |

**质量原则（必须遵守）**

- **AI 只做分类和字段提取，不改写用户原文。** 灵感正文、技巧正文、提示词正文、待办备注都来自用户原文的逐字片段，由后端校验。
- **链接只能来自原文。** AI 输出的 URL 不在原文中时直接丢弃，防止模型编造链接。
- **日期以规则解析为准。** 大模型容易算错星期几，常见中文日期表达由 Rust 计算，AI 结果只在规则无法解析时使用，并在界面上标注"AI 推断"。
- **任何情况都不能丢失用户输入。** 分析中、取消、失败、校验不通过时，文字都留在输入框里。

**本次不做**：快速记录小窗（Alt+Space）的智能整理、对已有条目重新分类、按前缀强制分类时跳过 AI（前缀只用于锁定类型，见 §3.3）。小窗以后可以直接复用本文的两个命令。

---

## 2. 改动总览

| 层        | 文件                                                                                                     | 改动                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 模板      | `src-tauri/templates/smart_capture.md`                                                                   | **新增**：内置 AI 操作模板（§3.2）                                                                 |
| AI 注册表 | `src-tauri/src/services/ai/actions.rs`                                                                   | `KEYS`/`DEFAULTS` 增加 `smart_capture`（共 13 个）；`messages()` 增加模板变量 `now`、`known_tools` |
| 领域      | `src-tauri/src/domain/capture.rs`（新增）、`domain/mod.rs`                                               | DTO（§3.1）                                                                                        |
| 领域      | `src-tauri/src/domain/tip.rs`                                                                            | 新增 `pub const PRESET_TOOLS: [&str; 4]`，作为工具预设的唯一来源                                   |
| 服务      | `src-tauri/src/services/capture/`（新增）：`mod.rs`、`prefix.rs`、`dates.rs`、`normalize.rs`、`tests.rs` | 前缀识别、日期解析、结果校验与归一化（§3.3–3.5）                                                   |
| 命令      | `src-tauri/src/commands/capture.rs`（新增）、`commands/mod.rs`、`lib.rs`                                 | `capture_analyze`、`capture_commit`、`capture_undo`（§3.6）                                        |
| 错误      | `src-tauri/src/error.rs`                                                                                 | `ErrorCode` 增加 `Cancelled`                                                                       |
| 设置      | `domain/settings.rs`、`repo/settings.rs`                                                                 | 新增 `capture.smartDefault`、`capture.autoSave`（§3.7）                                            |
| 前端 API  | `src/lib/api/capture.ts`（新增）                                                                         | 三个命令的类型化封装                                                                               |
| 前端      | `src/features/dashboard/QuickInput.tsx`（改造）、`src/features/dashboard/capture/`（新增目录）           | 智能模式、识别卡片、失败兜底（§4）                                                                 |
| 前端      | `src/features/content/DetailFields.tsx`、`ContentHeader.tsx`                                             | 工具预设改为引用同一个常量 `src/lib/tools.ts`（新增），与 Rust `PRESET_TOOLS` 保持一致             |
| 前端      | `src/features/ai/store.ts`、`src/i18n/zh-CN.ts`                                                          | `actionKeys` 增加 `smart_capture`；新增文案（§4.7）                                                |
| 设置页    | `src/features/settings/SettingsPage.tsx` 的 general 分区                                                 | 新增「智能整理」两个开关                                                                           |
| 文档      | `docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/PROGRESS.md`、`README.md`                             | 补充说明（§6）                                                                                     |
| 版本      | `package.json`、`tauri.conf.json`、`Cargo.toml`                                                          | 0.2.0 → 0.2.1                                                                                      |

**为什么不需要迁移**：设置存在键值表 `setting` 中；新模板由启动时已有的 `seed_system_templates()`（`INSERT OR IGNORE`）自动补进旧数据库；导入旧备份后 `services/data.rs` 也会调用它。保存条目复用五个模块已有的表和 repo。

---

## 3. 后端设计

### 3.1 DTO（`domain/capture.rs`）

全部按项目约定派生 `Serialize, Deserialize, TS`，`#[serde(rename_all = "camelCase")]`，`#[ts(export)]`，`i64` 时间戳标注 `#[ts(type = "number")]`。

```rust
/// 一条识别结果。用平铺结构而不是按类型分的枚举，是为了让用户在卡片里切换类型时字段不丢失。
pub struct CaptureItem {
    pub kind: EntityType,              // idea | todo | tip | skill | prompt
    pub source: String,                // 原文片段（只读展示，用于核对）
    pub title: String,                 // todo 标题 / tip 标题 / skill 名称 / prompt 标题；idea 不用
    pub body: String,                  // idea 正文 / todo 备注 / tip 正文 / skill 备注(note) / prompt 正文
    pub skill_content: Option<String>, // 仅 skill：原文含 frontmatter 时为完整 Markdown
    pub date: Option<String>,          // 仅 idea：YYYY-MM-DD
    pub due_date: Option<String>,      // 仅 todo：YYYY-MM-DD
    #[ts(type = "number | null")]
    pub remind_at: Option<i64>,        // 仅 todo：本地时间换算后的 Unix 毫秒
    pub date_text: Option<String>,     // 原文中的日期短语，如"下周三下午3点"
    pub date_source: Option<DateSource>,  // rule | ai
    pub priority: i32,                 // 1..=3
    pub tools: Vec<String>,            // 仅 tip
    pub url: Option<String>,           // tip 的 sourceUrl / skill 的 url
    pub description: String,           // 仅 skill
    pub category: String,              // 仅 prompt
    pub tags: Vec<String>,
    pub confidence: Confidence,        // high | low
    pub warnings: Vec<CaptureWarning>,
}

#[serde(rename_all = "camelCase")]
pub enum DateSource { Rule, Ai }
#[serde(rename_all = "camelCase")]
pub enum Confidence { High, Low }

/// 警告码，前端用 zh-CN.ts 里的 capture.warnings.<code> 显示中文
#[serde(rename_all = "camelCase")]
pub enum CaptureWarning {
    SourceMismatch,    // AI 给的原文片段在原文中找不到
    UrlDropped,        // AI 给的链接不在原文中，已丢弃
    DateFromAi,        // 规则无法解析，日期来自 AI 推断
    DateUnresolved,    // 原文有日期词，但无法确定具体日期
    DatePast,          // 待办截止日期早于今天
    TimeRolledOver,    // 只说了时间且今天已过，已顺延到明天
    TitleTruncated,    // 标题过长已截断
    LowConfidence,     // AI 不确定分类
}

pub struct CapturePreview {
    pub items: Vec<CaptureItem>,       // 1..=10 条
    pub today: String,                 // 本次解析使用的本地日期
    pub partial_coverage: bool,        // 多条结果合起来覆盖原文不足 60% 字符
    pub truncated: bool,               // 输入超过 ai.maxInputChars 被截断
    pub auto_save_eligible: bool,      // 见 §3.5 第 9 条
}

pub struct CaptureAnalyzeInput { pub request_id: String, pub provider_id: Option<String>, pub text: String }
pub struct CaptureCommitInput  { pub items: Vec<CaptureItem> }  // 用户在卡片中编辑后的结果
pub struct CaptureCommitResult {
    pub refs: Vec<EntityRef>,
    #[ts(type = "number")]
    pub created_at: i64,               // 本批次统一的创建时间，撤销时用于核对
}
pub struct CaptureUndoInput {
    pub refs: Vec<EntityRef>,
    #[ts(type = "number")]
    pub created_at: i64,
}
pub struct CaptureUndoResult { pub removed: u32, pub skipped: u32 }
```

### 3.2 AI 模板（`templates/smart_capture.md`）

在 `actions.rs` 的 `KEYS` 末尾加 `"smart_capture"`，在 `DEFAULTS` 末尾加 `("智能整理", include_str!("../../../templates/smart_capture.md"))`，两个数组长度改为 13。`parse.rs` 不需要为它增加分支，解析由 `services/capture` 负责。

`messages()` 的 `values` 增加两个变量（对所有模板都可用，不影响已有模板）：

- `now`：`chrono::Local::now()` 格式化为 `2026-10-20 14:30 星期二`，星期用中文。
- `known_tools`：`PRESET_TOOLS` 加上设置里的 `tips_custom_tools`，用顿号连接。

模板内容如下。**注意：模板正文里不能出现双花括号包住的示例变量名**，否则 `template::variables()` 会把它当成模板变量。

```text
---system---
你是个人知识库的录入助手。你的任务是把用户随手输入的一段文字归类到五个模块，并提取字段。你只做分类和字段提取，不改写、不扩写、不总结用户的原文。只输出合法 JSON，不要 Markdown 围栏，不要任何解释。
---user---
当前时间：{{now}}（一周从周一开始）
已有标签（优先复用）：{{existing_tags}}
可选工具：{{known_tools}}

模块定义：
- idea 灵感：想法、观察、感悟、选题、问题。无法判断时归为 idea，并把 confidence 设为 "low"。
- todo 待办：需要用户自己去完成的具体事情，常带"要、得、记得、提醒我、截止、之前"或时间。
- tip Agent 技巧：AI 工具或 Agent 的用法、命令、配置、经验，例如 Claude Code、Cursor、ChatGPT、Codex。
- skill Skill：对 Agent Skill 的收藏，通常带链接、SKILL.md，或明确提到 skill。
- prompt 提示词：可以直接发给 AI 使用的指令文本，常包含"你是……""请……"或双花括号变量。

规则：
1. 一段输入通常只有 1 条。只有明显是几件互不相关的事时才拆分，最多 10 条。
2. source 必须逐字摘自原文（可去掉首尾空白），所有条目的 source 合起来应覆盖原文的主要内容。
3. dateText：原文中表示日期或时间的词语，逐字摘录，例如"下周三下午3点""10月25日前""明天"；没有则为 null。date 是你据此推算出的 YYYY-MM-DD，time 是 HH:MM，无法确定则为 null。只有 todo 和 idea 需要日期；idea 只在原文说明想法发生在过去某天（如"昨天想到"）时填写。
4. title：todo 用动宾短语概括要做的事（不超过 30 字，去掉日期词）；tip 和 prompt 用不超过 20 字的标题；skill 用 Skill 名称（不知道就留空）；idea 留空。
5. body：仅 prompt 填写，为提示词正文本身，逐字摘自原文，去掉"存个提示词："这类说明语；其他类型留空。
6. url：只能使用原文中出现的链接，原样复制；没有则为 null。
7. tools：仅 tip 填写，只能从可选工具中选择。description：仅 skill 填写，不超过 60 字的中文简介。category：仅 prompt 填写，可以为空。
8. priority：原文明确表示紧急或重要为 1，明确表示不急为 3，否则为 2。
9. tags：0 到 3 个，优先从已有标签中选择，不要把模块名当作标签。
10. confidence：分类有把握为 "high"，否则为 "low"。

输出格式：
{"items":[{"type":"todo","source":"","title":"","body":"","dateText":null,"date":null,"time":null,"priority":2,"tools":[],"url":null,"description":"","category":"","tags":[],"confidence":"high"}]}

用户输入：
<input>
{{input}}
</input>
```

用户可以在「设置 → AI 模板」里编辑这个模板（复用现有机制）。模板被改坏导致输出无法解析时，走 §4.4 的失败兜底。

### 3.3 前缀锁定（`services/capture/prefix.rs`）

纯函数 `pub fn detect(text: &str) -> Option<(EntityType, &str)>`：去掉开头空白后，匹配以下前缀，后面紧跟 `：`、`:` 或空白：

| 类型   | 前缀（不区分大小写）   |
| ------ | ---------------------- |
| idea   | `灵感`、`想法`         |
| todo   | `待办`、`任务`、`todo` |
| tip    | `技巧`、`tip`          |
| skill  | `skill`                |
| prompt | `提示词`、`prompt`     |

命中前缀时：

- 仍然调用 AI（为了提取标题、日期、标签），但送给 AI 的是去掉前缀后的正文。
- 后处理时**强制只保留 1 条**，类型就是前缀对应的类型，`source` 等于去掉前缀后的全文，`confidence = High`。

### 3.4 日期解析（`services/capture/dates.rs`）

纯函数，所有"现在"都由调用方传入，便于测试：

```rust
pub struct Resolved { pub date: Option<NaiveDate>, pub time: Option<NaiveTime> }
/// prefer_future=true（待办）时，有歧义的日期取今天或之后最近的一个；false（灵感）时取今天或之前最近的一个。
pub fn resolve(phrase: &str, now: NaiveDateTime, prefer_future: bool) -> Option<Resolved>;
```

规则（一周从周一开始；数字支持阿拉伯数字，以及 `一` 到 `三十一` 的中文数字和 `两`）：

| 表达                                                                                         | 结果（示例以 2026-10-20 周二 14:30 为"现在"）                                                                                 |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `今天` `今日` `今晚`                                                                         | 今天                                                                                                                          |
| `明天` `明日` `明早` `明晚` / `后天` / `大后天`                                              | +1 / +2 / +3 天                                                                                                               |
| `昨天` `昨日` / `前天`                                                                       | -1 / -2 天                                                                                                                    |
| `N天后` `N天以后` `N日后`                                                                    | +N 天                                                                                                                         |
| `周X` `星期X` `礼拜X`（X 为 一到六、日、天）                                                 | 本周的这一天；已过去且 prefer_future 时取下周。周三 → 10-21，周二 → 10-20，周一 → 10-26                                       |
| `本周X` `这周X`                                                                              | 本周的这一天，即使已过去。本周一 → 10-19                                                                                      |
| `下周X` `下星期X` `下礼拜X`                                                                  | 下周的这一天。下周三 → 10-28，下周日 → 11-01                                                                                  |
| `月底` `本月底`                                                                              | 本月最后一天 → 10-31                                                                                                          |
| `N号` `N日`                                                                                  | 本月 N 日；prefer_future 且已过去则取下月，非 prefer_future 且在未来则取上月。日期不存在（如 2 月 30 日）返回 None            |
| `下个月N号` `下月N日`                                                                        | 下月 N 日                                                                                                                     |
| `M月N日` `M月N号`                                                                            | 今年；prefer_future 且已过去则取明年                                                                                          |
| `YYYY-MM-DD` `YYYY/MM/DD` `YYYY年M月N日`                                                     | 原样                                                                                                                          |
| 时间：`[上午\|早上\|早\|中午\|下午\|晚上\|晚\|凌晨]` + `H点`/`H时` + `[半\|M分]`，或 `HH:MM` | `下午`/`晚上`/`晚` 且 H < 12 时加 12；`中午` 取 11 到 13 点原值；例：下午3点 → 15:00，晚上8点半 → 20:30，上午10点20分 → 10:20 |
| 只有时段词、没有点数（如单独的"今晚""下午"）                                                 | 只确定日期，不设时间                                                                                                          |
| `下周`（不带星期几）、`过几天`、`月中`、`年底前` 等                                          | 返回 None，交给 AI 推断                                                                                                       |

允许日期词后面跟 `前`、`之前`、`以前`、`截止`、`为止`，不影响结果。

**后处理时的组合规则**（在 `normalize.rs` 中）：

1. `dateText` 不在原文 `source` 中（逐字查找）时，视为 AI 编造，丢弃日期信息。
2. 规则能解析 → 使用规则结果，`date_source = Rule`。AI 给的 date 与规则结果不同时，以规则为准。
3. 规则不能解析，但 AI 给了合法的 `date`（以及可选的 `time`），并且日期在"今天 -1 年"到"今天 +3 年"之间 → 采用 AI 结果，`date_source = Ai`，加警告 `DateFromAi`。
4. 都没有 → 不设日期；`dateText` 非空时加警告 `DateUnresolved`。
5. **待办**：`due_date` = 日期。有时间时 `remind_at` = 本地 `date + time` 换算成 Unix 毫秒（用 `Local.from_local_datetime(...).earliest()`，遇到无效的本地时间则不设提醒）。只有时间没有日期时，日期取今天；如果这个时间今天已经过了，取明天并加警告 `TimeRolledOver`。截止日期早于今天时加警告 `DatePast`。
6. **灵感**：解析出的日期不晚于今天且在 30 天以内时作为 `date`，否则 `date` = 今天。
7. 技巧、Skill、提示词忽略日期（这三个模块没有日期字段，记录日期就是创建时间）。

### 3.5 结果校验与归一化（`services/capture/normalize.rs`）

```rust
pub struct Context<'a> {
    pub original: &'a str,        // 去掉前缀后的完整输入
    pub forced: Option<EntityType>,
    pub now: NaiveDateTime,
    pub existing_tags: &'a [String],
    pub known_tools: &'a [String],
}
pub fn build_preview(raw_ai_text: &str, ctx: &Context, truncated: bool) -> AppResult<CapturePreview>;
```

处理步骤：

1. 用现有的 `services::ai::parse::json()` 提取 JSON，读取 `items` 数组。拿不到 JSON、`items` 不是数组或为空时，返回 `AppError::coded(ErrorCode::AiBadResponse, ...)`。单个条目的字段缺失或类型不对时使用默认值，不让整条失败。最多取前 10 条。
2. `type` 不是五种之一时按 `idea` 处理并加 `LowConfidence`。有前缀锁定时按 §3.3 强制。
3. **原文核对**：只有 1 条结果时，`source` 直接改成完整原文（不依赖 AI）。多条时，把 `source` 和原文的连续空白都压成一个空格后，用子串查找核对；找不到时加 `SourceMismatch`。
4. **覆盖率**：多条结果时，统计各 `source` 在原文中命中的字符数（去重）。占原文非空白字符少于 60% 时，`partial_coverage = true`。
5. **按类型填正文**（AI 不改写原文）：

   | 类型   | 字段                                                                                                                                                                                                                                          |
   | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | idea   | `body` = source                                                                                                                                                                                                                               |
   | todo   | `title` = AI 标题，为空时用 source 第一行；去掉 `date_text`（如果包含）后再去掉首尾标点。`body`（备注）= source，只在 source 去空白后和 title 不相同时填写                                                                                    |
   | tip    | `title` = AI 标题，为空时用 source 第一行；`body` = source；`url` 作为来源链接                                                                                                                                                                |
   | skill  | `title`（名称）= AI 名称；`body`（备注 note）= source；source 中有 frontmatter 时，用现有的 `services::skill_parse::parse` 解析：`skill_content` = source，name/description 为空时用 frontmatter 补齐；`description` = AI 简介，截断到 100 字 |
   | prompt | `title` = AI 标题；`body` = AI 给的正文，前提是它是原文的子串，否则用 source；`category` = AI 分类                                                                                                                                            |

6. **链接**：从原文中用正则 `https?://[^\s<>"'，。；、）)】]+` 提取所有链接。AI 给的 `url` 必须与其中某一个完全一致，否则丢弃并加 `UrlDropped`。AI 没给链接，但条目是 skill 或 tip、且它的 source 中恰好有一个链接时，使用这个链接。
7. **字段清洗**：
   - `title`：待办最多 500 字，其他类型最多 200 字，超出截断并加 `TitleTruncated`。
   - `tags`：去空白、去重（不区分大小写），单个不超过 30 字，最多 5 个。与已有标签不区分大小写相同时，改用已有标签的写法。
   - `tools`：只保留 `known_tools` 中的值（不区分大小写匹配，输出用规范写法），只用于 tip。
   - `priority`：不在 1 到 3 之间时设为 2。
   - `confidence` 为 `low` 时加 `LowConfidence`。
8. 日期按 §3.4 处理。
9. `auto_save_eligible` 在以下条件**全部**满足时为 true：
   - 条目数在 1 到 5 之间；
   - 所有条目 `confidence = High`；
   - 没有 `SourceMismatch`、`UrlDropped`、`DateFromAi`、`DateUnresolved`、`DatePast`、`LowConfidence` 这些警告；
   - `partial_coverage = false` 且 `truncated = false`；
   - 每条待办的 `title` 不为空。

### 3.6 IPC 命令（`commands/capture.rs`）

在 `lib.rs` 的 `invoke_handler` 中注册。主窗口的 capability 只需要这三个自定义命令，不需要新的插件权限。

**`capture_analyze`**（`async fn`）：`{ requestId, providerId?, text }` → `CapturePreview`

1. 校验：`requestId` 是 UUID（复用 `commands/ai.rs` 的 `validate`）；`text` 去空白后不为空，不超过 20,000 字符。
2. `prefix::detect`。
3. 用 `with_conn` 读取凭据（复用 `commands/ai.rs` 的 `credentials`，需要把它改成 `pub(crate)`），然后调用 `ai::actions::messages(c, "smart_capture", &AiInput::Text { text }, settings.ai_max_input_chars)`，同时读出已有标签和 `known_tools`，组成 `Context` 需要的数据。**持有数据库锁期间不能 await**。
4. 调用 `state.ai.run(request_id, provider, key, messages, truncated, emit)`，`emit` 闭包收集事件：拼接 `Delta` 文本，记录 `Done`、`Cancelled`、`Error { error }`，返回 `true`。
5. 结果处理：
   - 收到 `Cancelled` → 返回 `AppError::coded(ErrorCode::Cancelled, "Capture cancelled")`；
   - 收到 `Error` → 用它的 `code` 构造 `AppError::Coded`，`message` 只使用安全诊断文本；
   - 收到 `Done` → 调用 `normalize::build_preview` 并返回。
6. 这个命令**不写数据库、不广播 `data-changed`**，日志中不记录用户输入和 AI 输出。

**`capture_commit`**（`#[tauri::command(async)]`）：`{ items }` → `CaptureCommitResult`

1. 条目数 1 到 10。每条按 `kind` 转成对应的 `XxxInput`：

   | kind   | 映射                                                                                                              |
   | ------ | ----------------------------------------------------------------------------------------------------------------- |
   | idea   | `IdeaInput { content_md: body, date: date 或今天, tags }`                                                         |
   | todo   | `TodoInput { title, note_md: body, due_date, remind_at, priority, tags, ..Default::default() }`                   |
   | tip    | `TipInput { title, content_md: body, tools, source_url: url, tags }`                                              |
   | skill  | `SkillInput { name: title, description, content_md: skill_content, url, note: body, tags, ..Default::default() }` |
   | prompt | `PromptInput { title, body, category, tags, ..Default::default() }`                                               |

2. 每条都先调用对应的 `super::prepare_*` 和 `super::validate`（与各模块 `*_create` 命令完全一致），全部通过后才开事务。
3. 在**一个事务**中用同一个 `now` 依次调用各 repo 的 `create(tx, &input, now, None)`。任何一条失败，整批回滚。
4. 提交后调用一次 `events::emit_data_changed(&app, "all", "create")`，返回 `refs` 和 `created_at = now`。

**`capture_undo`**（`#[tauri::command(async)]`）：`{ refs, createdAt }` → `CaptureUndoResult`

- 在一个事务中逐条检查：记录存在、`deleted_at IS NULL`、`created_at = createdAt`、`updated_at = createdAt`（说明保存后没有被编辑过）时，调用 `repo::common::mutate(tx, ref, "purge", now, false)` **彻底删除**（不进回收站）；否则跳过并计数。
- 结束后广播 `data-changed { entity: "all", op: "purge" }`。前端在 `skipped > 0` 时提示"已编辑的条目已保留"。

**错误码**：`ErrorCode` 增加 `Cancelled`（序列化为 `CANCELLED`），`AppError::code()` 和 `Serialize` 实现中都要处理。前端遇到 `CANCELLED` 不弹错误提示。

### 3.7 设置

| key                    | 默认值  | 校验 | 含义                                                         |
| ---------------------- | ------- | ---- | ------------------------------------------------------------ |
| `capture.smartDefault` | `true`  | 布尔 | 有可用模型时，今日输入框默认进入智能模式                     |
| `capture.autoSave`     | `false` | 布尔 | 识别结果可靠（`autoSaveEligible`）时直接保存，不显示确认卡片 |

`Settings` 增加 `capture_smart_default: bool`、`capture_auto_save: bool`，并在 `repo/settings.rs` 的 `get_all` 和 `set` 中加上对应分支。JSON 备份的导入导出会自动带上这两项，因为现有逻辑是按 `setting` 表的行导出、导入时调用 `set()` 校验。

---

## 4. 前端设计

### 4.1 新增与改动的文件

```text
src/lib/api/capture.ts            captureApi.analyze / commit / undo
src/lib/tools.ts                  export const presetTools = ['Claude Code', 'Cursor', 'ChatGPT', 'Codex'] as const
src/features/dashboard/
├── QuickInput.tsx                改造：模式切换、调用智能整理
├── QuickInput.test.tsx           只调整 mock（见 §5.2）
└── capture/
    ├── useSmartCapture.ts        状态机与命令调用
    ├── useAiAvailable.ts         判断是否有可用模型
    ├── CapturePreview.tsx        识别结果面板（卡片列表 + 底部操作）
    ├── CaptureCard.tsx           单条卡片（类型切换 + 按类型显示字段）
    ├── CaptureFallback.tsx       失败兜底条
    ├── convert.ts                卡片切换类型时的字段迁移（纯函数）
    ├── capture.test.tsx
    └── convert.test.ts
```

`capture.ts` 的 `analyze` 直接用 `ipc('capture_analyze', input)`，不需要 Channel。取消时调用已有的 `aiApi.cancel(requestId)`。

### 4.2 模式与键盘

`QuickInput` 的类型状态从 `'idea' | 'todo'` 改为 `'smart' | 'idea' | 'todo'`。

- **可用模型的判断**（`useAiAvailable`）：`useQuery({ queryKey: ['provider'], queryFn: providerApi.list })`，与 `ModelSettings`、`AiDrawer` 使用同一个查询 key，所以 `data-changed { entity: "provider" }` 会自动刷新。存在 `isDefault && hasKey` 的配置即为可用。返回值不是数组时按不可用处理。
- **初始模式**：可用且 `capture.smartDefault = true` 时为 `smart`，否则为 `idea`。模型从不可用变为可用时不要强行切换用户当前的模式。
- **Tab 切换**：可用时按 `smart → idea → todo → smart` 循环，不可用时保持现在的 `idea ↔ todo`。左下角的类型按钮行为相同，`smart` 显示 `Sparkles` 图标和"智能"文字。
- **智能模式下的按键**：

  | 按键            | 行为                                              |
  | --------------- | ------------------------------------------------- |
  | `Enter`         | 开始分析                                          |
  | `Ctrl+Enter`    | 不经过 AI，直接存为灵感（与快速记录小窗习惯一致） |
  | `Shift+Enter`   | 换行                                              |
  | `Esc`（分析中） | 取消分析，文字保留                                |

  中文输入法组字时（`isComposing`）不响应，沿用现有判断。

- 提示文字随模式变化：智能模式为"Enter 智能整理 · Ctrl+Enter 直接存为灵感 · Tab 切换"。智能模式的占位文字为"随手记：灵感、待办、技巧、Skill 链接、提示词，AI 会自动归类并识别日期…"。

### 4.3 状态机（`useSmartCapture`）

```text
idle ──Enter──► analyzing ──成功──► preview ──全部保存──► idle（清空输入）
  ▲                │                  │
  │              Esc/失败             Esc/取消
  │                ▼                  ▼
  └────────── idle（保留文字） ◄───────┘
                   └─ 失败时显示 CaptureFallback
```

- `analyzing`：输入框只读（不是 disabled，保证可以选中复制），右侧按钮变成"取消"，显示"正在整理…"。用 `crypto.randomUUID()` 作为 `requestId`。组件卸载时取消正在进行的请求（参照 `useAiRun` 的写法）。
- `preview`：在输入框下方显示 `CapturePreview`，输入框保持只读，文字保留，方便对照。
- 成功保存后才清空输入框。
- 本功能**不使用** `features/ai/store.ts` 的全局 AI 任务，也不打开 AI 抽屉，所以不会和抽屉中正在运行的 AI 操作冲突（后端最多允许 8 个并发请求）。

### 4.4 失败兜底（`CaptureFallback`）

除 `CANCELLED` 外的任何错误，都在输入框下方显示一条提示，文字保留在输入框中：

```text
⚠ AI 整理失败：{按错误码显示的中文原因}
[重试]  [存为灵感]  [存为待办]  [去设置]（仅 AI_NO_PROVIDER / AI_NO_KEY / AI_AUTH / AI_ENDPOINT 时显示）
```

- 「存为灵感」「存为待办」直接复用现在的手动保存逻辑（`contentApi(kind).create`，待办的截止日期为今天），成功后清空输入框和提示。
- 「去设置」跳转到 `#/settings/models`。
- 用户继续编辑输入框时隐藏这条提示。

### 4.5 识别结果面板（`CapturePreview` / `CaptureCard`）

**整体布局**：沿用现有的暖白/松绿视觉，样式写在 `globals.css` 的现有体系中，不新建主题。

```text
┌─ 识别到 2 条 · 以 10-20（周二）为基准 ─────────────────────────────┐
│ ┌ [✓ 待办] 灵感 技巧 Skill 提示词                         [移除] ┐ │
│ │ 标题  [交房租                                   ]              │ │
│ │ 截止  [2026-10-28]  提醒 [  :  ]   优先级 [中 ▾]               │ │
│ │ 📅 识别自「下周三」· 规则计算                                   │ │
│ │ 标签  [生活 ×] [+]                                              │ │
│ │ 原文：下周三交房租                                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ ┌ 待办 [✓ 灵感] 技巧 Skill 提示词                         [移除] ┐ │
│ │ 正文  番茄钟配合 AI 总结效果很好                                │ │
│ │ 日期  [2026-10-20]                                              │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [全部保存 Enter]   [按原文存为一条灵感]   [取消 Esc]               │
└─────────────────────────────────────────────────────────────────────┘
```

**每张卡片**：

- 顶部是五种类型的分段切换（复用 `toggle-group`），右侧是"移除"按钮。
- 各类型显示的字段：

  | 类型   | 字段                                                                            |
  | ------ | ------------------------------------------------------------------------------- |
  | 灵感   | 正文（多行文本框）、日期                                                        |
  | 待办   | 标题、截止日期、提醒时间（`datetime-local`）、优先级、备注（可折叠）            |
  | 技巧   | 标题、工具（多选，选项来自 `presetTools` 和设置中的自定义工具）、来源链接、正文 |
  | Skill  | 名称、链接、简介、备注；有 `skillContent` 时显示"已识别 SKILL.md 内容"标记      |
  | 提示词 | 标题、分类、正文，并显示识别到的变量（复用 `lib/template.ts`）                  |

  所有类型都有标签（复用 `TagInput`）。

- **日期说明行**：有 `dateText` 时显示"识别自「{dateText}」· 规则计算"，`date_source = ai` 时显示"AI 推断，请核对"（警告色）。日期旁边显示星期几（用 `date-fns` 的 `zhCN` locale），方便一眼核对。
- **警告**：每个警告在卡片内显示一行中文说明（`capture.warnings.<code>`）。低置信度的卡片左边框用警告色。
- **原文**：折叠显示 `source`，默认展开有 `SourceMismatch` 警告的卡片。
- **Skill 自动补名称**：Skill 卡片名称为空且有链接时，在挂载时调用已有的 `appApi.linkTitle(url)` 填充名称；失败时不提示（与 Skill 详情页的现有行为一致）。
- **切换类型**（`convert.ts`，纯函数）：
  - 切到灵感：正文 = `source`；
  - 切到待办：标题 = 当前标题，为空时取 `source` 第一行（截断到 500 字）；备注 = `source`；
  - 切到技巧或提示词：正文 = `source`，标题保留；
  - 切到 Skill：备注 = `source`，名称 = 当前标题；
  - 日期、链接、标签始终保留；从待办切到灵感时，`date` 设为今天。

**底部操作**：

- **全部保存**：把编辑后的条目交给 `captureApi.commit`。焦点在只读的快速输入框或卡片的单行字段上时按 `Enter` 也会触发；焦点在卡片的多行文本框中时 `Enter` 正常换行。`Ctrl+Enter` 在任何位置都能触发。待办标题为空时禁用，并在对应字段上提示。
- **按原文存为一条灵感**：不采用拆分结果，直接把完整原文存为一条灵感。
- **取消**（`Esc`）：关闭面板，文字保留在输入框中，回到 idle。
- 识别结果全部被移除时，"全部保存"禁用。
- 面板顶部按需显示：`partialCoverage` 时提示"部分原文可能没有被整理进去，请核对"；`truncated` 时提示"输入过长，只分析了前面的内容"。

**保存成功后**：清空输入框，关闭面板，弹出 `sonner` 提示：

```text
已整理 2 条：待办 ×1（截止 10-28）、灵感 ×1        [查看] [撤销]
```

- 只有一条时，「查看」跳转到该条目的详情（`/${routes[kind]}/${id}`）；多条时跳转到第一条所在的模块。
- 「撤销」调用 `captureApi.undo({ refs, createdAt })`；`skipped > 0` 时提示"已编辑过的条目已保留"。
- 提示的显示时长为 8 秒。

**直接保存模式**：`capture.autoSave = true` 且 `autoSaveEligible = true` 时，分析完成后不显示面板，直接调用 `commit`，然后弹出同样的提示（带撤销）。不满足条件时照常显示面板，并在面板顶部说明"有需要确认的内容，未自动保存"。

### 4.6 设置页

在 `SettingsPage` 的 `general` 分区新增一组「今日智能整理」：

- [x] 有可用模型时，今日输入框默认使用智能整理（`capture.smartDefault`）
- [ ] 识别结果可靠时直接保存，不再确认（可撤销）（`capture.autoSave`）
- 一行说明，以及「编辑智能整理模板」链接，跳转到 `#/settings/templates`。

写法参照 `V02Settings.tsx` 中的 `ReminderSettings`。

### 4.7 文案（`zh-CN.ts`）

新增 `capture` 分组，至少包括：模式名"智能"；智能模式的占位文字和提示；"正在整理…""取消"；面板标题"识别到 {count} 条 · 以 {date}（{weekday}）为基准"；全部保存、按原文存为一条灵感；字段名；日期说明（规则计算 / AI 推断，请核对）；八个警告码的中文说明；保存提示"已整理 {count} 条：{summary}"、查看、撤销、"已编辑过的条目已保留"；失败兜底文字；设置页两项开关和说明。

另外：

- `ai.smart_capture: '智能整理'`（模板列表等地方会按操作 key 取名称）；
- `errors.CANCELLED: '已取消。'`；
- `store.ts` 的 `actionKeys` 末尾加上 `'smart_capture'`，保持与 Rust 的 `KEYS` 一致。它**不加入**任何 AI 菜单或批量栏。

---

## 5. 测试

### 5.1 Rust

| 文件                           | 必测内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture/dates.rs`（表驱动）   | 固定"现在"为 `2026-10-20 14:30`（周二），覆盖 §3.4 表格中的每一行示例；中文数字（三天后、二十五号、十月二十五日）；`前/之前/截止` 后缀；月份边界：现在为 `2026-12-31` 时"明天"是 `2027-01-01`；`1月5日` 在 prefer_future 下是 `2027-01-05`；`15号` 在 prefer_future 下是 `11-15`，否则是 `10-15`；`2月30日` 返回 None；"下周""过几天"返回 None；时间：下午3点、下午两点、晚上8点半、上午10点20分、中午12点、凌晨1点、`9:15`                                                                                                                 |
| `capture/prefix.rs`            | 五种前缀，全角和半角冒号，大小写，前面有空白，前缀后面没有分隔符时不命中（如"灵感爆发了"）                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `capture/normalize.rs`         | 1 条结果时 source 改为原文；多条结果时 source 不匹配触发 `SourceMismatch`；覆盖率低于 60%；JSON 包在代码围栏中仍能解析；JSON 损坏时返回 `AI_BAD_RESPONSE`；超过 10 条只保留前 10 条；不在原文中的链接被丢弃；tip 从 source 中补链接；工具过滤与规范写法；标签按已有标签的写法归一；优先级越界；标题截断；skill 的 frontmatter 补齐名称和简介；prompt 正文不是原文子串时退回 source；前缀锁定为 1 条；日期组合规则（规则优先、AI 兜底并警告、编造的 dateText 被忽略、只有时间且已过去时顺延、过去的截止日期）；`autoSaveEligible` 的每个条件 |
| `capture/tests.rs`（wiremock） | 模拟 SSE 返回识别 JSON，走完整个分析流程得到预览；401 → `AI_AUTH`；取消 → `CANCELLED`；断言请求中的模板已渲染了 `now` 和 `known_tools`，日志中没有用户输入                                                                                                                                                                                                                                                                                                                                                                                  |
| commit / undo（内存数据库）    | 五种类型各提交一条，检查字段映射正确，都能被搜索到；某一条校验失败时整批不写入；撤销会彻底删除未编辑的条目，跳过已编辑的条目；撤销后回收站中没有这些条目                                                                                                                                                                                                                                                                                                                                                                                    |
| 回归                           | `seed_system_templates` 在旧数据库上补齐第 13 个模板，不覆盖用户对其他模板的修改；导入 v0.2.0 的 JSON 备份后智能整理模板存在；`settings.set` 接受两个新 key，拒绝非布尔值                                                                                                                                                                                                                                                                                                                                                                   |

### 5.2 前端（Vitest + `mockIPC`）

- **调整已有的 `QuickInput.test.tsx`**：它的 mock 对所有命令都返回 `{ id: 'test' }`，改为 `provider_list` 返回 `[]`，其他命令不变。原有断言（Tab 切到待办、Enter 调用 `todo_create`、输入框被清空）必须继续通过。
- 有可用模型时默认是智能模式；Enter 调用 `capture_analyze` 并传入文字；显示卡片；修改标题后点"全部保存"，`capture_commit` 收到修改后的内容；保存后输入框清空。
- 智能模式下 Ctrl+Enter 直接调用 `idea_create`，不调用 `capture_analyze`。
- 分析中按 Esc 会调用 `ai_cancel`，文字保留，不显示错误。
- `capture_analyze` 返回 `NETWORK` 错误时显示兜底提示，点"存为灵感"调用 `idea_create`，文字不丢失。
- `capture.autoSave = true` 且 `autoSaveEligible = true` 时不显示面板，直接调用 `capture_commit`；点击提示中的撤销会调用 `capture_undo`。`autoSaveEligible = false` 时仍然显示面板。
- `convert.ts`：五种类型之间互相切换时 source、日期、标签不丢失。
- 卡片显示日期说明和 AI 推断警告。
- 没有可用模型时，Tab 只在灵感和待办之间切换，不出现"智能"。

---

## 6. 文档更新

- `docs/ARCHITECTURE.md`：§6.8 的 IPC 表增加三个命令；§6.10 的操作注册表增加 `smart_capture` 一行；§7.9 设置表增加两项；在 §7.5 的"今日"一行注明"智能整理见 ADDENDUM-smart-capture.md"。
- `docs/DECISIONS.md`：新增「智能整理决策（0.2.1）」，记录 §1 中的三项产品决策、规则优先的日期策略、原文与链接只来自用户输入、撤销是彻底删除，以及施工中的其他补充决定。
- `docs/PROGRESS.md`：记录第 8 节验收结果，**分开写**模拟服务的自动化结果和真实服务商的人工结果。
- `README.md`：功能列表中加上一行"今日智能整理"。

---

## 7. 实施顺序（同一批次内的建议顺序）

1. `ErrorCode::Cancelled`、设置两项、`PRESET_TOOLS` 与 `src/lib/tools.ts`。
2. `dates.rs` 和 `prefix.rs`，先写表驱动测试再实现。
3. 模板、`actions.rs` 注册和新变量，`normalize.rs` 及其测试。
4. 三个命令和 wiremock、commit/undo 测试。运行 `pnpm gen:types`。
5. 前端：`captureApi`、`useAiAvailable`、`useSmartCapture`、`QuickInput` 改造、失败兜底。
6. `CapturePreview`、`CaptureCard`、`convert.ts`、保存提示与撤销、直接保存模式。
7. 设置页、文案、文档、版本号。运行 `pnpm check` 和 `pnpm build`，做第 8 节验收。

---

## 8. 验收清单

以下"今天"指验收当天，期望日期按当天推算。真实服务商建议至少测一家（如 DeepSeek 或硅基流动）。

**识别与日期**（真实服务商，结果卡片中检查）

- [ ] `明天下午3点前把周报发给老板` → 待办；标题类似"把周报发给老板"（不含日期词）；截止日期为明天；提醒时间为明天 15:00；日期说明显示"规则计算"。
- [ ] `突然想到可以按周把灵感自动整理成选题` → 灵感；日期为今天；正文与输入完全一致。
- [ ] `Claude Code 里用 /compact 可以压缩上下文，长对话很好用` → Agent 技巧；工具为 Claude Code；正文与输入完全一致。
- [ ] `这个 skill 不错 https://github.com/anthropics/skills` → Skill；链接与输入完全一致；名称自动填充；备注为原文。
- [ ] `提示词：你是资深编辑，请把 {{topic}} 写成 300 字的小红书文案` → 提示词；正文不含"提示词："；识别出变量 topic。
- [ ] `下周三交房租；另外记一下：番茄钟配合 AI 总结效果很好` → 2 条：待办（截止下周三）和灵感。
- [ ] `25号之前提交报销` → 待办，截止日期为本月 25 日（已过则为下月 25 日）。
- [ ] `昨天想到一个点子：用 AI 自动写周报` → 灵感，日期为昨天。
- [ ] `待办：整理书架` → 前缀锁定为 1 条待办，没有截止日期。

**交互与安全**

- [ ] 默认模式下按 Enter 显示卡片，再按 Enter 全部保存；对应模块和今日页立即出现这些条目；提示中的「撤销」可以把它们彻底删除（回收站中也没有）。
- [ ] 卡片中切换类型、修改字段、移除某条后保存，结果与编辑一致。
- [ ] Ctrl+Enter 不经过 AI 直接存为灵感。
- [ ] 分析中按 Esc 取消，文字保留，没有错误提示。
- [ ] 删除模型配置（或清空 Key）后，输入框中没有"智能"模式，Tab 在灵感和待办之间切换，与 v0.2.0 一致。
- [ ] 断网或填错 Key 时，显示失败兜底提示，文字保留，「存为灵感」「存为待办」可用，Key 错误时出现「去设置」。
- [ ] 打开"直接保存"后，可靠的输入直接保存并出现撤销提示；带有"AI 推断"日期或低置信度的输入仍然显示卡片。
- [ ] 在设置 → AI 模板中可以看到并编辑"智能整理"模板，恢复默认可用；把模板改坏后，失败兜底正常工作。
- [ ] 让 AI 返回原文中没有的链接（可用 wiremock 自动化测试代替），链接不会被保存。
- [ ] 日志中没有用户输入内容、AI 输出内容和 API Key。
- [ ] 导出 JSON 后再导入，两个新设置项保留；导入 v0.2.0 的旧备份不报错。
- [ ] v0.2.0 的所有自动化测试和原生回归脚本继续通过。

---

## 9. 给 Codex 的提示词（复制使用）

```text
请先阅读 docs/ARCHITECTURE.md、docs/DECISIONS.md、docs/PROGRESS.md，再完整阅读 docs/ADDENDUM-smart-capture.md，然后在当前 v0.2.0 代码（提交 679100e）的基础上实施这份补充方案的全部内容。
要求：
1. 严格遵守补充方案第 0 节的约定：不引入新依赖、不新增迁移、保持 commands → services → repo 分层，services/capture 不依赖 tauri。
2. 质量红线：AI 不改写用户原文；链接只能来自原文；日期以 Rust 规则解析为准，AI 推断只作兜底并在界面标注；任何失败或取消都不能丢失用户输入；没有可用模型时行为与 v0.2.0 完全一致。
3. 按第 7 节顺序施工，日期解析和前缀识别先写表驱动测试再实现；按第 5 节补齐 Rust 与前端测试。
4. 完成后运行 pnpm check 直到全部通过，并确认 pnpm build 成功；版本号升到 0.2.1。
5. 按第 6 节更新文档，在 docs/PROGRESS.md 中逐项记录第 8 节验收结果，模拟服务结果和真实服务商结果分开写。
6. 最后输出：完成情况摘要、与本方案不一致之处及原因、需要我用真实 API Key 手动验证的项目。
```
