CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'EMPLOYEE'))
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  filename TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  document_id UUID NOT NULL REFERENCES documents (id),
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024) NOT NULL
);

ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding_model TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS chunks_tenant_id_idx ON chunks (tenant_id);

CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID NOT NULL REFERENCES users (id),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_owner_updated_idx
  ON conversations (tenant_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_turns (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants (id),
  user_id UUID NOT NULL REFERENCES users (id),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  model TEXT,
  insufficient_data BOOLEAN NOT NULL DEFAULT FALSE,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_turns_conversation_id_idx
  ON chat_turns (conversation_id);

CREATE INDEX IF NOT EXISTS chat_turns_owner_idx
  ON chat_turns (tenant_id, user_id, conversation_id, created_at);

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;

UPDATE documents SET status = 'EXTRACTING' WHERE status = 'PROCESSING';

ALTER TABLE documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('UPLOADED', 'EXTRACTING', 'EMBEDDING', 'READY', 'FAILED'));

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON documents;
CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON chunks;
CREATE POLICY tenant_isolation ON chunks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conversations;
CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE chat_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_turns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON chat_turns;
CREATE POLICY tenant_isolation ON chat_turns
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
