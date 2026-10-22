# v0.5 施工方案：首页输入框「六类目标整理」+「单轮过程栏」

> 基线：0.4.4，提交 `a62d705`。本方案配套的**框架代码已落在工作区（未提交）**，Codex 在此基础上施工。
> 所有带 `TODO(v0.5 …)` 的注释都是预留的施工点，可用 `rg "TODO\(v0.5"` 找到。

---

## 0. 需求原文与解读

| #   | 用户需求                                                                                  | 解读                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | 左下角的选择变成六个选项：灵感、待办、Skill、提示词、Agent 技巧、作品素材库               | 取消原来的「智能 / 灵感 / 待办」三种模式，换成**目标模块选择器**。选中的模块就是这次输入的去向。                                                    |
| R2  | 选中任一选项后，可以输入相关素材、链接和要整理的内容，AI 自动整理进对应界面               | 有可用模型时，Enter 一律走 AI 整理，并**强制目标类型**为所选模块。预览、编辑、保存、撤销仍沿用 v0.2.1 的智能整理流程。                              |
| R3  | AI 回复做流式输出                                                                         | 新增流式命令 `capture_analyze_stream`，实时推送阶段事件和模型输出增量。                                                                             |
| R4  | 聊天框正中上方加一个按钮，可展开「思考过程」和「回复结果」：AI 做了什么、内容整理到了哪里 | 输入框上方居中放一个过程按钮，点开是过程栏，分「思考过程」（阶段步骤 + 模型流式输出）和「回复结果」（整理到哪个模块、标题、查看链接）。             |
| R5  | 只做一轮，不做上下文记忆；看完即可清除；退出过程栏时提示将清除，确认后清除                | 过程只放内存（zustand），不落库、不回传模型。新一轮直接替换旧的一轮。**关闭已结束一轮的过程栏时弹确认框**，确认后清空；运行中收起只是隐藏，不清除。 |

---

## 1. 已完成的框架（本次交付）

### 1.1 后端（Rust）

| 文件                                      | 改动                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/domain/capture.rs`         | `CaptureAnalyzeInput` 新增 `target: Option<EntityType>`（带 `#[serde(default)]`，旧调用方不受影响）。新增 `CaptureStage`（preparing / requesting / streaming / normalizing / ready）和 `CaptureStreamEvent`（`stage{stage, model}` / `delta{text}`）。                                                   |
| `src-tauri/src/services/capture/mod.rs`   | 新增 `prepare_for(conn, text, target, now)`：`forced = target.or(前缀识别)`，并在最后一条 user 消息末尾追加 `target_hint`，所以用户改过的 `smart_capture` 模板依然有效。新增 `analyze_with(…, forward)`，转发每个 `AiStreamEvent`。`prepare` 和 `analyze` 保留原签名作为包装，旧测试和原生脚本无需修改。 |
| `src-tauri/src/commands/capture.rs`       | 新增 `capture_analyze_stream(input, on_event: Channel<CaptureStreamEvent>) -> CapturePreview`，校验规则与 `capture_analyze` 一致。旧命令保留，也接受 `target`。                                                                                                                                          |
| `src-tauri/src/lib.rs`                    | 注册新命令。                                                                                                                                                                                                                                                                                             |
| `src-tauri/src/services/capture/tests.rs` | 新增 `explicit_target_wins_over_prefix_and_appends_hint`。                                                                                                                                                                                                                                               |
| `src/types/bindings/*`                    | 由 `pnpm gen:types` 生成：`CaptureStage.ts`、`CaptureStreamEvent.ts`，以及更新后的 `CaptureAnalyzeInput.ts`。                                                                                                                                                                                            |

### 1.2 前端

| 文件                                              | 改动                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/capture/targets.ts`                 | **六个目标的唯一定义**，含顺序（即 Tab 顺序）、图标、文案 key、占位符、是否可手动保存。`availableTargets(ai)`：没有模型时只剩灵感和待办。                                                                               |
| `src/features/capture/TargetPicker.tsx`           | 左下角选择器，用 Radix DropdownMenu 的 RadioGroup 实现，菜单向上弹出。按钮的可访问名称就是模块名。                                                                                                                      |
| `src/features/capture/process/store.ts`           | `useCaptureProcess`：单轮过程状态，含 `runId / target / input / phase / steps / output / results / open`，提供 `begin / step / delta / finish / saved / setOpen / clear`。所有写入按 `runId` 隔离，迟到的事件会被丢弃。 |
| `src/features/capture/process/CaptureProcess.tsx` | 顶部居中的过程按钮和过程栏。运行中收起不清除；已结束时关闭会弹 `ConfirmDialog`，确认后调用 `clear()`。                                                                                                                  |
| `src/features/capture/useSmartCapture.ts`         | `analyze(text, target)` 改走 `analyzeStream` + `Channel`，并写入过程 store。`save` 成功后写入 `results`（模块、标题、ref），失败时记一条 failed 步骤。                                                                  |
| `src/features/home/HomeComposer.tsx`              | `Mode = EntityType`。有模型时 Enter 调 `smart.analyze(value, kind)`，Ctrl+Enter 不经 AI 直接存为灵感；没有模型时仍是原来的灵感/待办手动保存。`<CaptureProcess />` 放在输入框上方。                                      |
| `src/lib/api/capture.ts`                          | `captureApi.analyzeStream`。                                                                                                                                                                                            |
| `src/i18n/zh-CN.ts`                               | `capture.targets / placeholders / process.*` 以及选择器相关文案。                                                                                                                                                       |
| `src/styles/home.css`                             | 末尾追加 `.capture-process*` 和 `.capture-target-*` 样式，使用 sea 主题的 `--surface-*` 变量。                                                                                                                          |
| 测试                                              | 旧测试改为识别 `capture_analyze_stream` 和 AI 占位符；新增 `process/process.test.tsx`，覆盖六类 Tab 切换、`target` 传参、保存后显示去向、关闭时确认并清除。                                                             |

### 1.3 框架当前状态

- `pnpm typecheck` 通过；`pnpm lint` 通过（只有 `ContentList.tsx` 一条原有警告）。
- `pnpm test`：35 个文件、105 项通过。
- `pnpm check:rust`：fmt、clippy（`-D warnings`）和 145 项测试通过，之后新增的 1 项单独运行也通过。
- **尚未做**：在桌面窗口里实际运行验证（`pnpm dev`）、真实模型联调、视觉打磨、版本号升级。

---

## 2. 关键设计决策（Codex 不要自行推翻，如有异议请写入 `docs/DECISIONS.md`）

- **D1 目标优先级**：composer 选中的目标 > 文本前缀（如「技巧：」）> 模型自己的分类。前缀仍会从原文中去掉。
- **D2 保留确认步骤**：AI 整理后照旧显示可编辑的 `CapturePreview`，确认后才写库。`captureAutoSave` 打开且结果可靠时自动保存，行为不变。
- **D3 只有一轮**：过程 store 不持久化，不进备份，不进对话历史，也不作为上下文发给模型。新一轮 `begin()` 会直接覆盖旧一轮（不弹确认，因为需求明确只保留一轮）。
- **D4 清除确认**：只在**关闭已结束一轮**（preview / saved / error / cancelled）时弹确认。运行中点按钮只收起，不清除，也不取消请求；取消仍用输入框里的「取消」或 Esc。
- **D5 隐私**：流式文本只通过 Channel 发给发起请求的窗口，Rust 侧不记日志。API Key 已由 `Redactor` 脱敏。`reasoning_content` 目前**仍被丢弃**（见 Phase 3）。
- **D6 兼容**：旧命令 `capture_analyze` 保留（供 `scripts/smart-capture-native.mjs` 使用），不改数据库 Schema，不新增依赖。
- **D7 `captureSmartDefault`**：框架里已不再用它切换手动模式（有模型就走 AI）。Phase 2 把它替换为「默认整理目标」。

---

## 3. 接口契约

```ts
// IPC
invoke<CapturePreview>('capture_analyze_stream', {
  input: { requestId, providerId, text, target /* EntityType | null */ },
  onEvent: Channel<CaptureStreamEvent>,
});
// 事件顺序（成功时）
stage(preparing) → stage(requesting, model) → stage(streaming) → delta* → stage(normalizing) → stage(ready) → 返回 CapturePreview
// 失败或取消：命令 reject AppError（CANCELLED / AI_* / NETWORK …），前端 store.finish('error' | 'cancelled')
```

过程 store 的 phase 流转：

```
begin → running ──成功──▶ preview ──保存成功──▶ saved
                 ├─失败──▶ error
                 └─取消──▶ cancelled
任意已结束状态 ──关闭并确认──▶ clear()（runId=null，按钮消失）
```

---

## 4. 施工任务

### Phase 1 交互收尾（必须）

1. **桌面端走查**：运行 `pnpm dev`，在海底主题的深色和浅色下检查：选择器菜单的层级（`z-index`，是否被 `.home-composer { overflow:auto }` 裁切；菜单已用 Portal），过程按钮在 `max-height:54vh` 下的滚动表现，以及过程栏、预览卡片和输入框三者的垂直排列。
2. **选择器键盘体验**：Tab 循环保持不变。菜单内支持方向键和 Enter（Radix 自带）。可选：Alt+1…6 直接选中。选中项高亮，菜单底部有「需配置模型」提示。
3. **前缀自动同步**：用户输入「技巧：」「skill:」等前缀时，前端自动把选择器切到对应目标。规则复用 Rust `prefix.rs` 的表，可在前端写一份同表并加单测。
4. **过程栏细节**：
   - 首次流式开始时，按钮做一次轻微提示（呼吸或高亮），**不要**自动展开。
   - 「思考过程」里步骤带相对耗时（`at` 差值）；模型输出 `<pre>` 在流式时自动滚到底。
   - 「回复结果」里每条提供「查看」链接（已实现）和「撤销」按钮（复用 `notify.ts` 里的撤销逻辑，抽成公共函数）。
   - 过程栏打开时 Esc 等同于关闭（走确认）。确认框取消后焦点回到关闭按钮。
5. **离开首页**：`active=false` 时请求会被取消（已有逻辑），过程 store 保留 cancelled 状态。回到首页后按钮仍在，可查看或清除。

### Phase 2 目标化整理质量（必须）

1. **按目标细化提示**：把 `target_hint` 扩展成每个模块一段字段规则，例如 skill 提取名称、简介、url，可识别 SKILL.md；material 判断 work 还是 component，组件提示词必须逐字摘录；prompt 提取正文和变量。写在 `services/capture/mod.rs`，并补测试。
2. **同一类型多条**：现在 `forced` 时只取 1 条。新增 `Context.target`（与前缀 `forced` 区分），指定目标时允许最多 10 条**同类型**条目（例如一次粘贴 3 个 Skill 链接）。需要重新检查 `normalize.rs` 里 `single` 和覆盖率的逻辑，并补 `normalize/tests.rs`。
3. **链接类内容**：skill 和 material 目标只有一个 URL、没有标题时，预览阶段沿用现有的 `link_fetch_title` 自动补标题（仅限预览，不自动联网保存）。
4. **默认整理目标设置**：用 `capture.defaultTarget`（`EntityType` 字符串，默认 `idea`）替换 `capture.smartDefault`。需要改 `repo/settings.rs` 的读写和校验、`Settings` 类型、`CaptureSettings.tsx` 的 UI，以及备份兼容（旧备份里的 `capture.smartDefault` 忽略即可）。
5. **没有模型时**：保持只有灵感和待办可选（D6/D7）。不要为 Skill 等目标做手动建档，那是各模块页面的职责。

### Phase 3 思考过程增强（建议）

1. **推理内容（reasoning_content）**：`sse.rs` 的 `Decoder` 增加一个开关 `with_reasoning`，开启时对 `/choices/0/delta/reasoning_content` 输出 `Chunk::Reasoning`。**只有 capture 流式命令开启**，其他 AI 动作保持丢弃（现有测试 `split_utf8_crlf_and_multiple_events` 必须继续通过）。`AiService::run` 需要一个变体透传 reasoning，同样经过 `Redactor` 脱敏。`CaptureStreamEvent` 增加 `Reasoning { text }`，前端在「思考过程」里单独折叠显示。
2. **输出可读化**：模型输出的是 JSON，直接展示可读性差。前端增加 `process/partial.ts`，对流式 JSON 做容错的部分解析，逐条显示「识别到：技巧 · 压缩上下文」。原始 JSON 放进「原始输出」二级折叠。补单测，覆盖半截字符串和转义字符。
3. **结果摘要**：保存后用一句话总结，例如「整理 2 条到 Skill 库，1 条带链接」。

---

## 5. 不做 / 禁止

- 不做多轮对话和上下文记忆；不把过程写入数据库、备份、日志或剪贴板。
- 不修改 `0001_init.sql` / `0002_v02.sql`，不加迁移（Phase 2 的设置走现有 settings 表）。
- 不新增 npm 或 cargo 依赖。
- 不改动神经元场景、海底背景，只通过 `homeBus` 发事件（已有的 analyzing / settled / saving / committed 保持不变）。
- 不删除旧命令 `capture_analyze`。

---

## 6. 验收清单

| #   | 场景                                    | 预期                                                                                       |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| A1  | 有模型时点左下角                        | 弹出 6 项，顺序为：灵感、待办、Skill、提示词、Agent 技巧、作品素材库。Tab 按同样顺序循环。 |
| A2  | 无模型                                  | 只有灵感和待办，菜单有配置提示；Enter 直接保存，和 0.4.4 一致。                            |
| A3  | 选「Skill」后粘贴一个 GitHub 链接并回车 | 过程按钮出现并转圈；展开后能看到步骤依次出现、模型输出逐字增长；预览卡片类型为 Skill。     |
| A4  | 保存                                    | 回复结果显示「已整理到「Skill」：xxx」并可查看；Skill 库计数 +1，神经元有 committed 动效。 |
| A5  | 输入「待办：…」但选择器在「提示词」     | Phase 1 完成后选择器自动切到待办。未完成前以选择器为准（D1）。                             |
| A6  | 运行中点过程按钮收起                    | 不弹确认，请求继续。                                                                       |
| A7  | 一轮结束后关闭过程栏                    | 弹「关闭并清除本轮过程？」；取消则保持打开；确认则按钮消失，内存中无残留。                 |
| A8  | 第二次提交                              | 旧一轮被新一轮替换，过程中没有旧内容。                                                     |
| A9  | Esc 取消、网络错误、Key 错误            | 过程栏分别显示已取消 / 失败及原因，输入原文保留，降级按钮可用。                            |
| A10 | Ctrl+Enter                              | 不调用模型，直接存为灵感，不产生过程记录。                                                 |
| A11 | 隐私                                    | 日志里没有输入原文和模型输出；流式文本里 Key 被替换为 `[REDACTED]`。                       |
| A12 | 回归                                    | `pnpm check`、`pnpm build` 通过；`scripts/smart-capture-native.mjs` 通过。                 |

## 7. 交付要求

- 版本号升到 `0.5.0`（`package.json`、`src-tauri/Cargo.toml`、`tauri.conf.json`）。
- 在 `docs/PROGRESS.md` 追加 v0.5 逐项验收记录，真实模型联调的结果单独写，不要把模拟结果当作真实结果。
- 按 Phase 1 / 2 / 3 分开提交；每次提交前运行 `pnpm check`。
