/**
 * Macro Signal Intelligence Detector
 *
 * Detects abnormal conditions in macroeconomic rate data
 * and maps them to signal severity levels for spread adjustment.
 *
 * Signals detected:
 * - Rate velocity: rapid changes in SOFR or inflation
 * - Yield curve inversion: negative real rates
 * - Inflation shock: sudden inflation expectation spikes
 * - Rate volatility clustering: sustained high variance in rates
 */

export enum SignalSeverity {
  NONE = 0,
  LOW = 1,
  HIGH = 2,
  CRITICAL = 3,
}

export interface MacroSignal {
  severity: SignalSeverity;
  type: string;
  description: string;
}

/**
 * Signal-adjusted spread mapping for macro signals (bps)
 * These are wider than event-side because macro dislocations affect all markets.
 */
const MACRO_SIGNAL_SPREAD: Record<SignalSeverity, number> = {
  [SignalSeverity.NONE]: 0,
  [SignalSeverity.LOW]: 15,
  [SignalSeverity.HIGH]: 50,
  [SignalSeverity.CRITICAL]: 100,
};

export class MacroSignalDetector {
  private sofrHistory: number[] = [];
  private inflationHistory: number[] = [];
  private realRateHistory: number[] = [];
  private readonly maxHistory = 50;

  /**
   * Detect the highest-severity macro signal from current rate data.
   * Returns the most severe signal found across all detection methods.
   */
  detect(
    nominalBps: number,
    inflationBps: number,
    realRateBps: number,
  ): MacroSignal {
    this.sofrHistory.push(nominalBps);
    this.inflationHistory.push(inflationBps);
    this.realRateHistory.push(realRateBps);

    if (this.sofrHistory.length > this.maxHistory) {
      this.sofrHistory.shift();
      this.inflationHistory.shift();
      this.realRateHistory.shift();
    }

    // Run all detectors and take the highest severity
    const signals: MacroSignal[] = [
      this.detectYieldCurveInversion(realRateBps),
      this.detectRateVelocity(this.sofrHistory, "SOFR"),
      this.detectInflationShock(),
      this.detectRateVolatilityClustering(),
    ];

    let worst: MacroSignal = {
      severity: SignalSeverity.NONE,
      type: "NONE",
      description: "Normal macro conditions",
    };

    for (const signal of signals) {
      if (signal.severity > worst.severity) {
        worst = signal;
      }
    }

    return worst;
  }

  /**
   * Map signal severity to spread adjustment in basis points.
   */
  computeSpread(severity: SignalSeverity): number {
    return MACRO_SIGNAL_SPREAD[severity];
  }

  /**
   * Detect yield curve inversion based on real rate.
   * Deeply negative real rates signal recession risk.
   */
  private detectYieldCurveInversion(realRateBps: number): MacroSignal {
    if (realRateBps < -200) {
      return {
        severity: SignalSeverity.CRITICAL,
        type: "YIELD_CURVE_INVERSION",
        description: `Deep inversion: real rate ${realRateBps} bps`,
      };
    }
    if (realRateBps < -50) {
      return {
        severity: SignalSeverity.HIGH,
        type: "YIELD_CURVE_INVERSION",
        description: `Moderate inversion: real rate ${realRateBps} bps`,
      };
    }
    if (realRateBps < 0) {
      return {
        severity: SignalSeverity.LOW,
        type: "YIELD_CURVE_INVERSION",
        description: `Mild inversion: real rate ${realRateBps} bps`,
      };
    }
    return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
  }

  /**
   * Detect rapid rate changes (velocity).
   * Large inter-update changes in SOFR indicate policy shifts.
   */
  private detectRateVelocity(
    history: number[],
    label: string,
  ): MacroSignal {
    if (history.length < 2) {
      return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
    }

    const prev = history[history.length - 2];
    const current = history[history.length - 1];
    const change = Math.abs(current - prev);

    if (change > 50) {
      return {
        severity: SignalSeverity.CRITICAL,
        type: "RATE_VELOCITY",
        description: `${label} moved ${change} bps in one update`,
      };
    }
    if (change > 25) {
      return {
        severity: SignalSeverity.HIGH,
        type: "RATE_VELOCITY",
        description: `${label} moved ${change} bps in one update`,
      };
    }
    if (change > 10) {
      return {
        severity: SignalSeverity.LOW,
        type: "RATE_VELOCITY",
        description: `${label} moved ${change} bps in one update`,
      };
    }

    return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
  }

  /**
   * Detect inflation expectation shocks.
   * Sudden moves in breakeven inflation signal CPI surprises.
   */
  private detectInflationShock(): MacroSignal {
    if (this.inflationHistory.length < 2) {
      return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
    }

    const prev = this.inflationHistory[this.inflationHistory.length - 2];
    const current = this.inflationHistory[this.inflationHistory.length - 1];
    const change = Math.abs(current - prev);

    if (change > 50) {
      return {
        severity: SignalSeverity.CRITICAL,
        type: "INFLATION_SHOCK",
        description: `Inflation expectations moved ${change} bps`,
      };
    }
    if (change > 25) {
      return {
        severity: SignalSeverity.HIGH,
        type: "INFLATION_SHOCK",
        description: `Inflation expectations moved ${change} bps`,
      };
    }

    return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
  }

  /**
   * Detect volatility clustering in real rates.
   * Sustained high variance across the rolling window indicates uncertainty.
   */
  private detectRateVolatilityClustering(): MacroSignal {
    if (this.realRateHistory.length < 10) {
      return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
    }

    const recent = this.realRateHistory.slice(-10);
    const changes: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      changes.push(Math.abs(recent[i] - recent[i - 1]));
    }
    const avgChange =
      changes.reduce((a, b) => a + b, 0) / changes.length;

    if (avgChange > 20) {
      return {
        severity: SignalSeverity.HIGH,
        type: "RATE_VOLATILITY_CLUSTER",
        description: `High rate volatility: avg ${avgChange.toFixed(1)} bps per update`,
      };
    }
    if (avgChange > 10) {
      return {
        severity: SignalSeverity.LOW,
        type: "RATE_VOLATILITY_CLUSTER",
        description: `Elevated rate volatility: avg ${avgChange.toFixed(1)} bps per update`,
      };
    }

    return { severity: SignalSeverity.NONE, type: "NONE", description: "" };
  }
}
