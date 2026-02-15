
import React, { useEffect, useRef } from 'react';

interface YouTubePlayerProps {
  url: string;
  offset: number;
  duration: number; // Agora precisamos da duração para o controle linear
  onEnded: () => void;
  muted?: boolean;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ url, offset, duration, onEnded, muted = false }) => {
  const timerRef = useRef<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const getVideoId = (url: string) => {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getVideoId(url);
  
  // URL de EMBED conforme a regra de ouro
  // autoplay=1, playsinline=1, controls=0 (para look de TV), start=offset
  const origin =
    (typeof window !== 'undefined' && window.location?.origin)
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : '';

  const embedUrl = videoId 
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&start=${Math.floor(offset)}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1${origin}`
    : '';

  useEffect(() => {
    // Cálculo do tempo restante para este bloco da programação
    const remainingTime = (duration - offset) * 1000;

    if (remainingTime > 0) {
      timerRef.current = window.setTimeout(() => {
        onEnded();
      }, remainingTime);
    }

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [url, offset, duration, onEnded]);

  useEffect(() => {
    if (!videoId) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    // Mute/unmute without reloading the iframe (YouTube IFrame API command channel).
    const cmd = muted ? 'mute' : 'unMute';
    const msg = JSON.stringify({ event: 'command', func: cmd, args: [] });

    try { win.postMessage(msg, '*'); } catch {}
    const t1 = window.setTimeout(() => { try { win.postMessage(msg, '*'); } catch {} }, 250);
    const t2 = window.setTimeout(() => { try { win.postMessage(msg, '*'); } catch {} }, 1000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [muted, videoId]);

  if (!videoId) return null;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full flex items-center justify-center scale-110">
        <iframe
          ref={iframeRef}
          width="100%"
          height="100%"
          src={embedUrl}
          frameBorder="0"
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full"
          title="YouTube Video"
        ></iframe>
      </div>
    </div>
  );
};

export default YouTubePlayer;
