-- 迁移：强制模式（数学题解锁）
-- 只执行一次：npx wrangler d1 execute strong-reminder --remote --file=./migrations/002_add_unlock.sql --yes
ALTER TABLE reminders ADD COLUMN unlock TEXT NOT NULL DEFAULT 'none';
