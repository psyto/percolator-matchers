/**
 * BTC Market Keeper Crank
 *
 * Continuously cranks the Percolator BTC market to keep it fresh:
 * - Updates oracle price from Pyth BTC/USD
 * - Processes funding payments
 * - Sweeps account maintenance
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { encodeKeeperCrank } from "../../../../percolator-cli/src/abi/instructions.js";
import {
  ACCOUNTS_KEEPER_CRANK,
  buildAccountMetas,
} from "../../../../percolator-cli/src/abi/accounts.js";
import { buildIx } from "../../../../percolator-cli/src/runtime/tx.js";

const CRANK_NO_CALLER = 65535;

export class BtcCrank {
  constructor(
    private connection: Connection,
    private payer: Keypair,
    private programId: PublicKey,
    private slab: PublicKey,
    private oracle: PublicKey,
  ) {}

  private async runCrank(): Promise<string> {
    const crankData = encodeKeeperCrank({
      callerIdx: CRANK_NO_CALLER,
      allowPanic: false,
    });

    const keys = buildAccountMetas(ACCOUNTS_KEEPER_CRANK, [
      this.payer.publicKey,
      this.slab,
      SYSVAR_CLOCK_PUBKEY,
      this.oracle,
    ]);

    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(buildIx({ programId: this.programId, keys, data: crankData }));

    return await sendAndConfirmTransaction(this.connection, tx, [this.payer], {
      commitment: "confirmed",
      skipPreflight: true,
    });
  }

  async run(intervalMs: number): Promise<void> {
    let crankCount = 0;
    let consecutiveErrors = 0;

    while (true) {
      try {
        const sig = await this.runCrank();
        crankCount++;
        consecutiveErrors = 0;
        if (crankCount % 10 === 0) {
          console.log(
            `[${new Date().toISOString()}] BTC crank #${crankCount} OK: ${sig.slice(0, 16)}...`
          );
        }
      } catch (err: any) {
        consecutiveErrors++;
        const msg = err.message || String(err);

        // Suppress stale-crank noise (normal when no activity)
        if (!msg.includes("CrankTooSoon") && !msg.includes("0x1775")) {
          console.error(
            `[${new Date().toISOString()}] BTC crank error (${consecutiveErrors}): ${msg.slice(0, 120)}`
          );
        }

        // Back off on consecutive errors
        if (consecutiveErrors > 10) {
          console.warn("Too many consecutive crank errors, backing off 30s...");
          await new Promise((r) => setTimeout(r, 30_000));
          consecutiveErrors = 0;
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
