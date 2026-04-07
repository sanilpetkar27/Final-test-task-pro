
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import ErrorBoundary from './src/components/ErrorBoundary';
import { AuthCompanyProvider } from './src/context/AuthCompanyContext';
import { validateEnv } from './src/utils/validateEnv';
import './src/styles.css';

validateEnv();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  tracesSampleRate: 0.2,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthCompanyProvider>
        <App />
      </AuthCompanyProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
