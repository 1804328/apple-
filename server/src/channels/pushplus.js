/**
 * PushPlus 通道：把提醒推到你的微信（服务号）。
 * 文档：https://www.pushplus.plus/doc/
 * 免费额度：实名用户微信渠道 < 200 次/天，超出当日暂停。
 */

export const name = 'pushplus';

/**
 * @param {object} args
 * @param {string} [args.token]
 * @param {string} args.title
 * @param {string} args.content  支持 HTML
 * @param {string} [args.url]
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string, raw?: unknown}>}
 */
export async function send({ token, title, content, url }) {
  if (!token) {
    return { ok: false, skipped: true, error: 'PUSHPLUS_TOKEN 未配置（wrangler secret put PUSHPLUS_TOKEN）' };
  }

  const res = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token,
      title,
      content,
      template: 'html',
      ...(url ? { callbackUrl: url } : {}),
    }),
  });

  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, error: `PushPlus HTTP ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`, raw };
  }
  const ok = Number(raw?.code) === 200;
  return {
    ok,
    error: ok ? undefined : `PushPlus ${raw?.code}: ${raw?.msg ?? 'unknown'}`,
    raw,
  };
}
