import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import { initEnclaveE2E } from '@/steve';
import { startEnclaveVerification } from '@/steve/attestation';

const basePath = import.meta.env.BASE_URL;
const slashlessBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : '';
const shouldCanonicalizePath = Boolean(slashlessBasePath && window.location.pathname === slashlessBasePath);

if (shouldCanonicalizePath) {
  window.location.replace(`${basePath}${window.location.search}${window.location.hash}`);
} else {
  // Direct attestation check — independent of STEVE, drives the enclave badge.
  startEnclaveVerification();
  // Register the STEVE service worker so traffic is E2E-encrypted to the enclave.
  void initEnclaveE2E();
}

if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark');
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  document.documentElement.classList.toggle('dark', e.matches);
});

if (!shouldCanonicalizePath) {
  // biome-ignore lint/style/noNonNullAssertion: <safe to use>
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
