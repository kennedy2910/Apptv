
import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface AdPlaceholderProps {
  duration: number;
  onEnded: () => void;
}

const AdPlaceholder: React.FC<AdPlaceholderProps> = ({ duration, onEnded }) => {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onEnded();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [duration, onEnded]);

  return (
    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
      <div className="relative w-48 h-48 mb-8">
        <div className="absolute inset-0 border-4 border-blue-500 rounded-full animate-ping opacity-25"></div>
        <div className="absolute inset-0 border-4 border-blue-500 rounded-full flex items-center justify-center">
          <Play className="w-16 h-16 text-blue-500 fill-current" />
        </div>
      </div>
      <h2 className="text-3xl font-bold mb-2">Intervalo Comercial</h2>
      <p className="text-xl text-slate-400">A programação volta em {remaining}s</p>
      
      <div className="absolute bottom-12 right-12 bg-black/60 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10">
        <span className="text-sm font-semibold tracking-widest text-slate-400 uppercase">Anúncio Local</span>
      </div>
    </div>
  );
};

export default AdPlaceholder;
