import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Hls: any;
  }
}

interface HLSPlayerProps {
  url: string;
  offset: number;
  onEnded: () => void;
  muted?: boolean;
}

const HLS_MANIFEST_TIMEOUT_MS = 4000;

const buildHlsUrlCandidates = (rawUrl: string): string[] => {
  const normalized = String(rawUrl || '').trim();
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);

  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, '');
    const addPath = (nextPath: string) => {
      const cleanPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
      candidates.add(`${parsed.origin}${cleanPath}`);
    };

    const hlsMatch = path.match(/^\/hls\/([^/]+)\/([^/]+)\/index\.m3u8$/i);
    if (hlsMatch) {
      const [, app, stream] = hlsMatch;
      addPath(`/live/${stream}.m3u8`);
      addPath(`/live/${stream}/index.m3u8`);
      addPath(`/${stream}.m3u8`);
      addPath(`/${stream}/index.m3u8`);
      addPath(`/${app}/${stream}.m3u8`);
      addPath(`/${app}/${stream}/index.m3u8`);
      addPath(`/hls/${stream}.m3u8`);
      addPath(`/hls/${stream}/index.m3u8`);
    }

    const indexMatch = path.match(/^\/([^/]+)\/index\.m3u8$/i);
    if (indexMatch) {
      const [, stream] = indexMatch;
      addPath(`/${stream}.m3u8`);
      addPath(`/live/${stream}.m3u8`);
      addPath(`/live/${stream}/index.m3u8`);
    }

    const flatMatch = path.match(/^\/([^/]+)\.m3u8$/i);
    if (flatMatch) {
      const [, stream] = flatMatch;
      addPath(`/${stream}/index.m3u8`);
      addPath(`/live/${stream}.m3u8`);
      addPath(`/live/${stream}/index.m3u8`);
    }
  } catch {
    // Ignore malformed fallback candidates and keep the original URL.
  }

  return Array.from(candidates);
};

const isLikelyHlsManifest = (contentType: string | null, body: string) => {
  const ct = String(contentType || '').toLowerCase();
  const text = String(body || '').trimStart();

  if (text.startsWith('#EXTM3U')) return true;
  if (ct.includes('application/vnd.apple.mpegurl') || ct.includes('application/x-mpegurl') || ct.includes('audio/mpegurl')) {
    return true;
  }

  return false;
};

const extractManifestCodecs = (body: string) => {
  const codecs = new Set<string>();
  const matches = body.matchAll(/CODECS="([^"]+)"/gi);
  for (const match of matches) {
    const raw = String(match[1] || '').trim();
    if (!raw) continue;
    for (const codec of raw.split(',')) {
      const normalized = codec.trim().toLowerCase();
      if (normalized) codecs.add(normalized);
    }
  }
  return Array.from(codecs);
};

const isHevcManifest = (body: string) =>
  extractManifestCodecs(body).some(codec => codec.includes('hvc1') || codec.includes('hev1'));

const resolvePlayableHls = async (rawUrl: string) => {
  const candidates = buildHlsUrlCandidates(rawUrl);

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), HLS_MANIFEST_TIMEOUT_MS);

    try {
      const response = await fetch(candidate, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const body = await response.text();
      if (!isLikelyHlsManifest(response.headers.get('content-type'), body)) continue;

      return {
        url: candidate,
        manifestBody: body,
        codecs: extractManifestCodecs(body),
        isHevc: isHevcManifest(body),
      };
    } catch {
      // Try the next candidate.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw new Error(`No valid HLS manifest found for ${rawUrl}`);
};

const HLSPlayer: React.FC<HLSPlayerProps> = ({ url, offset, onEnded, muted = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const onEndedRef = useRef(onEnded);
  const lastAppliedOffsetRef = useRef<number>(Number.NaN);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let retryTimer: number | null = null;

    const applyOffsetBestEffort = () => {
      if (disposed) return;
      if (!Number.isFinite(offset) || offset <= 0) return;

      try {
        const last = lastAppliedOffsetRef.current;
        if (Number.isFinite(last) && Math.abs(last - offset) < 0.5) return;
        lastAppliedOffsetRef.current = offset;

        if (video.readyState >= 1) {
          if (!Number.isFinite(video.duration) || offset < video.duration) {
            if (Math.abs(video.currentTime - offset) > 1.5) {
              video.currentTime = offset;
            }
          }
        }
      } catch {
        // ignore
      }
    };

    const onLoadedMetadata = () => applyOffsetBestEffort();

    const initHls = async () => {
      if (disposed) return;

      if (!window.Hls) {
        // Fallback se o script ainda nao carregou via HTML
        retryTimer = window.setTimeout(initHls, 200);
        return;
      }

      let resolvedHls: Awaited<ReturnType<typeof resolvePlayableHls>>;
      try {
        resolvedHls = await resolvePlayableHls(url);
      } catch (e) {
        console.error('HLS manifest validation failed', { url, error: e });
        onEndedRef.current?.();
        return;
      }

      const playableUrl = resolvedHls.url;
      const shouldPreferNative = resolvedHls.isHevc && !!video.canPlayType('application/vnd.apple.mpegurl');

      if (shouldPreferNative) {
        video.src = playableUrl;
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener(
          'loadedmetadata',
          () => video.play().catch(e => console.error('Native HLS Playback failed', e)),
          { once: true }
        );
      } else if (window.Hls.isSupported()) {
        const hls = new window.Hls({
          // Apply the initial offset only when (re)loading a URL. Further updates use seeking.
          startPosition: Number.isFinite(offset) ? offset : -1,
          capLevelToPlayerSize: true,
        });

        hlsRef.current = hls;
        hls.loadSource(playableUrl);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          applyOffsetBestEffort();
          video.play().catch(e => console.error('HLS Playback failed', e));
        });

        hls.on(window.Hls.Events.ERROR, (_: any, data: any) => {
          if (!data?.fatal) return;
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              onEndedRef.current?.();
              break;
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playableUrl;
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener(
          'loadedmetadata',
          () => video.play().catch(e => console.error('Native HLS Playback failed', e)),
          { once: true }
        );
      } else if (resolvedHls.isHevc) {
        console.error('HEVC HLS requires native browser support', {
          url: playableUrl,
          codecs: resolvedHls.codecs,
        });
        onEndedRef.current?.();
      }
    };

    initHls();

    return () => {
      disposed = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      try {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      } catch {
        // ignore
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!Number.isFinite(offset) || offset <= 0) return;

    // Best-effort seek without recreating HLS.
    try {
      const last = lastAppliedOffsetRef.current;
      if (Number.isFinite(last) && Math.abs(last - offset) < 0.5) return;
      lastAppliedOffsetRef.current = offset;

      if (video.readyState >= 1) {
        if (!Number.isFinite(video.duration) || offset < video.duration) {
          if (Math.abs(video.currentTime - offset) > 1.5) {
            video.currentTime = offset;
          }
        }
      }
    } catch {
      // ignore
    }
  }, [offset]);

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onEnded={onEnded}
        muted={muted}
        playsInline
      />
    </div>
  );
};

export default HLSPlayer;
