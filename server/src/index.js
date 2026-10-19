import { CHANNEL_LABEL, sendOnChannel } from './channels/index.js';
import * as db from './lib/db.js';
import { dueSteps, normalizeSteps, shouldMarkMissed } from './lib/escalation.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function authorized(request, env) {
  // 没配 API_KEY 时视为本地开发，放行
  if (!env.API_KEY) return true;
  const header = request.headers.get('x-api-key');
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return header === env.API_KEY || bearer === env.API_KEY;
}

function parseSteps(row) {
  try {
    return normalizeSteps(JSON.parse(row.steps));
  } catch {
    return normalizeSteps(null);
  }
}

function formatTime(epochSec, tz) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz || 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(epochSec * 1000));
  } catch {
    return new Date(epochSec * 1000).toISOString();
  }
}

function ackUrl(env, row) {
  const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/a/${row.ack_token}`;
}

function pushContent(env, row, { index, step, due }) {
  const link = ackUrl(env, row);
  const channelOfThis = step.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(' / ');
  const escalation = index === 0 ? '首次提醒' : '未确认，升级提醒';
  return {
    title: `⏰ ${row.title}`,
    content: `
      <div style="font-size:16px;line-height:1.7">
        <p><b>${escapeHtml(row.title)}</b></p>
        <p>时间：${formatTime(row.fire_at, row.tz)}（${escapeHtml(row.tz)}）</p>
        ${row.note ? `<p>备注：${escapeHtml(row.note)}</p>` : ''}
        <p style="color:#b45309">${escalation} · ${channelOfThis}</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none">我知道了，已确认</a></p>
        <p style="color:#888;font-size:12px">链接 24 小时内有效，点一次即停止升级。</p>
      </div>`,
    url: link,
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 核心调度：扫描到期提醒 → 计算应下发步骤 → 逐通道投递。
 * 幂等由 deliveries 的唯一约束保证，重复 cron 不会重复推送。
 * @param {object} env
 * @param {number} now epoch 秒
 */
export async function runScheduler(env, now = Math.floor(Date.now() / 1000)) {
  const rows = await db.listDueReminders(env.DB, now);
  const log = [];

  for (const row of rows) {
    if (shouldMarkMissed(row, now)) {
      await db.markMissed(env.DB, row.id, now);
      log.push({ reminderId: row.id, action: 'missed' });
      continue;
    }

    const steps = parseSteps(row);
    const delivered = await db.deliveredSteps(env.DB, row.id);
    const due = dueSteps({ reminder: row, steps, now, delivered });

    for (const item of due) {
      for (const channel of item.step.channels) {
        const claim = await db.claimDelivery(env.DB, {
          reminderId: row.id,
          stepIndex: item.index,
          channel,
          dueAt: item.due,
          now,
        });
        if (!claim.claimed) continue;

        const content = pushContent(env, row, item);
        const result = await sendOnChannel(channel, {
          env,
          ...content,
        });

        await db.finishDelivery(env.DB, {
          reminderId: row.id,
          stepIndex: item.index,
          channel,
          ok: result.ok,
          error: result.error,
        });

        log.push({
          reminderId: row.id,
          step: item.index,
          channel,
          attempt: claim.attempt,
          ok: result.ok,
          skipped: result.skipped ?? false,
          error: result.error,
        });
      }
    }
  }

  return log;
}

function ackPage(row, ok) {
  const title = ok ? '已确认' : '链接已失效';
  const body = ok
    ? `<p style="font-size:18px">✅ 已确认：<b>${escapeHtml(row.title)}</b></p>
       <p style="color:#666">这条提醒不会再升级。</p>`
    : `<p style="font-size:18px">⚠️ 这个确认链接无效或已过期。</p>
       <p style="color:#666">请打开 App 确认。</p>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;display:flex;min-height:100vh;align-items:center;justify-content:center">
<div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;box-shadow:0 8px 30px rgba(0,0,0,.08);text-align:center">
<h1 style="font-size:22px;margin:0 0 16px">${title}</h1>${body}
</div></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const now = Math.floor(Date.now() / 1000);

    if (pathname === '/health') {
      return json({ ok: true, now, channels: Object.keys(CHANNEL_LABEL) });
    }

    // 一键确认（微信/短信里点开，无需鉴权，token 即凭证）
    const ackMatch = pathname.match(/^\/a\/([a-f0-9]{16,})$/);
    if (ackMatch) {
      const row = await db.findByAckToken(env.DB, ackMatch[1], now);
      if (!row) return new Response(ackPage(null, false), { status: 410, headers: { 'content-type': 'text/html; charset=utf-8' } });
      await db.markAcked(env.DB, row.id, now);
      if (url.searchParams.get('json') === '1') return json({ ok: true, reminder: row.title });
      return new Response(ackPage(row, true), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (!authorized(request, env)) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }

    // 列表（调试用）
    if (pathname === '/api/reminders' && request.method === 'GET') {
      return json({ ok: true, reminders: await db.listReminders(env.DB) });
    }

    // 创建 / 编辑
    if (pathname === '/api/reminders' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: 'invalid json' }, 400);
      }
      if (!body?.id || !body?.title || !Number.isFinite(Number(body?.fire_at))) {
        return json({ ok: false, error: 'id / title / fire_at 必填' }, 400);
      }
      const saved = await db.upsertReminder(env.DB, body, now);
      return json({ ok: true, id: saved.id, ack_url: ackUrl(env, saved) });
    }

    // 删除
    const delMatch = pathname.match(/^\/api\/reminders\/([^/]+)$/);
    if (delMatch && request.method === 'DELETE') {
      await db.deleteReminder(env.DB, delMatch[1]);
      return json({ ok: true });
    }

    // App 内确认
    const ackApi = pathname.match(/^\/api\/reminders\/([^/]+)\/ack$/);
    if (ackApi && request.method === 'POST') {
      await db.markAcked(env.DB, ackApi[1], now);
      return json({ ok: true });
    }

    // 手动触发一次微信通道测试，便于排查 Webhook / token 是否有效
    if (pathname === '/api/test' && request.method === 'POST') {
      const base = (env.PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
      const result = await sendOnChannel('pushplus', {
        env,
        title: '强提醒 · 通道测试',
        content: `这是一条测试推送。\n时间：${new Date(now * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        url: base ? `${base}/health` : undefined,
      });
      return json({ ok: result.ok, skipped: result.skipped ?? false, error: result.error ?? null });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(event, env) {
    const log = await runScheduler(env);
    console.log('scheduler', JSON.stringify(log));
  },
};
