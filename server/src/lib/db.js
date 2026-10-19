/** D1 数据访问层。所有时间都是 epoch 秒。 */

export function newId() {
  return crypto.randomUUID();
}

export function newAckToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 取需要处理的提醒：未来 7 天内的（要发前置预警）+ 过去 24 小时内的（可能要补发） */
export async function listDueReminders(db, now, horizonSec = 7 * 86400, lookbackSec = 86400) {
  const { results } = await db
    .prepare(
      `SELECT * FROM reminders
        WHERE status = 'pending' AND fire_at <= ? AND fire_at >= ?
        ORDER BY fire_at ASC LIMIT 200`,
    )
    .bind(now + horizonSec, now - lookbackSec)
    .all();
  return results ?? [];
}

/** 某条提醒已成功投递过的 step 下标 */
export async function deliveredSteps(db, reminderId) {
  const { results } = await db
    .prepare(`SELECT step_index FROM deliveries WHERE reminder_id = ? AND ok = 1`)
    .bind(reminderId)
    .all();
  return new Set((results ?? []).map((r) => Number(r.step_index)));
}

/**
 * 抢占一次投递：唯一约束保证并发 cron 不会重复推送。
 * 失败过的步骤允许重试，最多 maxAttempts 次。
 * @returns {Promise<{claimed: boolean, attempt: number}>}
 */
export async function claimDelivery(db, { reminderId, stepIndex, channel, dueAt, now, maxAttempts = 3 }) {
  const id = `${reminderId}:${stepIndex}:${channel}`;
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO deliveries
         (id, reminder_id, step_index, channel, due_at, attempted_at, ok, error, attempts)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 1)`,
    )
    .bind(id, reminderId, stepIndex, channel, dueAt, now)
    .run();
  if ((inserted.meta?.changes ?? 0) > 0) return { claimed: true, attempt: 1 };

  const existing = await db
    .prepare(`SELECT ok, attempts FROM deliveries WHERE id = ?`)
    .bind(id)
    .first();
  if (!existing) return { claimed: false, attempt: 0 };
  if (existing.ok === 1) return { claimed: false, attempt: existing.attempts };
  if (Number(existing.attempts) >= maxAttempts) return { claimed: false, attempt: existing.attempts };

  await db
    .prepare(`UPDATE deliveries SET attempts = attempts + 1, attempted_at = ? WHERE id = ?`)
    .bind(now, id)
    .run();
  return { claimed: true, attempt: Number(existing.attempts) + 1 };
}

export async function finishDelivery(db, { reminderId, stepIndex, channel, ok, error = null }) {
  await db
    .prepare(`UPDATE deliveries SET ok = ?, error = ? WHERE id = ?`)
    .bind(ok ? 1 : 0, ok ? null : String(error ?? '').slice(0, 500), `${reminderId}:${stepIndex}:${channel}`)
    .run();
}

export async function markAcked(db, reminderId, now) {
  await db
    .prepare(`UPDATE reminders SET status = 'acked', acked_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(now, now, reminderId)
    .run();
}

export async function markMissed(db, reminderId, now) {
  await db
    .prepare(`UPDATE reminders SET status = 'missed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(now, reminderId)
    .run();
}

export async function findByAckToken(db, token, now) {
  return db
    .prepare(`SELECT * FROM reminders WHERE ack_token = ? AND ack_token_exp >= ?`)
    .bind(token, now)
    .first();
}

export async function getReminder(db, id) {
  return db.prepare(`SELECT * FROM reminders WHERE id = ?`).bind(id).first();
}

export async function listReminders(db, limit = 50) {
  const { results } = await db
    .prepare(`SELECT * FROM reminders ORDER BY fire_at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return results ?? [];
}

/** 按状态查询，App 启动时用 status=pending 恢复本地缺失的提醒 */
export async function listRemindersByStatus(db, status = 'pending', limit = 100) {
  const { results } = await db
    .prepare(`SELECT * FROM reminders WHERE status = ? ORDER BY fire_at ASC LIMIT ?`)
    .bind(status, limit)
    .all();
  return results ?? [];
}

/** 每条提醒的成功投递统计：用于在列表里显示「已推送 N 次 · 最近时间」 */
export async function deliveryStats(db) {
  const { results } = await db
    .prepare(
      `SELECT reminder_id, COUNT(*) AS push_count, MAX(attempted_at) AS last_push_at
         FROM deliveries WHERE ok = 1 GROUP BY reminder_id`,
    )
    .all();
  const map = new Map();
  for (const row of results ?? []) {
    map.set(row.reminder_id, {
      pushCount: Number(row.push_count),
      lastPushAt: Number(row.last_push_at),
    });
  }
  return map;
}

/**
 * App 创建/编辑提醒时同步上来。id 由 App 生成（本地优先）。
 * @returns {Promise<{id:string, ack_token:string}>}
 */
export async function upsertReminder(db, payload, now) {
  const existing = await getReminder(db, payload.id);
  const ackToken = existing?.ack_token ?? newAckToken();
  const ackExp = Math.max(Number(payload.fire_at) + 86400, now + 7 * 86400);
  const repeat = payload.repeat === 'yearly' ? 'yearly' : 'none';
  const unlock = payload.unlock === 'math' ? 'math' : 'none';

  await db
    .prepare(
      `INSERT INTO reminders
         (id, user_id, title, note, fire_at, tz, steps, force_level, repeat, unlock, status,
          acked_at, ack_token, ack_token_exp, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         note = excluded.note,
         fire_at = excluded.fire_at,
         tz = excluded.tz,
         steps = excluded.steps,
         force_level = excluded.force_level,
         repeat = excluded.repeat,
         unlock = excluded.unlock,
         status = 'pending',
         acked_at = NULL,
         ack_token_exp = excluded.ack_token_exp,
         updated_at = excluded.updated_at`,
    )
    .bind(
      payload.id,
      payload.user_id ?? 'default',
      String(payload.title ?? '').slice(0, 200),
      String(payload.note ?? '').slice(0, 2000),
      Number(payload.fire_at),
      String(payload.tz ?? 'Asia/Shanghai'),
      JSON.stringify(payload.steps ?? []),
      Number(payload.force_level ?? 3),
      repeat,
      unlock,
      ackToken,
      ackExp,
      existing?.created_at ?? now,
      now,
    )
    .run();

  return { id: payload.id, ack_token: ackToken };
}

/** 取某个时刻在指定时区的偏移量（毫秒） */
function timezoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** 下一次重复时刻（按提醒自己的时区算，闰年/月末不会漂） */
export function nextRepeatEpoch(epochSec, tz = 'Asia/Shanghai', repeat = 'yearly') {
  try {
    const date = new Date(epochSec * 1000);
    const offset = timezoneOffsetMs(date, tz);
    const local = new Date(date.getTime() + offset);

    if (repeat === 'yearly') {
      local.setUTCFullYear(local.getUTCFullYear() + 1);
    } else if (repeat === 'monthly') {
      const day = local.getUTCDate();
      local.setUTCDate(1);
      local.setUTCMonth(local.getUTCMonth() + 1);
      // 月末对齐：1/31 + 1 月 → 2/28（而不是滚到 3/3）
      const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
      local.setUTCDate(Math.min(day, lastDay));
    } else if (repeat === 'weekly') {
      local.setUTCDate(local.getUTCDate() + 7);
    } else {
      return epochSec + 365 * 86400;
    }

    return Math.floor((local.getTime() - offset) / 1000);
  } catch {
    return epochSec + 365 * 86400;
  }
}

/**
 * 重复提醒「完成/错过」后滚到下一周期：重置为 pending、清空本周期投递记录，
 * 这样即使 App 没装，服务器也会继续按周期提醒。
 * @returns {Promise<number>} 新的 fire_at（epoch 秒）
 */
export async function rollRepeat(db, row, now) {
  const repeat = row.repeat === 'yearly' || row.repeat === 'monthly' || row.repeat === 'weekly' ? row.repeat : 'yearly';
  const next = nextRepeatEpoch(Number(row.fire_at), row.tz, repeat);
  const ackExp = Math.max(next + 86400, now + 7 * 86400);
  await db
    .prepare(
      `UPDATE reminders
          SET fire_at = ?, status = 'pending', acked_at = NULL,
              ack_token_exp = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(next, ackExp, now, row.id)
    .run();
  await db.prepare(`DELETE FROM deliveries WHERE reminder_id = ?`).bind(row.id).run();
  return next;
}

export async function deleteReminder(db, id) {
  await db.prepare(`DELETE FROM reminders WHERE id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM deliveries WHERE reminder_id = ?`).bind(id).run();
}
