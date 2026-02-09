import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

/**
 * Sigma VarianceTracker data layout (key offsets for reading)
 * Adapted from sigma/programs/shared-oracle/src/state.rs
 */
const SIGMA_VARIANCE_VOL_BPS_OFFSET = 72; // u64: annualized vol in bps
const SIGMA_VARIANCE_REGIME_OFFSET = 80;   // u8: VolatilityRegime enum

/**
 * Sigma VolatilityIndex data layout
 */
const SIGMA_VOL_INDEX_7D_OFFSET = 40;  // u64: 7-day avg vol bps
const SIGMA_VOL_INDEX_30D_OFFSET = 48; // u64: 30-day avg vol bps

export class VolOracleSync {
  constructor(
    private connection: Connection,
    private payer: Keypair,
    private matcherProgramId: PublicKey,
    private matcherContext: PublicKey,
    private varianceTracker: PublicKey,
    private volIndex: PublicKey,
  ) {}

  /**
   * Read Sigma oracle accounts and sync to vol-matcher context
   */
  async syncOracle(): Promise<void> {
    // Read Sigma oracle accounts
    const [vtInfo, viInfo] = await Promise.all([
      this.connection.getAccountInfo(this.varianceTracker),
      this.connection.getAccountInfo(this.volIndex),
    ]);

    if (!vtInfo || !viInfo) {
      console.warn("Sigma oracle accounts not found — using fallback values");
      // Use fallback values for testing
      await this.writeSyncInstruction(3000, 3_000_000_000, 2, 2800, 3200);
      return;
    }

    // Parse VarianceTracker
    const currentVolBps = vtInfo.data.readBigUInt64LE(SIGMA_VARIANCE_VOL_BPS_OFFSET);
    const regime = vtInfo.data[SIGMA_VARIANCE_REGIME_OFFSET];

    // Parse VolatilityIndex
    const vol7d = viInfo.data.readBigUInt64LE(SIGMA_VOL_INDEX_7D_OFFSET);
    const vol30d = viInfo.data.readBigUInt64LE(SIGMA_VOL_INDEX_30D_OFFSET);

    // Vol mark price = vol in bps * 1_000_000 (e6 scaling)
    // e.g., 4500 bps (45% vol) → mark = 4_500_000_000
    const volMarkPrice = currentVolBps * 1_000_000n;

    await this.writeSyncInstruction(
      Number(currentVolBps),
      Number(volMarkPrice),
      regime,
      Number(vol7d),
      Number(vol30d),
    );
  }

  private async writeSyncInstruction(
    currentVolBps: number,
    volMarkPrice: number,
    regime: number,
    vol7dBps: number,
    vol30dBps: number,
  ): Promise<void> {
    // Build tag 0x03 instruction data
    const data = Buffer.alloc(34);
    data[0] = 0x03;
    data.writeBigUInt64LE(BigInt(currentVolBps), 1);
    data.writeBigUInt64LE(BigInt(volMarkPrice), 9);
    data[17] = regime;
    data.writeBigUInt64LE(BigInt(vol7dBps), 18);
    data.writeBigUInt64LE(BigInt(vol30dBps), 26);

    const ix = new TransactionInstruction({
      programId: this.matcherProgramId,
      keys: [
        { pubkey: this.matcherContext, isSigner: false, isWritable: true },
        { pubkey: this.varianceTracker, isSigner: false, isWritable: false },
        { pubkey: this.volIndex, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
    console.log(`Oracle synced: vol=${currentVolBps}bps regime=${regime} tx=${sig}`);
  }
}
