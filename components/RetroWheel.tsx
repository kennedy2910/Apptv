import React, { useMemo } from 'react';

type RetroWheelProps = {
  titles: string[];
  activeIndex: number;
  onPickIndex?: (idx: number) => void;
  className?: string;
};

const clampIndex = (n: number, len: number) => {
  if (len <= 0) return 0;
  const x = n % len;
  return x < 0 ? x + len : x;
};

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: r * Math.cos(a), y: r * Math.sin(a) };
};

const wedgePath = (r0: number, r1: number, a0: number, a1: number) => {
  const p0 = polar(r1, a0);
  const p1 = polar(r1, a1);
  const p2 = polar(r0, a1);
  const p3 = polar(r0, a0);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return [
    `M ${p0.x.toFixed(3)} ${p0.y.toFixed(3)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p1.x.toFixed(3)} ${p1.y.toFixed(3)}`,
    `L ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p3.x.toFixed(3)} ${p3.y.toFixed(3)}`,
    'Z',
  ].join(' ');
};

const RetroWheel: React.FC<RetroWheelProps> = ({ titles, activeIndex, onPickIndex, className }) => {
  const len = titles.length;
  const idx = clampIndex(activeIndex, len);
  // Render only a semicircle, so the wheel can feel like an "infinite" carousel.
  const segCount = Math.min(11, Math.max(1, len));
  const span = 180 / segCount;
  const innerR = 92;
  const outerR = 242;
  const centerSeg = Math.floor(segCount / 2);
  const fontSize = 10;
  const fontSizeActive = 11;
  const maxChars = 16;

  const items = useMemo(() => {
    const out: Array<{ title: string; idx: number; seg: number }> = [];
    for (let s = 0; s < segCount; s++) {
      // Center the active index at the top of the semicircle.
      const i = clampIndex(idx + (s - centerSeg), len);
      out.push({ title: titles[i] || '', idx: i, seg: s });
    }
    return out;
  }, [centerSeg, idx, len, segCount, titles]);

  return (
    <div className={className}>
      <svg viewBox="-270 -270 540 540" className="w-full h-full">
        <defs>
          <radialGradient id="rw_bg" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <circle r={outerR} fill="url(#rw_bg)" />

        {items.map(it => {
          // Semicircle: angles from -180 (left) to 0 (right), centered at -90 (top).
          const mid = -180 + (it.seg + 0.5) * span;
          const a0 = mid - span / 2;
          const a1 = mid + span / 2;
          const path = wedgePath(innerR, outerR, a0, a1);
          const isActive = it.idx === idx;

          // Push labels outward to increase arc-length available per segment.
          const labelR = innerR * 0.25 + outerR * 0.75;
          const lp = polar(labelR, mid);

          const label =
            it.title.length > maxChars ? `${it.title.slice(0, maxChars - 1)}…` : it.title;

          return (
            <g key={`${it.idx}-${it.seg}`}>
              <path
                d={path}
                fill={isActive ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.03)'}
                stroke={isActive ? 'rgba(56,189,248,0.95)' : 'rgba(255,255,255,0.28)'}
                strokeWidth={isActive ? 2.4 : 1.6}
                style={{ cursor: onPickIndex ? 'pointer' : 'default' }}
                onClick={() => onPickIndex?.(it.idx)}
              />

              {/* Keep labels horizontal (closer to the reference image). */}
              <g transform={`translate(${lp.x.toFixed(3)} ${lp.y.toFixed(3)})`}>
                <text
                  x="0"
                  y="0"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isActive ? 'rgba(226,232,240,0.98)' : 'rgba(226,232,240,0.70)'}
                  fontSize={isActive ? fontSizeActive : fontSize}
                  fontWeight={isActive ? 800 : 600}
                >
                  {label}
                </text>
              </g>
            </g>
          );
        })}

        <circle r={innerR - 2} fill="rgba(2,6,23,0.65)" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
        <text
          x="0"
          y="-8"
          textAnchor="middle"
          fill="rgba(226,232,240,0.9)"
          fontSize={12}
          fontWeight={700}
        >
          Jogo selecionado
        </text>
        <text
          x="0"
          y="12"
          textAnchor="middle"
          fill="rgba(148,163,184,0.95)"
          fontSize={10}
          fontWeight={600}
        >
          {titles[idx] ? (titles[idx].length > 24 ? `${titles[idx].slice(0, 23)}…` : titles[idx]) : '---'}
        </text>
      </svg>
    </div>
  );
};

export default RetroWheel;
