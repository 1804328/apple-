import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STEPS,
  MAX_CATCHUP_SEC,
  dueSteps,
  normalizeSteps,
  shouldMarkMissed,
} from '../src/lib/escalation.js';

const HOUR = 3600;
const now = 1_800_000_000;

/** 一个到点时间可调的提醒，默认创建于 7 天前 */
function reminder(overrides = {}) {
  return {
    id: 'r1',
    fire_at: now,
    created_at: now - 7 * 24 * HOUR,
    status: 'pending',
    acked_at: null,
    ...overrides,
  };
}

const steps = normalizeSteps(DEFAULT_STEPS);
const secs = (due) => due.map((d) => d.step.after_sec);

test('还没到点的步骤不下发', () => {
  // 距到点 10 小时：T-2小时 尚未到；T-1天 已在 14 小时前到期，但前置预警只要还没到点就补发
  const due = dueSteps({ reminder: reminder({ fire_at: now + 10 * HOUR }), steps, now });
  assert.deepEqual(secs(due), [-86400]);
});

test('到点时刻只发到点步骤，前置预警不再补发', () => {
  const due = dueSteps({ reminder: reminder(), steps, now });
  assert.deepEqual(secs(due), [0]);
});

test('已投递的步骤不重复下发', () => {
  const due = dueSteps({ reminder: reminder(), steps, now, delivered: new Set([0, 1, 2]) });
  assert.deepEqual(due, []);
});

test('已确认的提醒一条都不发', () => {
  const due = dueSteps({ reminder: reminder({ status: 'acked', acked_at: now - 60 }), steps, now });
  assert.deepEqual(due, []);
});

test('status 不是 pending 时不发', () => {
  assert.deepEqual(dueSteps({ reminder: reminder({ status: 'missed' }), steps, now }), []);
});

test('早于创建时间的前置预警直接跳过（避免建完就炸）', () => {
  // 创建时距到点只有 30 分钟，T-1天 / T-2小时 都早于创建时间，不应补发
  const due = dueSteps({ reminder: reminder({ created_at: now - 30 * 60 }), steps, now });
  assert.deepEqual(secs(due), [0]);
});

test('到点后的升级步骤超过补发窗口就不再发', () => {
  // 到点后 8 小时才恢复：最晚的 +30min 步骤也已过期 7.5 小时，全部放弃
  const late = now + 8 * HOUR;
  const due = dueSteps({ reminder: reminder(), steps, now: late });
  assert.deepEqual(due, []);
});

test('补发窗口内，错过的升级步骤会按顺序补上', () => {
  // 服务端宕机 20 分钟后恢复：0 / +5min / +15min 均已到期，+30min 未到
  const later = now + 20 * 60;
  const due = dueSteps({ reminder: reminder(), steps, now: later });
  assert.deepEqual(secs(due), [0, 300, 900]);
  const dues = due.map((d) => d.due);
  assert.deepEqual(dues, [...dues].sort((a, b) => a - b));
});

test('到点前 1 小时：T-1天 与 T-2小时 都已到期，按时间排序下发', () => {
  const due = dueSteps({ reminder: reminder({ fire_at: now + 1 * HOUR }), steps, now });
  assert.deepEqual(secs(due), [-86400, -7200]);
});

test('normalizeSteps 对空值/脏数据回退到默认链', () => {
  assert.equal(normalizeSteps(null).length, DEFAULT_STEPS.length);
  assert.equal(normalizeSteps([]).length, DEFAULT_STEPS.length);
  assert.equal(normalizeSteps([{ after_sec: 'x' }]).length, DEFAULT_STEPS.length);
  assert.equal(normalizeSteps([{ after_sec: 0, channels: [] }]).length, DEFAULT_STEPS.length);
});

test('normalizeSteps 清洗并按 after_sec 排序', () => {
  const cleaned = normalizeSteps([
    { after_sec: 300, channels: ['pushplus'] },
    { after_sec: -60, channels: ['email', 42] },
  ]);
  assert.deepEqual(cleaned, [
    { after_sec: -60, channels: ['email'] },
    { after_sec: 300, channels: ['pushplus'] },
  ]);
});

test('shouldMarkMissed：超过补发窗口且未确认才成立', () => {
  assert.equal(shouldMarkMissed(reminder(), now), false);
  assert.equal(shouldMarkMissed(reminder(), now + MAX_CATCHUP_SEC + 1), true);
  assert.equal(shouldMarkMissed(reminder({ status: 'acked', acked_at: now }), now + 10 * HOUR), false);
});
