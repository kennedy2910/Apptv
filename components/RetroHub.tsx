import React, { useEffect, useMemo, useState } from 'react';
import NesEmulator from './NesEmulator';
import EmulatorJSFrame from './EmulatorJSFrame';
import RetroFan from './RetroFan';

type RomSystem = 'nes' | 'snes';
type RomEntry = { name: string; url: string; system: RomSystem };

const normalizeKey = (s: string) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const stripTags = (s: string) =>
  String(s || '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Build-time ROM discovery. Put ROMs under `roms/` at the project root.
// Note: shipping ROMs may be illegal; only use ROMs you own or have rights to distribute.
const ROM_MODULES = import.meta.glob('../roms/**/*.{nes,NES,smc,SMC,sfc,SFC}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const toRomList = (): RomEntry[] => {
  const entries: RomEntry[] = [];
  for (const [p, url] of Object.entries(ROM_MODULES)) {
    const file = p.split('/').pop() || '';
    const base = file.replace(/\.[^.]+$/, '');
    const ext = (file.split('.').pop() || '').toLowerCase();
    const system: RomSystem =
      ext === 'nes' ? 'nes' :
      (ext === 'smc' || ext === 'sfc') ? 'snes' :
      'snes';
    if (typeof url === 'string' && base) entries.push({ name: base, url, system });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
};

// Optional covers: drop images into `roms/covers/` with a filename that matches (or roughly matches) the ROM name.
const COVER_MODULES = import.meta.glob('../roms/covers/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const COVER_URL_BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [p, url] of Object.entries(COVER_MODULES)) {
    const file = p.split('/').pop() || '';
    const base = file.replace(/\.[^.]+$/, '');
    const key = normalizeKey(base);
    if (key && typeof url === 'string') out[key] = url;
  }
  return out;
})();

const resolveCoverUrl = (romName: string): string | undefined => {
  const k0 = normalizeKey(romName);
  if (COVER_URL_BY_KEY[k0]) return COVER_URL_BY_KEY[k0];

  const k1 = normalizeKey(stripTags(romName));
  if (COVER_URL_BY_KEY[k1]) return COVER_URL_BY_KEY[k1];

  const k = Object.keys(COVER_URL_BY_KEY).find(x => x.includes(k1) || k1.includes(x) || x.includes(k0) || k0.includes(x));
  return k ? COVER_URL_BY_KEY[k] : undefined;
};

const isBackKey = (e: KeyboardEvent) => {
  const code = (e as any).keyCode as number | undefined;
  return (
    e.key === 'Escape' ||
    e.key === 'Backspace' ||
    e.key === 'GoBack' ||
    code === 27 ||
    code === 8 ||
    code === 461 // Android TV BACK
  );
};

const RetroHub: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const roms = useMemo(() => toRomList(), []);
  const [selected, setSelected] = useState<RomEntry | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isBackKey(e)) {
        e.preventDefault();
        if (selected) setSelected(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, selected]);

  useEffect(() => {
    if (!isOpen) return;
    const onMessage = (ev: MessageEvent) => {
      const t = (ev.data as any)?.type;
      if (t !== 'retro_exit') return;
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [isOpen, onClose, selected]);

  useEffect(() => {
    if (!isOpen) setSelected(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
  }, [isOpen, roms.length]);

  useEffect(() => {
    if (!isOpen) return;
    if (selected) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const len = roms.length;
      if (len <= 0) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + len) % len);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % len);
        return;
      }

      const code = (e as any).keyCode as number | undefined;
      const isOk =
        e.key === 'Enter' ||
        e.key === 'OK' ||
        code === 13 ||
        code === 23 ||
        code === 66;

      if (isOk) {
        e.preventDefault();
        const r = roms[((activeIndex % len) + len) % len];
        if (r) setSelected(r);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, isOpen, roms, selected]);

  if (!isOpen) return null;

  const active = roms[Math.min(Math.max(0, activeIndex), Math.max(0, roms.length - 1))] || null;
  const activeCover = active ? resolveCoverUrl(active.name) : undefined;

  return (
    <div className="fixed inset-0 z-[100] text-slate-100">
      <div className="absolute inset-0 bg-slate-950" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(56,189,248,0.25), transparent 45%), radial-gradient(circle at 70% 30%, rgba(244,63,94,0.20), transparent 55%), radial-gradient(circle at 50% 90%, rgba(34,197,94,0.12), transparent 55%)',
        }}
      />

      <header className="relative h-16 px-10 flex items-center justify-between border-b border-white/10 bg-black/20 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-fuchsia-500/90 grid place-items-center text-slate-950 font-black">
            R
          </div>
          <div className="font-extrabold tracking-tight">Retro Games</div>
        </div>
        <div className="text-xs text-slate-300/80">
          {selected ? 'Esc/Voltar: lista' : 'Esc/Voltar: TV'}
        </div>
      </header>

      <main className="relative px-10 py-8">
        {!selected ? (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-black tracking-tight">Biblioteca</div>
                <div className="mt-2 text-sm text-slate-300/80">
                  Coloque ROMs <span className="font-semibold text-slate-200">.nes</span> ou <span className="font-semibold text-slate-200">.smc/.sfc</span> em <span className="font-mono">roms/</span>.
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
              >
                Voltar
              </button>
            </div>

            {roms.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-300/90">
                Nenhuma ROM encontrada em <span className="font-mono">roms/</span>.
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
                <aside className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-200">Lista de jogos</div>
                    <div className="text-xs text-slate-400">{roms.length}</div>
                  </div>
                  <div className="max-h-[calc(100vh-260px)] overflow-auto">
                    {roms.map((r, i) => {
                      const isActive = i === activeIndex;
                      const cover = resolveCoverUrl(r.name);
                      return (
                        <button
                          key={r.url}
                          type="button"
                          onClick={() => setActiveIndex(i)}
                          className={[
                            'w-full text-left px-4 py-2.5 border-b border-white/5 flex items-center gap-3',
                            isActive ? 'bg-sky-500/10' : 'hover:bg-white/5',
                          ].join(' ')}
                        >
                          <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/10 bg-black/30 shrink-0">
                            {cover ? (
                              <img src={cover} alt={r.name} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                            ) : (
                              <div className="w-full h-full grid place-items-center text-[11px] font-black text-slate-200/80">
                                {r.system === 'snes' ? 'SNES' : 'NES'}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className={['text-sm font-semibold truncate', isActive ? 'text-slate-50' : 'text-slate-200'].join(' ')}>
                              {r.name}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">{r.system.toUpperCase()}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden relative min-h-[560px]">
                  {activeCover && (
                    <img
                      src={activeCover}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-15 blur-sm scale-105"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/70 to-slate-950" />

                  <div className="relative p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-400">Selecionado</div>
                        <div className="mt-1 text-2xl font-black tracking-tight truncate">{active?.name || '---'}</div>
                        <div className="mt-2 text-sm text-slate-300/80">
                          Enter/OK: jogar
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-400">
                        {active?.system ? active.system.toUpperCase() : ''}
                      </div>
                    </div>

                    <div className="mt-6 grid place-items-center">
                      <div className="w-full max-w-[1120px] h-[640px]">
                        <RetroFan
                          items={roms.map(r => ({
                            title: r.name,
                            coverUrl: resolveCoverUrl(r.name),
                            systemLabel: r.system.toUpperCase(),
                          }))}
                          activeIndex={activeIndex}
                          onPickIndex={(idx) => setActiveIndex(idx)}
                          className="w-full h-full"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-slate-200">Agora jogando</div>
              <div className="mt-2 text-lg font-black tracking-tight">{selected.name}</div>
              <div className="mt-4 text-xs text-slate-300/80">
                Controles: Setas, Z/X, Enter, Shift
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
                >
                  Biblioteca
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm"
                >
                  TV
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/50 overflow-hidden">
              {selected.system === 'nes' ? (
                <NesEmulator romUrl={selected.url} />
              ) : (
                <div className="w-full aspect-video bg-black">
                  <EmulatorJSFrame core="snes" romUrl={selected.url} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default RetroHub;
