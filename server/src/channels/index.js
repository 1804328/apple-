import * as pushplus from './pushplus.js';
import * as wecom from './wecom.js';
import * as wxpusher from './wxpusher.js';

/**
 * 通道注册表。
 * 数据模型里的 `pushplus` 表示「微信通道」，真正用哪个服务由环境变量决定：
 *   配了 WXPUSHER_APP_TOKEN  → WxPusher（免费，进个人微信）
 *   配了 WECOM_WEBHOOK       → 企业微信群机器人（免费，进企业微信）
 *   配了 PUSHPLUS_TOKEN      → PushPlus（现为会员功能）
 * 优先级：WxPusher > 企业微信 > PushPlus
 */
const adapters = {
  pushplus,
  wecom,
  wxpusher,
};

export const CHANNELS = Object.keys(adapters);

export const CHANNEL_LABEL = {
  pushplus: '微信',
  email: '邮件',
  sms: '短信',
  voice: '电话语音',
  local: '本地闹钟',
};

function pickWechatProvider(env) {
  if (env.WXPUSHER_APP_TOKEN) return 'wxpusher';
  if (env.WECOM_WEBHOOK) return 'wecom';
  if (env.PUSHPLUS_TOKEN) return 'pushplus';
  return null;
}

/**
 * @param {string} channel
 * @param {{env: object, title: string, content: string, url?: string}} ctx
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
export async function sendOnChannel(channel, ctx) {
  if (channel === 'local') {
    return { ok: true, skipped: true, error: 'local 由客户端负责' };
  }

  // 微信通道按已配置的服务动态选择
  const provider = channel === 'pushplus' ? pickWechatProvider(ctx.env) : channel;
  if (!provider) {
    return { ok: false, skipped: true, error: '微信通道未配置：需要 WXPUSHER_APP_TOKEN 或 WECOM_WEBHOOK' };
  }

  const adapter = adapters[provider];
  if (!adapter) {
    return { ok: false, skipped: true, error: `通道尚未实现: ${channel}` };
  }

  try {
    return await adapter.send(ctx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
