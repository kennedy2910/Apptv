export enum ChannelKind {
  YOUTUBE_LINEAR = 'youtube_linear',
  YOUTUBE = 'youtube',
  HLS = 'hls'
}

export enum ContentType {
  VIDEO = 'video',
  AD = 'ad'
}

export interface PlaylistItem {
  type: ContentType;
  url?: string;
  duration: number; // Duracao em segundos
}

export interface BannerAd {
  message: string;
  duration: number;
  url?: string;
  target_url?: string;
  image_url?: string;
  start_time?: string;
  repeat_count_per_day?: number;
  interval_minutes?: number;
}

export interface Channel {
  channel_id: string;
  name: string;
  category?: string;
  kind: ChannelKind;
  schedule_start: string; // ISO 8601 string
  items: PlaylistItem[];
  banner_ads?: BannerAd[];
  loop: boolean;
}

export interface AppState {
  currentChannelIndex: number;
  channels: Channel[];
  isLoading: boolean;
  isOverlayVisible: boolean;
  isInteracted: boolean;
}
