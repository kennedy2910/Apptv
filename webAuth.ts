const AUTH_STORAGE_KEY = 'wiipyn_webtv_auth_v1';

const readEnv = (key: string) => String((import.meta as any).env?.[key] || '').trim();

export const getConfiguredWebCredentials = () => ({
  username: readEnv('VITE_WEBTV_LOGIN_USER'),
  password: readEnv('VITE_WEBTV_LOGIN_PASSWORD'),
});

export const hasValidWebAuthConfig = () => {
  const creds = getConfiguredWebCredentials();
  return Boolean(creds.username && creds.password);
};

export const isWebSessionAuthenticated = () => {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const persistWebSessionAuth = () => {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, '1');
  } catch {
    // ignore storage failures
  }
};

export const clearWebSessionAuth = () => {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
};
