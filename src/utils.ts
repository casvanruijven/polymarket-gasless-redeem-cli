/**
 * Utility Functions
 */

import { CONFIG } from './config.js';
import type { LogLevel } from './types.js';

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = CONFIG.api.retries,
  baseDelay: number = 1000,
  description: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        console.error(`[ERROR] ${description} failed after ${maxRetries + 1} attempts`);
        throw lastError;
      }

      const delay = Math.min(
        baseDelay * Math.pow(CONFIG.api.backoffMultiplier, attempt),
        CONFIG.api.maxBackoffTime
      );

      console.warn(`[WARN] ${description} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
      console.warn(`   Error: ${lastError.message}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Input validation utilities
 */
export const validators = {
  /**
   * Validate Ethereum address (40 hex chars after 0x)
   */
  isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  },

  /**
   * Validate private key (64 hex chars after 0x)
   */
  isValidPrivateKey(key: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(key);
  },

  /**
   * Validate bytes32 (condition ID, parent collection ID, etc.)
   */
  isValidBytes32(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  },

  /**
   * Validate transaction hash (alias for bytes32)
   */
  isValidTxHash(hash: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  },

  /**
   * Validate positive number
   */
  isPositiveNumber(value: unknown): boolean {
    const num = Number(value);
    return !isNaN(num) && num > 0;
  }
};

/**
 * Log level priorities
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  'ERROR': 0,
  'WARN': 1,
  'INFO': 2,
  'DEBUG': 3
};

/**
 * Enhanced logging system
 */
export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = CONFIG.logging.level) {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data: unknown = null): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] ${level}: ${message}`;

    if (CONFIG.logging.format === 'json') {
      const logEntry: Record<string, unknown> = {
        timestamp,
        level,
        message
      };
      if (data) {
        logEntry['data'] = data;
      }
      return JSON.stringify(logEntry);
    } else {
      let formatted = baseMessage;
      if (data) {
        formatted += ` ${JSON.stringify(data, null, 2)}`;
      }
      return formatted;
    }
  }

  error(message: string, data: unknown = null): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', message, data));
    }
  }

  warn(message: string, data: unknown = null): void {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  info(message: string, data: unknown = null): void {
    if (this.shouldLog('INFO')) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  debug(message: string, data: unknown = null): void {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }
}

// Global logger instance
export const logger = new Logger();

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

/**
 * Safe JSON parsing with error handling
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.warn('Failed to parse JSON', { error: errorMsg, jsonString });
    return fallback;
  }
}

/**
 * Format currency values safely
 */
export function formatCurrency(value: unknown, decimals: number = 4): string {
  const num = Number(value);
  if (isNaN(num)) {
    return '0.0000';
  }
  return num.toFixed(decimals);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

