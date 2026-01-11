/**
 * Transaction Builders using Viem
 * Uses the official Polymarket prepareEncodeFunctionData pattern
 */

import { encodeFunctionData, prepareEncodeFunctionData, zeroHash, type Hex, type Address } from 'viem';
import type { Transaction } from './types.js';
import { CONFIG } from './config.js';
import { validators, logger } from './utils.js';

/**
 * Prepare CTF redeem function encoding (done once at module load)
 */
const ctfRedeemPrepared = prepareEncodeFunctionData({
  abi: CONFIG.abis.ctfRedeem,
  functionName: 'redeemPositions'
});

/**
 * Prepare NegRisk redeem function encoding (done once at module load)
 */
const negRiskRedeemPrepared = prepareEncodeFunctionData({
  abi: CONFIG.abis.negRiskRedeem,
  functionName: 'redeemPositions'
});

/**
 * Create CTF redeem transaction for standard binary markets
 * Redeems both outcomes (indexSets [1, 2]) in a single call
 */
export function createCtfRedeemTx(conditionId: Hex): Transaction {
  if (!validators.isValidBytes32(conditionId)) {
    throw new Error(`Invalid condition ID: ${conditionId}`);
  }

  const data = encodeFunctionData({
    ...ctfRedeemPrepared,
    args: [CONFIG.contracts.usdc, zeroHash, conditionId, [1n, 2n]]
  });

  logger.debug('Created CTF redeem transaction', {
    to: CONFIG.contracts.ctf,
    conditionId,
    outcomes: [1, 2]
  });

  return {
    to: CONFIG.contracts.ctf as Address,
    data,
    value: '0'
  };
}

/**
 * Create NegRisk adapter redeem transaction for negative risk markets
 * @param conditionId - The condition ID to redeem
 * @param amounts - Array of amounts [yesTokens, noTokens] in base units (1e6 for USDC decimals)
 */
export function createNegRiskRedeemTx(conditionId: Hex, amounts: bigint[]): Transaction {
  if (!validators.isValidBytes32(conditionId)) {
    throw new Error(`Invalid condition ID: ${conditionId}`);
  }

  if (!Array.isArray(amounts) || amounts.length === 0) {
    throw new Error('Amounts must be a non-empty array');
  }

  // Validate amounts are non-negative bigints
  for (const amount of amounts) {
    if (typeof amount !== 'bigint' || amount < 0n) {
      throw new Error(`Invalid amount: ${amount}. Must be non-negative bigint.`);
    }
  }

  const data = encodeFunctionData({
    ...negRiskRedeemPrepared,
    args: [conditionId, amounts]
  });

  logger.debug('Created NegRisk redeem transaction', {
    to: CONFIG.contracts.negRiskAdapter,
    conditionId,
    amounts: amounts.map(a => a.toString())
  });

  return {
    to: CONFIG.contracts.negRiskAdapter as Address,
    data,
    value: '0'
  };
}

/**
 * Calculate redemption amounts from position sizes
 * Converts floating point sizes to base units (1e6 for USDC)
 */
export function calculateRedeemAmounts(sizes: number[]): bigint[] {
  return sizes.map(size => {
    const scaled = Math.floor(size * 1e6);
    return BigInt(Math.max(0, scaled));
  });
}

