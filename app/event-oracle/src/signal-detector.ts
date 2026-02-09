/**
 * Signal severity levels (adapted from Kalshify's IntelSignal types)
 */
export enum SignalSeverity {
  NONE = 0,
  LOW = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface Signal {
  severity: SignalSeverity;
  type: string;
  description: string;
}

/**
 * Detects unusual market activity that should widen spreads
 * Adapted from Kalshify's signal intelligence patterns
 */
export class SignalDetector {
  private priceHistory: number[] = [];
  private readonly maxHistory = 100;

  /**
   * Detect signals based on probability movement
   */
  detect(currentProbability: number): Signal {
    this.priceHistory.push(currentProbability);
    if (this.priceHistory.length > this.maxHistory) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < 3) {
      return { severity: SignalSeverity.NONE, type: "NONE", description: "Insufficient data" };
    }

    // Check for rapid price movement (PRICE_MOVE signal)
    const prev = this.priceHistory[this.priceHistory.length - 2];
    const change = Math.abs(currentProbability - prev);

    if (change > 100_000) {
      // >10% move in one update → CRITICAL
      return {
        severity: SignalSeverity.CRITICAL,
        type: "PRICE_MOVE",
        description: `Rapid probability shift: ${(change / 10_000).toFixed(1)}%`,
      };
    }

    if (change > 50_000) {
      // >5% move → HIGH
      return {
        severity: SignalSeverity.HIGH,
        type: "PRICE_MOVE",
        description: `Significant probability shift: ${(change / 10_000).toFixed(1)}%`,
      };
    }

    if (change > 20_000) {
      // >2% move → LOW
      return {
        severity: SignalSeverity.LOW,
        type: "PRICE_MOVE",
        description: `Notable probability shift: ${(change / 10_000).toFixed(1)}%`,
      };
    }

    // Check for volatility clustering (vol-of-probability)
    if (this.priceHistory.length >= 10) {
      const recent = this.priceHistory.slice(-10);
      const changes = [];
      for (let i = 1; i < recent.length; i++) {
        changes.push(Math.abs(recent[i] - recent[i - 1]));
      }
      const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;

      if (avgChange > 30_000) {
        return {
          severity: SignalSeverity.HIGH,
          type: "VOLATILITY_CLUSTER",
          description: `High probability volatility: avg ${(avgChange / 10_000).toFixed(1)}% per update`,
        };
      }
    }

    return { severity: SignalSeverity.NONE, type: "NONE", description: "Normal activity" };
  }
}
