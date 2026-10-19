/**
 * 企业微信群机器人：完全免费、无额度限制（每分钟 20 条）。
 * 建好群 → 群机器人 → 复制 Webhook 地址，填到 WECOM_WEBHOOK。
 * 消息进企业微信 App（手机端会推送通知）。
 */

export const name = 'wecom';

const MARKDOWN_LIMIT = 4000;

export async function send({ env, title, content, url }) {
  const webhook = env.WECOM_WEBHOOK;
  if (!webhook) {
    return { ok: false, skipped: true, error: 'WECOM_WEBHOOK 未配置（wrangler secret put WECOM_WEBHOOK）' };
  }

  const markdown = [
    `**${title}**`,
    '',
    content.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    '',
    url ? `[点此确认已收到](${url})` : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, MARKDOWN_LIMIT);

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content: markdown } }),
  });

  const raw = await res.json().catch(() => null);
  const ok = res.ok && Number(raw?.errcode) === 0;
  return {
    ok,
    error: ok ? undefined : `企业微信 ${raw?.errcode ?? res.status}: ${raw?.errmsg ?? 'unknown'}`,
    raw,
  };
}
