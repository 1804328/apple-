import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';

/** 极简 env：这些用例都不碰 D1 */
const noDb = {};
const withKey = { API_KEY: 'secret' };

function req(path, init = {}) {
  return new Request(`https://example.com${path}`, init);
}

test('GET /health 返回 ok 且列出通道', async () => {
  const res = await worker.fetch(req('/health'), noDb);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.channels));
  assert.ok(body.channels.includes('pushplus'));
});

test('配置了 API_KEY 时，/api/* 无 key 返回 401', async () => {
  const res = await worker.fetch(req('/api/reminders'), withKey);
  assert.equal(res.status, 401);
});

test('配置了 API_KEY 时，错误的 key 也返回 401', async () => {
  const res = await worker.fetch(
    req('/api/reminders', { headers: { 'x-api-key': 'wrong' } }),
    withKey,
  );
  assert.equal(res.status, 401);
});

test('正确的 x-api-key 或 Bearer 都能通过鉴权', async () => {
  // 通过鉴权后会因为 env.DB 缺失而抛错，说明确实走到了业务层
  await assert.rejects(() => worker.fetch(req('/api/reminders', { headers: { 'x-api-key': 'secret' } }), withKey));
  await assert.rejects(() =>
    worker.fetch(req('/api/reminders', { headers: { authorization: 'Bearer secret' } }), withKey),
  );
});

test('创建提醒缺少必填字段返回 400', async () => {
  const res = await worker.fetch(
    req('/api/reminders', { method: 'POST', body: JSON.stringify({ title: 'x' }) }),
    noDb,
  );
  assert.equal(res.status, 400);
});

test('非法 JSON 返回 400', async () => {
  const res = await worker.fetch(req('/api/reminders', { method: 'POST', body: 'not-json' }), noDb);
  assert.equal(res.status, 400);
});

test('未知路由返回 404', async () => {
  const res = await worker.fetch(req('/whatever'), noDb);
  assert.equal(res.status, 404);
});

test('格式不合法的确认 token 不会命中确认逻辑', async () => {
  const res = await worker.fetch(req('/a/too-short'), noDb);
  assert.equal(res.status, 404);
});
