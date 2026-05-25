import { BannerAd } from './types';

const CENTRAL_MEDIA_PREFIX = '/central-media';
const CENTRAL_MEDIA_ORIGINS = new Set([
  'http://207.126.162.189:9000',
  'https://207.126.162.189:9000',
]);

const normalizeBannerAssetUrl = (rawUrl: string): string | undefined => {
  const normalized = String(rawUrl || '').trim();
  if (!normalized) return undefined;
  if (normalized.startsWith(CENTRAL_MEDIA_PREFIX)) return normalized;
  if (normalized.startsWith('/static/')) return `${CENTRAL_MEDIA_PREFIX}${normalized}`;

  try {
    const parsed = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return normalized;
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    const isCentralStaticAsset = parsed.pathname.startsWith('/static/banner-ads/') || parsed.pathname.startsWith('/static/channel-icons/');
    if (CENTRAL_MEDIA_ORIGINS.has(parsed.origin) || parsed.port === '9000' || isCentralStaticAsset) {
      return `${CENTRAL_MEDIA_PREFIX}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return normalized;
  }
};

const getEdgeIconUrl = (rawItem: any): string | undefined => {
  const raw = String(rawItem?.icon_url || rawItem?.icon || rawItem?.logo || '').trim();
  return normalizeBannerAssetUrl(raw) || undefined;
};

export const getEdgeBannerAds = (rawItem: any): BannerAd[] => {
  const rawList = rawItem?.banner_ads || rawItem?.bannerAds;
  if (!Array.isArray(rawList)) return [];

  const fallbackImageUrl = getEdgeIconUrl(rawItem);

  return rawList
    .map((entry: any) => {
      const message = String(entry?.message || '').trim();
      const duration = Number(entry?.duration);
      const targetUrl = String(entry?.target_url || entry?.url || '').trim();
      const imageUrl = normalizeBannerAssetUrl(String(
        entry?.image_url || entry?.imageUrl || entry?.image || entry?.media_url || fallbackImageUrl || ''
      ).trim());
      const startTime = String(entry?.start_time || entry?.startTime || '00:00').trim() || '00:00';
      const repeatCountPerDay = Number(entry?.repeat_count_per_day ?? entry?.repeatCountPerDay ?? 1);
      const intervalMinutes = Number(entry?.interval_minutes ?? entry?.intervalMinutes);

      if (!message && !imageUrl) return null;

      return {
        message,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 5,
        url: targetUrl || undefined,
        target_url: targetUrl || undefined,
        image_url: imageUrl || undefined,
        start_time: startTime,
        repeat_count_per_day: Number.isFinite(repeatCountPerDay) && repeatCountPerDay > 0 ? repeatCountPerDay : 1,
        interval_minutes: Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : undefined,
      } as BannerAd;
    })
    .filter(Boolean) as BannerAd[];
};

export const getBannerIntervalMs = (banner: BannerAd): number => {
  const repeatCount = Number(banner.repeat_count_per_day);
  if (Number.isFinite(repeatCount) && repeatCount > 0) {
    return (24 * 60 * 60 * 1000) / repeatCount;
  }

  const intervalMinutes = Number(banner.interval_minutes);
  if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
    return intervalMinutes * 60 * 1000;
  }

  return 24 * 60 * 60 * 1000;
};

export const getBannerStartOffsetMs = (banner: BannerAd): number => {
  const raw = String(banner.start_time || '00:00').trim();
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;

  return ((Math.max(0, Math.min(23, hours)) * 60) + Math.max(0, Math.min(59, minutes))) * 60 * 1000;
};

const getBannerOccurrenceInternal = (banner: BannerAd, nowMs: number, phaseOffsetMs = 0) => {
  const intervalMs = Math.max(60 * 1000, getBannerIntervalMs(banner));
  const durationMs = Math.max(1000, Math.round((Number(banner.duration) || 5) * 1000));
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);

  const firstStartMs = dayStart.getTime() + getBannerStartOffsetMs(banner) + phaseOffsetMs;
  let currentStartMs = firstStartMs;

  if (nowMs >= firstStartMs) {
    const cycles = Math.floor((nowMs - firstStartMs) / intervalMs);
    currentStartMs = firstStartMs + cycles * intervalMs;
  } else {
    const cyclesBack = Math.ceil((firstStartMs - nowMs) / intervalMs);
    currentStartMs = firstStartMs - cyclesBack * intervalMs;
  }

  const elapsedMs = nowMs - currentStartMs;
  const isActiveWindow = elapsedMs >= 0 && elapsedMs < durationMs;
  const remainingMs = isActiveWindow ? durationMs - elapsedMs : 0;
  const nextStartMs = isActiveWindow
    ? currentStartMs + intervalMs
    : (elapsedMs < 0 ? currentStartMs : currentStartMs + intervalMs);

  return {
    isActiveWindow,
    remainingMs,
    waitUntilNextStartMs: Math.max(250, nextStartMs - nowMs),
    occurrenceStartMs: currentStartMs,
    nextOccurrenceStartMs: nextStartMs,
  };
};

export const getBannerOccurrenceWithPhase = (banner: BannerAd, nowMs: number, phaseOffsetMs = 0) => (
  getBannerOccurrenceInternal(banner, nowMs, phaseOffsetMs)
);

export const getBannerOccurrence = (banner: BannerAd, nowMs: number) => (
  getBannerOccurrenceInternal(banner, nowMs, 0)
);
