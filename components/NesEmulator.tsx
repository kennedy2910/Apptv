import React, { useEffect, useRef } from 'react';
import { NES } from 'jsnes';

const abToBinaryString = (ab: ArrayBuffer): string => {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
};

const NesEmulator: React.FC<{ romUrl: string }> = ({ romUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nesRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let cancelled = false;
    canvas.width = 256;
    canvas.height = 240;

    const imageData = ctx.getImageData(0, 0, 256, 240);
    const data = imageData.data;

    const nes = new NES({
      onFrame: (frameBuffer: Uint32Array) => {
        // frameBuffer: 256*240, each pixel is 0xAARRGGBB
        for (let i = 0; i < frameBuffer.length; i++) {
          const x = frameBuffer[i];
          const o = i * 4;
          data[o + 0] = (x >> 16) & 0xff; // R
          data[o + 1] = (x >> 8) & 0xff;  // G
          data[o + 2] = x & 0xff;         // B
          data[o + 3] = 0xff;             // A
        }
        ctx.putImageData(imageData, 0, 0);
      },
    });
    nesRef.current = nes;

    const keyMap: Record<string, number> = {
      ArrowUp: 4,    // UP
      ArrowDown: 5,  // DOWN
      ArrowLeft: 6,  // LEFT
      ArrowRight: 7, // RIGHT
      z: 0,          // A
      Z: 0,
      x: 1,          // B
      X: 1,
      Enter: 3,      // START
      Shift: 2,      // SELECT
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const b = keyMap[e.key];
      if (b === undefined) return;
      e.preventDefault();
      try { nes.buttonDown(1, b); } catch {}
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const b = keyMap[e.key];
      if (b === undefined) return;
      e.preventDefault();
      try { nes.buttonUp(1, b); } catch {}
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const loop = () => {
      if (cancelled) return;
      try { nes.frame(); } catch {}
      rafRef.current = window.requestAnimationFrame(loop);
    };

    (async () => {
      try {
        const r = await fetch(romUrl);
        const ab = await r.arrayBuffer();
        const rom = abToBinaryString(ab);
        if (cancelled) return;
        nes.loadROM(rom);
        loop();
      } catch (e) {
        console.error('[NesEmulator] Failed to load ROM', e);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      nesRef.current = null;
    };
  }, [romUrl]);

  return (
    <div className="w-full aspect-video bg-black grid place-items-center">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{ imageRendering: 'pixelated' as any }}
      />
    </div>
  );
};

export default NesEmulator;

