import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;
let sentryEnabled = false;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log('⚠️  Sentry DSN not configured - error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RELEASE || 'sdr-platform@latest',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      Sentry.onUncaughtExceptionIntegration({
        exitEvenIfOtherHandlersAreRegistered: false,
      }),
      Sentry.onUnhandledRejectionIntegration({
        mode: 'warn',
      }),
    ],
    beforeSend(event, hint) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Sentry Event:', event);
        console.error('Original Error:', hint.originalException);
      }
      return event;
    },
  });

  sentryEnabled = true;
  console.log('✅ Sentry initialized for backend error monitoring');
}

export function isSentryEnabled() {
  return sentryEnabled;
}

export { Sentry };
