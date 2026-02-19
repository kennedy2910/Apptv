
import { Channel, ChannelKind, ContentType } from './types';

// Data base no passado para garantir que o cálculo de "tempo decorrido" sempre encontre a programação em andamento
const BASE_DATE = "2024-01-01T00:00:00Z";

export const MOCK_CHANNELS: Channel[] = [
  {
    channel_id: "01",
    name: "VELOCIDADE PRO",
    kind: ChannelKind.YOUTUBE_LINEAR,
    schedule_start: BASE_DATE,
    items: [
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=ciSNHrKrkeQ", duration: 7200 }, // 24h Le Mans 2023 Highlights/Race
      { type: ContentType.AD, duration: 45 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=bcZGP3MsrL0", duration: 3600 }, // Touring car Spa
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=Cpl373FOntY", duration: 900 },  // Ultimate Race comparison
      { type: ContentType.AD, duration: 30 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=Ldp9qioQHsg", duration: 840 },  // Ferrari vs Pagani
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=Mu0gKZis4cg", duration: 780 }   // Bugatti Drag Race
    ],
    loop: true
  },
  {
    channel_id: "02",
    name: "AÇÃO & ESPORTE",
    kind: ChannelKind.YOUTUBE_LINEAR,
    schedule_start: BASE_DATE,
    items: [
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=aBTtLCz0Qk0", duration: 1500 }, // 79MM Highlights
      { type: ContentType.AD, duration: 30 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=0nL3qjE5Gs", duration: 1200 },  // Gordon Spice Trophy
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=XTqHhCzcQhw", duration: 7200 }, // 24h Le Mans 2024
      { type: ContentType.AD, duration: 60 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=Cpl373FOntY", duration: 900 }   // Reuse comparison for sports fill
    ],
    loop: true
  },
  {
    channel_id: "03",
    name: "MÚSICA TV",
    kind: ChannelKind.YOUTUBE_LINEAR,
    schedule_start: BASE_DATE,
    items: [
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=uPHuOJ_1gzw", duration: 1800 }, // Top 30 Greatest
      { type: ContentType.AD, duration: 30 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=tcuRzQcTs9g", duration: 2100 }, // Best of 2025
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=vBynw9Isr28", duration: 300 },  // Lady Gaga
      { type: ContentType.AD, duration: 15 },
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=KFMYx1TibeQ", duration: 240 },  // Kehlani
      { type: ContentType.VIDEO, url: "https://www.youtube.com/watch?v=BQ0mxQXmLsk", duration: 420 }   // Camila Cabello
    ],
    loop: true
  }
];

export const OVERLAY_TIMEOUT = 5000;
