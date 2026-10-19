/**
 * WxPusher：免费的微信推送（消息进个人微信里的服务号）。
 * 1. 注册 https://wxpusher.zjiecode.com
 * 2. 创建应用 → 拿到 APP_TOKEN
 * 3. 扫码关注该应用 → 在「用户管理」里复制 UID
 * 然后设置两个 secret：WXPUSHER_APP_TOKEN、WXPUSHER_UIDS
 */

export const name = 'wxpusher';

const API = 'https://wxpusher.zjiecode.com/api/send/message';

export async function send({ env, title, content, url }) {
  const appToken = env.WXPUSHER_APP_TOKEN;
  const uids = String(env.WXPUSHER_UIDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!appToken) {
    return { ok: false, skipped: true, error: 'WXPUSHER_APP_TOKEN 未配置' };
  }
  if (uids.length === 0) {
    return { ok: false, skipped: true, error: 'WXPUSHER_UIDS 未配置' };
  }

  const markdown = [
    `## ${title}`,
    '',
    content.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    '',
    url ? `[👉 点此确认已收到](${url})` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      appToken,
      uids,
      summary: title,
      content: markdown,
      contentType: 3, // 3 = markdown
    }),
  });

  const raw = await res.json().catch(() => null);
  const ok = res.ok && (Number(raw?.code) === 1000 || raw?.success === true);
  return {
    ok,
    error: ok ? undefined : `WxPusher ${raw?.code ?? res.status}: ${raw?.msg ?? 'unknown'}`,
    raw,
  };
}
