import * as pushplus from './pushplus.js';

/**
 * 通道注册表。M1 只有微信；短信/语音/邮件在 M4 按需加。
 * 新增通道：实现 send({...}) -> {ok, error}，然后在这里注册并加到 channelOrder。
 */
const adapters = {
  pushplus,
};

export const CHANNELS = Object.keys(adapters);

export const CHANNEL_LABEL = {
  pushplus: '微信',
  email: '邮件',
  sms: '短信',
  voice: '电话语音',
  local: '本地闹钟',
};

/**
 * @param {string} channel
 * @param {object} ctx
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
export async function sendOnChannel(channel, ctx) {
  if (channel === 'local') {
    return { ok: true, skipped: true, error: 'local 由客户端负责' };
  }
  const adapter = adapters[channel];
  if (!adapter) {
    return { ok: false, skipped: true, error: `通道尚未实现: ${channel}` };
  }
  try {
    return await adapter.send(ctx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
