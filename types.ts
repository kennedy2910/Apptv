
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
  duration: number; // Duração em segundos
}

export interface Channel {
  channel_id: string;
  name: string;
  kind: ChannelKind;
  schedule_start: string; // ISO 8601 string
  items: PlaylistItem[];
  loop: boolean;
}

export interface AppState {
  currentChannelIndex: number;
  channels: Channel[];
  isLoading: boolean;
  isOverlayVisible: boolean;
  isInteracted: boolean;
}
