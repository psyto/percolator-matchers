import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { withRetry } from "../../shared/retry";

/**
 * Handle event resolution and market settlement
 */
export class EventSettlement {
  constructor(
    private connection: Connection,
    private oracleKeypair: Keypair,
    private matcherProgramId: PublicKey,
    private matcherContext: PublicKey,
  ) {}

  /**
   * Resolve the event market with outcome
   */
  async resolve(outcome: 0 | 1): Promise<string> {
    const data = Buffer.alloc(2);
    data[0] = 0x04; // Resolve tag
    data[1] = outcome;

    const ix = new TransactionInstruction({
      programId: this.matcherProgramId,
      keys: [
        { pubkey: this.matcherContext, isSigner: false, isWritable: true },
        { pubkey: this.oracleKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await withRetry(
      () => sendAndConfirmTransaction(this.connection, tx, [this.oracleKeypair]),
      { onRetry: (err, attempt, delay) => console.log(`[SETTLEMENT] retry ${attempt} in ${delay}ms: ${err}`) },
    );

    console.log(`Event resolved: outcome=${outcome === 1 ? "YES" : "NO"} tx=${sig}`);
    return sig;
  }
}
