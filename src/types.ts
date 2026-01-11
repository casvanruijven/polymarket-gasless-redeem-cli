/**
 * Type Definitions for Polymarket Gasless Redemption
 */

import type { Hex, Address as ViemAddress } from 'viem';

// Re-export Address from viem for convenience
export type Address = ViemAddress;

/**
 * Encrypted keys stored in the key file
 */
export interface EncryptedKeys {
  privateKey: Hex;
  funderAddress: Address;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

/**
 * Encrypted data structure stored on disk
 */
export interface EncryptedData {
  salt: string;
  iv: string;
  encrypted: string;
  tag: string;
}

/**
 * Individual outcome within a position
 */
export interface Outcome {
  outcome: string;
  outcomeIndex: number;
  size: number;
  value: number;
}

/**
 * Grouped position by conditionId
 */
export interface Position {
  conditionId: Hex;
  title: string;
  negativeRisk: boolean;
  outcomes: Outcome[];
  totalValue: number;
  totalSize: number;
}

/**
 * Raw position data from the Polymarket Data API
 */
export interface RawPositionData {
  conditionId: string;
  title?: string;
  negativeRisk?: boolean;
  outcome?: string;
  outcomeIndex?: number | string;
  size?: number | string;
  currentValue?: number | string;
}

/**
 * Result of a redemption attempt
 */
export interface RedemptionResult {
  success: boolean;
  txHash?: Hex;
  url?: string;
  error?: string;
}

/**
 * Transaction structure for the relay client
 */
export interface Transaction {
  to: Address;
  data: Hex;
  value: string;
}

/**
 * Main function return result
 */
export interface MainResult {
  setup?: boolean;
  reset?: boolean;
  message?: string;
  checkOnly?: boolean;
  redeemed: number;
  total: number;
  transactions?: Hex[];
}

/**
 * Log levels for the logger
 */
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

/**
 * Log format options
 */
export type LogFormat = 'json' | 'text';

/**
 * Configuration object type
 */
export interface AppConfig {
  api: {
    relayerUrl: string;
    dataApiUrl: string;
    timeout: number;
    retries: number;
    backoffMultiplier: number;
    maxBackoffTime: number;
  };
  blockchain: {
    chainId: number;
    rpcUrl: string;
    gasLimit: number;
    confirmations: number;
  };
  rateLimit: {
    requestsPerMinute: number;
    burstLimit: number;
    windowMs: number;
  };
  contracts: {
    ctf: Address;
    usdc: Address;
    negRiskAdapter: Address;
  };
  abis: {
    ctfRedeem: readonly AbiItem[];
    negRiskRedeem: readonly AbiItem[];
  };
  logging: {
    level: LogLevel;
    format: LogFormat;
    enableConsole: boolean;
    enableFile: boolean;
    logFile: string;
  };
  app: {
    maxConcurrentRedemptions: number;
    redemptionDelay: number;
    checkTimeout: number;
    redeemTimeout: number;
  };
}

/**
 * ABI function item structure
 */
export interface AbiItem {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: readonly AbiInput[];
  readonly outputs: readonly AbiOutput[];
  readonly stateMutability: 'nonpayable' | 'view' | 'pure' | 'payable';
  readonly constant?: boolean;
  readonly payable?: boolean;
}

export interface AbiInput {
  readonly name: string;
  readonly type: string;
  readonly internalType?: string;
}

export interface AbiOutput {
  readonly name: string;
  readonly type: string;
  readonly internalType?: string;
}

