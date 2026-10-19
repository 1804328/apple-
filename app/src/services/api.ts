import type { ChannelConfig, Reminder } from '../types';

export interface ApiResult {
  ok: boolean;
  error?: string;
  ackUrl?: string;
}

function base(cfg: ChannelConfig): string {
  return cfg.apiBaseUrl.replace(/\/+$/, '');
}

function headers(cfg: ChannelConfig): Record<string, string> {
  const h: Record<string, string> = {};
  if (cfg.apiKey) h['x-api-key'] = cfg.apiKey;
  return h;
}

function enabled(cfg: ChannelConfig): boolean {
  return cfg.syncEnabled && base(cfg).length > 0;
}

async function request(cfg: ChannelConfig, path: string, init: RequestInit): Promise<ApiResult> {
  if (!enabled(cfg)) return { ok: false, error: '未开启云端同步' };
  try {
    const res = await fetch(`${base(cfg)}${path}`, {
      ...init,
      headers: { ...headers(cfg), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json().catch(() => null)) as { ack_url?: string } | null;
    return { ok: true, ackUrl: data?.ack_url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 把提醒登记到云端，由 Cron 负责"到点没确认就升级" */
export function syncReminder(cfg: ChannelConfig, reminder: Reminder): Promise<ApiResult> {
  return request(cfg, '/api/reminders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: reminder.id,
      title: reminder.title,
      note: reminder.note,
      fire_at: Math.floor(reminder.fireAt / 1000),
      tz: reminder.tz,
      force_level: reminder.forceLevel,
      steps: reminder.steps.map((s) => ({ after_sec: s.afterSec, channels: s.channels })),
    }),
  });
}

export function ackOnServer(cfg: ChannelConfig, reminderId: string): Promise<ApiResult> {
  return request(cfg, `/api/reminders/${encodeURIComponent(reminderId)}/ack`, { method: 'POST' });
}

export function removeOnServer(cfg: ChannelConfig, reminderId: string): Promise<ApiResult> {
  return request(cfg, `/api/reminders/${encodeURIComponent(reminderId)}`, { method: 'DELETE' });
}

export async function checkHealth(cfg: ChannelConfig): Promise<ApiResult> {
  if (!base(cfg)) return { ok: false, error: '未填写服务器地址' };
  try {
    const res = await fetch(`${base(cfg)}/health`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
