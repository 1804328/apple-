export interface NewReminderDraft {
  title?: string;
  fireAt?: number;
}

/**
 * 解析 strongreminder://new?... 形式的深链。
 * 支持：
 *   strongreminder://new?title=买牛奶&at=1761926400000
 *   strongreminder://new?title=开会&date=2026-11-01&time=09:30
 */
export function parseDeepLink(url: string): NewReminderDraft | null {
  try {
    const raw = url.replace(/^strongreminder:\/\//i, '');
    const [path, query = ''] = raw.split('?');

    const target = path.replace(/\/$/, '').split('/')[0];
    if (target !== 'new') return null;

    const params = new URLSearchParams(query);
    const title = params.get('title')?.trim() || undefined;

    let fireAt: number | undefined;

    const at = params.get('at');
    if (at) {
      const value = Number(at);
      if (Number.isFinite(value) && value > 0) {
        fireAt = value > 1e12 ? value : value * 1000;
      }
    }

    if (!fireAt) {
      const date = params.get('date');
      if (date) {
        const [year, month, day] = date.split('-').map(Number);
        const time = params.get('time') ?? '09:00';
        const [hour, minute] = time.split(':').map(Number);
        if (year && month && day) {
          fireAt = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).getTime();
        }
      }
    }

    if (!title && !fireAt) return null;
    return { title, fireAt };
  } catch {
    return null;
  }
}
