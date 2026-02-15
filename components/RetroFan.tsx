import React, { useMemo } from 'react';

export type RetroFanItem = {
  title: string;
  coverUrl?: string;
  systemLabel?: string;
};

type RetroFanProps = {
  items: RetroFanItem[];
  activeIndex: number;
  onPickIndex?: (idx: number) => void;
  className?: string;
};

const clampIndex = (n: number, len: number) => {
  if (len <= 0) return 0;
  const x = n % len;
  return x < 0 ? x + len : x;
};

const RetroFan: React.FC<RetroFanProps> = ({ items, activeIndex, onPickIndex, className }) => {
  const len = items.length;
  const idx = clampIndex(activeIndex, len);

  const visibleCount = Math.min(11, len || 1);
  const half = Math.floor(visibleCount / 2);

  const slots = useMemo(() => {
    const out: Array<{ item: RetroFanItem; idx: number; offset: number }> = [];
    for (let o = -half; o <= half; o++) {
      const i = clampIndex(idx + o, len);
      out.push({ item: items[i] || { title: '' }, idx: i, offset: o });
    }
    return out;
  }, [half, idx, items, len]);

  const angleStep = 12;     // degrees between cards
  const radius = 440;       // arc radius in px
  const baseY = 510;        // pivot from top (inside container)

  return (
    <div className={className}>
      <div
        className="relative w-full h-full"
        style={{
          perspective: '1200px',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* arc glow */}
        <div
          className="absolute left-1/2"
          style={{
            top: baseY - radius,
            width: radius * 2,
            height: radius,
            transform: 'translateX(-50%)',
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
            border: '2px solid rgba(255,255,255,0.12)',
            borderBottom: 'none',
            boxShadow: '0 -20px 120px rgba(56,189,248,0.10)',
            pointerEvents: 'none',
          }}
        />

        {slots.map(s => {
          const a = s.offset * angleStep;
          const depth = Math.max(0, 1 - Math.min(1, Math.abs(s.offset) / (half + 0.0001)));
          const isActive = s.offset === 0;

          const scale = isActive ? 1.12 : 0.92 - Math.min(0.30, Math.abs(s.offset) * 0.06);
          const opacity = isActive ? 1 : 0.65 - Math.min(0.35, Math.abs(s.offset) * 0.06);
          const z = isActive ? 70 : Math.round(depth * 30);

          const cardW = 220;
          const cardH = 300;

          const transform = [
            `translate3d(-50%, -50%, 0px)`,
            `translate3d(0px, ${baseY}px, 0px)`,
            `rotate(${a}deg)`,
            `translate3d(0px, ${-radius}px, ${z}px)`,
            `rotate(${-a}deg)`,
            isActive ? `translate3d(0px, -18px, 0px)` : '',
            `scale(${scale})`,
          ].filter(Boolean).join(' ');

          return (
            <button
              key={`${s.idx}-${s.offset}`}
              type="button"
              onClick={() => onPickIndex?.(s.idx)}
              className="absolute left-1/2 top-0 text-left transition-transform duration-300 ease-out"
              style={{
                width: cardW,
                height: cardH,
                transform,
                opacity,
                zIndex: 1000 - Math.abs(s.offset),
              }}
            >
              <div
                className={[
                  'w-full h-full rounded-2xl overflow-hidden border',
                  isActive ? 'border-sky-300/70 shadow-2xl shadow-sky-500/20' : 'border-white/10 shadow-xl shadow-black/50',
                ].join(' ')}
              >
                {s.item.coverUrl ? (
                  <img
                    src={s.item.coverUrl}
                    alt={s.item.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-white/10 to-black grid place-items-center">
                    <div className="text-3xl font-black tracking-tight text-slate-200/70">
                      {s.item.systemLabel || 'ROM'}
                    </div>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/30 to-transparent">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="text-[11px] font-extrabold tracking-tight text-slate-100/90 leading-tight"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {s.item.title}
                    </div>
                    {s.item.systemLabel && (
                      <div className="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border border-white/10 bg-black/40 text-slate-200/80">
                        {s.item.systemLabel}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RetroFan;

