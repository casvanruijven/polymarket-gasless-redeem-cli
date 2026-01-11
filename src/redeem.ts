/**
 * Polymarket Gasless Redemption Script
 * TypeScript + Viem implementation with enhanced features
 *
 * Usage:
 *   npx tsx src/redeem.ts          # Redeem all positions
 *   npx tsx src/redeem.ts --check  # Just check, don't redeem
 *   npx tsx src/redeem.ts --setup  # Setup encrypted key storage
 *   npx tsx src/redeem.ts --reset  # Reset keys and run setup
 *   npx tsx src/redeem.ts --help  # Show help message
 */

/**
 * Display help message and exit
 */
function showHelp(): void {
  console.log(`
Polymarket Gasless Redemption CLI v2.0
=======================================

USAGE:
  npx tsx src/redeem.ts [OPTIONS]
  npm run redeem [OPTIONS]

OPTIONS:
  --check          Check for redeemable positions without redeeming
  --setup          Setup encrypted key storage (first-time setup)
  --reset          Reset and reconfigure encrypted keys
  --help, -h       Show this help message

EXAMPLES:
  # One-time redemption
  npm run redeem
  npx tsx src/redeem.ts

  # Check positions without redeeming
  npm run check
  npx tsx src/redeem.ts --check

  # Setup encrypted keys (first-time)
  npm run setup
  npx tsx src/redeem.ts --setup

  # Reset and reconfigure keys
  npm run reset
  npx tsx src/redeem.ts --reset

SETUP:
  Before first use, run: npm run setup
  This securely stores your wallet credentials with AES-256-GCM encryption.

ENVIRONMENT VARIABLES:
  REDEEM_PASSWORD    Encryption password (for automated scripts)
  RPC_URL            Polygon RPC endpoint (optional)
  LOG_LEVEL          Logging level: ERROR, WARN, INFO, DEBUG (optional)

For more information, see README.md
`);
  process.exit(0);
}

import { createWalletClient, http, type Hex, type WalletClient, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client';
import { BuilderConfig, type BuilderApiKeyCreds } from '@polymarket/builder-signing-sdk';

import keyManager from './keyManager.js';
import { CONFIG, validateConfig, loadEnvironmentOverrides } from './config.js';
import { globalRateLimiter } from './rateLimiter.js';
import { TransactionManager, TransactionState } from './transactionManager.js';
import { createCtfRedeemTx, createNegRiskRedeemTx, calculateRedeemAmounts } from './transactions.js';
import { retryWithBackoff, validators, logger, withTimeout, formatCurrency, sleep } from './utils.js';
import type { Position, RawPositionData, MainResult, RedemptionResult, EncryptedKeys } from './types.js';

// Check for help flag early (before config validation)
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
}

// Load environment overrides
loadEnvironmentOverrides();

// Validate configuration
try {
  validateConfig();
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  console.error('[ERROR] Configuration error:', errorMsg);
  process.exit(1);
}

/**
 * Fetch redeemable positions from Data API with rate limiting and validation
 */
async function getRedeemablePositions(walletAddress: string): Promise<Position[]> {
  // Validate input
  if (!validators.isValidAddress(walletAddress)) {
    throw new Error(`Invalid wallet address: ${walletAddress}`);
  }

  const url = `${CONFIG.api.dataApiUrl}/positions?user=${walletAddress}&sizeThreshold=0.01&redeemable=true&limit=100&offset=0`;

  logger.debug('Fetching redeemable positions', { url, walletAddress });

  const fetchFn = async (): Promise<RawPositionData[]> => {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'Polymarket-Redemption-CLI/2.0.0',
          'Accept': 'application/json'
        }
      }),
      CONFIG.api.timeout,
      'Data API request timed out'
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Data API error ${response.status}: ${errorText}`);
    }

    const data: unknown = await response.json();

    // Validate response structure
    if (!Array.isArray(data)) {
      throw new Error('Invalid API response: expected array of positions');
    }

    return data as RawPositionData[];
  };

  // Execute with rate limiting and retry logic
  const positions = await retryWithBackoff(
    () => globalRateLimiter.executeWithRateLimit(fetchFn, 'Data API call'),
    CONFIG.api.retries,
    2000,
    'Data API fetch'
  );

  logger.info(`Fetched ${positions.length} positions from API`);

  // Group by conditionId - aggregate both outcomes for display and redemption
  const byCondition = new Map<string, Position>();

  for (const pos of positions) {
    // Validate position data (conditionId is bytes32, not address)
    if (!pos.conditionId || !validators.isValidBytes32(pos.conditionId)) {
      logger.warn('Skipping invalid position', { position: pos });
      continue;
    }

    const cid = pos.conditionId;
    if (!byCondition.has(cid)) {
      byCondition.set(cid, {
        conditionId: cid as Hex,
        title: pos.title || 'Unknown Market',
        negativeRisk: Boolean(pos.negativeRisk),
        outcomes: [],
        totalValue: 0,
        totalSize: 0
      });
    }

    const group = byCondition.get(cid)!;

    // Validate outcome data
    const outcome = {
      outcome: pos.outcome || 'Unknown',
      outcomeIndex: Number(pos.outcomeIndex) || 0,
      size: Math.max(0, Number(pos.size) || 0),
      value: Math.max(0, Number(pos.currentValue) || 0)
    };

    group.outcomes.push(outcome);
    group.totalValue += outcome.value;
    group.totalSize += outcome.size;
  }

  const groupedPositions = Array.from(byCondition.values());
  logger.info(`Grouped into ${groupedPositions.length} condition(s)`);

  return groupedPositions;
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private maxConcurrent: number;
  private current: number;
  private waitQueue: Array<() => void>;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.waitQueue = [];
  }

  async acquire(): Promise<void> {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return;
    }

    return new Promise(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.current--;
    if (this.waitQueue.length > 0) {
      this.current++;
      const resolve = this.waitQueue.shift()!;
      resolve();
    }
  }
}

/**
 * Main redemption function with enhanced security and reliability
 */
async function main(): Promise<MainResult> {
  const checkOnly = process.argv.includes('--check');
  const setupMode = process.argv.includes('--setup');
  const resetMode = process.argv.includes('--reset');

  console.log('Polymarket Gasless Redemption v2.0 (TypeScript + Viem)');
  console.log('='.repeat(55));

  // Reset mode - delete existing keys and run setup
  if (resetMode) {
    try {
      keyManager.reset();
      console.log('\nRunning setup wizard...\n');
      await keyManager.setupWizard();
      console.log('\n[OK] Setup complete! You can now use --check or run redemptions.');
      return { setup: true, reset: true, redeemed: 0, total: 0 };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Reset/Setup failed:', errorMsg);
      process.exit(1);
    }
  }

  // Setup mode - initialize encrypted key storage
  if (setupMode) {
    try {
      if (keyManager.isSetup()) {
        console.log('[WARNING] Keys are already set up. Use --reset to reconfigure.');
        return { setup: false, message: 'Already configured', redeemed: 0, total: 0 };
      }

      await keyManager.setupWizard();
      console.log('\n[OK] Setup complete! You can now use --check or run redemptions.');
      return { setup: true, redeemed: 0, total: 0 };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ERROR] Setup failed:', errorMsg);
      process.exit(1);
    }
  }

  // Load encrypted keys
  let keys: EncryptedKeys;
  try {
    if (!keyManager.isSetup()) {
      console.log('[ERROR] Keys not configured. Run with --setup first.');
      console.log('   Example: npx tsx src/redeem.ts --setup');
      process.exit(1);
    }

    // Check for password in environment (for automated/interval mode)
    const envPassword = process.env['REDEEM_PASSWORD'] ?? null;
    if (envPassword) {
      logger.debug('Using password from environment variable');
    }

    keys = await keyManager.getKeys(envPassword);
    logger.info('Keys loaded successfully');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERROR] Failed to load keys:', errorMsg);
    process.exit(1);
  }

  // Validate loaded keys
  if (!validators.isValidPrivateKey(keys.privateKey)) {
    console.error('[ERROR] Invalid private key format');
    process.exit(1);
  }

  if (!validators.isValidAddress(keys.funderAddress)) {
    console.error('[ERROR] Invalid funder address format');
    process.exit(1);
  }

  // Initialize wallet with viem
  let wallet: WalletClient;
  let account: Account;
  try {
    account = privateKeyToAccount(keys.privateKey);
    wallet = createWalletClient({
      account,
      chain: polygon,
      transport: http(CONFIG.blockchain.rpcUrl)
    });

    logger.info('Wallet initialized', { address: account.address });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERROR] Failed to initialize wallet:', errorMsg);
    process.exit(1);
  }

  console.log(`EOA: ${account.address}`);
  console.log(`Proxy Wallet: ${keys.funderAddress}`);

  // Get redeemable positions with retry logic
  console.log('\nFetching redeemable positions...');
  let positions: Position[];
  try {
    positions = await getRedeemablePositions(keys.funderAddress);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERROR] Failed to fetch positions:', errorMsg);
    process.exit(1);
  }

  if (positions.length === 0) {
    console.log('No redeemable positions found.');
    return { redeemed: 0, total: 0 };
  }

  console.log(`Found ${positions.length} condition(s) to redeem:\n`);

  let totalValue = 0;
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const title = (pos.title || 'Unknown Market').substring(0, 50);

    console.log(`${i + 1}. ${title}`);
    for (const outcome of pos.outcomes) {
      const status = outcome.value > 0 ? '[WIN]' : '[LOSE]';
      console.log(`   ${outcome.outcome}: Size ${formatCurrency(outcome.size)}, Value $${formatCurrency(outcome.value)} ${status}`);
    }
    console.log(`   Condition Value: $${formatCurrency(pos.totalValue)}`);
    totalValue += pos.totalValue;
  }

  console.log(`\nTotal redeemable: $${formatCurrency(totalValue)}`);

  if (checkOnly) {
    console.log('\n(Check mode - not redeeming)');
    return { redeemed: 0, total: positions.length, checkOnly: true };
  }

  // Initialize RelayClient with enhanced error handling
  console.log('\nInitializing gasless relayer...');

  let client: RelayClient;
  let txManager: TransactionManager;
  try {
    const builderCreds: BuilderApiKeyCreds = {
      key: keys.apiKey,
      secret: keys.apiSecret,
      passphrase: keys.apiPassphrase
    };

    const builderConfig = new BuilderConfig({
      localBuilderCreds: builderCreds
    });

    client = new RelayClient(
      CONFIG.api.relayerUrl,
      CONFIG.blockchain.chainId,
      wallet,
      builderConfig,
      RelayerTxType.PROXY
    );

    txManager = new TransactionManager(client);

    logger.info('Relayer client initialized');
    console.log('[OK] Relayer ready\n');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ERROR] Failed to initialize relayer:', errorMsg);
    process.exit(1);
  }

  // Redeem each condition with concurrency control
  const semaphore = new Semaphore(CONFIG.app.maxConcurrentRedemptions);
  const results: Promise<RedemptionResult>[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]!;
    const title = (pos.title || 'Unknown Market').substring(0, 30);

    console.log(`${i + 1}/${positions.length}. Redeeming: ${title}`);
    console.log(`   Value: $${formatCurrency(pos.totalValue)}`);

    // Use semaphore for concurrency control
    await semaphore.acquire();

    // Execute redemption with timeout and error handling
    const redeemPromise = (async (): Promise<RedemptionResult> => {
      try {
        let tx;
        if (pos.negativeRisk) {
          // For negative risk markets, calculate amounts for each outcome
          const sizes = pos.outcomes.map(o => o.size);
          const amounts = calculateRedeemAmounts(sizes);
          tx = createNegRiskRedeemTx(pos.conditionId, amounts);
          console.log(`   NegRisk redeem, amounts: [${amounts.map(a => a.toString()).join(', ')}]`);
        } else {
          // CTF binary: redeem both outcomes at once
          tx = createCtfRedeemTx(pos.conditionId);
          console.log(`   CTF redeem (both outcomes)`);
        }

        // Execute via relayer with timeout
        const executeWithTimeout = withTimeout(
          client.execute([tx], `Redeem: ${title}`),
          CONFIG.app.redeemTimeout * 1000,
          'Relayer execution timed out'
        );

        const response = await executeWithTimeout;
        console.log(`   Submitted, waiting for confirmation...`);

        const result = await response.wait();
        logger.debug('Transaction result', result);

        // Type assertion for result
        const txResult = result as { transactionHash?: string; state?: string } | null;

        if (txResult?.transactionHash) {
          const txUrl = `https://polygonscan.com/tx/${txResult.transactionHash}`;

          if (txResult.state === TransactionState.STATE_FAILED) {
            console.log(`   FAILED ON-CHAIN! Tx: ${txResult.transactionHash}`);
            console.log(`   ${txUrl}`);
            return { success: false, txHash: txResult.transactionHash as Hex, url: txUrl };
          } else {
            console.log(`   SUCCESS! Tx: ${txResult.transactionHash}`);
            console.log(`   ${txUrl}`);
            return { success: true, txHash: txResult.transactionHash as Hex, url: txUrl };
          }
        } else {
          console.log(`   FAILED - no transaction hash returned`);
          return { success: false, error: 'No transaction hash' };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.log(`   ERROR: ${errorMsg}`);

        // Check if error has transactionHash property
        const errorWithTx = error as { transactionHash?: string };
        if (errorWithTx.transactionHash) {
          console.log(`   Tx: https://polygonscan.com/tx/${errorWithTx.transactionHash}`);
        }

        logger.error('Redemption failed', { error: errorMsg, conditionId: pos.conditionId });
        return { success: false, error: errorMsg };
      } finally {
        semaphore.release();
      }
    })();

    results.push(redeemPromise);

    // Add delay between redemptions to avoid overwhelming the relayer
    if (i < positions.length - 1) {
      await sleep(CONFIG.app.redemptionDelay);
    }
  }

  // Wait for all redemptions to complete
  const redemptionResults = await Promise.all(results);
  const successCount = redemptionResults.filter(r => r.success).length;

  console.log(`\n${'='.repeat(55)}`);
  console.log(`Redemption complete! ${successCount}/${positions.length} successful`);

  // Log successful transactions
  const successfulTxs = redemptionResults.filter(r => r.success && r.txHash);
  if (successfulTxs.length > 0) {
    console.log('\nSuccessful transactions:');
    successfulTxs.forEach((result, index) => {
      console.log(`   ${index + 1}. ${result.url}`);
    });
  }

  return {
    redeemed: successCount,
    total: positions.length,
    transactions: successfulTxs.map(r => r.txHash!).filter((h): h is Hex => h !== undefined)
  };
}

// Run main function with enhanced error handling
main()
  .then(result => {
    // Allow event loop to clean up async handles before exiting
    setTimeout(() => {
      // Setup mode - always exit successfully if setup completed
      if (result.setup !== undefined) {
        process.exit(result.setup ? 0 : 1);
      }

      // Check mode - success if we completed the check without fatal errors
      if (result.checkOnly) {
        logger.info('Check completed successfully');
        process.exit(0);
      }

      // Redemption mode - success if at least some positions were redeemed
      // (partial success is still success, as individual failures are logged)
      const success = result.redeemed > 0 || result.total === 0;
      logger.info('Redemption process completed', {
        successful: result.redeemed,
        total: result.total,
        success
      });

      process.exit(success ? 0 : 1);
    }, 100);
  })
  .catch(error => {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Fatal error in main function', { error: errorMsg });
    console.error('Fatal error:', errorMsg);
    setTimeout(() => process.exit(1), 100);
  });

