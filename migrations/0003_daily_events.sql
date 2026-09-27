-- SQLite cannot alter a CHECK constraint, so rebuild analytics_events with the
-- daily-page events (page_complete, quiz_done) allowed.
PRAGMA foreign_keys = OFF;

CREATE TABLE analytics_events_next (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('page_view', 'read_start', 'search', 'learning_open', 'review_complete', 'feedback_submitted', 'page_complete', 'quiz_done')),
  path_group TEXT NOT NULL,
  work_id TEXT,
  label TEXT,
  value INTEGER,
  created_at INTEGER NOT NULL
);

INSERT INTO analytics_events_next SELECT id, user_id, visitor_hash, event_name, path_group, work_id, label, value, created_at FROM analytics_events;
DROP TABLE analytics_events;
ALTER TABLE analytics_events_next RENAME TO analytics_events;

CREATE INDEX IF NOT EXISTS idx_analytics_event_created ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_created ON analytics_events(visitor_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_work_created ON analytics_events(work_id, created_at DESC);

PRAGMA foreign_keys = ON;
