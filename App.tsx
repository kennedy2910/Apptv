
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, ChannelKind, ContentType, Channel, PlaylistItem, ContentType as CT, ChannelKind as CK } from './types';
import { MOCK_CHANNELS, OVERLAY_TIMEOUT, DEFAULT_EDGE_BASE_URL } from './constants';
import { Gamepad2 } from 'lucide-react';
import YouTubePlayer from './components/YouTubePlayer';
import HLSPlayer from './components/HLSPlayer';
import AdPlaceholder from './components/AdPlaceholder';
import Overlay from './components/Overlay';
import RetroHub from './components/RetroHub';

const normalizeIconKey = (s: string) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

// Vite: eager-load icon asset URLs from ./icones.
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

const ICON_ALIASES: Record<string, string> = {
  // If channel naming differs slightly from file naming, add aliases here.
  variados: 'variedades',
};

const resolveChannelIconUrl = (channelName: string): string | undefined => {
  const keyRaw = normalizeIconKey(channelName);
  const key = ICON_ALIASES[keyRaw] || keyRaw;
  if (ICON_URL_BY_KEY[key]) return ICON_URL_BY_KEY[key];

  // Small fuzzy fallback: containment match (helps with suffix/prefix differences).
  const k = Object.keys(ICON_URL_BY_KEY).find(x => x.includes(key) || key.includes(x));
  return k ? ICON_URL_BY_KEY[k] : undefined;
};

type CategoryId =
  | 'esportes'
  | 'musicas'
  | 'kids'
  | 'documentarios'
  | 'filmes'
  | 'religiosos'
  | 'games'
  | 'lives'
  | 'noticias';

const CATEGORIES: Array<{ id: CategoryId; label: string }> = [
  { id: 'esportes', label: 'esportes' },
  { id: 'musicas', label: 'musicas' },
  { id: 'kids', label: 'kids' },
  { id: 'documentarios', label: 'Documentarios' },
  { id: 'filmes', label: 'filmes' },
  { id: 'religiosos', label: 'religiosos' },
  { id: 'games', label: 'games' },
  { id: 'lives', label: 'Lives' },
  { id: 'noticias', label: 'Noticias' },
];

const CHANNEL_CATEGORY_OVERRIDES: Record<string, CategoryId> = {
  esportv: 'esportes',
  nexflix: 'filmes',
  cinenex: 'filmes',
  nexomovies: 'filmes',
  cineflux: 'filmes',
  cinex: 'filmes',
  nexcine: 'filmes',
  variedades: 'lives',
  telanova: 'noticias',
};

const guessCategoryFromName = (name: string): CategoryId => {
  const k = normalizeIconKey(name);
  if (/sport|esport|fut|nba|ufc/.test(k)) return 'esportes';
  if (/music|musica|song|hits|mtv/.test(k)) return 'musicas';
  if (/kids|infantil|cartoon|desenho/.test(k)) return 'kids';
  if (/doc|document/.test(k)) return 'documentarios';
  if (/film|movie|cine|flix|series|tv/.test(k)) return 'filmes';
  if (/relig|gospel|igreja|jesus|fe/.test(k)) return 'religiosos';
  if (/game|retro|arcade|ps|xbox|nintendo/.test(k)) return 'games';
  if (/live|lives|ao vivo|stream/.test(k)) return 'lives';
  if (/news|notic|jornal|tvnews/.test(k)) return 'noticias';
  return 'filmes';
};

const getChannelCategory = (ch: Channel): CategoryId => {
  const key = normalizeIconKey(ch.name);
  return CHANNEL_CATEGORY_OVERRIDES[key] || guessCategoryFromName(ch.name);
};

const getVisibleChannelIndices = (channels: Channel[], category: CategoryId): number[] => {
  const idxs = channels
    .map((ch, i) => ({ ch, i }))
    .filter(x => getChannelCategory(x.ch) === category)
    .map(x => x.i);
  return idxs.length ? idxs : channels.map((_, i) => i);
};

const TOP_APPS: Array<{ id: string; label: string; href: string; kind: 'pill' | 'brand' }> = [
  { id: 'spotify', label: 'Spotify', href: 'https://open.spotify.com/', kind: 'pill' },
  { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com/', kind: 'brand' },
  { id: 'prime', label: 'prime video', href: 'https://www.primevideo.com/', kind: 'brand' },
  { id: 'netflix', label: 'NETFLIX', href: 'https://www.netflix.com/', kind: 'brand' },
];

const App: React.FC = () => {
  const DEBUG = Boolean((import.meta as any).env?.DEV);

  const [state, setState] = useState<AppState>({
    currentChannelIndex: 0,
    channels: MOCK_CHANNELS,
    isLoading: true,
    isOverlayVisible: true,
    isInteracted: false,
  });

  const [isZapping, setIsZapping] = useState(false);
  const overlayTimerRef = useRef<number | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const channelRailRef = useRef<HTMLDivElement | null>(null);
  const frozenOffsetRef = useRef<{ key: string; offset: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('esportes');
  const [isRetroOpen, setIsRetroOpen] = useState(false);
  const [ytTitleByUrl, setYtTitleByUrl] = useState<Record<string, string>>({});
  const [edgeBaseUrl, setEdgeBaseUrl] = useState<string>(
    (import.meta as any).env?.VITE_EDGE_BASE_URL || DEFAULT_EDGE_BASE_URL
  );
  const [edgeResolvedName, setEdgeResolvedName] = useState<string>('');
  const EDGE_BASE_URL = edgeBaseUrl;

  // -------------------------
  // Load channels from EDGE
  // -------------------------
  const RESOLVE_URL = (import.meta as any).env?.VITE_RESOLVE_URL as string | undefined;

  const normalizeBaseUrl = (u: string) => String(u || '').trim().replace(/\/+$/, '');

  const isLocalhostUrl = (u: string) => {
    try {
      const h = new URL(u).hostname;
      return h === 'localhost' || h === '127.0.0.1';
    } catch {
      return false;
    }
  };

  const resolveEdgeBaseUrl = useCallback(async () => {
    if (!RESOLVE_URL) return;

    const cacheKey = 'nex_resolve_cache_v1';
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.base_url && parsed?.expires_at && Date.now() < Number(parsed.expires_at)) {
          setEdgeResolvedName(String(parsed.edge_name || parsed.edge_id || ''));
          setEdgeBaseUrl(normalizeBaseUrl(String(parsed.base_url)));
          if (DEBUG) {
            console.info('[resolve] cache hit', {
              base_url: parsed.base_url,
              edge_name: parsed.edge_name || parsed.edge_id || '',
              expires_at: parsed.expires_at,
            });
          }
          return;
        }
      }
    } catch {
      // ignore cache
    }

    const controller = new AbortController();
    const t = window.setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(RESOLVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(`resolve HTTP ${r.status}`);
      const data: any = await r.json();

      const base = normalizeBaseUrl(String(data?.base_url || data?.baseUrl || ''));
      const fallbacks = Array.isArray(data?.fallback_edges) ? data.fallback_edges : [];
      const fallbackBase = fallbacks
        .map((x: any) => normalizeBaseUrl(String(x?.base_url || x?.baseUrl || '')))
        .find((x: string) => x && !isLocalhostUrl(x));

      // Avoid "localhost" answers when the client isn't on localhost.
      const chosen =
        (base && (!isLocalhostUrl(base) || window.location.hostname === 'localhost')) ? base :
        (fallbackBase || base);

      if (!chosen) return;

      setEdgeResolvedName(String(data?.edge_name || data?.edge_id || ''));
      setEdgeBaseUrl(chosen);
      if (DEBUG) {
        console.info('[resolve] ok', {
          edge_id: data?.edge_id,
          edge_name: data?.edge_name,
          base_url: data?.base_url,
          chosen,
          ttl: data?.ttl,
        });
      }

      const ttlSec = Number(data?.ttl || 300);
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          base_url: chosen,
          edge_name: data?.edge_name || data?.edge_id || '',
          expires_at: Date.now() + Math.max(30, ttlSec) * 1000,
        }));
      } catch {
        // ignore
      }
    } finally {
      window.clearTimeout(t);
    }
  }, [RESOLVE_URL]);

  const toChannelFromEdge = (it: any): Channel | null => {
    const channelId = String(it.channel_id || it.channel_number || it.id || '').trim();
    if (!channelId) return null;

    const name = String(it.name || channelId).trim();
    const kindRaw = String(it.kind || '').toLowerCase();
    const kind: CK = (kindRaw === CK.HLS || kindRaw === CK.YOUTUBE || kindRaw === CK.YOUTUBE_LINEAR)
      ? (kindRaw as CK)
      : (it.source_url && String(it.source_url).includes('youtube') ? CK.YOUTUBE_LINEAR : CK.HLS);

    // schedule_start: prefer explicit, else fallback to a stable past date to keep "linear" behavior.
    const scheduleStart = String(it.schedule_start || it.scheduleStart || it.schedule?.start || "2024-01-01T00:00:00Z");

    // items: prefer full playlist from EDGE (expected for youtube_linear). If missing, fallback to single item.
    const rawItems = it.items;
    let items: PlaylistItem[] = [];

    if (Array.isArray(rawItems) && rawItems.length > 0) {
      items = rawItems
        .map((x: any) => {
          const t = String(x.type || '').toLowerCase();
          const type = (t === CT.AD) ? CT.AD : CT.VIDEO;
          const duration = Number(x.duration);
          const url = x.url ? String(x.url) : undefined;
          if (!Number.isFinite(duration) || duration <= 0) return null;
          if (type === CT.VIDEO && !url) return null;
          return { type, url, duration } as PlaylistItem;
        })
        .filter(Boolean) as PlaylistItem[];
    }

    if (items.length === 0) {
      const url = String(it.playback_url || it.playbackUrl || it.source_url || it.url || '').trim();
      if (!url) return null;
      // Fallback duration: 1 hour blocks (keeps the "linear" feel but repeats). Replace by real durations from EDGE for true linear.
      items = [{ type: CT.VIDEO, url, duration: 3600 }];
    }

    return {
      channel_id: channelId,
      name,
      kind,
      schedule_start: scheduleStart,
      items,
      loop: it.loop !== undefined ? Boolean(it.loop) : true,
    };
  };

  const loadChannelsFromEdge = useCallback(async () => {
    try {
      setState(s => ({ ...s, isLoading: true }));

      // Preferred endpoint: /playlist.json (can carry schedule + items)
      const urlsToTry = [
        `${edgeBaseUrl.replace(/\/$/, '')}/playlist.json`,
        `${edgeBaseUrl.replace(/\/$/, '')}/channels`,
      ];

      let payload: any = null;
      let lastErr: any = null;

      for (const u of urlsToTry) {
        try {
          const r = await fetch(u, { cache: 'no-store' });
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          payload = await r.json();
          if (DEBUG) console.info('[edge] ok', { url: u });
          break;
        } catch (e) {
          lastErr = e;
          if (DEBUG) console.info('[edge] fail', { url: u, error: String((e as any)?.message || e) });
        }
      }

      if (!payload) throw lastErr || new Error('Failed to load');

      // Normalize: payload can be {items:[...]} or direct array
      const rawList = Array.isArray(payload) ? payload : (payload.items || payload.channels || []);
      const channels = (rawList as any[])
        .map(toChannelFromEdge)
        .filter(Boolean) as Channel[];

      if (channels.length === 0) {
        throw new Error('EDGE playlist returned 0 channels. Ensure EDGE exposes items/schedule for linear playback.');
      }

      setState(s => ({
        ...s,
        channels,
        currentChannelIndex: 0,
        isLoading: false,
      }));
    } catch (e) {
      console.error('[LinearTV] Failed to load channels from EDGE. Falling back to MOCK_CHANNELS.', e);
      setState(s => ({ ...s, channels: MOCK_CHANNELS, isLoading: false }));
    }
  }, [edgeBaseUrl]);

  useEffect(() => {
    // Resolve edge first (best-effort), then load channels.
    // If resolve fails, we keep the configured base.
    (async () => {
      try { await resolveEdgeBaseUrl(); } catch {}
      await loadChannelsFromEdge();
    })();
  }, [loadChannelsFromEdge, resolveEdgeBaseUrl]);

  // FunÃ§Ã£o auxiliar para calcular o estado atual da transmissÃ£o baseada no tempo real
  const getLivePlaybackState = (channel: Channel) => {
    const startTime = new Date(channel.schedule_start).getTime();
    const now = Date.now();
    let elapsed = (now - startTime) / 1000;

    const totalDuration = channel.items.reduce((acc, item) => acc + item.duration, 0);

    if (elapsed < 0) {
      return { item: channel.items[0], offset: 0, index: 0 };
    }

    if (channel.loop) {
      elapsed = elapsed % totalDuration;
    } else if (elapsed >= totalDuration) {
      return null; // ProgramaÃ§Ã£o encerrada
    }

    let currentSum = 0;
    for (let i = 0; i < channel.items.length; i++) {
      const item = channel.items[i];
      if (currentSum + item.duration > elapsed) {
        return { 
          item, 
          offset: elapsed - currentSum,
          index: i
        };
      }
      currentSum += item.duration;
    }
    return null;
  };

  const isYouTubeUrl = (u: string) => /youtube\.com|youtu\.be/.test(u);

  const extractYouTubeId = (u: string) => {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = u.match(regExp);
    return (match && match[2] && match[2].length === 11) ? match[2] : null;
  };

  const formatHm = (ms: number) =>
    new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const getScheduleSlots = (channel: Channel, limit = 4) => {
    if (!channel.items || channel.items.length === 0) return [];

    const startTime = new Date(channel.schedule_start).getTime();
    const now = Date.now();
    let elapsed = (now - startTime) / 1000;

    const totalDuration = channel.items.reduce((acc, item) => acc + item.duration, 0);
    if (!Number.isFinite(totalDuration) || totalDuration <= 0) return [];

    if (elapsed < 0) elapsed = 0;
    if (channel.loop) elapsed = elapsed % totalDuration;
    if (!channel.loop && elapsed >= totalDuration) return [];

    let currentSum = 0;
    let idx = 0;
    let offset = 0;
    for (let i = 0; i < channel.items.length; i++) {
      const item = channel.items[i];
      if (currentSum + item.duration > elapsed) {
        idx = i;
        offset = elapsed - currentSum;
        break;
      }
      currentSum += item.duration;
    }

    const startOfCurrentMs = now - Math.floor(offset * 1000);
    const slots: { time: string; item: PlaylistItem }[] = [];
    let accMs = 0;
    for (let k = 0; k < Math.min(limit, channel.items.length); k++) {
      const it = channel.items[(idx + k) % channel.items.length];
      slots.push({ time: formatHm(startOfCurrentMs + accMs), item: it });
      accMs += Math.max(0, it.duration) * 1000;
    }
    return slots;
  };

  const getItemLabel = (it: PlaylistItem) => {
    if (it.type === ContentType.AD) return 'Intervalo comercial';
    const u = it.url || '';
    if (!u) return 'Conteudo';
    if (isYouTubeUrl(u)) {
      return ytTitleByUrl[u] || (`Video ${extractYouTubeId(u) || 'YouTube'}`);
    }
    try {
      const host = new URL(u).hostname.replace(/^www\./, '');
      return `Stream (${host})`;
    } catch {
      return 'Stream';
    }
  };

  useEffect(() => {
    // Best-effort: fetch YouTube titles for the current channel programming.
    const ch = state.channels[state.currentChannelIndex];
    if (!ch || !ch.items) return;

    const urls = Array.from(
      new Set(
        ch.items
          .filter(x => x.type === ContentType.VIDEO && x.url && isYouTubeUrl(x.url))
          .map(x => x.url as string)
      )
    ).slice(0, 10);

    const controller = new AbortController();

    (async () => {
      for (const url of urls) {
        if (ytTitleByUrl[url]) continue;
        try {
          const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const r = await fetch(oembed, { signal: controller.signal });
          if (!r.ok) continue;
          const data: any = await r.json();
          const title = typeof data?.title === 'string' ? data.title : '';
          if (!title) continue;
          setYtTitleByUrl(prev => (prev[url] ? prev : { ...prev, [url]: title }));
        } catch {
          // ignore
        }
      }
    })();

    return () => controller.abort();
  }, [state.currentChannelIndex, state.channels, ytTitleByUrl]);

  const resetOverlayTimer = useCallback(() => {
    setState(s => ({ ...s, isOverlayVisible: true }));
    if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = window.setTimeout(() => {
      setState(s => ({ ...s, isOverlayVisible: false }));
    }, OVERLAY_TIMEOUT);
  }, []);

  const changeChannel = useCallback((direction: 'up' | 'down') => {
    if (isZapping) return;

    setIsZapping(true);
    resetOverlayTimer();

    setTimeout(() => {
      setState(prev => {
        const visible = getVisibleChannelIndices(prev.channels, selectedCategory);
        const curPos = Math.max(0, visible.indexOf(prev.currentChannelIndex));
        let nextPos = direction === 'up' ? curPos - 1 : curPos + 1;
        if (nextPos < 0) nextPos = visible.length - 1;
        if (nextPos >= visible.length) nextPos = 0;
        return { ...prev, currentChannelIndex: visible[nextPos] };
      });

      setTimeout(() => {
        setIsZapping(false);
      }, 150);
    }, 300);
  }, [isZapping, resetOverlayTimer, selectedCategory]);

  const scrollChannelRail = useCallback((dir: -1 | 1) => {
    const el = channelRailRef.current;
    if (!el) return;

    // Best-effort: scroll by ~3 cards.
    const firstCard = el.querySelector<HTMLElement>('[data-channel-card="1"]');
    const cardW = firstCard?.getBoundingClientRect().width || 224; // w-56
    const gap = 12; // gap-3
    const delta = dir * (cardW + gap) * 3;

    el.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const el = channelRailRef.current;
    if (!el) return;

    const selected = el.querySelector<HTMLElement>(`[data-channel-idx="${state.currentChannelIndex}"]`);
    selected?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [state.currentChannelIndex, state.channels.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!state.isInteracted) return;
      if (isRetroOpen) return; // Let RetroHub/emulator own the remote while open.

      const code = (e as any).keyCode as number | undefined;
      const isOk =
        e.key === 'Enter' ||
        e.key === 'OK' ||
        code === 13 || // Enter
        code === 23 || // Android DPAD_CENTER
        code === 66;   // Android ENTER

      if (isOk) {
        // Only functional change requested: fullscreen on OK/Enter.
        resetOverlayTimer();
        if (!document.fullscreenElement) {
          const el = playerShellRef.current as any;
          const fn = el?.requestFullscreen || el?.webkitRequestFullscreen || el?.msRequestFullscreen;
          if (fn) fn.call(el);
        }
        return;
      }

      switch(e.key) {
        case 'ArrowLeft':
          if (!isFullscreen) {
            e.preventDefault();
            resetOverlayTimer();
            scrollChannelRail(-1);
          }
          break;
        case 'ArrowRight':
          if (!isFullscreen) {
            e.preventDefault();
            resetOverlayTimer();
            scrollChannelRail(1);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeChannel('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeChannel('down');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [changeChannel, isFullscreen, isRetroOpen, resetOverlayTimer, scrollChannelRail, state.isInteracted]);

  useEffect(() => {
    if (state.isInteracted) {
        resetOverlayTimer();
    }
  }, [state.isInteracted, resetOverlayTimer]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean((document as any).fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    onFs();
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  if (state.isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black p-10 text-center">
        <p className="text-slate-300 text-lg">Carregando canais do EDGEâ€¦</p>
        <p className="text-slate-500 text-sm mt-2">Base: {EDGE_BASE_URL}{edgeResolvedName ? ` (${edgeResolvedName})` : ''}</p>
      </div>
    );
  }

  if (!state.isInteracted) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black p-10 text-center">
        <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/20">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </div>
        <h1 className="text-4xl font-bold mb-4">LinearTV Pro</h1>
        <p className="text-slate-400 text-lg mb-10 max-w-md">TelevisÃ£o linear moderna com troca de fontes transparente e programaÃ§Ã£o 24/7.</p>
        <button 
          onClick={() => setState(s => ({...s, isInteracted: true}))}
          className="bg-blue-600 hover:bg-blue-500 text-white px-12 py-4 rounded-xl text-xl font-bold transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-blue-600/30"
          autoFocus
          disabled={state.isLoading}
        >
          {state.isLoading ? 'Carregando canaisâ€¦' : 'Iniciar TransmissÃ£o'}
        </button>
        <p className="mt-6 text-slate-500 text-sm">
          Fonte: <span className="text-slate-300">{EDGE_BASE_URL}{edgeResolvedName ? ` (${edgeResolvedName})` : ''}</span>
        </p>
      </div>
    );
  }

  if (state.isLoading) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-center p-10">
        <p className="text-xl text-slate-300 font-semibold">Carregando canais do EDGEâ€¦</p>
        <p className="mt-3 text-slate-500">{EDGE_BASE_URL}{edgeResolvedName ? ` (${edgeResolvedName})` : ''}</p>
      </div>
    );
  }

  const currentChannel = state.channels[state.currentChannelIndex];
  const playback = getLivePlaybackState(currentChannel);
  const visibleChannelIndices = getVisibleChannelIndices(state.channels, selectedCategory);
  const visibleChannelPos = Math.max(0, visibleChannelIndices.indexOf(state.currentChannelIndex));

  if (!playback) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <p className="text-xl text-slate-500 font-medium">ProgramaÃ§Ã£o Encerrada</p>
      </div>
    );
  }

  const currentContent = playback.item;
  const actualOffset = playback.offset;
  const nextItem = currentChannel.items[(playback.index + 1) % currentChannel.items.length];

  // IMPORTANT: `actualOffset` is computed from wall-clock time. Any unrelated re-render (overlay hide/show,
  // fullscreen toggle, etc.) changes `actualOffset`, which was causing the player components to re-init and
  // "reload" the stream. Freeze the start offset per content instance (channel + url + index) so UI changes
  // don't restart playback.
  const playbackKey = `${currentChannel.channel_id}-${currentContent.url}-${playback.index}`;
  if (!frozenOffsetRef.current || frozenOffsetRef.current.key !== playbackKey) {
    frozenOffsetRef.current = { key: playbackKey, offset: actualOffset };
  }
  const frozenOffset = frozenOffsetRef.current.offset;

  // FunÃ§Ã£o para forÃ§ar o recÃ¡lculo quando um item termina
  const handleItemEnd = () => {
    // ForÃ§ar atualizaÃ§Ã£o do estado para disparar o prÃ³ximo vÃ­deo da grade
    setState(s => ({ ...s }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 via-slate-950 to-black" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[520px] rounded-full bg-sky-500/10 blur-3xl" />

      <header className="relative z-10 h-16 px-10 flex items-center justify-between border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="flex items-center gap-3 min-w-[260px]">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/90 grid place-items-center text-slate-950 font-black">N</div>
          <div className="font-extrabold tracking-tight">NEX TV</div>
        </div>
        <div className="hidden md:flex items-center gap-4 text-sm text-slate-300 min-w-0">
          <div className="flex items-center gap-3">
            {TOP_APPS.map(app => (
              <a
                key={app.id}
                href={app.href}
                target="_blank"
                rel="noreferrer"
                className={[
                  'select-none rounded-xl border border-white/10 hover:bg-white/10 transition-colors',
                  app.kind === 'pill' ? 'px-4 py-2 bg-black/30 font-semibold' : 'px-3 py-2 bg-black/40 font-extrabold tracking-tight',
                ].join(' ')}
              >
                <span
                  className={[
                    app.id === 'spotify' ? 'text-emerald-400' : '',
                    app.id === 'youtube' ? 'text-red-500' : '',
                    app.id === 'prime' ? 'text-sky-400' : '',
                    app.id === 'netflix' ? 'text-red-600' : '',
                  ].join(' ')}
                >
                  {app.label}
                </span>
              </a>
            ))}

            <button
              type="button"
              onClick={() => setIsRetroOpen(true)}
              className="select-none rounded-xl border border-white/10 bg-black/30 hover:bg-white/10 transition-colors px-3 py-2 flex items-center gap-2"
              aria-label="Abrir Retro Games"
              title="Retro Games"
            >
              <Gamepad2 className="w-4 h-4 text-fuchsia-300" />
              <span className="font-extrabold tracking-tight text-slate-100">Retro</span>
            </button>
          </div>
          <div className="flex items-center gap-8 pl-2">
            <span>Guia de canais</span>
            <span>On Demand</span>
          </div>
        </div>
        <div className="min-w-[260px] flex justify-end">
          <button
            className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
            onClick={resetOverlayTimer}
          >
            Assistir agora
          </button>
        </div>
      </header>

      <main className="relative z-10 px-10 py-6 grid grid-cols-[360px_1fr_320px] gap-6 items-start min-w-0">
        <section className="pt-6 min-w-0">
          <h1 className="text-3xl font-extrabold leading-tight">
            Bem-vindo a <span className="text-sky-400">NEX TV</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm leading-relaxed max-w-sm">
            Transmissao ao vivo de canais. Use as setas para cima/baixo para trocar de canal.
          </p>
          <div className="mt-5 text-xs text-slate-400">
            Enter/OK: fullscreen do player
          </div>

          <div className="mt-10">
            <div className="text-sm font-semibold text-slate-200 mb-3">Categorias</div>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    resetOverlayTimer();
                    setState(prev => {
                      const idx = prev.channels.findIndex(ch => getChannelCategory(ch) === cat.id);
                      return idx >= 0 ? { ...prev, currentChannelIndex: idx } : prev;
                    });
                  }}
                  className={[
                    'h-16 rounded-xl border text-sm font-bold tracking-tight transition-all',
                    selectedCategory === cat.id
                      ? 'border-sky-400/70 bg-sky-500/10 text-slate-50 ring-2 ring-sky-400/60'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
                  ].join(' ')}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-2 min-w-0">
          <div
            ref={playerShellRef}
            className="mx-auto w-full max-w-[920px] rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl"
          >
            <div className="relative w-full aspect-video">
              <div
                key={`${currentChannel.channel_id}-${currentContent.url}-${playback.index}`}
                className={`absolute inset-0 transition-all duration-500 ease-in-out transform ${
                  isZapping ? 'opacity-0 scale-[0.98] blur-sm' : 'opacity-100 scale-100 blur-0'
                }`}
              >
                {currentContent.type === ContentType.AD ? (
                  <AdPlaceholder duration={currentContent.duration - actualOffset} onEnded={handleItemEnd} />
                ) : (
                  <>
                    {(currentChannel.kind === ChannelKind.YOUTUBE || currentChannel.kind === ChannelKind.YOUTUBE_LINEAR) ? (
                      <YouTubePlayer
                        url={currentContent.url!}
                        offset={frozenOffset}
                        duration={currentContent.duration}
                        onEnded={handleItemEnd}
                        muted={isRetroOpen}
                      />
                    ) : (
                      <HLSPlayer
                        url={currentContent.url!}
                        offset={frozenOffset}
                        onEnded={handleItemEnd}
                        muted={isRetroOpen}
                      />
                    )}
                  </>
                )}
              </div>

              <Overlay
                channel={currentChannel}
                isVisible={state.isOverlayVisible}
                channelIndex={visibleChannelPos}
                totalChannels={visibleChannelIndices.length}
                nextItem={nextItem}
                variant={isFullscreen ? 'fullscreen' : 'card'}
              />
            </div>
          </div>

          <div className="mt-6 mx-auto w-full max-w-[920px] min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-200">Canais disponiveis</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollChannelRail(-1)}
                  className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-200"
                >
                  {'<'}
                </button>
                <button
                  type="button"
                  onClick={() => scrollChannelRail(1)}
                  className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-slate-200"
                >
                  {'>'}
                </button>
              </div>
            </div>
            <div className="relative min-w-0">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-950 via-slate-950/60 to-transparent" />
              <div
                ref={channelRailRef}
                className="flex flex-nowrap gap-3 overflow-x-auto overflow-y-hidden pb-2 px-2 snap-x snap-mandatory scroll-smooth overscroll-x-contain min-w-0"
              >
                {visibleChannelIndices.map((chIdx) => {
                  const ch = state.channels[chIdx];
                  const iconUrl = resolveChannelIconUrl(ch.name);
                  const fallbackLetter = String(ch.name || '?').trim().slice(0, 1).toUpperCase() || '?';

                  return (
                    <div
                      key={ch.channel_id}
                      data-channel-card="1"
                      data-channel-idx={chIdx}
                      className={[
                        'shrink-0 w-56 rounded-2xl border bg-white/5 border-white/10 overflow-hidden snap-start',
                        chIdx === state.currentChannelIndex ? 'ring-2 ring-sky-400/70' : '',
                      ].join(' ')}
                    >
                      <div className="h-28 bg-gradient-to-br from-white/10 to-white/0 relative">
                        <div className="absolute top-3 left-3 text-[11px] px-2 py-1 rounded-full border border-white/10 bg-black/30">
                          {ch.channel_id.padStart(2, '0')}
                        </div>
                        <div className="absolute inset-0">
                          {iconUrl ? (
                            <img
                              src={iconUrl}
                              alt={ch.name}
                              className="w-full h-full object-cover opacity-95"
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full grid place-items-center">
                              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 grid place-items-center text-xl font-black text-white/80">
                                {fallbackLetter}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-bold leading-tight truncate">{ch.name}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="pt-2 min-w-0">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold mb-3">Programacao</div>
            <div className="space-y-2 text-sm text-slate-300">
              {getScheduleSlots(currentChannel, 4).map((s, i) => (
                <div key={i} className="flex gap-3 items-center p-3 rounded-xl border border-white/10 bg-white/5">
                  <div className="text-sky-300 w-14 tabular-nums text-xs">{s.time}</div>
                  <div className="truncate">{getItemLabel(s.item)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-400">
              {currentChannel.kind === ChannelKind.YOUTUBE_LINEAR ? 'Baseado em schedule_start + duracoes.' : 'Canal ao vivo.'}
            </div>
          </div>

        </aside>
      </main>

      <RetroHub
        isOpen={isRetroOpen}
        onClose={() => setIsRetroOpen(false)}
      />
    </div>
  );
};

export default App;
