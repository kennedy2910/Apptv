import React, { useMemo } from 'react';

type EmulatorJSFrameProps = {
  core: 'snes' | 'nes';
  romUrl: string;
};

const EmulatorJSFrame: React.FC<EmulatorJSFrameProps> = ({ core, romUrl }) => {
  const srcDoc = useMemo(() => {
    // EmulatorJS reads config from globals at load-time.
    // Using an iframe isolates each game session and avoids global pollution in the React app.
    const cfg = {
      playerId: 'game',
      core,
      romUrl,
      dataPath: 'https://cdn.emulatorjs.org/stable/data/',
    };

    // Minimal html with Escape/back posting a message to the parent.
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
      #${cfg.playerId} { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="${cfg.playerId}"></div>
    <script>
      (function(){
        var isBackKey = function(e){
          var code = e && e.keyCode;
          return e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || code === 27 || code === 8 || code === 461;
        };
        window.addEventListener('keydown', function(e){
          if (!isBackKey(e)) return;
          try { e.preventDefault(); } catch {}
          try { parent && parent.postMessage({ type: 'retro_exit' }, '*'); } catch {}
        });
      })();

      window.EJS_player = '#${cfg.playerId}';
      window.EJS_core = '${cfg.core}';
      window.EJS_gameUrl = ${JSON.stringify(cfg.romUrl)};
      window.EJS_pathtodata = '${cfg.dataPath}';
      window.EJS_startOnLoaded = true;
    </script>
    <script src="${cfg.dataPath}loader.js"></script>
  </body>
</html>`;
  }, [core, romUrl]);

  return (
    <iframe
      title="EmulatorJS"
      className="w-full h-full bg-black"
      srcDoc={srcDoc}
      allow="autoplay; fullscreen; gamepad"
      referrerPolicy="no-referrer"
    />
  );
};

export default EmulatorJSFrame;

