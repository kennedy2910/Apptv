import React, { useEffect, useMemo, useRef } from 'react';

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: any) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
    __ytIframeApiPromise?: Promise<void>;
  }
}

type YTPlayer = {
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
};

interface YouTubePlayerProps {
  url: string;
  offset: number;
  duration: number;
  onEnded: () => void;
  muted?: boolean;
}

const loadYouTubeIframeApi = () => {
  if (window.YT?.Player) return Promise.resolve();
  if (window.__ytIframeApiPromise) return window.__ytIframeApiPromise;

  window.__ytIframeApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yt-iframe-api="1"]');

    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };

    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.ytIframeApi = '1';
    script.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
    document.head.appendChild(script);
  });

  return window.__ytIframeApiPromise;
};

const getVideoId = (url: string) => {
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2]?.length === 11 ? match[2] : null;
};

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ url, offset, duration, onEnded, muted = false }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const onEndedRef = useRef(onEnded);
  const videoId = useMemo(() => getVideoId(url), [url]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!videoId || !hostRef.current) return;

    let disposed = false;

    const clearFallbackTimer = () => {
      if (!fallbackTimerRef.current) return;
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    };

    const scheduleFallbackEnd = () => {
      clearFallbackTimer();
      const remainingMs = Math.max(250, Math.round((duration - offset) * 1000));
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        onEndedRef.current?.();
      }, remainingMs);
    };

    void loadYouTubeIframeApi().then(() => {
      if (disposed || !hostRef.current || !window.YT?.Player) return;

      hostRef.current.innerHTML = '';
      const playerHost = document.createElement('div');
      playerHost.className = 'w-full h-full';
      hostRef.current.appendChild(playerHost);

      playerRef.current = new window.YT.Player(playerHost, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          start: Math.max(0, Math.floor(offset)),
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }: { target: YTPlayer }) => {
            if (disposed) return;
            if (muted) target.mute(); else target.unMute();
            if (offset > 0) target.seekTo(offset, true);
            target.playVideo();
            scheduleFallbackEnd();
          },
          onStateChange: (event: { data: number; target: YTPlayer }) => {
            if (disposed || !window.YT?.PlayerState) return;

            if (event.data === window.YT.PlayerState.PLAYING) {
              if (muted) event.target.mute(); else event.target.unMute();
            }

            if (event.data === window.YT.PlayerState.ENDED) {
              clearFallbackTimer();
              onEndedRef.current?.();
            }
          },
        },
      });
    }).catch(() => {
      if (!disposed) scheduleFallbackEnd();
    });

    return () => {
      disposed = true;
      clearFallbackTimer();
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore player cleanup failures
      }
      playerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [duration, muted, offset, videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (muted) player.mute(); else player.unMute();
    } catch {
      // ignore runtime mute failures
    }
  }, [muted]);

  if (!videoId) return null;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full flex items-center justify-center scale-110">
        <div ref={hostRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default YouTubePlayer;
