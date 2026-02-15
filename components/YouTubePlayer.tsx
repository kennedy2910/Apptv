
import React, { useEffect, useRef } from 'react';

interface YouTubePlayerProps {
  url: string;
  offset: number;
  duration: number; // Agora precisamos da duração para o controle linear
  onEnded: () => void;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({ url, offset, duration, onEnded }) => {
  const timerRef = useRef<number | null>(null);

  const getVideoId = (url: string) => {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getVideoId(url);
  
  // URL de EMBED conforme a regra de ouro
  // autoplay=1, playsinline=1, controls=0 (para look de TV), start=offset
  const embedUrl = videoId 
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&start=${Math.floor(offset)}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0`
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

  if (!videoId) return null;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden pointer-events-none">
      <div className="w-full h-full flex items-center justify-center scale-110">
        <iframe
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
