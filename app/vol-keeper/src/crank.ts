import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { execSync } from "child_process";

/**
 * Percolator keeper crank wrapper
 * After oracle sync, call Percolator's keeper crank to update funding rates
 */
export class PercolatorCrank {
  constructor(
    private connection: Connection,
    private payer: Keypair,
    private percolatorCliPath: string,
    private marketPubkey: PublicKey,
  ) {}

  /**
   * Run Percolator keeper crank
   * Updates funding rates, processes liquidations, etc.
   */
  async crank(): Promise<void> {
    try {
      const cmd = `${this.percolatorCliPath} crank --market ${this.marketPubkey.toBase58()}`;
      const output = execSync(cmd, { encoding: "utf-8", timeout: 30_000 });
      console.log(`Percolator crank: ${output.trim()}`);
    } catch (err) {
      console.error("Percolator crank failed:", err);
    }
  }

  /**
   * Update oracle authority price (for Hyperp mode)
   * Sets the "index" price that Percolator uses for funding rate
   */
  async updateOracleAuthority(priceE6: bigint): Promise<void> {
    try {
      const cmd = `${this.percolatorCliPath} update-oracle-price --market ${this.marketPubkey.toBase58()} --price ${priceE6}`;
      const output = execSync(cmd, { encoding: "utf-8", timeout: 30_000 });
      console.log(`Oracle authority updated: price=${priceE6} ${output.trim()}`);
    } catch (err) {
      console.error("Oracle authority update failed:", err);
    }
  }
}
