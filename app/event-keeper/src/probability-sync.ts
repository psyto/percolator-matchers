import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { execSync } from "child_process";

/**
 * Reads probability from matcher context and pushes to Percolator oracle authority
 */
export class ProbabilitySync {
  private percolatorCliPath: string;

  constructor(
    private connection: Connection,
    private payer: Keypair,
    private marketPubkey: PublicKey,
    private matcherContext: PublicKey,
  ) {
    this.percolatorCliPath = process.env.PERCOLATOR_CLI || "percolator-cli";
  }

  /**
   * Read current probability from matcher context and update Percolator oracle
   */
  async syncProbabilityToOracle(): Promise<void> {
    const accountInfo = await this.connection.getAccountInfo(this.matcherContext);
    if (!accountInfo) {
      console.warn("Matcher context not found");
      return;
    }

    const data = accountInfo.data;

    // Read current probability from context
    const probability = data.readBigUInt64LE(128);
    const isResolved = data[160];

    // Update Percolator oracle authority price
    try {
      const cmd = `${this.percolatorCliPath} update-oracle-price --market ${this.marketPubkey.toBase58()} --price ${probability}`;
      execSync(cmd, { encoding: "utf-8", timeout: 30_000 });
      console.log(`Oracle synced: probability=${probability} resolved=${isResolved}`);
    } catch (err) {
      console.error("Oracle sync failed:", err);
    }

    // Crank Percolator
    try {
      const cmd = `${this.percolatorCliPath} crank --market ${this.marketPubkey.toBase58()}`;
      execSync(cmd, { encoding: "utf-8", timeout: 30_000 });
    } catch (err) {
      console.error("Crank failed:", err);
    }
  }
}
