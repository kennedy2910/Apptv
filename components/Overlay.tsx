import React from 'react';
import { Tv, Clock } from 'lucide-react';
import { Channel, PlaylistItem, ContentType } from '../types';

interface OverlayProps {
  channel: Channel;
  isVisible: boolean;
  channelIndex: number;
  totalChannels: number;
  nextItem?: PlaylistItem | null;
  variant?: 'fullscreen' | 'card';
}

const Overlay: React.FC<OverlayProps> = ({
  channel,
  isVisible,
  channelIndex,
  totalChannels,
  nextItem,
  variant = 'fullscreen',
}) => {
  const isCard = variant === 'card';

  const getNextItemLabel = () => {
    if (!nextItem) return 'Fim da programacao';
    if (nextItem.type === ContentType.AD) return 'Intervalo comercial';
    return 'Proximo conteudo';
  };

  return (
    <div
      className={[
        'absolute inset-0 pointer-events-none transition-opacity duration-500',
        isVisible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <div
        className={[
          'absolute top-0 left-0 right-0 flex justify-between items-start',
          'bg-gradient-to-b from-black/80 to-transparent',
          isCard ? 'p-4' : 'p-8',
        ].join(' ')}
      >
        <div className="flex items-center space-x-4">
          <div className={['bg-blue-600 rounded-lg', isCard ? 'p-1.5' : 'p-2'].join(' ')}>
            <Tv className={[isCard ? 'w-5 h-5' : 'w-6 h-6', 'text-white'].join(' ')} />
          </div>
          <div>
            <h1 className={[isCard ? 'text-lg' : 'text-2xl', 'font-bold tracking-tight'].join(' ')}>
              {channel.name}
            </h1>
            <p
              className={[
                isCard ? 'text-xs' : 'text-sm',
                'text-blue-400 font-semibold uppercase tracking-wider',
              ].join(' ')}
            >
              Ao vivo
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-6 text-white/70">
          <div className="flex items-center space-x-2">
            <Clock className={isCard ? 'w-4 h-4' : 'w-5 h-5'} />
            <span className={[isCard ? 'text-sm' : 'text-lg', 'font-medium'].join(' ')}>
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      <div
        className={[
          'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent',
          isCard ? 'p-5' : 'p-12',
        ].join(' ')}
      >
        <div className={isCard ? 'max-w-none' : 'max-w-4xl'}>
          <div className={['flex items-center space-x-3', isCard ? 'mb-1' : 'mb-2'].join(' ')}>
            <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">
              {channel.channel_id.padStart(2, '0')}
            </span>
            <h2 className={[isCard ? 'text-2xl' : 'text-4xl', 'font-bold'].join(' ')}>
              {channel.name}
            </h2>
          </div>

          <div className={['h-1 w-full bg-white/10 rounded-full overflow-hidden', isCard ? 'mb-2' : 'mb-4'].join(' ')}>
            <div className="h-full bg-blue-500 w-1/3 animate-pulse" />
          </div>

          <div
            className={[
              'text-white/60',
              isCard ? 'flex flex-col space-y-1 text-sm' : 'flex space-x-8 text-lg',
            ].join(' ')}
          >
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-white">Siga agora:</span>
              <span>Programacao {channel.name}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-white">Proximo:</span>
              <span>{getNextItemLabel()}</span>
            </div>
          </div>
        </div>
      </div>

      {!isCard && (
        <div className="absolute right-12 top-1/2 -translate-y-1/2 flex flex-col space-y-2">
          {Array.from({ length: totalChannels }).map((_, i) => (
            <div
              key={i}
              className={[
                'w-1 transition-all duration-300 rounded-full',
                i === channelIndex ? 'h-12 bg-blue-500' : 'h-4 bg-white/20',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Overlay;

