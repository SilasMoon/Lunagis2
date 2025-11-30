/**
 * Simple logger utility for development debugging
 * Logs are suppressed in production builds
 */

const isDevelopment = import.meta.env?.DEV ?? process.env.NODE_ENV !== 'production';

export const logger = {
  /**
   * Log debug information (development only)
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log warnings (development only)
   */
  warn: (...args: unknown[]) => {
    if (isDevelopment) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Log errors (always logged, but without stack traces in production)
   */
  error: (...args: unknown[]) => {
    if (isDevelopment) {
      console.error('[ERROR]', ...args);
    } else {
      // In production, log without potentially sensitive details
      const message = args[0];
      if (typeof message === 'string') {
        console.error('[ERROR]', message);
      }
    }
  },

  /**
   * Log info (development only)
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },
};

export default logger;
