export type NativeAppMode = 'mobile' | 'tvbox' | 'mapper';

const PROXY_RESOLVE_URL = String((import.meta as any).env?.VITE_RESOLVE_URL || '').trim();
const DIRECT_RESOLVE_URL = String((import.meta as any).env?.VITE_RESOLVE_DIRECT_URL || '').trim();

export const isNativeApp = () => false;

export const getRuntimeResolveUrl = (): string | undefined => {
  return PROXY_RESOLVE_URL || DIRECT_RESOLVE_URL || undefined;
};

export const shouldUseDirectEdgeUrls = () => false;

export const getNativeAppMode = async (): Promise<NativeAppMode | null> => null;
