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
