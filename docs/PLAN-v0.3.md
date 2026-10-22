# 施工方案：作品素材库 + 神经元首页（v0.3 / v0.4）

| 项目         | 内容                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 文档版本     | v1.0                                                                                                                                  |
| 日期         | 2026-10-21                                                                                                                            |
| 基线         | Workbench 0.2.1，提交 `d30fa9b`，工程目录 `C:\dev\workbench`                                                                          |
| 依据         | `docs/ARCHITECTURE.md`、`docs/ADDENDUM-smart-capture.md`、`docs/DECISIONS.md`，交互原型 `docs/design-refs/neuron-home-prototype.html` |
| 建议存放位置 | `docs/PLAN-v0.3.md`                                                                                                                   |
| 批次         | **批次 A：作品素材库**（0.3.0）→ **批次 B：神经元首页与导航**（0.4.0）                                                                |

---

## 0. 给 Codex 的工作约定

1. 先读 `docs/ARCHITECTURE.md`、`docs/ADDENDUM-smart-capture.md`、`docs/DECISIONS.md`、`docs/PROGRESS.md`，再读本文。本文与旧文档冲突时，以本文为准，但只限本文范围。
2. **每次只做一个批次**。批次 A 完成并通过验收后，才能开始批次 B。
3. 依赖：只允许新增 §2 列出的依赖，引入前在 `docs/DECISIONS.md` 写明理由；批次 B 的渲染技术选型见 §9.4。
4. 数据库变更只能通过新增迁移 `0003_materials.sql`，不得修改 `0001`、`0002`。
5. 沿用分层 `commands → services → repo`，DTO 用 `ts-rs` 生成，文案集中在 `src/i18n/zh-CN.ts`，配色只用现有语义 CSS 变量（`--primary`、`--background`、`--warning` 等），**不新增配色**。
6. 已有测试必须继续通过。因接口变化必须调整已有测试时，只能改 mock 或入口，不能删除断言，并在 `DECISIONS.md` 说明。
7. 完成标准：`pnpm check` 全部通过，`pnpm build` 产出安装包，本批次验收清单逐项写入 `docs/PROGRESS.md`，并把模拟结果和真实环境结果分开记录。

**产品负责人已确认的决策**

| #   | 决策                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | 原「灵感」保留，改名为 **灵感池**，作为首页中央大神经元，代表“随手记的收件箱”                                                                                                         |
| P2  | 新增 **作品素材库**，分「完整作品」（链接 + 多张图片）和「UI 组件」（图片 / GIF / 视频预览 + 旁边的提示词按钮，点开弹出可发给 AI 的 UI 生成提示词），**不做代码实时预览**             |
| P3  | 首页改为神经元舞台：五个板块是外围小神经元，点击进入对应板块；首页底部输入栏就是智能整理入口                                                                                          |
| P4  | 完整开场动画每天只播放一次；之后打开或从板块返回都直接进入展开状态                                                                                                                    |
| P5  | 暂不改配色                                                                                                                                                                            |
| P6  | **神经元的形态与动效由 Codex 参考产品负责人提供的素材（`docs/design-refs/neuron/`）自行设计**。原型中的神经元画法只是占位，不作为视觉依据；原型中的交互流程、布局与状态机是依据（§9） |

---

## 1. 为什么先做作品素材库

- 首页的五个神经元都要显示真实数量和最近内容，先有素材库的数据，首页一次就能接完整，不用临时占位。
- 素材库是确定性的功能（数据、文件、备份），可以完全自动化验收；神经元视觉要根据素材反复调整，放在后面不会卡住功能交付。
- 批次 A 期间，素材库先作为侧栏里的一个新入口使用。批次 B 再拆掉侧栏，换成神经元首页和板块页顶栏。

---

## 2. 新增依赖

| 批次 | 依赖                                                     | 用途                                                                 |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| A    | Rust `sha2`                                              | 素材文件去重与完整性校验                                             |
| A    | Rust `zip`（`default-features = false`，开启 `deflate`） | 含图片的完整备份包                                                   |
| A    | Tauri feature `protocol-asset`                           | 让 WebView 通过 `asset:` 协议读取本地素材文件（支持视频 Range 请求） |
| B    | 渲染库最多一个，见 §9.4                                  | 神经元渲染                                                           |

前端在批次 A 不新增依赖（瀑布流自己实现，拖拽排序用原生 HTML5 拖放）。

---

# 批次 A：作品素材库（0.3.0）

## 3. 数据模型

### 3.1 迁移 `0003_materials.sql`

```sql
CREATE TABLE material (
  id             TEXT PRIMARY KEY,
  kind           TEXT    NOT NULL CHECK (kind IN ('work', 'component')),
  title          TEXT    NOT NULL DEFAULT '',
  url            TEXT,                          -- 作品链接（组件也可选填来源）
  note_md        TEXT    NOT NULL DEFAULT '',   -- 备注
  prompt         TEXT    NOT NULL DEFAULT '',   -- 仅组件：UI 生成提示词
  cover_asset_id TEXT,                          -- 封面；为空时取排序第一张
  is_starred     INTEGER NOT NULL DEFAULT 0,
  origin_type    TEXT,
  origin_id      TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
CREATE INDEX idx_material_list ON material(deleted_at, kind, updated_at DESC);

CREATE TABLE material_asset (
  id            TEXT PRIMARY KEY,
  material_id   TEXT    NOT NULL REFERENCES material(id) ON DELETE CASCADE,
  media_kind    TEXT    NOT NULL CHECK (media_kind IN ('image', 'gif', 'video')),
  mime          TEXT    NOT NULL,
  file_name     TEXT    NOT NULL,     -- 存储名：<id>.<ext>，相对 assets 目录的路径见 §4.1
  original_name TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  sha256        TEXT    NOT NULL,
  width         INTEGER,
  height        INTEGER,
  duration_ms   INTEGER,
  thumb_name    TEXT,                 -- 缩略图存储名，可为空
  sort_order    REAL    NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_material_asset ON material_asset(material_id, sort_order);
CREATE INDEX idx_material_asset_sha ON material_asset(sha256);

-- entity_tag 的 CHECK 约束不含 material，SQLite 不能修改约束，只能重建表
CREATE TABLE entity_tag_new (
  entity_type TEXT NOT NULL CHECK (entity_type IN ('idea', 'todo', 'tip', 'skill', 'prompt', 'material')),
  entity_id   TEXT NOT NULL,
  tag_id      TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_type, entity_id, tag_id)
);
INSERT INTO entity_tag_new SELECT entity_type, entity_id, tag_id FROM entity_tag;
DROP TABLE entity_tag;
ALTER TABLE entity_tag_new RENAME TO entity_tag;
CREATE INDEX idx_entity_tag_tag ON entity_tag(tag_id);
```

迁移测试：在一个带标签数据的 v2 数据库上执行，确认标签关联条数不变，外键检查（`PRAGMA foreign_key_check`）通过。

### 3.2 `EntityType` 增加 `Material`

`domain/common.rs` 的 `EntityType` 增加 `Material`（序列化为 `material`，表名 `material`），`ALL` 改为 6 项。下面这些地方会受影响，必须逐一适配并补测试：

| 位置                                 | 适配内容                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `repo/common.rs`                     | 软删除、恢复、彻底删除、星标、标签都要支持 material；彻底删除时按 §4.4 处理文件   |
| `repo/search.rs`                     | 索引：title = 标题；body = 备注 + 提示词 + 链接 + 所有素材的原文件名；tags = 标签 |
| `repo/trash.rs`                      | 回收站列出素材，标题为空时显示「未命名作品 / 未命名组件」                         |
| `services/ai/context.rs`             | 作为 AI 上下文时拼装「标题 + 链接 + 备注 + 提示词」，不发送图片                   |
| `services/ai/chat.rs` 的 `@` 引用    | 可以引用素材                                                                      |
| `services/data.rs`                   | 备份 `TABLES` 增加 `materials`、`materialAssets`（§4.6）                          |
| `services/markdown_export.rs`        | §4.7                                                                              |
| `services/capture/*`                 | 智能整理支持素材（§6）                                                            |
| 前端 `lib/api/content.ts`            | `kinds`、`routes`（`material: 'materials'`）、`titleOf`、`bodyOf`                 |
| 命令面板、批量删除和加标签、回收站页 | 支持新类型                                                                        |

### 3.3 DTO（`domain/material.rs`）

```rust
pub struct Material {
    pub id: String,
    pub kind: String,                  // work | component
    pub title: String,
    pub url: Option<String>,
    pub note_md: String,
    pub prompt: String,
    pub cover_asset_id: Option<String>,
    pub assets: Vec<MaterialAsset>,    // 按 sort_order 排序
    pub is_starred: bool,
    pub origin: Option<Origin>,
    #[ts(type = "number")] pub created_at: i64,
    #[ts(type = "number")] pub updated_at: i64,
    #[ts(type = "number | null")] pub deleted_at: Option<i64>,
    pub tags: Vec<Tag>,
}
pub struct MaterialAsset {
    pub id: String,
    pub media_kind: String,            // image | gif | video
    pub mime: String,
    pub original_name: String,
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub path: String,                  // 绝对路径，前端用 convertFileSrc 转成 URL
    pub thumb_path: Option<String>,
    pub missing: bool,                 // 文件丢失时为 true，界面显示占位
}
pub struct MaterialInput {             // 整对象替换语义，与其他模块一致
    pub kind: String,
    pub title: String,
    pub url: Option<String>,
    pub note_md: String,
    pub prompt: String,
    pub cover_asset_id: Option<String>,
    pub tags: Vec<String>,
}
```

`ListQuery` 复用现有结构，新增可选字段 `material_kind`（`work` | `component`）。列表默认按 `updated_at` 倒序，星标优先。

---

## 4. 素材文件存储

### 4.1 目录

```text
<dataDir>/
├── workbench.db
├── backups/
└── assets/
    ├── 2026/10/<assetId>.<ext>     原文件，按导入月份分目录
    ├── thumbs/<assetId>.webp       缩略图
    └── _purged/<assetId>.<ext>     彻底删除后的暂存区，保留 30 天
```

`paths.rs` 增加 `assets_dir`，启动时创建。`data_change_dir`（更改数据目录）必须**同时复制 `assets/`**，复制完成且校验数量一致后才写入 `bootstrap.json`。

### 4.2 导入规则（`services/assets.rs`）

| 类型  | 扩展名               | 文件头校验                                              | 单个上限 |
| ----- | -------------------- | ------------------------------------------------------- | -------- |
| image | png、jpg、jpeg、webp | PNG `89 50 4E 47`、JPEG `FF D8 FF`、WebP `RIFF....WEBP` | 30 MB    |
| gif   | gif                  | `GIF87a` / `GIF89a`                                     | 30 MB    |
| video | mp4、webm            | MP4 第 4–8 字节为 `ftyp`；WebM `1A 45 DF A3`            | 300 MB   |

- 不接受 SVG，因为可能内嵌脚本。
- 扩展名和文件头必须一致，否则返回 `VALIDATION`。
- 一次最多导入 50 个文件。
- 文件以流式方式复制，边复制边计算 SHA-256，先写临时文件，成功后再改名为正式文件，避免半个文件。
- 同一个素材内 SHA-256 相同的文件跳过，并在结果中返回 `skipped`。
- 数据库记录在文件落盘之后、同一个事务里写入；事务失败时删除刚复制的文件。

### 4.3 IPC 命令（`commands/materials.rs`）

除了和其他模块一致的 `material_list / get / create / update / set_starred / delete`，再增加：

| 命令                    | 输入 → 输出                                                                                       | 说明                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `material_import_files` | `{ materialId?, kind?, paths[] }` → `{ material, added, skipped }`                                | 来自文件对话框或拖放（Tauri 的 `onDragDropEvent` 提供路径）。没有 `materialId` 时，每个文件新建一个作品（`kind` 默认为 work），标题取文件名 |
| `material_import_bytes` | 原始二进制请求体，元数据放在请求头 `x-material-id`、`x-kind`、`x-mime`、`x-name` → 同上           | 用于 `Ctrl+V` 粘贴截图。用 `tauri::ipc::Request` 读取 `InvokeBody::Raw`，**不要用 JSON 数组传字节**                                         |
| `asset_set_thumbnail`   | 原始二进制（WebP）+ 请求头 `x-asset-id`、`x-width`、`x-height`、`x-duration-ms` → `MaterialAsset` | 前端生成缩略图后回传（§5.4）                                                                                                                |
| `asset_reorder`         | `{ materialId, ids[] }`                                                                           | 拖拽排序                                                                                                                                    |
| `asset_delete`          | `{ id }`                                                                                          | 删除单个文件：记录删除，文件移入 `_purged/`；如果是封面，清空 `cover_asset_id`                                                              |
| `material_set_cover`    | `{ materialId, assetId }`                                                                         | 设为封面                                                                                                                                    |
| `assets_usage`          | → `{ fileCount, totalBytes, purgedBytes }`                                                        | 设置页「数据」分区显示占用空间                                                                                                              |

所有变更命令都要广播 `data-changed { entity: "material" }`。

### 4.4 删除与清理

- 软删除素材时不动文件。
- 彻底删除（回收站彻底删除、清空回收站、30 天自动清理）在**事务提交后**把相关文件移入 `_purged/`。
- 启动时和每 24 小时清理一次：删除 `_purged/` 中超过 30 天的文件；`assets/` 中没有被任何记录引用、且修改时间超过 7 天的孤立文件移入 `_purged/`。
- 从数据库自动备份恢复后，如果记录引用的文件不在 `assets/` 但在 `_purged/` 中，就自动移回；都找不到时 `missing = true`，界面显示「文件缺失」占位，不报错。

### 4.5 WebView 读取文件

- `Cargo.toml` 为 tauri 开启 `protocol-asset`，`tauri.conf.json` 设置 `app.security.assetProtocol = { "enable": true, "scope": [] }`。
- 启动时（以及更改数据目录后）在 Rust 中调用 `app.asset_protocol_scope().allow_directory(assets_dir, true)`，只开放 `assets/` 目录。
- CSP 增加：`img-src 'self' data: https: asset: http://asset.localhost; media-src 'self' asset: http://asset.localhost`。
- 前端统一用 `convertFileSrc(path)` 生成地址，封装在 `lib/api/materials.ts` 的 `assetUrl()` 里。

### 4.6 备份格式升级

现有 JSON 备份装不下文件，改为完整备份包：

```text
workbench-backup-YYYYMMDD-HHmm.wbbackup   （zip）
├── manifest.json   { app, formatVersion: 2, schemaVersion: 3, exportedAt, assetCount, totalBytes }
├── data.json       与现有 JSON 备份的 data 结构相同，增加 materials、materialAssets
└── assets/         原文件与缩略图，路径与 §4.1 一致（不含 _purged）
```

- 设置 →「数据」的导出改为两个选项：**完整备份（含图片，.wbbackup，默认）** 和 **仅数据（.json，不含图片，旧格式）**。选「仅数据」时提示图片不会被备份。
- 导入同时支持 `.json`（`formatVersion` 1，`schemaVersion` 1–3）和 `.wbbackup`。
- zip 安全：
  - 只接受 `manifest.json`、`data.json` 和 `assets/` 下符合 `^\d{4}/\d{2}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif|mp4|webm)$` 或 `^thumbs/[0-9a-f-]{36}\.webp$` 的条目；
  - 拒绝绝对路径和 `..`（防止路径穿越）；
  - 单个文件和总解压大小有上限（总共 10 GB），并检查压缩比，防止压缩炸弹；
  - 导入时逐个校验文件的 SHA-256 与 `data.json` 一致。
- 导入流程沿用现有逻辑（先 `VACUUM INTO` 备份数据库，再在单事务中合并或覆盖）。文件导入**只新增、不删除**：
  - 覆盖模式下，旧文件变成孤立文件，按 §4.4 在 7 天后清理；
  - 合并模式下，按 `material_asset.id` 合并，SHA-256 相同的文件跳过复制。
- 每日自动备份仍然只备份数据库（不复制文件）。素材文件导入后不会被修改，所以文件不需要每日备份；彻底删除后的文件也会在 `_purged/` 保留 30 天，覆盖自动备份 7 份的范围。在设置页的备份说明中写明这一点。

### 4.7 Markdown 导出

增加：

```text
作品素材库/作品/<标题>/index.md          frontmatter：tags、url、created、updated；正文为备注，并用相对路径引用图片
作品素材库/作品/<标题>/<原文件名>         复制原文件
作品素材库/UI组件/<标题>/README.md       备注 + 素材引用
作品素材库/UI组件/<标题>/prompt.md       UI 生成提示词
作品素材库/UI组件/<标题>/<原文件名>
```

文件名清洗、重名加序号，沿用现有规则。

---

## 5. 前端：作品素材库页面

### 5.1 路由与文件

- 新增路由 `#/materials/:id?`，查询参数 `?tab=works|components`（默认 works）。
- 批次 A 在侧栏「灵感池」下方加一个「作品素材库」入口（图标 `Images`）。
- 侧栏和各处显示的「灵感」改名为「灵感池」（`nav.idea`），**路由 `#/ideas` 保持不变**，智能整理的条目类型仍叫「灵感」。

```text
src/lib/api/materials.ts
src/features/materials/
├── MaterialPage.tsx         顶部工具栏 + 分区切换 + 内容区 + 详情抽屉
├── WorksMasonry.tsx         完整作品：瀑布流
├── ComponentGrid.tsx        UI 组件：网格
├── MediaPreview.tsx         图片 / GIF / 视频预览（含懒加载与自动播放规则）
├── MaterialDrawer.tsx       右侧详情抽屉（编辑）
├── AssetManager.tsx         素材文件管理：排序、设封面、删除、添加
├── PromptDialog.tsx         提示词弹窗
├── useMaterialImport.ts     拖放、粘贴、文件对话框导入
├── thumbnail.ts             缩略图生成（纯函数，可测试）
├── masonry.ts               瀑布流布局计算（纯函数，可测试）
└── *.test.ts(x)
```

### 5.2 页面布局

- **顶部工具栏**：
  - 分区切换「完整作品 N / UI 组件 N」（沿用 `toggle-group`）；
  - 页面内筛选框（按标题、标签过滤，复用 `search_query` 加 `type:material` 过滤）；
  - 标签筛选和星标筛选；
  - 主按钮「＋ 添加作品 / ＋ 添加组件」。
- **拖放区**：在列表顶部放一个虚线提示条：「把作品截图、GIF 或短视频拖到这里，或 Ctrl+V 粘贴截图」。拖入文件时，整个页面出现高亮遮罩。
- **完整作品（瀑布流）**：
  - 按容器宽度计算列数（每列最小 240px，间距 18px）。
  - 卡片按「最短列优先」放置，根据封面的宽高比预先算出高度，**图片加载前布局就稳定**，追加数据时已有卡片不移动（`masonry.ts`）。
  - 每次加载 60 条，滚动到底部时加载下一页。
  - 卡片内容：封面缩略图、标题、链接域名或「本地图片」、图片数量、标签、星标。
  - 悬停时卡片上浮 3px；点击打开详情抽屉。
- **UI 组件（网格）**：`repeat(auto-fill, minmax(280px, 1fr))`。
  - 卡片上部是预览区（16:10），左上角标出 `GIF` / `视频` / `图片`。
  - 卡片下部左侧是名称和标签；**右侧是「✦ 提示词」按钮**，点击打开 `PromptDialog`。提示词为空时按钮显示为「＋ 提示词」，点击打开详情抽屉并定位到提示词编辑框。
- **预览播放规则**（`MediaPreview`）：
  - 图片：显示缩略图，详情中显示原图。
  - GIF：卡片进入视口时播放；动效强度为「关闭」时显示缩略图（第一帧）。
  - 视频：`muted`、`loop`、`playsInline`，以缩略图为封面。卡片进入视口（`IntersectionObserver`，阈值 0.6）时自动播放，离开视口时暂停；同一时间最多播放 4 个，多出的按离视口中心的距离排队。动效强度为「简洁」时只在悬停时播放，「关闭」时不自动播放。

### 5.3 详情抽屉（`MaterialDrawer`）

- 从右侧滑出，宽 520px，可以拖拽调宽。URL 中带上 `:id`，打开时列表仍然可以滚动和点击。
- 字段：标题、链接（「打开」按钮通过 opener 插件用系统浏览器打开）、标签、星标、备注（复用 `EditorPane`）。
- 组件额外有「UI 生成提示词」编辑器（CodeMirror Markdown 模式，可以识别双花括号变量），以及「复制」「发送给 AI 助手」按钮。
- `AssetManager`：
  - 横向缩略图条，可以拖拽排序；
  - 悬停时显示「设为封面」「删除」；
  - 末尾是「＋ 添加文件」按钮（打开文件对话框）。
- 主预览区显示当前选中的文件，可以用左右方向键切换；视频带原生控件。
- 自动保存沿用 `useAutosave`（停止输入 1 秒后保存）。

### 5.4 缩略图生成（`thumbnail.ts`）

导入成功后，前端为每个新文件生成缩略图：

- 图片和 GIF：用 `<img>` 加载 `assetUrl`，按长边 480px 等比缩小后画到 canvas。
- 视频：用 `<video>` 加载，跳到 `min(1s, 时长的 10%)` 处，等待 `seeked` 后截帧，同时读取时长。
- 用 `canvas.toBlob('image/webp', 0.82)` 导出，调用 `asset_set_thumbnail` 回传。
- 任何一步失败都不阻塞：界面退回直接显示原图（视频显示占位图标），并在后台记录一条诊断（不含文件内容）。

### 5.5 提示词弹窗（`PromptDialog`）

- 标题：「<组件名> · UI 生成提示词」，副标题：「复制后发给任意 AI，即可生成同款组件」。
- 正文用等宽字体展示（可以滚动），双花括号变量高亮。
- 按钮：
  - **复制提示词**（主按钮，`Enter`）：写入剪贴板，提示「已复制」并关闭弹窗；
  - **发送给 AI 助手**：打开 AI 抽屉，把提示词**填入输入框但不自动发送**；
  - **编辑**：打开详情抽屉；
  - **关闭**（`Esc`）。
- 提示词带变量时，先弹出复用 `UsePromptDialog` 的变量填写表单，再复制。

### 5.6 导入入口（`useMaterialImport`）

| 入口                                | 行为                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| 「＋ 添加作品」                     | 新建一条空作品并打开详情抽屉，焦点在标题                                       |
| 「＋ 添加组件」                     | 新建一条空组件并打开详情抽屉                                                   |
| 拖入文件到列表区                    | 每个文件新建一条素材，类型取当前分区，打开最后一条                             |
| 拖入文件到详情抽屉                  | 添加到当前素材                                                                 |
| `Ctrl+V` 粘贴图片（不在文本框中时） | 抽屉打开时添加到当前素材，否则新建一条                                         |
| 粘贴一个 URL（不在文本框中时）      | 在当前分区新建一条素材并填入链接；名称为空时调用已有的 `link_fetch_title` 补上 |

新建后的空素材离开时如果仍为空（没有标题、链接、文件、备注、提示词），直接彻底删除，与其他模块的规则一致。

## 6. 智能整理支持素材

- `CaptureItem` 增加 `material_kind: Option<String>`（work | component）。卡片类型选择中增加「作品素材」，选中后出现二级选择「完整作品 / UI 组件」。
- `capture_commit` 映射到 `MaterialInput`：`title`、`url`、`note_md = body`；组件的 `prompt` 取 AI 给出的提示词摘录（必须是原文的子串，否则为空）。
- 前缀锁定增加 `作品`、`素材`、`组件`。
- `smart_capture` 模板增加模块定义：
  - 「material 作品素材：设计作品、灵感图、UI 组件或交互动效的收藏，常带 dribbble、behance、figma、站酷、pinterest 等链接，或明确提到组件、动效、交互」；
  - 输出字段 `materialKind`。
- **默认模板升级**：系统模板一旦写入数据库就不再自动覆盖。为了让没有修改过模板的用户拿到新版本，在 `actions.rs` 中为 `smart_capture` 记录**旧版默认正文的 SHA-256**。启动时，如果数据库中的正文与旧版默认一致，就更新为新版；否则保留用户的修改，并在「设置 → AI 模板」中该模板旁边显示「有新版默认模板」，点击「恢复默认」即可升级。
- 智能整理无法处理图片（输入框只接受文字），这一点保持不变。

## 7. 批次 A 测试

| 层           | 必测内容                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 迁移         | v2 → v3：数据和标签关联不丢，外键检查通过，重复启动不重复迁移                                                                                                                                                                                          |
| repo         | 素材 CRUD；软删除、恢复、彻底删除；标签；搜索（标题、备注、提示词、原文件名）；分页与 `material_kind` 筛选                                                                                                                                             |
| assets       | 各类型的文件头校验（伪造扩展名被拒）；超过大小上限；SVG 被拒；同一素材内重复文件跳过；复制中途失败不留半个文件，也不留数据库记录；彻底删除后文件进入 `_purged/`；超过 30 天才清理；孤立文件处理；恢复时从 `_purged/` 移回；文件缺失时 `missing = true` |
| 备份         | `.wbbackup` 往返：数据、标签、文件、缩略图、封面全部恢复，SHA-256 一致；路径穿越、绝对路径、非法文件名、压缩炸弹、SHA-256 不一致都被拒；旧版 `.json`（schemaVersion 1、2）能导入；合并模式不重复复制文件                                               |
| 更改数据目录 | `assets/` 被完整复制，失败时不切换目录                                                                                                                                                                                                                 |
| 智能整理     | 素材类型的识别与映射；链接必须来自原文；模板升级逻辑（未修改的旧默认会升级，修改过的保留并提示）                                                                                                                                                       |
| 前端         | `masonry.ts` 放置与追加时位置稳定；`thumbnail.ts`（用模拟的 canvas 和 video）；分区切换与筛选；提示词弹窗的复制和变量填写；粘贴 URL 新建；空素材离开时被清除；视频同时最多播放 4 个                                                                    |

## 8. 批次 A 验收清单

- [ ] 侧栏出现「作品素材库」，「灵感」都改名为「灵感池」，旧数据和标签完整。
- [ ] 拖入 5 张不同格式的图片（png / jpg / webp / gif，外加一个 mp4）：生成 5 条作品，缩略图正确，瀑布流在图片加载前后都不跳动。
- [ ] 一条作品添加 3 张图片，拖拽排序、设为封面、删除其中一张，重启后保持不变。
- [ ] `Ctrl+V` 粘贴系统截图可以新建作品；粘贴 Dribbble 链接可以新建作品并自动填入名称。
- [ ] 新建 UI 组件，上传 GIF 和视频，卡片里自动播放，滚出视口后暂停；动效设为「关闭」后不自动播放。
- [ ] 组件卡片右侧的「✦ 提示词」打开弹窗，「复制提示词」后剪贴板内容正确；「发送给 AI 助手」只填入输入框，不自动发送；带变量时先填写变量。
- [ ] `Ctrl+K` 可以搜到作品标题、组件提示词中的词和原文件名。
- [ ] 删除进回收站并恢复；彻底删除后文件进入 `_purged/`。
- [ ] 导出 `.wbbackup` → 清空数据 → 导入，所有素材和文件完整恢复；导入 0.2.1 的 `.json` 旧备份不报错。
- [ ] 把伪造扩展名的文件（如 txt 改成 png）拖进来会被拒绝，并有明确提示。
- [ ] 智能整理输入「收藏一个作品 https://dribbble.com/shots/123 渐变风格的音乐播放器」，识别为作品素材，链接正确。
- [ ] 更改数据目录后，素材图片仍然正常显示。
- [ ] 0.2.1 的全部自动化测试和原生回归脚本继续通过。

---

# 批次 B：神经元首页与导航（0.4.0）

## 9. 设计原则与分工

### 9.1 什么是固定的，什么由 Codex 设计

| 固定（按本文和原型实现）                                                     | 由 Codex 根据素材设计                    |
| ---------------------------------------------------------------------------- | ---------------------------------------- |
| 状态机：显现 → 待唤醒 → 生长 → 展开（§10.2）                                 | 大神经元和小神经元的形态、材质、光效     |
| 节点布局与对应关系（§10.1）                                                  | 突触的形态、生长方式、光球的样子         |
| 交互：悬停预览、点击进入、键盘、拖放、智能整理的光粒和光球事件（§10.4–10.6） | 所有动效的具体曲线、粒子、着色           |
| 板块页的镜头推进与拉远、顶栏、小地图（§11）                                  | 推进到神经元内部时的过渡画面             |
| 性能预算、无障碍、动效强度三档（§9.3）                                       |                                          |
| 配色只能来自现有语义变量（§9.2）                                             | 在这些颜色范围内的明暗、透明度与混合方式 |

产品负责人把参考素材放在 `docs/design-refs/neuron/`，可能包括图片、视频、动效参考或代码示例。**开始写渲染器之前**，Codex 先写 `docs/design-refs/neuron/ANALYSIS.md`，内容包括：

- 每份素材借鉴了什么（形态、运动、质感），不借鉴什么；
- 选择的渲染技术和理由；
- 预计性能；
- 素材的授权情况。仓库按 MIT 协议开源，素材如果要打包进应用，必须确认可以再分发，并写入 `THIRD_PARTY_NOTICES.md`；无法确认时只能参考，不能打包。

### 9.2 颜色

渲染器从 CSS 变量读取颜色（`--primary`、`--foreground`、`--background`、`--warning`、`--muted-foreground`），随浅色/深色主题变化，主题切换时调用 `setTheme()`。可以调整这些颜色的透明度、亮度和混合模式，不能引入新的色相。素材本身的颜色与现有配色冲突时，以现有配色为准，并在 `ANALYSIS.md` 中说明。

### 9.3 性能与无障碍预算（硬性要求）

| 项目         | 要求                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首页代码体积 | 首页路由（不含渲染器）≤ 60 KB gzip；渲染器代码 ≤ 120 KB gzip；视觉素材 ≤ 4 MB，并且在首屏渲染之后才加载                                                                             |
| 首屏         | 输入栏和板块标签（HTML 部分）先显示并可以使用，不等渲染器初始化；渲染器初始化失败时自动换用静态渲染器（§9.5），不能出现白屏                                                         |
| 帧率         | 1440×900、核显：生长动画期间平均 ≥ 55 fps；展开后的空闲状态下，每帧脚本加绘制 ≤ 4 ms                                                                                                |
| 空闲降频     | 10 秒没有交互降到 30 fps；离开首页、窗口隐藏或最小化时**完全停止**绘制；从托盘恢复后继续                                                                                            |
| 冷启动       | 与 0.3.0 相比，冷启动时间增加不超过 150 ms（用现有启动计时脚本对比，结果写入 PROGRESS）                                                                                             |
| 分辨率       | 设备像素比最高按 2 计算                                                                                                                                                             |
| 动效强度     | 「完整 / 简洁 / 关闭」三档，默认跟随系统的「减少动画」设置（§12）。简洁：没有常驻光球，形变幅度减半，过场只用淡入淡出；关闭：静态画面，事件只更新数字，不播放光球                   |
| 无障碍       | 每个神经元都有可以聚焦的按钮（`aria-label` 包含名称和数量）；Tab 顺序为：灵感池 → 作品素材库 → 待办 → Agent 技巧 → Skill 库 → 提示词库 → 输入栏；聚焦时与悬停效果相同，并显示焦点环 |

### 9.4 渲染技术

由 Codex 根据素材选择，可选项：Canvas 2D、原生 WebGL / WebGL2、SVG、视频或动图序列，或它们的组合。**最多新增一个渲染库**，例如 OGL 或 PixiJS；不允许使用 three.js、Lottie 这类体积超过预算的库，除非 gzip 后仍满足 §9.3。选型理由写入 `DECISIONS.md` 和 `ANALYSIS.md`。

### 9.5 渲染器接口（必须遵守）

渲染器只负责画面，所有状态、数据和交互都由控制器管理。这样以后要换视觉，只需要换渲染器，其他代码不用动。

```ts
// src/features/home/scene/types.ts
export type NodeId = 'idea' | 'material' | 'todo' | 'tip' | 'skill' | 'prompt';
export type ScenePhase = 'forming' | 'dormant' | 'growing' | 'awake';
export type MotionLevel = 'full' | 'lite' | 'off';

export interface NodeBox {
  x: number;
  y: number;
  r: number;
} // CSS 像素，相对舞台容器
export interface SceneLayout {
  width: number;
  height: number;
  dpr: number;
  nodes: Record<NodeId, NodeBox>;
}
export interface NodeVisual {
  hover: boolean;
  focus: boolean;
  pending: boolean; // 智能整理识别结果指向这里，等待确认
  dropTarget: boolean; // 正在把文件拖向首页
  activity: number; // 0..1，最近 7 天的活跃度
  overdue: boolean; // 仅待办：有逾期
}
export interface SceneTheme {
  primary: string;
  foreground: string;
  background: string;
  warning: string;
  muted: string;
  dark: boolean;
}

export type SceneEvent =
  | { type: 'absorb'; from: DOMRect; amount: number } // 输入文字化作光粒被吸进中心
  | { type: 'thinking'; on: boolean } // AI 分析中
  | {
      type: 'orb';
      to: NodeId;
      strength: 'ambient' | 'event';
      reverse?: boolean;
    }
  | { type: 'land'; at: NodeId } // 灵感池收到内容（中心自身的反馈，没有光球）
  | { type: 'pulse'; at: NodeId; tone: 'normal' | 'warm' };

export type RendererSignal =
  | { type: 'formed' } // 大神经元成形，可以显示「点击唤醒」
  | { type: 'born'; node: NodeId } // 某个小神经元成形，可以显示它的标签
  | { type: 'awake' };

export interface NeuronRenderer {
  mount(host: HTMLElement): Promise<void>;
  resize(layout: SceneLayout, opts?: { animate?: boolean }): void; // animate：输入栏变高时平滑缩放
  setPhase(phase: ScenePhase, opts?: { instant?: boolean }): void;
  setNodes(nodes: Record<NodeId, NodeVisual>): void;
  setTheme(theme: SceneTheme): void;
  setMotion(level: MotionLevel): void;
  emit(event: SceneEvent): Promise<void>; // orb 在到达时 resolve；其他事件立即 resolve
  zoom(node: NodeId, dir: 'in' | 'out'): Promise<void>; // 进入/返回板块的镜头动画
  onSignal(cb: (s: RendererSignal) => void): () => void;
  pause(): void;
  resume(): void;
  destroy(): void;
}
```

- `scene/renderers/static.ts`：**静态渲染器**，必须实现。它用最简单的方式（例如静态图片或几个 CSS 圆形加连线）画出展开状态，所有事件立即 resolve，`setPhase` 直接进入 awake。动效强度为「关闭」或主渲染器初始化失败时使用。
- `scene/renderers/<name>/`：Codex 设计的主渲染器。
- 控制器（`scene/controller.ts`）、HTML 覆盖层和测试都只依赖接口，不依赖具体渲染器。

### 9.6 神经元实验室（仅开发模式）

新增开发路由 `#/__lab/neuron`，只在 `import.meta.env.DEV` 为真时注册，生产构建中不存在。页面包括：

- 全尺寸舞台；
- 一排按钮：重播开场、各个状态、悬停某节点、pending、拖放目标、逾期、吸入、思考、光球（正向、反向、常驻）、灵感池落入、进入和返回镜头；
- 动效强度、主题、渲染器（主 / 静态）切换；
- FPS 和每帧耗时显示。

产品负责人用这个页面检查视觉。之后如果只想调整视觉，只需要改主渲染器，用实验室页面验收即可。

---

## 10. 首页

### 10.1 布局

舞台是一个 1200×680 的虚拟坐标系，在「顶栏下方」到「输入栏上方」的区域内等比缩放、居中显示。

| 节点           | 虚拟坐标 (x, y) | 半径 | 快捷键 | 标签位置                             |
| -------------- | --------------- | ---- | ------ | ------------------------------------ |
| 灵感池（中心） | (600, 292)      | 112  | 0      | 胞体**上方**，避开通往提示词库的突触 |
| 作品素材库     | (264, 138)      | 48   | 1      | 胞体下方                             |
| 待办           | (936, 138)      | 48   | 2      | 胞体下方                             |
| Agent 技巧     | (226, 432)      | 48   | 3      | 胞体下方                             |
| Skill 库       | (974, 432)      | 48   | 4      | 胞体下方                             |
| 提示词库       | (600, 566)      | 48   | 5      | 胞体下方                             |

- 渲染器可以在视觉上让胞体比半径稍大或稍小，但点击区域是以 `NodeBox` 为圆心、直径为 2.3 倍半径的圆。
- 输入栏高度变化（显示识别结果卡片、失败提示）时，舞台**平滑缩放**到新的可用区域（约 300 ms），不能跳变。
- 顶栏：左边「个人工作台」，右边依次是搜索（Ctrl+K）、回收站、设置三个图标按钮。

### 10.2 状态机（`controller.ts`）

```text
            每天第一次打开（home.intro = daily）
 启动 ──┬──────────────────────────────► forming ──formed──► dormant
        │                                    │                  │
        │                       点击中心 / 发送内容 / 按 Enter  │ 点击中心 / 发送内容 / 按 Enter
        │                                    ▼                  ▼
        │                                  growing ──awake──► awake
        └── 当天已播放过，或 intro = never，或动效强度为关闭 ───────► awake（instant）
```

- **forming**：大神经元逐渐成形（参考时长 1.8–2.4 s）。没有小神经元、标签和突触。输入栏立即可用。
- **dormant**：大神经元持续缓慢起伏，下方显示「点击，唤醒工作空间」。
- **growing**：五条突触从中心不同位置向外生长（彼此错开 0.1–0.2 s，每条 1.6–2.2 s）。每条到达末端后，该处小神经元先出现亮点再长成胞体（0.5–0.8 s）；渲染器发出 `born` 信号后，控制器才显示这个节点的标签和数量。生长期间再次点击中心不会重复触发。
- **awake**：稳定状态。
- 「当天是否已播放」记在 `localStorage` 的 `wb.home.introDate`（本机界面状态，不进数据库和备份）。只有进入 awake 后才写入，中途关闭应用的话，下次还会播放。
- 在 forming 或 dormant 状态下发送内容时，先立即进入 growing（动效为「简洁」时直接 awake），然后照常处理。
- 设置里的「重播开场动画」清除记录并重新从 forming 开始。

### 10.3 首页数据（`home_overview` 命令）

```rust
pub struct HomeOverview { pub today: String, pub nodes: Vec<HomeNode> }
pub struct HomeNode {
    pub id: String,          // idea | material | todo | tip | skill | prompt
    pub count: u32,          // 见下表
    pub overdue: u32,        // 仅待办
    pub recent7: u32,        // 最近 7 天新增数量，用于活跃度
    pub latest: Vec<HomeLatest>,  // 最多 3 条
}
pub struct HomeLatest { pub id: String, pub title: String, pub sub: Option<String> }
```

| 节点                                       | count 的含义               | 悬停预览的标题                                                   | latest                                              |
| ------------------------------------------ | -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| 灵感池                                     | 今日新增灵感数             | 「今日 N 条」                                                    | 最新 3 条                                           |
| 待办                                       | 今日未完成数（含逾期顺延） | 「今日 N 项未完成」，有逾期时另起一行「其中 M 项已逾期」（暖色） | 今日待办前 3 条，sub 为「逾期」或截止日期           |
| 作品素材库、Agent 技巧、Skill 库、提示词库 | 总数                       | 「共 N 条」                                                      | 最近更新的 3 条；素材的 sub 为「作品」或「UI 组件」 |

- 活跃度：`activity = ln(1 + recent7) / ln(1 + 各节点 recent7 的最大值)`，最大值为 0 时都取 0。
- 前端查询 key 为 `['home']`，`lib/events.ts` 的全局失效列表中加入 `'home'`。
- 原来的 `dashboard_get` 和今日页不再使用，在批次 B 中删除（命令、DTO、`DashboardPage`、对应测试）。「生成每日小结」按钮移到灵感池页面的工具栏，并在命令面板中增加「生成每日小结」命令。

### 10.4 覆盖层（HTML，`NodeOverlay.tsx`、`NodePeek.tsx`）

- **点击区和标签**：每个节点一个 `<button>`（点击区）和一个标签按钮（名称 + 数量徽标 + 悬停时显示的快捷键）。数量变化时徽标轻微放大一次；待办有逾期时徽标使用暖色。
- **悬停预览**：鼠标停留 260 ms 后，在节点外侧（左半边的节点显示在左边，右半边的显示在右边）弹出 260px 宽的卡片，内容按 §10.3 的表格。点击某一条会带镜头动画进入板块并打开该条目；鼠标可以移进卡片，离开 140 ms 后关闭。
- **pending**：智能整理识别出结果后，结果指向的节点 `pending = true`；在结果卡片中把鼠标移到某一条上时，对应节点同时高亮。
- **逾期**：awake 状态下待办有逾期时，每 2.8 s 发一次 `pulse { tone: 'warm' }`。
- **常驻光球**：awake 状态、动效为「完整」时，每条突触每隔 1.5–2.7 s 随机发射一个 `orb { strength: 'ambient' }`。离开首页时停止。

### 10.5 智能整理与场景事件

首页底部的 `HomeComposer` 复用现有的智能整理（`useSmartCapture`、`CapturePreview`、`CaptureFallback`），不改变它的业务规则。新增一个轻量事件总线 `src/features/home/scene/bus.ts`（类型化的发布订阅），`useSmartCapture` 在下列时机发布事件，首页控制器订阅并转成场景事件：

| 智能整理时机                      | 场景事件                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 开始分析                          | `absorb { from: 输入框的位置, amount: 文字长度 }` + `thinking { on: true }`                                                       |
| 分析结束、取消或失败              | `thinking { on: false }`                                                                                                          |
| 显示识别卡片                      | 结果涉及的节点 `pending = true`                                                                                                   |
| 保存成功（`capture_commit` 返回） | 按顺序（间隔 220 ms）为每条结果发送 `orb { to, strength: 'event' }`，灵感发送 `land { at: 'idea' }`；光球到达后才刷新该节点的数量 |
| 撤销                              | 对应节点发送 `orb { reverse: true }`，然后刷新数量                                                                                |
| `Ctrl+Enter` 直接存为灵感         | `absorb` + `land { at: 'idea' }`                                                                                                  |

- 其他地方新建的内容（Alt+Space 快速记录小窗、各模块页的新建）通过 `data-changed { op: "create", entity: <模块> }` 触发：主窗口回到首页时，为离开期间新建过内容的节点各补发一次 `orb`（每个节点最多一次）。
- 如果 1.5 s 内已经由智能整理发过事件，忽略重复的 `data-changed`。
- 模块名到节点的对应：idea → idea，material → material，其余同名。

**模型选择**：输入栏右侧的下拉框列出所有已经填写 Key 的模型配置，默认选中默认配置。选择只在本次运行期间有效（存在 Zustand 中），不修改默认配置，传给 `capture_analyze` 的 `providerId`。没有可用模型时隐藏下拉框，按智能整理已有的规则退回手动模式。

### 10.6 首页的拖放

- 在首页拖入文件时，作品素材库节点 `dropTarget = true`，舞台下方显示「松开，放入作品素材库」。
- 松开后调用 `material_import_files`（新建作品），然后发送 `orb { to: 'material' }`。到达后提示「已放入作品素材库：N 个文件」，带「查看」按钮。
- 拖入不支持的文件时提示原因，不发送光球。

---

## 11. 板块页与导航

### 11.1 外壳

- 删除左侧 `Sidebar`，以及 `useUi` 中只为它服务的折叠状态。
- 首页之外的所有页面（六个板块、回收站、设置）使用新的 `ModuleHeader`（高 64px，底部一条 1px 分隔线）：
  - 左边：「← 首页」按钮（标出 `Esc`）、板块名称、副标题；
  - 右边：小地图 `MiniMap`、搜索、回收站、设置图标；
  - AI 助手的悬浮按钮和抽屉保持现状。
- `MiniMap`：约 150×80px 的 SVG，按 §10.1 的布局画出六个节点和连线。当前板块用 `--primary` 填充，其他节点用 `--secondary`；悬停时显示名称和快捷键，点击切换板块。回收站和设置页里没有高亮节点。
- 板块内的布局保持现状（列表 + 详情的三栏、素材库的瀑布流和抽屉），只是少了侧栏。宽度不够时，沿用现有的最小宽度规则。

### 11.2 首页常驻与镜头过场

- 舞台组件 `HomeStage` 放在 `AppShell` 中**常驻挂载**：在首页时显示，其他页面时隐藏并调用 `renderer.pause()`。这样返回首页时不需要重新初始化，镜头可以立即拉远。
- **进入板块**（点击节点、预览卡片中的条目、数字键）：
  1. `flushAll()`；
  2. 开始预加载目标路由的代码；
  3. 隐藏覆盖层和输入栏（200 ms 淡出）；
  4. 调用 `renderer.zoom(node, 'in')`（参考 600 ms），进行到约一半时导航到目标路由；
  5. 板块页淡入（320 ms）。
- **返回首页**（「← 首页」按钮或 `Esc`；注意小地图的中心节点进入的是灵感池，不是首页）：
  1. 板块页淡出（200 ms）；
  2. `navigate('/', { state: { from: 当前节点 } })`；
  3. `renderer.zoom(from, 'out')`；
  4. 显示覆盖层和输入栏。**不重播开场**。
- **直接打开深层链接**（通知点击、命令面板、启动时恢复的路由）不播放镜头动画，直接显示页面。
- **板块之间切换**（小地图、数字键）不经过首页，只是内容区淡出淡入（180 ms）。
- 动效为「简洁」时镜头动画缩短为 300 ms；为「关闭」时直接切换。

### 11.3 键盘

| 按键                         | 范围                                                                     | 行为                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `0`–`5`                      | 首页和板块页；焦点不在输入框、编辑器、下拉框中，并且没有打开的弹窗或菜单 | 进入对应节点                                                                                      |
| `/`                          | 首页                                                                     | 聚焦输入栏                                                                                        |
| `Esc`                        | 板块页                                                                   | 按顺序：关闭弹窗或菜单 → 清除多选 → 让编辑器失焦 → 返回首页。**只有前面几项都不适用时才返回首页** |
| `Enter` / `空格`             | 首页、焦点在中心节点、状态为 forming 或 dormant                          | 唤醒                                                                                              |
| `Ctrl+K`、`Ctrl+N`、`Ctrl+J` | 全局                                                                     | 保持现状。首页的 `Ctrl+N` 聚焦输入栏                                                              |

在 `lib/keymap.ts` 中统一注册，并加测试，防止在编辑器里输入数字时误跳转。

## 12. 设置项

| key                 | 默认值     | 可选值                                                                             | 位置                                    |
| ------------------- | ---------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| `appearance.motion` | `"system"` | `system`（跟随系统「减少动画」：开启为 lite，否则 full） / `full` / `lite` / `off` | 设置 → 外观                             |
| `home.intro`        | `"daily"`  | `daily` / `always` / `never`                                                       | 设置 → 外观，旁边有「重播开场动画」按钮 |

在 `domain/settings.rs`、`repo/settings.rs` 中增加，并加入校验。批次 A 的视频自动播放规则也读取 `appearance.motion`，所以**这一项在批次 A 就要加上**。

## 13. 文件清单（批次 B）

```text
src/features/home/
├── HomePage.tsx              首页路由组件（覆盖层 + 输入栏 + 顶栏）
├── HomeStage.tsx             常驻舞台容器（挂在 AppShell）
├── HomeComposer.tsx          输入栏（复用智能整理）+ ModelPicker
├── NodeOverlay.tsx / NodePeek.tsx
├── useHomeOverview.ts
├── scene/
│   ├── types.ts              §9.5 接口
│   ├── layout.ts             §10.1 布局计算（纯函数）
│   ├── controller.ts         §10.2 状态机与事件调度（不依赖 DOM 绘制，可单测）
│   ├── bus.ts                §10.5 事件总线
│   ├── theme.ts              从 CSS 变量读取颜色
│   └── renderers/
│       ├── static.ts
│       └── <name>/           Codex 设计的主渲染器
└── lab/NeuronLab.tsx         §9.6，仅开发模式
src/app/layout/ModuleHeader.tsx、MiniMap.tsx
src-tauri/src/commands/home.rs、repo/home.rs、domain/home.rs
docs/design-refs/neuron/ANALYSIS.md
```

删除：`src/app/layout/Sidebar.tsx`、`src/features/dashboard/DashboardPage.tsx`、`dashboard_get` 及其 DTO 和测试。智能整理相关的文件从 `features/dashboard/capture/` 移到 `features/capture/`，只改路径，不改逻辑，测试一起移动。

## 14. 批次 B 测试

| 层                              | 必测内容                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout.ts`                     | 不同窗口尺寸下的缩放和居中；宽或高为 0 时缩放仍为正数（原型中实际出现过这个 bug）；输入栏变高后的目标布局                                                                                                                           |
| `controller.ts`（用模拟渲染器） | 每天只播放一次：同一天第二次启动直接 awake；中途关闭不写入记录；intro 三种取值；生长期间重复点击不重复触发；`born` 信号到达后才显示标签；在 dormant 状态发送内容会先唤醒；离开首页时 pause，返回时 resume；常驻光球只在 full 下产生 |
| 事件映射                        | 智能整理各时机对应的场景事件（§10.5 表格）；光球到达后才刷新数量；撤销发送反向光球；1.5 s 内的重复 `data-changed` 被忽略；离开期间新建内容在返回时每个节点只补一次                                                                  |
| `home_overview`                 | 各节点 count、overdue、recent7、latest 的计算（含逾期顺延、软删除不计入、系统模板不计入提示词）                                                                                                                                     |
| 键盘                            | 编辑器、输入框、下拉框中按数字不跳转；`Esc` 的优先顺序                                                                                                                                                                              |
| 静态渲染器                      | 动效为「关闭」时使用；主渲染器 `mount` 抛错时自动换用，并记录诊断                                                                                                                                                                   |
| 无障碍                          | Tab 顺序；`aria-label` 包含数量；聚焦即触发悬停效果                                                                                                                                                                                 |
| 回归                            | 智能整理的全部测试在移动路径后继续通过；Alt+Space 快速记录小窗不受影响；AI 抽屉、命令面板正常                                                                                                                                       |

## 15. 批次 B 验收清单

**功能**

- [ ] 当天第一次打开：大神经元逐渐成形 → 提示「点击，唤醒工作空间」→ 点击后五条突触生长，各小神经元成形后才出现标签。同一天再次打开直接是展开状态。
- [ ] 悬停任意节点：节点和对应突触变亮，弹出最近内容预览，点击其中一条会推进镜头进入板块并打开该条目。
- [ ] 待办有逾期时，待办节点周期性发出暖色脉冲，徽标为暖色。
- [ ] 输入「明天下午3点前把周报发给老板；另外记一下：番茄钟配合 AI 总结效果很好」→ 光粒被吸入中心、中心进入思考状态 → 出现识别卡片，舞台平滑缩小，待办和灵感池节点 pending → 按 Enter 保存后，光球飞向待办，灵感池收到落入反馈，光球到达后数量才变化 → 撤销时光球反向飞回。
- [ ] 用 Alt+Space 小窗记一条灵感，回到首页时灵感池收到一次反馈。
- [ ] 把 3 张图片拖到首页，作品素材库节点高亮，松开后光球飞入，素材库中出现 3 条作品。
- [ ] 点击节点进入板块有镜头推进过场；「← 首页」或 `Esc` 返回时镜头拉远、不重播开场；小地图和数字键可以直接切换板块。
- [ ] 在编辑器里输入数字不会跳转；编辑器中按 `Esc` 先失焦，再按一次才返回首页。
- [ ] 回收站、设置可以从顶栏进入；搜索、AI 抽屉正常。
- [ ] 每日小结可以从灵感池页面和命令面板生成。
- [ ] 动效强度三档切换都正常；系统开启「减少动画」时默认为简洁；「重播开场动画」有效。

**视觉与性能**

- [ ] `docs/design-refs/neuron/ANALYSIS.md` 已完成，素材授权情况已说明。
- [ ] 开发模式下 `#/__lab/neuron` 可以逐个触发全部状态和事件，产品负责人确认视觉效果。
- [ ] 满足 §9.3 的全部预算，测量方法和数据写入 PROGRESS（帧率、每帧耗时、代码体积、素材体积、冷启动对比）。
- [ ] 最小化到托盘 1 分钟后，任务管理器中 WebView 进程的 CPU 占用接近 0。
- [ ] 浅色和深色主题下神经元都清晰可辨，标签文字对比度不低于 4.5:1。
- [ ] 批次 A 和 0.2.1 的全部验收项回归通过。

---

## 16. 文档更新

- `docs/ARCHITECTURE.md`：增加 material 实体、素材文件存储、备份格式 v2、首页场景架构（控制器 / 渲染器接口 / 覆盖层）、导航外壳；IPC 表与设置表同步更新。
- `DESIGN.md`：删除侧栏相关描述，补充首页舞台、板块顶栏、小地图、素材库瀑布流和组件卡片的规范。
- `docs/DECISIONS.md`：每个批次一节，记录依赖、技术选型和施工中的补充决定。
- `README.md`：更新功能列表和首页截图（截图使用演示数据）。
- `THIRD_PARTY_NOTICES.md`：新增依赖和打包进应用的素材。

---

## 17. 给 Codex 的提示词

**批次 A**

```text
请先阅读 docs/ARCHITECTURE.md、docs/ADDENDUM-smart-capture.md、docs/DECISIONS.md、docs/PROGRESS.md，再完整阅读 docs/PLAN-v0.3.md，然后在当前 0.2.1 代码（提交 d30fa9b）的基础上实施「批次 A：作品素材库」（第 3–8 节，以及第 12 节中的 appearance.motion 设置）。
要求：
1. 遵守第 0 节约定：只新增第 2 节列出的依赖；数据库变更只能新增 0003_materials.sql；配色只用现有语义变量。
2. 质量红线：文件必须先完整落盘再写数据库，失败不能留下半个文件或孤立记录；导入严格校验文件头，拒绝 SVG；zip 导入防路径穿越和压缩炸弹；彻底删除的文件先进 _purged/ 保留 30 天；更改数据目录时必须同时复制 assets/。
3. EntityType 增加 Material 后，按 3.2 节的表格逐一适配搜索、回收站、标签、AI 上下文、备份、Markdown 导出和智能整理，并补测试。
4. 不要开始批次 B 的任何内容（不删侧栏、不做首页）。
5. 完成后运行 pnpm check 直到全部通过，并确认 pnpm build 成功；版本升到 0.3.0。
6. 在 docs/PROGRESS.md 中逐项记录第 8 节的验收结果，模拟结果和真实环境结果分开写；补充决定写入 docs/DECISIONS.md。
7. 最后输出：完成情况摘要、与方案不一致之处及原因、需要我手动验证的项目。
```

**批次 B**

```text
请阅读 docs/PLAN-v0.3.md、docs/DECISIONS.md、docs/PROGRESS.md，在批次 A（0.3.0）的基础上实施「批次 B：神经元首页与导航」（第 9–15 节）。
参考资料：
- docs/design-refs/neuron-home-prototype.html 是交互原型：布局、状态机、悬停预览、智能整理的光粒与光球事件、镜头过场、小地图都以它为准；但原型里神经元的画法只是占位，不要照抄。
- docs/design-refs/neuron/ 是我准备的神经元视觉素材。神经元的形态、材质和动效请你参考这些素材自行设计。
要求：
1. 先完成 docs/design-refs/neuron/ANALYSIS.md（借鉴了什么、渲染技术选型、性能预估、素材授权），再写渲染器。
2. 严格遵守 9.5 节的渲染器接口：控制器、覆盖层和测试只依赖接口；必须实现静态渲染器作为降级方案；实现 9.6 节的开发模式实验室页面。
3. 满足 9.3 节的全部性能和无障碍预算，并把测量数据写入 PROGRESS；配色只能来自现有语义变量。
4. 先完成功能（控制器、覆盖层、导航外壳、首页数据、事件映射，可以先用静态渲染器跑通全部测试），再做主渲染器的视觉。
5. 完成后运行 pnpm check 直到全部通过，并确认 pnpm build 成功；版本升到 0.4.0。
6. 在 docs/PROGRESS.md 中逐项记录第 15 节的验收结果，并回归批次 A 和 0.2.1 的验收项。
7. 最后输出：完成情况摘要、与方案不一致之处及原因，以及需要我在实验室页面和真实应用里手动确认的视觉项目。
```
