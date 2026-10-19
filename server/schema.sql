-- 提醒
CREATE TABLE IF NOT EXISTS reminders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL DEFAULT 'default',
  title         TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  fire_at       INTEGER NOT NULL,              -- epoch 秒（UTC）
  tz            TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  steps         TEXT NOT NULL,                 -- JSON: [{after_sec, channels}]
  force_level   INTEGER NOT NULL DEFAULT 3,    -- 1..6，见 PLAN §1.4
  repeat        TEXT NOT NULL DEFAULT 'none',  -- none | yearly
  unlock        TEXT NOT NULL DEFAULT 'none',  -- none | math
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | acked | done | missed
  acked_at      INTEGER,
  ack_token     TEXT NOT NULL,
  ack_token_exp INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, fire_at);

-- 每次投递尝试（用于幂等与审计）
CREATE TABLE IF NOT EXISTS deliveries (
  id          TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  step_index  INTEGER NOT NULL,
  channel     TEXT NOT NULL,
  due_at      INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL,
  ok          INTEGER NOT NULL,
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 1,
  UNIQUE (reminder_id, step_index, channel)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_reminder ON deliveries (reminder_id);
