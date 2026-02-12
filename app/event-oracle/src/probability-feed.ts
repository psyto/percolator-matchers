import {
  Connection, Keypair, PublicKey, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import { KalshiAdapter } from "./kalshi-adapter";
import { PolymarketAdapter } from "./polymarket-adapter";
import { SignalDetector, SignalSeverity } from "./signal-detector";
import { withRetry } from "../../shared/retry";

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

    if (kalshiProb === null && polyProb === null) {
      console.warn("No probability sources available — skipping update");
      return;
    }

    // Weighted aggregation: Kalshi 40%, Polymarket 40%, Internal 20%
    // Internal estimate defaults to the average of available external sources
    const avgProbability = this.computeWeightedProbability(kalshiProb, polyProb);

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

  /**
   * Compute weighted probability: Kalshi 40%, Polymarket 40%, Internal 20%
   * Internal estimate defaults to the average of available external sources.
   * When only one source is available, it gets 80% weight and internal gets 20%.
   */
  private computeWeightedProbability(
    kalshiProb: number | null,
    polyProb: number | null,
  ): number {
    if (kalshiProb !== null && polyProb !== null) {
      const internalProb = Math.round((kalshiProb + polyProb) / 2);
      return Math.round(
        kalshiProb * 0.40 + polyProb * 0.40 + internalProb * 0.20
      );
    }

    // Single source available: 80% external, 20% internal (which equals itself)
    const singleProb = (kalshiProb ?? polyProb)!;
    return singleProb;
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
    const sig = await withRetry(
      () => sendAndConfirmTransaction(this.connection, tx, [this.payer]),
      { onRetry: (err, attempt, delay) => console.log(`  retry ${attempt} in ${delay}ms: ${err}`) },
    );
    console.log(`  tx: ${sig}`);
  }
}
