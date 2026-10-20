ALTER TABLE todo ADD COLUMN remind_at INTEGER;
ALTER TABLE todo ADD COLUMN reminded_at INTEGER;

CREATE TABLE prompt_version (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompt(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  system_prompt TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_prompt_version ON prompt_version(prompt_id, created_at DESC);

CREATE TABLE ai_conversation (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  provider_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE ai_message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  refs TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_message_conv ON ai_message(conversation_id, created_at);
