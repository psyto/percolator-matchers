import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { FredDataSource } from "./data-sources";
import { MacroSignalDetector } from "./macro-signal-detector";

/**
 * Rate offset: +500 bps (+5.00%) to keep mark price positive.
 * Matches RATE_OFFSET in state.rs.
 */
const RATE_OFFSET = 500;

/**
 * Compute mark price from real rate in bps.
 * mark_price_e6 = max(0, (real_rate_bps + RATE_OFFSET) * 10_000)
 */
function computeMarkPrice(realRateBps: number): number {
  const shifted = realRateBps + RATE_OFFSET;
  if (shifted <= 0) return 0;
  return shifted * 10_000;
}

/**
 * Pack nominal and inflation into a single u64:
 * high 32 bits = nominal (u32), low 32 bits = inflation (u32)
 */
function packComponents(nominalBps: number, inflationBps: number): bigint {
  // Clamp to u32 range
  const nom = Math.max(0, nominalBps) & 0xFFFFFFFF;
  const inf = Math.max(0, inflationBps) & 0xFFFFFFFF;
  return (BigInt(nom) << 32n) | BigInt(inf);
}

export class MacroOracleSync {
  private fredSource: FredDataSource;
  private signalDetector: MacroSignalDetector;

  constructor(
    private connection: Connection,
    private payer: Keypair,
    private matcherProgramId: PublicKey,
    private matcherContext: PublicKey,
    private macroOracle: PublicKey,
    fredApiKey: string,
  ) {
    this.fredSource = new FredDataSource(fredApiKey);
    this.signalDetector = new MacroSignalDetector();
  }

  /**
   * Fetch FRED data, compute real rate, and sync to macro-matcher context.
   * Sends tag 0x03 (IndexSync) instruction.
   */
  async syncOracle(): Promise<void> {
    const { nominalBps, inflationBps, realRateBps } =
      await this.fredSource.fetchRealRate();

    const markPrice = computeMarkPrice(realRateBps);
    const componentsPacked = packComponents(nominalBps, inflationBps);

    // Signal intelligence: detect macro anomalies from rate data
    const signal = this.signalDetector.detect(nominalBps, inflationBps, realRateBps);
    const signalSeverity = signal.severity;
    const signalAdjustedSpread = this.signalDetector.computeSpread(signal.severity);

    await this.writeSyncInstruction(
      markPrice,
      componentsPacked,
      signalSeverity,
      signalAdjustedSpread,
    );

    const severityNames = ["NONE", "LOW", "HIGH", "CRITICAL"];
    console.log(
      `Synced: real=${realRateBps}bps mark=${markPrice} ` +
      `nom=${nominalBps} inf=${inflationBps} | ` +
      `Signal: ${severityNames[signalSeverity]} spread_adj=${signalAdjustedSpread}bps` +
      (signal.type !== "NONE" ? ` (${signal.type}: ${signal.description})` : "")
    );
  }

  /**
   * Build and send tag 0x03 (IndexSync) instruction.
   * Data layout:
   *   [0]     tag (0x03)
   *   [1..9]  current_index_e6 (u64 LE)
   *   [9..17] index_components_packed (u64 LE)
   *   [17..25] signal_severity (u64 LE)
   *   [25..33] signal_adjusted_spread (u64 LE)
   */
  private async writeSyncInstruction(
    markPrice: number,
    componentsPacked: bigint,
    signalSeverity: number,
    signalAdjustedSpread: number,
  ): Promise<void> {
    const data = Buffer.alloc(33);
    data[0] = 0x03; // IndexSync tag
    data.writeBigUInt64LE(BigInt(markPrice), 1);
    data.writeBigUInt64LE(componentsPacked, 9);
    data.writeBigUInt64LE(BigInt(signalSeverity), 17);
    data.writeBigUInt64LE(BigInt(signalAdjustedSpread), 25);

    const ix = new TransactionInstruction({
      programId: this.matcherProgramId,
      keys: [
        { pubkey: this.matcherContext, isSigner: false, isWritable: true },
        { pubkey: this.macroOracle, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
    console.log(`IndexSync tx: ${sig}`);
  }
}
