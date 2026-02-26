/**
 * Configuration Management System
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LogLevel, LogFormat } from './types.js';
import type { Address } from 'viem';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * CTF Redeem ABI - for standard binary markets
 */
const ctfRedeemAbi = [
  {
    type: 'function',
    name: 'redeemPositions',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
] as const;

/**
 * NegRisk Adapter Redeem ABI - for negative risk markets
 */
const negRiskRedeemAbi = [
  {
    type: 'function',
    name: 'redeemPositions',
    inputs: [
      { internalType: 'bytes32', name: '_conditionId', type: 'bytes32' },
      { internalType: 'uint256[]', name: '_amounts', type: 'uint256[]' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  }
] as const;

/**
 * Application configuration
 */
export const CONFIG = {
  // API Configuration
  api: {
    relayerUrl: 'https://relayer-v2.polymarket.com',
    dataApiUrl: 'https://data-api.polymarket.com',
    timeout: 30000,
    retries: 3,
    backoffMultiplier: 2,
    maxBackoffTime: 30000
  },

  // Blockchain Configuration
  blockchain: {
    chainId: 137,
    rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
    gasLimit: 200000,
    confirmations: 1
  },

  // Rate Limiting
  rateLimit: {
    requestsPerMinute: 30,
    burstLimit: 10,
    windowMs: 60000
  },

  // Contract Addresses (Polygon mainnet)
  contracts: {
    ctf: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045' as Address,
    usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as Address,
    negRiskAdapter: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' as Address
  },

  // ABIs with const assertion for type inference
  abis: {
    ctfRedeem: ctfRedeemAbi,
    negRiskRedeem: negRiskRedeemAbi
  },

  // Logging
  logging: {
    level: (process.env['LOG_LEVEL'] || 'INFO') as LogLevel,
    format: 'json' as LogFormat,
    enableConsole: true,
    enableFile: false,
    logFile: path.join(__dirname, '..', 'logs', 'redemption.log')
  },

  // Application
  app: {
    maxConcurrentRedemptions: 3,
    redemptionDelay: 5000,
    checkTimeout: 60,
    redeemTimeout: 120
  }
} as const;

/**
 * Validate configuration at startup
 */
export function validateConfig(): void {
  // Validate contract addresses
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  
  for (const [name, address] of Object.entries(CONFIG.contracts)) {
    if (!addressRegex.test(address)) {
      throw new Error(`Invalid contract address for ${name}: ${address}`);
    }
  }

  // Validate API URLs
  if (!CONFIG.api.relayerUrl.startsWith('https://')) {
    throw new Error('Relayer URL must use HTTPS');
  }

  if (!CONFIG.api.dataApiUrl.startsWith('https://')) {
    throw new Error('Data API URL must use HTTPS');
  }

  // Validate rate limits
  if (CONFIG.rateLimit.requestsPerMinute <= 0) {
    throw new Error('Requests per minute must be positive');
  }

  console.log('[OK] Configuration validated');
}

/**
 * Load environment-specific overrides
 */
export function loadEnvironmentOverrides(): void {
  // Type-safe environment variable access
  const rpcUrl = process.env['RPC_URL'];
  const logLevel = process.env['LOG_LEVEL'];
  const maxConcurrent = process.env['MAX_CONCURRENT_REDEMPTIONS'];

  if (rpcUrl) {
    (CONFIG.blockchain as { rpcUrl: string }).rpcUrl = rpcUrl;
  }

  if (logLevel && ['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(logLevel)) {
    (CONFIG.logging as { level: LogLevel }).level = logLevel as LogLevel;
  }

  if (maxConcurrent) {
    const parsed = parseInt(maxConcurrent, 10);
    if (!isNaN(parsed) && parsed > 0) {
      (CONFIG.app as { maxConcurrentRedemptions: number }).maxConcurrentRedemptions = parsed;
    }
  }
}

