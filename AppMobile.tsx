import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Grid2x2, House, Menu, Search, UserCircle2 } from 'lucide-react';
import { BannerAd, Channel, ChannelKind, ContentType, PlaylistItem, ContentType as CT, ChannelKind as CK } from './types';
import { MOCK_CHANNELS } from './constants';
import YouTubePlayer from './components/YouTubePlayer';
import HLSPlayer from './components/HLSPlayer';
import AdPlaceholder from './components/AdPlaceholder';
import BannerSticker from './components/BannerSticker';
import { getBannerIntervalMs, getBannerOccurrenceWithPhase, getEdgeBannerAds } from './bannerAds';
import { BRAND_DESCRIPTION, BRAND_LOGO_SRC, BRAND_NAME, BRAND_TAGLINE } from './branding';
import { getRuntimeResolveUrl, isNativeApp, shouldUseDirectEdgeUrls } from './nativeRuntime';

const normalizeIconKey = (s: string) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const ICON_MODULES = import.meta.glob('./icones/*.{png,svg,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const ICON_URL_BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [p, url] of Object.entries(ICON_MODULES)) {
    const file = p.split('/').pop() || '';
    const base = file.replace(/\.[^.]+$/, '');
    const key = normalizeIconKey(base);
    if (key && typeof url === 'string') out[key] = url;
  }
  return out;
})();

const resolveChannelIconUrl = (channelName: string): string | undefined => {
  const key = normalizeIconKey(channelName);
  if (ICON_URL_BY_KEY[key]) return ICON_URL_BY_KEY[key];
  const fuzzy = Object.keys(ICON_URL_BY_KEY).find(x => x.includes(key) || key.includes(x));
  return fuzzy ? ICON_URL_BY_KEY[fuzzy] : undefined;
};

type CategoryId = string;
type LivePlayback = { item: PlaylistItem; offset: number; index: number };
type MobileTab = 'inicio' | 'categorias' | 'sessao';
type MobileMenuSection = 'termos' | 'sobre' | 'colabore';

const getChannelCategory = (ch: Channel): CategoryId => String(ch.category || '').trim();

const getAvailableCategories = (channels: Channel[]): Array<{ id: CategoryId; label: string }> => {
  const seen = new Set<string>();
  const out: Array<{ id: CategoryId; label: string }> = [];
  for (const ch of channels) {
    const raw = getChannelCategory(ch);
    if (!raw) continue;
    const key = normalizeIconKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ id: raw, label: raw });
  }
  return out;
};

const getCategoryChannelIndices = (channels: Channel[], category: CategoryId): number[] =>
  channels
    .map((ch, i) => ({ ch, i }))
    .filter(x => category && getChannelCategory(x.ch) === category)
    .map(x => x.i);

const isYouTubeUrl = (u: string) => /youtube\.com|youtu\.be/.test(u);

const extractYouTubeId = (u: string) => {
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = u.match(regExp);
  return (match && match[2] && match[2].length === 11) ? match[2] : null;
};

const getCardThumbUrl = (ch: Channel, liveItem?: PlaylistItem | null) => {
  if (liveItem?.type === ContentType.VIDEO && liveItem.url && isYouTubeUrl(liveItem.url)) {
    const id = extractYouTubeId(liveItem.url);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return resolveChannelIconUrl(ch.name);
};

const formatChannelNumber = (ch: Channel, fallbackIndex?: number) => {
  const raw = String(ch.channel_id || '').trim();
  if (/^\d+$/.test(raw)) return raw.padStart(3, '0');
  if (raw) return raw;
  return String((fallbackIndex ?? 0) + 1).padStart(3, '0');
};

const formatHm = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const formatPtDate = (ms: number) => {
  const d = new Date(ms);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  return `${weekday}., ${day} DE ${month}.`;
};

const getLivePlaybackState = (channel: Channel): LivePlayback | null => {
  const startTime = new Date(channel.schedule_start).getTime();
  const now = Date.now();
  let elapsed = (now - startTime) / 1000;
  const totalDuration = channel.items.reduce((acc, item) => acc + item.duration, 0);

  if (!channel.items.length || !Number.isFinite(totalDuration) || totalDuration <= 0) return null;
  if (elapsed < 0) return { item: channel.items[0], offset: 0, index: 0 };
  if (channel.loop) elapsed = elapsed % totalDuration;
  else if (elapsed >= totalDuration) return null;

  let acc = 0;
  for (let i = 0; i < channel.items.length; i++) {
    const item = channel.items[i];
    if (acc + item.duration > elapsed) return { item, offset: elapsed - acc, index: i };
    acc += item.duration;
  }
  return null;
};

const getItemLabel = (it: PlaylistItem) => {
  if (it.type === ContentType.AD) return 'Intervalo comercial';
  const u = it.url || '';
  if (!u) return 'Conteudo';
  if (isYouTubeUrl(u)) return `Video ${extractYouTubeId(u) || 'YouTube'}`;
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'Stream';
  }
};

const AppMobile: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>(MOCK_CHANNELS);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('');
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);
  const [hoverPreview, setHoverPreview] = useState<{ channelIndex: number; playback: LivePlayback; token: number } | null>(null);
  const [expandedPlayback, setExpandedPlayback] = useState<{ channelIndex: number; playback: LivePlayback } | null>(null);
  const [isExpandedInfoVisible, setIsExpandedInfoVisible] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('inicio');
  const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
  const [activeMenuSection, setActiveMenuSection] = useState<MobileMenuSection>('termos');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [overlayViewport, setOverlayViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const expandedInfoTimerRef = useRef<number | null>(null);
  const bannerAdTimerRef = useRef<number | null>(null);
  const bannerAdHideTimerRef = useRef<number | null>(null);
  const [activeBannerAd, setActiveBannerAd] = useState<BannerAd | null>(null);
  const [isBannerAdVisible, setIsBannerAdVisible] = useState(false);
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const expandedRootRef = useRef<HTMLDivElement | null>(null);
  const configuredEdgeBaseUrl = String((import.meta as any).env?.VITE_EDGE_BASE_URL || '').trim().replace(/\/+$/, '');
  const configuredEdgeFallbackBaseUrl = String((import.meta as any).env?.VITE_EDGE_FALLBACK_BASE_URL || '').trim().replace(/\/+$/, '');
  const EDGE_PROXY_PREFIX = '/edge';
  const [edgeBaseUrl, setEdgeBaseUrl] = useState<string>(configuredEdgeBaseUrl || configuredEdgeFallbackBaseUrl);
  const RESOLVE_URL = getRuntimeResolveUrl();
  const ALLOW_EDGE_RESOLVE = (import.meta as any).env?.VITE_ALLOW_EDGE_RESOLVE === '1';

  const normalizeBaseUrl = (u: string) => String(u || '').trim().replace(/\/+$/, '');

  const isAllowedEdgeBaseUrl = (u: string) => {
    try {
      const parsed = new URL(u);
      const proto = parsed.protocol;
      const host = parsed.hostname;
      if (proto !== 'http:' && proto !== 'https:') return false;
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
      return true;
    } catch {
      return false;
    }
  };

  const toEdgeProxyUrl = useCallback((rawUrl: string) => {
    const normalized = String(rawUrl || '').trim();
    if (!normalized) return normalized;

    try {
      const parsed = new URL(normalized, window.location.origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return normalized;
      if (parsed.origin === window.location.origin) return `${parsed.pathname}${parsed.search}${parsed.hash}`;

            if (shouldUseDirectEdgeUrls()) return parsed.toString();

      const knownEdgeOrigins = new Set<string>();
      for (const candidate of [edgeBaseUrl, configuredEdgeBaseUrl, configuredEdgeFallbackBaseUrl]) {
        if (!isAllowedEdgeBaseUrl(candidate)) continue;
        knownEdgeOrigins.add(new URL(candidate).origin);
      }

      if (!knownEdgeOrigins.has(parsed.origin)) return normalized;
      return `${EDGE_PROXY_PREFIX}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return normalized;
    }
  }, [configuredEdgeBaseUrl, configuredEdgeFallbackBaseUrl, edgeBaseUrl]);

  const toChannelFromEdge = (it: any): Channel | null => {
    const channelId = String(it.channel_id || it.channel_number || it.id || '').trim();
    if (!channelId) return null;
    const name = String(it.name || channelId).trim();
    const category = String(it.category ?? it.categoria ?? it.group ?? it.genre ?? '').trim();
    const kindRaw = String(it.kind || '').toLowerCase();
    const kind: CK = (kindRaw === CK.HLS || kindRaw === CK.YOUTUBE || kindRaw === CK.YOUTUBE_LINEAR)
      ? (kindRaw as CK)
      : (it.source_url && String(it.source_url).includes('youtube') ? CK.YOUTUBE_LINEAR : CK.HLS);
    const scheduleStart = String(it.schedule_start || it.scheduleStart || it.schedule?.start || '2024-01-01T00:00:00Z');

    let items: PlaylistItem[] = [];
    if (Array.isArray(it.items) && it.items.length > 0) {
      items = it.items
        .map((x: any) => {
          const t = String(x.type || '').toLowerCase();
          const type = t === CT.AD ? CT.AD : CT.VIDEO;
          const duration = Number(x.duration);
          const url = x.url ? toEdgeProxyUrl(String(x.url)) : undefined;
          if (!Number.isFinite(duration) || duration <= 0) return null;
          if (type === CT.VIDEO && !url) return null;
          return { type, url, duration } as PlaylistItem;
        })
        .filter(Boolean) as PlaylistItem[];
    }
    if (!items.length) {
      const url = toEdgeProxyUrl(String(it.playback_url || it.playbackUrl || it.source_url || it.url || '').trim());
      if (!url) return null;
      items = [{ type: CT.VIDEO, url, duration: 3600 }];
    }
    return {
      channel_id: channelId,
      name,
      category: category || undefined,
      kind,
      schedule_start: scheduleStart,
      items,
      banner_ads: getEdgeBannerAds(it),
      loop: it.loop !== undefined ? Boolean(it.loop) : true,
    };
  };

  const resolveEdgeBaseUrl = useCallback(async () => {
    if (!ALLOW_EDGE_RESOLVE || !RESOLVE_URL || configuredEdgeBaseUrl) return;
    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(RESOLVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      if (!r.ok) return;
      const data: any = await r.json();
      const base = normalizeBaseUrl(String(data?.base_url || data?.baseUrl || ''));
      if (isAllowedEdgeBaseUrl(base)) setEdgeBaseUrl(base);
    } catch {
      // ignore
    } finally {
      window.clearTimeout(t);
    }
  }, [ALLOW_EDGE_RESOLVE, RESOLVE_URL, configuredEdgeBaseUrl]);

  const loadChannelsFromEdge = useCallback(async () => {
    try {
      setIsLoading(true);
      const base = normalizeBaseUrl(edgeBaseUrl);
      if (!isAllowedEdgeBaseUrl(base)) throw new Error('invalid edge url');

      const urlsToTry = [`${base}/playlist.json`, `${base}/channels`];
      let payload: any = null;
      for (const u of urlsToTry) {
        try {
          const r = await fetch(u, { cache: 'no-store' });
          if (!r.ok) continue;
          payload = await r.json();
          break;
        } catch {
          // continue
        }
      }
      if (!payload) throw new Error('no payload');
      const rawList = Array.isArray(payload) ? payload : (payload.items || payload.channels || []);
      const parsed = (rawList as any[]).map(toChannelFromEdge).filter(Boolean) as Channel[];
      if (!parsed.length) throw new Error('empty channels');
      setChannels(parsed);
      setSelectedChannelIndex(0);
    } catch {
      setChannels(MOCK_CHANNELS);
      setSelectedChannelIndex(0);
    } finally {
      setIsLoading(false);
    }
  }, [edgeBaseUrl, toEdgeProxyUrl]);

  useEffect(() => {
    (async () => {
      if (!configuredEdgeBaseUrl && ALLOW_EDGE_RESOLVE) {
        try { await resolveEdgeBaseUrl(); } catch { /* ignore */ }
      }
      await loadChannelsFromEdge();
    })();
  }, [ALLOW_EDGE_RESOLVE, configuredEdgeBaseUrl, loadChannelsFromEdge, resolveEdgeBaseUrl]);

  const clearBannerAdTimers = useCallback(() => {
    if (bannerAdTimerRef.current) {
      window.clearTimeout(bannerAdTimerRef.current);
      bannerAdTimerRef.current = null;
    }
    if (bannerAdHideTimerRef.current) {
      window.clearTimeout(bannerAdHideTimerRef.current);
      bannerAdHideTimerRef.current = null;
    }
  }, []);

  const availableCategories = useMemo(() => getAvailableCategories(channels), [channels]);
  const popularCards = useMemo(() => channels.map((_, i) => i), [channels]);
  const categoryCards = useMemo(() => getCategoryChannelIndices(channels, selectedCategory), [channels, selectedCategory]);
  const cards = useMemo(() => (categoryCards.length ? categoryCards : popularCards), [categoryCards, popularCards]);
  const isIOSBrowser = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const isIOSDevice = /iP(hone|od|ad)/i.test(ua);
    const isIPadDesktopUA = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isIOSDevice || isIPadDesktopUA;
  }, []);
  const shouldUseNativeFullscreen = !isIOSBrowser;

  useEffect(() => {
    if (!selectedCategory) return;
    if (!availableCategories.some(c => c.id === selectedCategory)) setSelectedCategory('');
  }, [availableCategories, selectedCategory]);

  const enterExpandedFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (!shouldUseNativeFullscreen) return;
    if (document.fullscreenElement) return;
    const target = (expandedRootRef.current || appRootRef.current || document.documentElement) as any;

    try {
      if (typeof target.requestFullscreen === 'function') {
        await target.requestFullscreen();
      } else if (typeof target.webkitRequestFullscreen === 'function') {
        target.webkitRequestFullscreen();
      }
    } catch {
      // fullscreen may be blocked by the browser
    }
  }, [shouldUseNativeFullscreen]);

  const exitExpandedFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (!shouldUseNativeFullscreen) return;
    const d = document as any;
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
      } else if (d.webkitFullscreenElement && typeof d.webkitExitFullscreen === 'function') {
        d.webkitExitFullscreen();
      }
    } catch {
      // ignore fullscreen exit errors
    }
  }, [shouldUseNativeFullscreen]);

  useEffect(() => {
    if (!expandedPlayback) return;
    const updateViewport = () => {
      const vv = window.visualViewport;
      const width = Math.round(Math.max(
        vv?.width || 0,
        window.innerWidth || 0,
        document.documentElement.clientWidth || 0
      ));
      const height = Math.round(Math.max(
        vv?.height || 0,
        window.innerHeight || 0,
        document.documentElement.clientHeight || 0
      ));
      setOverlayViewport({ width, height });
    };

    updateViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateViewport);
    vv?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    return () => {
      vv?.removeEventListener('resize', updateViewport);
      vv?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, [expandedPlayback]);

  useEffect(() => {
    if (!expandedPlayback) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyOverscroll = (document.body.style as any).overscrollBehavior;
    const prevRootOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    (document.body.style as any).overscrollBehavior = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      (document.body.style as any).overscrollBehavior = prevBodyOverscroll;
      document.documentElement.style.overflow = prevRootOverflow;
    };
  }, [expandedPlayback]);

  useEffect(() => {
    if (!shouldUseNativeFullscreen) return;
    const onFullscreenChange = () => {
      if (!expandedPlayback) return;
      if (!document.fullscreenElement) setExpandedPlayback(null);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange' as any, onFullscreenChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange' as any, onFullscreenChange as EventListener);
    };
  }, [expandedPlayback, shouldUseNativeFullscreen]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!expandedPlayback) return;
    setIsExpandedInfoVisible(true);
    if (expandedInfoTimerRef.current) window.clearTimeout(expandedInfoTimerRef.current);
    expandedInfoTimerRef.current = window.setTimeout(() => {
      setIsExpandedInfoVisible(false);
      expandedInfoTimerRef.current = null;
    }, 5000);
  }, [expandedPlayback?.channelIndex, expandedPlayback?.playback.index]);

  useEffect(() => {
    clearBannerAdTimers();

    if (!expandedPlayback || expandedPlayback.playback.item.type !== ContentType.VIDEO) {
      setIsBannerAdVisible(false);
      setActiveBannerAd(null);
      return;
    }

    const channel = channels[expandedPlayback.channelIndex];
    const banners = channel?.banner_ads || [];
    if (!banners.length) {
      setIsBannerAdVisible(false);
      setActiveBannerAd(null);
      return;
    }

    const bannerExitDurationMs = 400;
    const getBannerDisplayMs = (banner: BannerAd) => Math.max(1000, Math.round((Number(banner.duration) || 5) * 1000));
    const getBannerWeight = (banner: BannerAd) => {
      const repeatCount = Number(banner.repeat_count_per_day);
      if (Number.isFinite(repeatCount) && repeatCount > 0) return repeatCount;

      const intervalMinutes = Number(banner.interval_minutes);
      if (Number.isFinite(intervalMinutes) && intervalMinutes > 0) {
        return (24 * 60) / intervalMinutes;
      }

      return 1;
    };
    let lastServedSlotKey: string | null = null;
    let lastServedIndex: number | null = null;
    const servedCounts = new Map<number, number>();
    const bannerPhaseOffsets = (() => {
      const offsets = new Map<number, number>();
      const groups = new Map<string, number[]>();

      banners.forEach((entry, index) => {
        const key = String(entry.start_time || '00:00').trim() || '00:00';
        const existing = groups.get(key) || [];
        existing.push(index);
        groups.set(key, existing);
      });

      groups.forEach((indices) => {
        if (!indices.length) return;
        const baseIntervalMs = Math.max(60 * 1000, Math.min(...indices.map((index) => getBannerIntervalMs(banners[index]))));
        indices.forEach((index, order) => {
          const phaseOffsetMs = indices.length > 1 ? Math.round((baseIntervalMs / indices.length) * order) : 0;
          offsets.set(index, phaseOffsetMs);
        });
      });

      return offsets;
    })();
    const syncBannerSchedule = () => {
      const nowMs = Date.now();
      const schedules = banners.map((entry, index) => ({
        banner: entry,
        index,
        schedule: getBannerOccurrenceWithPhase(entry, nowMs, bannerPhaseOffsets.get(index) || 0),
      }));

      const activeCandidates = schedules
        .filter(({ schedule }) => schedule.isActiveWindow)
        .sort((a, b) => (
          a.schedule.occurrenceStartMs - b.schedule.occurrenceStartMs || a.index - b.index
        ));

      const slotKey = activeCandidates
        .map(({ index, schedule }) => `${index}:${schedule.occurrenceStartMs}`)
        .join('|');

      if (activeCandidates.length && slotKey !== lastServedSlotKey) {
        const candidatePool = lastServedIndex !== null && activeCandidates.some(({ index }) => index !== lastServedIndex)
          ? activeCandidates.filter(({ index }) => index !== lastServedIndex)
          : activeCandidates;

        const nextBanner = candidatePool
          .map((entry) => {
            const weight = Math.max(1, getBannerWeight(entry.banner));
            const served = servedCounts.get(entry.index) || 0;
            return {
              ...entry,
              weight,
              served,
              score: served / weight,
            };
          })
          .sort((a, b) => (
            a.score - b.score ||
            b.weight - a.weight ||
            a.schedule.occurrenceStartMs - b.schedule.occurrenceStartMs ||
            a.index - b.index
          ))[0];

        servedCounts.set(nextBanner.index, (servedCounts.get(nextBanner.index) || 0) + 1);
        lastServedIndex = nextBanner.index;
        lastServedSlotKey = slotKey;
        setActiveBannerAd(nextBanner.banner);
        setIsBannerAdVisible(true);
        bannerAdTimerRef.current = window.setTimeout(() => {
          setIsBannerAdVisible(false);
          bannerAdHideTimerRef.current = window.setTimeout(() => {
            setActiveBannerAd(null);
            syncBannerSchedule();
          }, bannerExitDurationMs);
        }, Math.max(250, Math.min(nextBanner.schedule.remainingMs, getBannerDisplayMs(nextBanner.banner))));
        return;
      }

      const waitUntilNextStartMs = schedules.length
        ? Math.min(...schedules.map(({ schedule }) => schedule.waitUntilNextStartMs))
        : 1000;

      setIsBannerAdVisible(false);
      setActiveBannerAd(null);
      bannerAdTimerRef.current = window.setTimeout(() => {
        syncBannerSchedule();
      }, waitUntilNextStartMs);
    };

    syncBannerSchedule();

    return () => {
      clearBannerAdTimers();
    };
  }, [channels, clearBannerAdTimers, expandedPlayback?.channelIndex, expandedPlayback?.playback.item.type]);

  const openChannelLarge = useCallback((channelIndex: number) => {
    const ch = channels[channelIndex];
    if (!ch) return;
    const live = getLivePlaybackState(ch);
    if (!live) return;

    const launchChannel = () => {
      setSelectedChannelIndex(channelIndex);
      setExpandedPlayback({ channelIndex, playback: live });
      window.requestAnimationFrame(() => {
        void enterExpandedFullscreen();
      });
    };

    if (expandedPlayback && expandedPlayback.channelIndex !== channelIndex) {
      setExpandedPlayback(null);
      void exitExpandedFullscreen().finally(() => {
        window.requestAnimationFrame(launchChannel);
      });
      return;
    }

    launchChannel();
  }, [channels, enterExpandedFullscreen, exitExpandedFullscreen, expandedPlayback, getNextPlaybackState]);

  const handleChannelCardTap = useCallback((channelIndex: number) => {
    if (selectedChannelIndex !== channelIndex) {
      setSelectedChannelIndex(channelIndex);
      return;
    }
    openChannelLarge(channelIndex);
  }, [openChannelLarge, selectedChannelIndex]);

  const closeExpanded = useCallback(() => {
    setExpandedPlayback(null);
    void exitExpandedFullscreen();
  }, [exitExpandedFullscreen]);

  const getWrappedNextChannelIndex = useCallback((currentIndex: number, delta: number) => {
    if (!cards.length) return currentIndex;
    const currentPos = Math.max(0, cards.indexOf(currentIndex));
    let nextPos = currentPos + delta;
    while (nextPos < 0) nextPos += cards.length;
    nextPos = nextPos % cards.length;
    return cards[nextPos];
  }, [cards]);

  function getNextPlaybackState(channel: Channel, currentIndex: number) {
    if (!channel.items.length) return null;

    const nextIndex = currentIndex + 1;
    if (nextIndex < channel.items.length) {
      return { item: channel.items[nextIndex], offset: 0, index: nextIndex };
    }

    if (!channel.loop) return null;
    return { item: channel.items[0], offset: 0, index: 0 };
  }

  const syncExpandedPlayback = useCallback((channelIndex: number, fallbackIndex?: number) => {
    const channel = channels[channelIndex];
    if (!channel) return false;

    let livePlayback = getLivePlaybackState(channel);
    if ((!livePlayback || (fallbackIndex !== undefined && livePlayback.index === fallbackIndex)) && fallbackIndex !== undefined) {
      livePlayback = getNextPlaybackState(channel, fallbackIndex);
    }

    if (!livePlayback) {
      closeExpanded();
      return false;
    }

    setSelectedChannelIndex(channelIndex);
    setExpandedPlayback({ channelIndex, playback: livePlayback });
    return true;
  }, [channels, closeExpanded, getLivePlaybackState, getNextPlaybackState]);

  const handleExpandedPlaybackEnded = useCallback(() => {
    if (!expandedPlayback) return;
    syncExpandedPlayback(expandedPlayback.channelIndex, expandedPlayback.playback.index);
  }, [expandedPlayback, syncExpandedPlayback]);

  const changeExpandedChannel = useCallback((delta: number) => {
    if (!expandedPlayback) return;
    const nextChannelIndex = getWrappedNextChannelIndex(expandedPlayback.channelIndex, delta);
    syncExpandedPlayback(nextChannelIndex);
  }, [expandedPlayback, getWrappedNextChannelIndex, syncExpandedPlayback]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = (e as any).keyCode as number | undefined;
      const isBack = e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Back' || code === 27 || code === 8 || code === 461;
      if (isAppMenuOpen && isBack) {
        e.preventDefault();
        setIsAppMenuOpen(false);
        return;
      }
      if (expandedPlayback && isBack) {
        e.preventDefault();
        closeExpanded();
        return;
      }
      if (!expandedPlayback) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        changeExpandedChannel(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        changeExpandedChannel(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeExpandedChannel, closeExpanded, expandedPlayback, isAppMenuOpen]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cleaned = false;
    let removeListener: (() => Promise<void>) | null = null;
    const loadCapacitorApp = new Function("return import('@capacitor/app')") as () => Promise<{ App: { addListener: (...args: any[]) => Promise<{ remove: () => Promise<void> }>; exitApp: () => Promise<void>; } }>;

    void loadCapacitorApp().then(({ App: CapacitorApp }) => {
      if (cleaned) return;

      const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (isAppMenuOpen) {
          setIsAppMenuOpen(false);
          return;
        }

        if (expandedPlayback) {
          closeExpanded();
          return;
        }

        if (canGoBack && window.history.length > 1) {
          window.history.back();
          return;
        }

        void CapacitorApp.exitApp();
      });

      removeListener = async () => {
        const handle = await listener;
        await handle.remove();
      };
    }).catch(() => {
      removeListener = null;
    });

    return () => {
      cleaned = true;
      void removeListener?.();
    };
  }, [closeExpanded, expandedPlayback, isAppMenuOpen]);
  if (isLoading) {
    return (
      <div className="h-[100dvh] w-screen bg-[#05070d] text-white grid place-items-center">
        <div className="px-5 text-center">
          <div className="relative mx-auto mb-5 w-[min(82vw,430px)]">
            <div className="absolute inset-[-10%] bg-[radial-gradient(circle,rgba(60,174,255,0.22)_0%,rgba(255,134,58,0.18)_38%,transparent_72%)] blur-3xl" />
            <img src={BRAND_LOGO_SRC} alt={BRAND_NAME} className="relative w-full h-auto object-contain" />
          </div>
          <div className="text-xl font-black tracking-tight">{BRAND_NAME}</div>
          <div className="mt-2 text-[0.64rem] uppercase tracking-[0.32em] text-cyan-200/70">{BRAND_TAGLINE}</div>
          <div className="mt-3 text-sm text-white/70">{BRAND_DESCRIPTION}</div>
          <div className="mt-4 text-sm text-white/60">{edgeBaseUrl || 'sem edge configurado'}</div>
        </div>
      </div>
    );
  }

  const expandedChannel = expandedPlayback ? channels[expandedPlayback.channelIndex] : null;
  const expandedItem = expandedPlayback?.playback.item;
  const clockLabel = formatHm(nowMs);
  const dateLabel = formatPtDate(nowMs);
  const popularChipIndices = popularCards.slice(0, 20);
  const expandedOverlayStyle: React.CSSProperties = {
    width: overlayViewport.width > 0 ? `${overlayViewport.width}px` : '100vw',
    height: overlayViewport.height > 0 ? `${overlayViewport.height}px` : '100dvh',
  };

  return (
    <div
      ref={appRootRef}
      className="h-[100dvh] w-screen overflow-hidden text-white flex flex-col bg-[radial-gradient(120%_78%_at_50%_0%,#0a2150_0%,#04112e_46%,#01050f_100%)]"
    >
      <header className="shrink-0 px-3 pt-3 pb-2 border-b border-white/10 bg-[#071327]/75 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsAppMenuOpen(true)}
              className="w-10 h-10 rounded-xl border border-white/20 bg-white/5 grid place-items-center"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src={BRAND_LOGO_SRC}
              alt={BRAND_NAME}
              className="h-10 w-auto max-w-[48vw] object-contain drop-shadow-[0_8px_24px_rgba(60,174,255,0.22)]"
            />
          </div>
          <div className="text-right leading-none pt-0.5">
            <div className="text-[2.1rem] font-black tabular-nums">{clockLabel}</div>
            <div className="mt-1 text-[0.72rem] tracking-[0.28em] uppercase text-sky-100/80">{dateLabel}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[0.56rem] sm:text-[0.62rem] uppercase tracking-[0.22em] font-black text-white/90">
            Mais popular...
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.58rem] sm:text-xs font-semibold text-white/90"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {popularChipIndices.map((chIdx) => {
            const ch = channels[chIdx];
            const isSelected = chIdx === selectedChannelIndex;
            return (
              <button
                key={`mob-pop-${ch.channel_id}-${chIdx}`}
                type="button"
                onClick={() => handleChannelCardTap(chIdx)}
                className={[
                  'shrink-0 rounded-2xl border px-5 py-2 text-[0.58rem] sm:text-xs font-black uppercase tracking-wide transition-colors',
                  isSelected ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
                ].join(' ')}
              >
                {ch.name}
              </button>
            );
          })}
        </div>

        {(mobileTab === 'categorias' || selectedCategory) && (
          <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setSelectedCategory('')}
              className={[
                'shrink-0 rounded-xl border px-3 py-1.5 text-[0.56rem] sm:text-xs font-bold uppercase',
                !selectedCategory ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
              ].join(' ')}
            >
              Todos
            </button>
            {availableCategories.map((cat) => (
              <button
                key={`mob-cat-${cat.id}`}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={[
                  'shrink-0 rounded-xl border px-3 py-1.5 text-[0.56rem] sm:text-xs font-bold uppercase',
                  selectedCategory === cat.id ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
                ].join(' ')}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-3 space-y-4">
        <section className="space-y-4">
          {cards.map((chIdx) => {
            const ch = channels[chIdx];
            const live = getLivePlaybackState(ch);
            const liveItem = live?.item || null;
            const iconUrl = resolveChannelIconUrl(ch.name);
            const thumbUrl = getCardThumbUrl(ch, liveItem);
            const isPreviewing = hoverPreview?.channelIndex === chIdx && Boolean(hoverPreview.playback.item.url);
            const isSelected = chIdx === selectedChannelIndex;

            return (
              <article key={ch.channel_id} className="min-w-0">
                <button
                  type="button"
                  onMouseEnter={() => {
                    if (!live || live.item.type !== ContentType.VIDEO || !live.item.url) {
                      setHoverPreview(null);
                      return;
                    }
                    setSelectedChannelIndex(chIdx);
                    setHoverPreview({ channelIndex: chIdx, playback: live, token: Date.now() });
                  }}
                  onMouseLeave={() => setHoverPreview(prev => (prev?.channelIndex === chIdx ? null : prev))}
                  onClick={() => handleChannelCardTap(chIdx)}
                  className={[
                    'w-full rounded-[1.15rem] overflow-hidden border text-left bg-black/25 shadow-[0_6px_20px_rgba(0,0,0,0.35)]',
                    isSelected ? 'border-sky-300 ring-2 ring-sky-300/55' : 'border-white/15',
                  ].join(' ')}
                >
                  <div className="relative aspect-video bg-black">
                    {isPreviewing ? (
                      <div className="absolute inset-0">
                        {(ch.kind === ChannelKind.YOUTUBE || ch.kind === ChannelKind.YOUTUBE_LINEAR) ? (
                          <YouTubePlayer
                            key={`mob-preview-${ch.channel_id}-${hoverPreview?.token}`}
                            url={hoverPreview!.playback.item.url!}
                            offset={hoverPreview!.playback.offset}
                            duration={hoverPreview!.playback.item.duration}
                            onEnded={() => {}}
                            muted
                          />
                        ) : (
                          <HLSPlayer
                            key={`mob-preview-${ch.channel_id}-${hoverPreview?.token}`}
                            url={hoverPreview!.playback.item.url!}
                            offset={hoverPreview!.playback.offset}
                            onEnded={() => {}}
                            muted
                          />
                        )}
                      </div>
                    ) : thumbUrl ? (
                      <img src={thumbUrl} alt={ch.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-lg font-black bg-gradient-to-br from-white/10 to-black">
                        {String(ch.name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute top-2 left-2 rounded-full bg-[#2d4df7] px-2.5 py-1 text-sm leading-none font-black">
                      {formatChannelNumber(ch, chIdx)}
                    </div>
                  </div>
                </button>

                <button type="button" onClick={() => handleChannelCardTap(chIdx)} className="mt-2 w-full text-left">
                  <div className="flex items-start gap-2.5">
                    {iconUrl ? (
                      <img src={iconUrl} alt={ch.name} className="w-8 h-8 rounded-full object-cover border border-white/20" loading="lazy" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 grid place-items-center text-xs font-black">
                        {String(ch.name || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div
                        className="text-[0.95rem] sm:text-base leading-5 font-semibold text-white/95"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {liveItem ? getItemLabel(liveItem) : ch.name}
                      </div>
                      <div className="text-[0.9rem] sm:text-sm text-white/70 truncate uppercase">{ch.name}</div>
                      <div className="text-[0.85rem] sm:text-xs text-white/60 truncate">
                        {formatHm(nowMs)} - Ao vivo
                      </div>
                    </div>
                  </div>
                </button>
              </article>
            );
          })}
        </section>
      </main>

      <nav className="shrink-0 border-t border-white/10 bg-[#050c1d]/95">
        <div className="grid grid-cols-3 gap-2 px-3 pt-2 pb-3">
          <button
            type="button"
            onClick={() => {
              setMobileTab('inicio');
              setSelectedCategory('');
            }}
            className={[
              'rounded-xl py-1.5 flex flex-col items-center justify-center gap-0.5',
              mobileTab === 'inicio' ? 'text-white bg-white/10' : 'text-white/70',
            ].join(' ')}
          >
            <House className="w-5 h-5" />
            <span className="text-[0.6rem] font-black uppercase tracking-wider">Inicio</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('categorias')}
            className={[
              'rounded-xl py-1.5 flex flex-col items-center justify-center gap-0.5',
              mobileTab === 'categorias' ? 'text-white bg-white/10' : 'text-white/70',
            ].join(' ')}
          >
            <Grid2x2 className="w-5 h-5" />
            <span className="text-[0.6rem] font-black uppercase tracking-wider">Categorias</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileTab('sessao');
              setIsAppMenuOpen(true);
            }}
            className={[
              'rounded-xl py-1.5 flex flex-col items-center justify-center gap-0.5',
              mobileTab === 'sessao' ? 'text-white bg-white/10' : 'text-white/70',
            ].join(' ')}
          >
            <UserCircle2 className="w-5 h-5" />
            <span className="text-[0.6rem] font-black uppercase tracking-wider">Sessao</span>
          </button>
        </div>
      </nav>

      {isAppMenuOpen && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            onClick={() => setIsAppMenuOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
            aria-label="Fechar menu"
          />
          <section className="absolute inset-x-3 top-16 bottom-6 rounded-2xl border border-white/20 bg-[#071224]/95 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/15 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setActiveMenuSection('termos')}
                className={[
                  'shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold uppercase border',
                  activeMenuSection === 'termos' ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
                ].join(' ')}
              >
                Termos
              </button>
              <button
                type="button"
                onClick={() => setActiveMenuSection('sobre')}
                className={[
                  'shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold uppercase border',
                  activeMenuSection === 'sobre' ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
                ].join(' ')}
              >
                Sobre
              </button>
              <button
                type="button"
                onClick={() => setActiveMenuSection('colabore')}
                className={[
                  'shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold uppercase border',
                  activeMenuSection === 'colabore' ? 'bg-white text-[#0a1d80] border-white' : 'bg-white/10 border-white/20 text-white',
                ].join(' ')}
              >
                Colabore
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 text-sm text-white/90 space-y-4">
              {activeMenuSection === 'termos' && (
                <>
                  <h3 className="text-base font-black uppercase">Termos de uso</h3>
                  <p>
                    Este e um projeto experimental. Os canais e conteudos exibidos aqui sao publicos, gratuitos e livres em plataformas como
                    YouTube e outras fontes abertas.
                  </p>
                  <p>
                    Nao temos responsabilidade editorial sobre o material exibido por terceiros. Caso algum conteudo viole direitos ou politicas,
                    ele deve ser reportado diretamente na plataforma de origem.
                  </p>
                </>
              )}

              {activeMenuSection === 'sobre' && (
                <>
                  <h3 className="text-base font-black uppercase">Sobre</h3>
                  <p>
                    A {BRAND_NAME} e uma interface de TV linear para navegar canais por categoria, com previews ao vivo e abertura rapida em tela grande.
                  </p>
                  <p>
                    Desenvolvido por <span className="font-bold text-white">Kennedy S. Amorim</span>.
                  </p>
                </>
              )}

              {activeMenuSection === 'colabore' && (
                <>
                  <h3 className="text-base font-black uppercase">Colabore conosco</h3>
                  <p>Voce pode colaborar com este projeto com uma doacao ou enviando sugestoes de melhoria.</p>
                  <p className="text-xs text-white/75">QR code placeholder (ainda sem destino especifico):</p>
                  <div className="w-40 aspect-square rounded-xl bg-white p-3">
                    <div
                      className="w-full h-full"
                      style={{
                        backgroundImage:
                          'linear-gradient(90deg,#111 50%,#fff 50%), linear-gradient(#111 50%,#fff 50%)',
                        backgroundSize: '14px 14px',
                        border: '2px solid #111',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {expandedPlayback && expandedChannel && expandedItem && typeof document !== 'undefined' && createPortal(
        <div
          ref={expandedRootRef}
          className="fixed top-0 left-0 z-[9999] bg-black"
          style={expandedOverlayStyle}
        >
          <button
            type="button"
            onClick={closeExpanded}
            className="absolute top-4 left-4 z-50 w-11 h-11 rounded-full bg-black/60 border border-white/25 grid place-items-center"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => changeExpandedChannel(-1)}
              className="w-10 h-10 rounded-full border border-white/25 bg-black/50"
              aria-label="Canal acima"
            >
              {'^'}
            </button>
            <button
              type="button"
              onClick={() => changeExpandedChannel(1)}
              className="w-10 h-10 rounded-full border border-white/25 bg-black/50"
              aria-label="Canal abaixo"
            >
              {'v'}
            </button>
          </div>

          <div className="w-full h-full relative">
            {expandedItem.type === ContentType.AD ? (
              <AdPlaceholder
                duration={Math.max(0, expandedItem.duration - expandedPlayback.playback.offset)}
                onEnded={closeExpanded}
              />
            ) : (
              <>
                {(expandedChannel.kind === ChannelKind.YOUTUBE || expandedChannel.kind === ChannelKind.YOUTUBE_LINEAR) ? (
                  <YouTubePlayer
                    key={`mob-expanded-${expandedChannel.channel_id}-${expandedPlayback.playback.index}`}
                    url={expandedItem.url!}
                    offset={expandedPlayback.playback.offset}
                    duration={expandedItem.duration}
                    onEnded={handleExpandedPlaybackEnded}
                  />
                ) : (
                  <HLSPlayer
                    key={`mob-expanded-${expandedChannel.channel_id}-${expandedPlayback.playback.index}`}
                    url={expandedItem.url!}
                    offset={expandedPlayback.playback.offset}
                    onEnded={handleExpandedPlaybackEnded}
                  />
                )}
              </>
            )}

            <BannerSticker banner={activeBannerAd} isVisible={isBannerAdVisible} />
            <div className={['pointer-events-none absolute inset-0 transition-opacity duration-300', isExpandedInfoVisible ? 'opacity-100' : 'opacity-0'].join(' ')}>
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-4">
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/45 px-3 py-2">
                  <span className="rounded-full bg-[#2d4df7] px-2.5 py-1 text-sm font-black">{formatChannelNumber(expandedChannel, expandedPlayback.channelIndex)}</span>
                  <span className="text-base font-extrabold">{expandedChannel.name}</span>
                </div>
              </div>
              <div className="absolute left-0 right-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4">
                <div className="max-w-[82%] rounded-xl border border-white/20 bg-black/45 px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-widest text-sky-300">Agora</div>
                  <div className="text-sm font-bold truncate">{getItemLabel(expandedItem)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AppMobile;



