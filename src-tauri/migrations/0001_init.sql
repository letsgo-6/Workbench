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
