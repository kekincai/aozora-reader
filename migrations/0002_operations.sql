PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('bug', 'suggestion', 'content', 'other')),
  message TEXT NOT NULL,
  contact TEXT,
  page_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_visitor_created ON feedback(visitor_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('page_view', 'read_start', 'search', 'learning_open', 'review_complete', 'feedback_submitted')),
  path_group TEXT NOT NULL,
  work_id TEXT,
  label TEXT,
  value INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_created ON analytics_events(visitor_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_work_created ON analytics_events(work_id, created_at DESC);

