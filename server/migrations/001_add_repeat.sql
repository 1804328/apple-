-- 迁移：给已有数据库加上「每年重复」字段
-- 只执行一次：npx wrangler d1 execute strong-reminder --remote --file=./migrations/001_add_repeat.sql --yes
ALTER TABLE reminders ADD COLUMN repeat TEXT NOT NULL DEFAULT 'none';
