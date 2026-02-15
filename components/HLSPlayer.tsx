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

    const initHls = () => {
      if (disposed) return;

      if (!window.Hls) {
        // Fallback se o script ainda nao carregou via HTML
        retryTimer = window.setTimeout(initHls, 200);
        return;
      }

      if (window.Hls.isSupported()) {
        const hls = new window.Hls({
          // Apply the initial offset only when (re)loading a URL. Further updates use seeking.
          startPosition: Number.isFinite(offset) ? offset : -1,
          capLevelToPlayerSize: true,
        });

        hlsRef.current = hls;
        hls.loadSource(url);
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
        video.src = url;
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener(
          'loadedmetadata',
          () => video.play().catch(e => console.error('Native HLS Playback failed', e)),
          { once: true }
        );
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
