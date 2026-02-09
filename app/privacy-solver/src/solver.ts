import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { SolverConfig, EncryptedIntent, DecryptedIntent } from "./config";
import { decrypt, deserializeIntent } from "./encryption";
import * as fs from "fs";

export class PrivacyPerpsSolver {
  private connection: Connection;
  private solverKeypair: Keypair;
  private config: SolverConfig;
  private running: boolean = false;
  private intentQueue: EncryptedIntent[] = [];

  constructor(config: SolverConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl, "confirmed");
    const keyData = JSON.parse(fs.readFileSync(config.solverKeypairPath, "utf-8"));
    this.solverKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));
  }

  /**
   * Start the solver service
   */
  async start(): Promise<void> {
    this.running = true;
    console.log(`Privacy Perps Solver started`);
    console.log(`  Solver: ${this.solverKeypair.publicKey.toBase58()}`);
    console.log(`  Matcher: ${this.config.matcherProgramId.toBase58()}`);
    console.log(`  Poll interval: ${this.config.pollIntervalMs}ms`);

    while (this.running) {
      try {
        await this.pollAndProcess();
      } catch (err) {
        console.error("Solver error:", err);
      }
      await this.sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Stop the solver service
   */
  stop(): void {
    this.running = false;
    console.log("Solver stopping...");
  }

  /**
   * Poll for encrypted intents, decrypt, validate, price, and execute
   */
  private async pollAndProcess(): Promise<void> {
    // In production, this would poll a WebSocket or on-chain queue
    // For now, process any queued intents
    if (this.intentQueue.length === 0) return;

    const intent = this.intentQueue.shift()!;
    console.log(`Processing intent ${intent.id} from ${intent.userPubkey}`);

    // Step 1: Decrypt
    const decrypted = this.decryptIntent(intent);
    if (!decrypted) {
      console.error(`Failed to decrypt intent ${intent.id}`);
      return;
    }

    // Step 2: Validate
    if (!this.validateIntent(decrypted)) {
      console.error(`Intent ${intent.id} failed validation`);
      return;
    }

    // Step 3: Get current oracle price and update matcher context
    const oraclePrice = await this.fetchOraclePrice();
    await this.updateOraclePrice(oraclePrice);

    // Step 4: Execute trade via Percolator CPI
    await this.executeTrade(decrypted, oraclePrice);
  }

  /**
   * Decrypt an encrypted intent
   */
  private decryptIntent(intent: EncryptedIntent): DecryptedIntent | null {
    try {
      const decryptedBytes = decrypt(
        intent.encryptedPayload,
        intent.nonce,
        intent.userEphemeralPubkey,
        this.solverKeypair.secretKey.slice(0, 32) // X25519 secret key
      );
      const parsed = deserializeIntent(decryptedBytes);
      return {
        id: intent.id,
        userPubkey: intent.userPubkey,
        ...parsed,
      };
    } catch (err) {
      console.error(`Decryption error: ${err}`);
      return null;
    }
  }

  /**
   * Validate a decrypted intent
   */
  private validateIntent(intent: DecryptedIntent): boolean {
    const now = BigInt(Math.floor(Date.now() / 1000));

    // Check deadline
    if (intent.deadline > 0n && now > intent.deadline) {
      console.error(`Intent ${intent.id} expired: deadline=${intent.deadline}, now=${now}`);
      return false;
    }

    // Check slippage tolerance
    if (intent.maxSlippageBps > this.config.maxSlippageBps) {
      console.error(`Intent ${intent.id} slippage too high: ${intent.maxSlippageBps} > ${this.config.maxSlippageBps}`);
      return false;
    }

    // Check size is non-zero
    if (intent.size === 0n) {
      console.error(`Intent ${intent.id} has zero size`);
      return false;
    }

    return true;
  }

  /**
   * Fetch current oracle price (placeholder — integrate with Pyth/Switchboard)
   */
  private async fetchOraclePrice(): Promise<bigint> {
    // In production: read from Pyth or Switchboard oracle
    // For now, return a placeholder
    return 100_000_000n; // $100.00 in e6
  }

  /**
   * Update oracle price in matcher context (Tag 0x03)
   */
  private async updateOraclePrice(price: bigint): Promise<void> {
    const data = Buffer.alloc(9);
    data[0] = 0x03; // Oracle update tag
    data.writeBigUInt64LE(price, 1);

    const ix = new TransactionInstruction({
      programId: this.config.matcherProgramId,
      keys: [
        { pubkey: this.solverKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: this.config.matcherContextAccount, isSigner: false, isWritable: true },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.solverKeypair]);
    console.log(`Oracle updated: price=${price}, tx=${sig}`);
  }

  /**
   * Execute trade via Percolator's trade-cpi
   */
  private async executeTrade(intent: DecryptedIntent, oraclePrice: bigint): Promise<void> {
    // In production, this calls percolator-cli trade-cpi
    // The CLI constructs the CPI transaction that invokes Percolator,
    // which in turn CPI's into our privacy-matcher for pricing
    console.log(`Executing trade: user=${intent.userPubkey}, size=${intent.size}, oracle=${oraclePrice}`);
    console.log(`  Would call: percolator-cli trade-cpi --size ${intent.size} --matcher ${this.config.matcherProgramId.toBase58()}`);
  }

  /**
   * Add an encrypted intent to the queue (called by WebSocket handler)
   */
  addIntent(intent: EncryptedIntent): void {
    this.intentQueue.push(intent);
    console.log(`Intent ${intent.id} queued (queue size: ${this.intentQueue.length})`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
