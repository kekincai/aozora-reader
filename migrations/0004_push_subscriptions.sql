-- Daily reminders: one row per browser push subscription. last_read_date lets the hourly
-- job skip people who already read today, without knowing who they are.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  last_read_date TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  last_sent_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_hour ON push_subscriptions(hour, last_read_date);
