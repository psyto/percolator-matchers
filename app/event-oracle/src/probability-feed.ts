import {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { KalshiAdapter } from "./kalshi-adapter";
import { PolymarketAdapter } from "./polymarket-adapter";
import { SignalDetector, SignalSeverity } from "./signal-detector";

export class ProbabilityFeed {
  private kalshi: KalshiAdapter;
  private polymarket: PolymarketAdapter;
  private signalDetector: SignalDetector;

  constructor(
    private connection: Connection,
    private payer: Keypair,
    private matcherProgramId: PublicKey,
    private matcherContext: PublicKey,
    private eventOracle: PublicKey,
  ) {
    this.kalshi = new KalshiAdapter();
    this.polymarket = new PolymarketAdapter();
    this.signalDetector = new SignalDetector();
  }

  /**
   * Fetch probability from sources, detect signals, and update on-chain
   */
  async updateProbability(): Promise<void> {
    // Aggregate probability from multiple sources
    const kalshiProb = await this.kalshi.getProbability();
    const polyProb = await this.polymarket.getProbability();

    // Weighted median: Polymarket 40%, Kalshi 40%, internal 20%
    // For now, simple average of available sources
    const sources: number[] = [];
    if (kalshiProb !== null) sources.push(kalshiProb);
    if (polyProb !== null) sources.push(polyProb);

    if (sources.length === 0) {
      console.warn("No probability sources available — skipping update");
      return;
    }

    const avgProbability = Math.round(
      sources.reduce((a, b) => a + b, 0) / sources.length
    );

    // Clamp to valid range
    const probability = Math.max(0, Math.min(1_000_000, avgProbability));

    // Detect signals
    const signal = this.signalDetector.detect(probability);

    // Compute signal-adjusted spread
    const signalSpread = this.computeSignalSpread(signal.severity);

    // Write to chain
    await this.writeProbabilitySync(probability, signal.severity, signalSpread);

    console.log(
      `Probability updated: ${(probability / 10_000).toFixed(2)}% | ` +
      `Signal: ${SignalSeverity[signal.severity]} | ` +
      `Spread adj: ${signalSpread} bps`
    );
  }

  private computeSignalSpread(severity: SignalSeverity): number {
    switch (severity) {
      case SignalSeverity.NONE: return 0;
      case SignalSeverity.LOW: return 10;
      case SignalSeverity.HIGH: return 30;
      case SignalSeverity.CRITICAL: return 75;
      default: return 0;
    }
  }

  private async writeProbabilitySync(
    probability: number,
    signalSeverity: SignalSeverity,
    signalSpread: number,
  ): Promise<void> {
    const data = Buffer.alloc(25);
    data[0] = 0x03; // Probability sync tag
    data.writeBigUInt64LE(BigInt(probability), 1);
    data.writeBigUInt64LE(BigInt(signalSeverity), 9);
    data.writeBigUInt64LE(BigInt(signalSpread), 17);

    const ix = new TransactionInstruction({
      programId: this.matcherProgramId,
      keys: [
        { pubkey: this.matcherContext, isSigner: false, isWritable: true },
        { pubkey: this.eventOracle, isSigner: false, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
    console.log(`  tx: ${sig}`);
  }
}
