/**
 * Transaction Manager
 * Handles transaction querying and polling for the Polymarket relayer
 */

import type { RelayClient } from '@polymarket/builder-relayer-client';
import { logger } from './utils.js';

/**
 * Transaction states from the relayer
 */
export enum TransactionState {
  STATE_PENDING = 'STATE_PENDING',
  STATE_EXECUTED = 'STATE_EXECUTED',
  STATE_CONFIRMED = 'STATE_CONFIRMED',
  STATE_FAILED = 'STATE_FAILED'
}

/**
 * Transaction query result - flexible type for relayer responses
 */
export interface TransactionInfo {
  id?: string;
  state?: string;
  transactionHash?: string;
  proxyAddress?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Transaction Manager class
 * Provides methods for querying and polling transaction status
 */
export class TransactionManager {
  private client: RelayClient;

  constructor(client: RelayClient) {
    this.client = client;
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(id: string): Promise<TransactionInfo | null> {
    try {
      const result = await this.client.getTransaction(id);
      logger.debug('Got transaction', { id, result });
      return result as unknown as TransactionInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get transaction', { id, error: errorMsg });
      return null;
    }
  }

  /**
   * Get all transactions for the current wallet
   */
  async getTransactions(): Promise<TransactionInfo[]> {
    try {
      const result = await this.client.getTransactions();
      logger.debug('Got transactions', { count: Array.isArray(result) ? result.length : 0 });
      return (result as unknown as TransactionInfo[]) ?? [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get transactions', { error: errorMsg });
      return [];
    }
  }

  /**
   * Poll until transaction reaches confirmed state
   * @param id - Transaction ID to poll
   * @param timeoutMs - Maximum time to wait (default: 120 seconds)
   */
  async pollUntilConfirmed(id: string, timeoutMs: number = 120000): Promise<TransactionInfo | null> {
    try {
      const states = [TransactionState.STATE_CONFIRMED];
      const result = await this.client.pollUntilState(id, states, String(timeoutMs));
      logger.info('Transaction confirmed', { id, result });
      return result as unknown as TransactionInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Poll until confirmed failed', { id, error: errorMsg });
      return null;
    }
  }

  /**
   * Poll until transaction is executed (on-chain but maybe not confirmed)
   * @param id - Transaction ID to poll
   * @param timeoutMs - Maximum time to wait (default: 60 seconds)
   */
  async pollUntilExecuted(id: string, timeoutMs: number = 60000): Promise<TransactionInfo | null> {
    try {
      const states = [
        TransactionState.STATE_EXECUTED,
        TransactionState.STATE_CONFIRMED
      ];
      const result = await this.client.pollUntilState(id, states, String(timeoutMs));
      logger.info('Transaction executed', { id, result });
      return result as unknown as TransactionInfo;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Poll until executed failed', { id, error: errorMsg });
      return null;
    }
  }

  /**
   * Wait for execution with detailed status updates
   * Uses the built-in wait() method from the execute response
   */
  async waitWithProgress(
    executeResponse: { wait: () => Promise<unknown>; id?: string },
    description: string = 'Transaction'
  ): Promise<TransactionInfo | null> {
    console.log(`   ${description}: Submitted, waiting for confirmation...`);
    
    try {
      const result = await executeResponse.wait();
      const info = result as TransactionInfo;
      
      if (info?.transactionHash) {
        const txUrl = `https://polygonscan.com/tx/${info.transactionHash}`;
        
        if (info.state === TransactionState.STATE_FAILED) {
          console.log(`   ${description}: FAILED ON-CHAIN!`);
          console.log(`   Tx: ${info.transactionHash}`);
          console.log(`   ${txUrl}`);
        } else {
          console.log(`   ${description}: SUCCESS!`);
          console.log(`   Tx: ${info.transactionHash}`);
          console.log(`   ${txUrl}`);
        }
      } else {
        console.log(`   ${description}: FAILED - no transaction hash returned`);
      }
      
      return info;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ${description}: ERROR - ${errorMsg}`);
      logger.error('Wait with progress failed', { description, error: errorMsg });
      return null;
    }
  }

  /**
   * Get recent failed transactions
   */
  async getFailedTransactions(): Promise<TransactionInfo[]> {
    const transactions = await this.getTransactions();
    return transactions.filter(tx => tx.state === TransactionState.STATE_FAILED);
  }

  /**
   * Get recent successful transactions
   */
  async getSuccessfulTransactions(): Promise<TransactionInfo[]> {
    const transactions = await this.getTransactions();
    return transactions.filter(tx => 
      tx.state === TransactionState.STATE_CONFIRMED ||
      tx.state === TransactionState.STATE_EXECUTED
    );
  }
}

