/**
 * Secure Key Management System
 * Encrypts sensitive data using AES-256-GCM
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { EncryptedKeys, EncryptedData } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class KeyManager {
  private keyFile: string;
  private algorithm: string;
  private keyLength: number;
  private ivLength: number;

  constructor() {
    this.keyFile = path.join(__dirname, '..', '.encrypted_keys');
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, this.keyLength, 'sha256');
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  private encrypt(data: EncryptedKeys, password: string): EncryptedData {
    const salt = crypto.randomBytes(32);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(this.ivLength);

    const cipher = crypto.createCipheriv(this.algorithm, key, iv) as crypto.CipherGCM;
    cipher.setAAD(salt);

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      encrypted,
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   */
  private decrypt(encryptedData: EncryptedData, password: string): EncryptedKeys {
    const { salt, iv, encrypted, tag } = encryptedData;

    const saltBuffer = Buffer.from(salt, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const tagBuffer = Buffer.from(tag, 'hex');

    const key = this.deriveKey(password, saltBuffer);

    const decipher = crypto.createDecipheriv(this.algorithm, key, ivBuffer) as crypto.DecipherGCM;
    decipher.setAAD(saltBuffer);
    decipher.setAuthTag(tagBuffer);

    try {
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted) as EncryptedKeys;
    } catch {
      throw new Error('Invalid password or corrupted key file');
    }
  }

  /**
   * Store encrypted keys to file
   */
  storeKeys(keys: EncryptedKeys, password: string): void {
    const encrypted = this.encrypt(keys, password);
    fs.writeFileSync(this.keyFile, JSON.stringify(encrypted, null, 2));
    
    // Set restrictive permissions (ignore errors on Windows)
    try {
      fs.chmodSync(this.keyFile, 0o600);
    } catch {
      // Ignore on Windows
    }
  }

  /**
   * Load encrypted keys from file
   */
  loadKeys(password: string): EncryptedKeys {
    if (!fs.existsSync(this.keyFile)) {
      throw new Error('Key file not found. Run setup first.');
    }

    const encryptedData = JSON.parse(
      fs.readFileSync(this.keyFile, 'utf8')
    ) as EncryptedData;
    
    return this.decrypt(encryptedData, password);
  }

  /**
   * Create readline interface for user input
   */
  private createReadline(): readline.Interface {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * Ask a question and get user input
   */
  private ask(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer));
    });
  }

  /**
   * Setup wizard for first-time key storage
   */
  async setupWizard(): Promise<EncryptedKeys> {
    const rl = this.createReadline();

    try {
      console.log('Secure Key Setup Wizard');
      console.log('==========================');

      const privateKey = await this.ask(rl, 'Enter your wallet private key: ');
      const funderAddress = await this.ask(rl, 'Enter your Polymarket proxy wallet address: ');
      const apiKey = await this.ask(rl, 'Enter your Builder API key: ');
      const apiSecret = await this.ask(rl, 'Enter your Builder API secret: ');
      const apiPassphrase = await this.ask(rl, 'Enter your Builder API passphrase: ');

      console.log('\nPassword Protection Setup');
      const password = await this.ask(rl, 'Create a password to encrypt your keys: ');
      const confirmPassword = await this.ask(rl, 'Confirm password: ');

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      const keys: EncryptedKeys = {
        privateKey: privateKey.trim() as `0x${string}`,
        funderAddress: funderAddress.trim() as `0x${string}`,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        apiPassphrase: apiPassphrase.trim()
      };

      this.storeKeys(keys, password);

      console.log('[OK] Keys encrypted and stored securely!');
      console.log('Key file created:', this.keyFile);

      return keys;
    } finally {
      rl.close();
    }
  }

  /**
   * Get keys (with password prompt if needed)
   */
  async getKeys(password: string | null = null): Promise<EncryptedKeys> {
    if (!password) {
      const rl = this.createReadline();

      return new Promise((resolve, reject) => {
        rl.question('Enter your encryption password: ', (pwd) => {
          rl.close();
          try {
            const keys = this.loadKeys(pwd);
            resolve(keys);
          } catch (error) {
            reject(error);
          }
        });
      });
    } else {
      return this.loadKeys(password);
    }
  }

  /**
   * Check if keys are already set up
   */
  isSetup(): boolean {
    return fs.existsSync(this.keyFile);
  }

  /**
   * Reset/delete encrypted keys file
   */
  reset(): boolean {
    if (fs.existsSync(this.keyFile)) {
      fs.unlinkSync(this.keyFile);
      console.log('[OK] Encrypted keys file deleted');
      return true;
    } else {
      console.log('[INFO] No keys file found to delete');
      return false;
    }
  }
}

export default new KeyManager();

