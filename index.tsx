import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AppMobile from './AppMobile';
import WebAuthGate from './components/WebAuthGate';
import { hasValidWebAuthConfig, isWebSessionAuthenticated } from './webAuth';

const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';

const isMobileBootstrapRoute = () => {
  const pathname = normalizePath(window.location.pathname || '/');
  const hashPath = normalizePath((window.location.hash || '').replace(/^#/, '').split('?')[0] || '/');
  const searchParams = new URLSearchParams(window.location.search || '');
  const ua = navigator.userAgent || '';
  const isExplicitMobileRoute = pathname === '/mob' || pathname.startsWith('/mob/');
  const isExplicitMobileHash = hashPath === '/mob' || hashPath.startsWith('/mob/');
  const isExplicitMobileQuery =
    searchParams.get('mobile') === '1' ||
    searchParams.get('mobile') === 'true' ||
    searchParams.get('view') === 'mobile';
  const isEmbeddedAndroidWebView =
    /Android/i.test(ua) &&
    (/\bwv\b/i.test(ua) || /Version\/[\d.]+/i.test(ua) || /; wv\)/i.test(ua));

  return isExplicitMobileRoute || isExplicitMobileHash || isExplicitMobileQuery || (pathname === '/' && isEmbeddedAndroidWebView);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
const isMobileRoute = isMobileBootstrapRoute();
const app = isMobileRoute ? <AppMobile /> : <App />;
const isAuthenticated = hasValidWebAuthConfig() && isWebSessionAuthenticated();

root.render(
  <React.StrictMode>
    {isAuthenticated ? app : <WebAuthGate>{app}</WebAuthGate>}
  </React.StrictMode>
);
