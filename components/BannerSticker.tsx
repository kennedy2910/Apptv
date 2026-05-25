import React, { useEffect, useMemo, useState } from 'react';
import { BannerAd } from '../types';

interface BannerStickerProps {
  banner: BannerAd | null;
  isVisible: boolean;
}

const BannerSticker: React.FC<BannerStickerProps> = ({ banner, isVisible }) => {
  if (!banner) return null;

  const href = String(banner.target_url || banner.url || '').trim();
  const imageUrl = String(banner.image_url || '').trim();
  const message = String(banner.message || '').trim();

  const toCentralMediaFallback = (rawUrl: string): string => {
    const normalized = String(rawUrl || '').trim();
    if (!normalized) return '';
    if (normalized.startsWith('/central-media')) return normalized;
    if (normalized.startsWith('/static/')) return `/central-media${normalized}`;

    try {
      const parsed = new URL(normalized, window.location.origin);
      if (parsed.pathname.startsWith('/static/banner-ads/') || parsed.pathname.startsWith('/static/channel-icons/') || parsed.port === '9000') {
        return `/central-media${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      return normalized;
    }

    return normalized;
  };

  const [resolvedImageUrl, setResolvedImageUrl] = useState(() => toCentralMediaFallback(imageUrl));

  useEffect(() => {
    setResolvedImageUrl(toCentralMediaFallback(imageUrl));
  }, [imageUrl]);

  const frameClassName = useMemo(() => ([
    'absolute right-[2px] top-[2px] z-[35] block w-[min(30vw,420px)] min-w-[180px] max-w-[78vw] aspect-[3/1] overflow-hidden bg-transparent shadow-[0_18px_44px_rgba(0,0,0,0.45)] transition-opacity duration-300',
    isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
  ].join(' ')), [isVisible]);

  const FrameTag = (href ? 'a' : 'div') as 'a' | 'div';
  const frameProps = href
    ? {
        href,
        target: '_blank',
        rel: 'noreferrer',
        'aria-label': message || 'Banner ADS',
      }
    : {};

  return (
    <FrameTag {...frameProps} className={frameClassName}>
      {resolvedImageUrl ? (
        <img
          key={resolvedImageUrl}
          src={resolvedImageUrl}
          alt={message || 'Banner ADS'}
          className="block h-full w-full object-cover object-center"
          draggable={false}
          onError={() => {
            const fallback = toCentralMediaFallback(imageUrl);
            if (fallback && fallback !== resolvedImageUrl) {
              setResolvedImageUrl(fallback);
            }
          }}
        />
      ) : null}
    </FrameTag>
  );
};

export default BannerSticker;
