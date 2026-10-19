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

/**
 * App 创建/编辑提醒时同步上来。id 由 App 生成（本地优先）。
 * @returns {Promise<{id:string, ack_token:string}>}
 */
export async function upsertReminder(db, payload, now) {
  const existing = await getReminder(db, payload.id);
  const ackToken = existing?.ack_token ?? newAckToken();
  const ackExp = Math.max(Number(payload.fire_at) + 86400, now + 7 * 86400);

  await db
    .prepare(
      `INSERT INTO reminders
         (id, user_id, title, note, fire_at, tz, steps, force_level, status,
          acked_at, ack_token, ack_token_exp, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         note = excluded.note,
         fire_at = excluded.fire_at,
         tz = excluded.tz,
         steps = excluded.steps,
         force_level = excluded.force_level,
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
      ackToken,
      ackExp,
      existing?.created_at ?? now,
      now,
    )
    .run();

  return { id: payload.id, ack_token: ackToken };
}

export async function deleteReminder(db, id) {
  await db.prepare(`DELETE FROM reminders WHERE id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM deliveries WHERE reminder_id = ?`).bind(id).run();
}
