/**
 * PushPlus 通道（微信服务号）。
 * 注意：2026 年起 PushPlus 的微信渠道已划入会员，免费额度不再稳定。
 * 个人自用建议优先用 WxPusher 或企业微信群机器人（见 wecom.js / wxpusher.js）。
 */

export const name = 'pushplus';

/**
 * @param {object} args
 * @param {object} args.env
 * @param {string} args.title
 * @param {string} args.content
 * @param {string} [args.url]
 */
export async function send({ env, title, content, url }) {
  const token = env.PUSHPLUS_TOKEN;
  if (!token) {
    return { ok: false, skipped: true, error: 'PUSHPLUS_TOKEN 未配置' };
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
