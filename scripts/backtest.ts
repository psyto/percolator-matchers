/**
 * LP Protection Backtest — Percolator Matchers
 *
 * Simulates 200 trades per matcher under changing market conditions,
 * comparing each matcher's adaptive spread against a naive fixed spread.
 * Shows how LPs are protected during high-risk periods.
 *
 * Usage: npm run backtest
 */

// ---------------------------------------------------------------------------
// 1. Seeded PRNG (Mulberry32) — deterministic, reproducible output
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

/** Box-Muller transform for normally-distributed random numbers */
function gaussianNoise(mean: number, stddev: number): number {
  let u1 = rng();
  let u2 = rng();
  // Avoid log(0)
  while (u1 === 0) u1 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}

// ---------------------------------------------------------------------------
// 2. Pricing functions (copied from tests/*.test.ts)
// ---------------------------------------------------------------------------

// --- Vol-Matcher ---
const volRegimeMultiplier: Record<number, number> = {
  0: 50,   // VeryLow
  1: 75,   // Low
  2: 100,  // Normal
  3: 150,  // High
  4: 250,  // Extreme
};

function computeVolSpread(
  baseSpread: number,
  vovSpread: number,
  maxSpread: number,
  regime: number,
): number {
  const multiplier = volRegimeMultiplier[regime] || 100;
  const adjustedVov = Math.floor((vovSpread * multiplier) / 100);
  return Math.min(baseSpread + adjustedVov, maxSpread);
}

// --- Macro-Matcher ---
const macroRegimeMultiplier: Record<number, number> = {
  0: 60,   // Expansion
  1: 100,  // Stagnation
  2: 200,  // Crisis
  3: 125,  // Recovery
};

function computeMacroSpread(
  baseSpread: number,
  regimeSpread: number,
  maxSpread: number,
  regime: number,
  signalAdj: number = 0,
): number {
  const multiplier = macroRegimeMultiplier[regime] ?? 100;
  const adjustedRegime = Math.floor((regimeSpread * multiplier) / 100);
  return Math.min(baseSpread + adjustedRegime + signalAdj, maxSpread);
}

// --- Event-Matcher ---
const EVENT_MAX_PROBABILITY = 1_000_000;

function computeEdgeFactor(probability: number): number {
  const p = probability;
  const oneMinusP = EVENT_MAX_PROBABILITY - p;
  const denom = (p * oneMinusP * 4) / 1_000_000_000_000;
  if (denom <= 0) return 10_000_000; // max
  return Math.min(Math.floor(1_000_000 / denom), 10_000_000);
}

function computeEventSpread(
  baseSpread: number,
  edgeSpread: number,
  maxSpread: number,
  probability: number,
  signalAdj: number = 0,
): number {
  const edgeFactor = computeEdgeFactor(probability);
  const adjustedEdge = Math.floor((edgeSpread * edgeFactor) / 1_000_000);
  return Math.min(baseSpread + adjustedEdge + signalAdj, maxSpread);
}

// --- Privacy-Matcher ---
function computePrivacySpread(
  baseSpread: number,
  solverFee: number,
  maxSpread: number,
): number {
  return Math.min(baseSpread + solverFee, maxSpread);
}

// --- JPY-Matcher ---
function computeJpySpread(
  baseSpread: number,
  kycDiscount: number,
  maxSpread: number,
  isInstitutional: boolean,
): number {
  const discount = isInstitutional ? kycDiscount : 0;
  const effective = Math.max(baseSpread - discount, 0);
  return Math.min(effective, maxSpread);
}

// ---------------------------------------------------------------------------
// 3. Synthetic data generators (one per matcher, 200 steps each)
// ---------------------------------------------------------------------------

interface TradeStep {
  step: number;
  regimeLabel: string;
  trueRiskBps: number;
  adaptiveSpreadBps: number;
  fixedSpreadBps: number;
}

function generateVolScenario(): TradeStep[] {
  const steps: TradeStep[] = [];
  const base = 20, vov = 30, max = 200;
  const fixedSpread = computeVolSpread(base, vov, max, 2); // Normal = 50

  const regimeLabels: Record<number, string> = {
    0: "VeryLow", 1: "Low", 2: "Normal", 3: "High", 4: "Extreme",
  };

  for (let i = 0; i < 200; i++) {
    let regime: number;
    let riskBase: number;
    let noiseSigma: number;

    if (i < 40) {
      regime = 0; riskBase = 12; noiseSigma = 5;
    } else if (i < 80) {
      regime = 1; riskBase = 22; noiseSigma = 8;
    } else if (i < 120) {
      regime = 2; riskBase = 38; noiseSigma = 12;
    } else if (i < 140) {
      regime = 3; riskBase = 55; noiseSigma = 18;
    } else if (i < 160) {
      regime = 4; riskBase = 85; noiseSigma = 25;
    } else if (i < 180) {
      regime = 2; riskBase = 38; noiseSigma = 12;
    } else {
      regime = 1; riskBase = 22; noiseSigma = 8;
    }

    const trueRisk = Math.max(0, Math.round(gaussianNoise(riskBase, noiseSigma)));
    const adaptiveSpread = computeVolSpread(base, vov, max, regime);

    steps.push({
      step: i,
      regimeLabel: regimeLabels[regime],
      trueRiskBps: trueRisk,
      adaptiveSpreadBps: adaptiveSpread,
      fixedSpreadBps: fixedSpread,
    });
  }
  return steps;
}

function generateMacroScenario(): TradeStep[] {
  const steps: TradeStep[] = [];
  const base = 20, regimeSpread = 40, max = 200;
  const fixedSpread = computeMacroSpread(base, regimeSpread, max, 1); // Stagnation = 60

  const regimeLabels: Record<number, string> = {
    0: "Expansion", 1: "Stagnation", 2: "Crisis", 3: "Recovery",
  };

  for (let i = 0; i < 200; i++) {
    let regime: number;
    let riskBase: number;
    let noiseSigma: number;
    let signalAdj = 0;

    if (i < 50) {
      regime = 0; riskBase = 20; noiseSigma = 8;
    } else if (i < 100) {
      regime = 1; riskBase = 45; noiseSigma = 12;
    } else if (i < 150) {
      regime = 2; riskBase = 80; noiseSigma = 30;
      // Add signal adjustments during crisis (random spikes)
      if (i % 7 === 0) signalAdj = 20;
    } else {
      regime = 3; riskBase = 50; noiseSigma = 15;
    }

    const trueRisk = Math.max(0, Math.round(gaussianNoise(riskBase, noiseSigma)));
    const adaptiveSpread = computeMacroSpread(base, regimeSpread, max, regime, signalAdj);

    steps.push({
      step: i,
      regimeLabel: regimeLabels[regime],
      trueRiskBps: trueRisk,
      adaptiveSpreadBps: adaptiveSpread,
      fixedSpreadBps: fixedSpread,
    });
  }
  return steps;
}

function generateEventScenario(): TradeStep[] {
  const steps: TradeStep[] = [];
  const base = 25, edge = 60, max = 400;
  // Fixed spread at 50% probability
  const fixedSpread = computeEventSpread(base, edge, max, 500_000); // ~85

  for (let i = 0; i < 200; i++) {
    let probability: number;
    let signalAdj = 0;

    if (i < 40) {
      // Stable near 52%
      probability = 520_000 + Math.round(gaussianNoise(0, 20_000));
    } else if (i < 80) {
      // Drifting to 35-40%
      const drift = ((i - 40) / 40) * 150_000;
      probability = 520_000 - Math.round(drift) + Math.round(gaussianNoise(0, 30_000));
    } else if (i < 120) {
      // Dropping to 15-25%
      const drift = ((i - 80) / 40) * 150_000;
      probability = 370_000 - Math.round(drift) + Math.round(gaussianNoise(0, 25_000));
      if (i % 10 === 0) signalAdj = 30; // Signal events
    } else if (i < 160) {
      // Tail risk: 5-10%
      const drift = ((i - 120) / 40) * 100_000;
      probability = 220_000 - Math.round(drift) + Math.round(gaussianNoise(0, 20_000));
    } else {
      // Near resolution: 0-3%
      const drift = ((i - 160) / 40) * 90_000;
      probability = 120_000 - Math.round(drift) + Math.round(gaussianNoise(0, 10_000));
    }

    // Clamp probability to valid range
    probability = Math.max(1_000, Math.min(probability, 999_000));

    // True risk scales inversely with p*(1-p) — same logic as the matcher
    const pNorm = probability / EVENT_MAX_PROBABILITY;
    const entropy = pNorm * (1 - pNorm) * 4; // peaks at 0.5
    const inverseEntropy = entropy > 0.01 ? 1 / entropy : 100;
    const riskBase = 20 * inverseEntropy;
    const noiseSigma = 5 * inverseEntropy;
    const trueRisk = Math.max(0, Math.round(gaussianNoise(riskBase, noiseSigma)));

    const adaptiveSpread = computeEventSpread(base, edge, max, probability, signalAdj);

    // Label based on probability band
    let label: string;
    if (pNorm > 0.45) label = "~50% Stable";
    else if (pNorm > 0.30) label = "~35% Drift";
    else if (pNorm > 0.15) label = "~20% Signal";
    else if (pNorm > 0.05) label = "~8% Tail";
    else label = "~2% Resolve";

    steps.push({
      step: i,
      regimeLabel: label,
      trueRiskBps: trueRisk,
      adaptiveSpreadBps: adaptiveSpread,
      fixedSpreadBps: fixedSpread,
    });
  }
  return steps;
}

function generatePrivacyScenario(): TradeStep[] {
  const steps: TradeStep[] = [];
  const base = 15, max = 100;
  const fixedSpread = computePrivacySpread(base, 10, max); // 25

  for (let i = 0; i < 200; i++) {
    let solverFee: number;
    let riskBase: number;
    let noiseSigma: number;

    if (i < 100) {
      solverFee = 10; riskBase = 15; noiseSigma = 5;
    } else if (i < 150) {
      // High MEV period — solver fee spikes
      solverFee = 30; riskBase = 35; noiseSigma = 10;
    } else {
      solverFee = 10; riskBase = 15; noiseSigma = 5;
    }

    const trueRisk = Math.max(0, Math.round(gaussianNoise(riskBase, noiseSigma)));
    const adaptiveSpread = computePrivacySpread(base, solverFee, max);

    let label: string;
    if (i < 100) label = "Low MEV";
    else if (i < 150) label = "High MEV";
    else label = "Low MEV";

    steps.push({
      step: i,
      regimeLabel: label,
      trueRiskBps: trueRisk,
      adaptiveSpreadBps: adaptiveSpread,
      fixedSpreadBps: fixedSpread,
    });
  }
  return steps;
}

function generateJpyScenario(): TradeStep[] {
  const steps: TradeStep[] = [];
  const base = 20, kycDiscount = 5, max = 100;
  // Fixed spread: average of retail (20) and institutional (15) = 17.5, rounded to 17
  // A naive LP that doesn't differentiate by KYC tier
  const fixedSpread = 17;

  for (let i = 0; i < 200; i++) {
    let retailRiskBase: number;
    let instRiskBase: number;
    let noiseSigma: number;
    let isInstitutional: boolean;

    if (i < 100) {
      // Normal market: institutional flow is genuinely lower risk (better info, less toxic)
      retailRiskBase = 16; instRiskBase = 6; noiseSigma = 4;
      isInstitutional = rng() < 0.4;
    } else if (i < 150) {
      // BOJ intervention — retail risk spikes hard, institutional stays low
      retailRiskBase = 35; instRiskBase = 10; noiseSigma = 7;
      isInstitutional = rng() < 0.4;
    } else {
      retailRiskBase = 16; instRiskBase = 6; noiseSigma = 4;
      isInstitutional = rng() < 0.4;
    }

    const riskBase = isInstitutional ? instRiskBase : retailRiskBase;
    const trueRisk = Math.max(0, Math.round(gaussianNoise(riskBase, noiseSigma)));
    const adaptiveSpread = computeJpySpread(base, kycDiscount, max, isInstitutional);

    let label: string;
    const tag = isInstitutional ? " (Inst)" : " (Ret)";
    if (i < 100) label = "Normal" + tag;
    else if (i < 150) label = "BOJ Intv" + tag;
    else label = "Normal" + tag;

    steps.push({
      step: i,
      regimeLabel: label,
      trueRiskBps: trueRisk,
      adaptiveSpreadBps: adaptiveSpread,
      fixedSpreadBps: fixedSpread,
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// 4. Simulation engine
// ---------------------------------------------------------------------------

interface SimResult {
  name: string;
  subtitle: string;
  scenarioDesc: string;
  steps: TradeStep[];
  adaptiveTotalPnl: number;
  fixedTotalPnl: number;
  adaptiveMaxDD: number;
  fixedMaxDD: number;
  adaptiveSharpe: number;
  fixedSharpe: number;
  adaptiveWinRate: number;
  fixedWinRate: number;
}

function simulate(
  name: string,
  subtitle: string,
  scenarioDesc: string,
  steps: TradeStep[],
): SimResult {
  let adaptiveCum = 0;
  let fixedCum = 0;
  let adaptivePeak = 0;
  let fixedPeak = 0;
  let adaptiveMaxDD = 0;
  let fixedMaxDD = 0;
  let adaptiveWins = 0;
  let fixedWins = 0;

  const adaptivePnls: number[] = [];
  const fixedPnls: number[] = [];

  for (const s of steps) {
    const aPnl = s.adaptiveSpreadBps - s.trueRiskBps;
    const fPnl = s.fixedSpreadBps - s.trueRiskBps;

    adaptivePnls.push(aPnl);
    fixedPnls.push(fPnl);

    adaptiveCum += aPnl;
    fixedCum += fPnl;

    if (adaptiveCum > adaptivePeak) adaptivePeak = adaptiveCum;
    if (fixedCum > fixedPeak) fixedPeak = fixedCum;

    const aDD = adaptivePeak - adaptiveCum;
    const fDD = fixedPeak - fixedCum;
    if (aDD > adaptiveMaxDD) adaptiveMaxDD = aDD;
    if (fDD > fixedMaxDD) fixedMaxDD = fDD;

    if (aPnl > 0) adaptiveWins++;
    if (fPnl > 0) fixedWins++;
  }

  return {
    name,
    subtitle,
    scenarioDesc,
    steps,
    adaptiveTotalPnl: adaptiveCum,
    fixedTotalPnl: fixedCum,
    adaptiveMaxDD,
    fixedMaxDD,
    adaptiveSharpe: computeSharpe(adaptivePnls),
    fixedSharpe: computeSharpe(fixedPnls),
    adaptiveWinRate: (adaptiveWins / steps.length) * 100,
    fixedWinRate: (fixedWins / steps.length) * 100,
  };
}

// ---------------------------------------------------------------------------
// 5. Statistics
// ---------------------------------------------------------------------------

function computeSharpe(pnls: number[]): number {
  const n = pnls.length;
  if (n === 0) return 0;
  const mean = pnls.reduce((a, b) => a + b, 0) / n;
  const variance = pnls.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return 0;
  return mean / stddev;
}

// ---------------------------------------------------------------------------
// 6. Terminal report formatting
// ---------------------------------------------------------------------------

function pad(s: string, width: number, align: "left" | "right" = "right"): string {
  if (align === "left") return s.padEnd(width);
  return s.padStart(width);
}

function fmtBps(bps: number): string {
  return `${bps >= 0 ? "+" : ""}${bps.toLocaleString()} bps`;
}

function fmtPct(pct: number): string {
  return pct.toFixed(1) + "%";
}

function fmtSharpe(s: number): string {
  return s.toFixed(2);
}

function printSeparator(): void {
  console.log("=".repeat(80));
}

function printMatcherReport(result: SimResult): void {
  console.log();
  console.log(`--- ${result.name} (${result.subtitle}) ---`);
  console.log(`Scenario: ${result.scenarioDesc}`);
  console.log();

  // Table header
  console.log(
    "  " +
    pad("Step", 5, "right") + " | " +
    pad("Regime", 14, "left") + " | " +
    pad("True Risk", 10) + " | " +
    pad("Adaptive", 10) + " | " +
    pad("Fixed", 10) + " | " +
    pad("Adapt P&L", 12) + " | " +
    pad("Fixed P&L", 12)
  );
  console.log("  " + "-".repeat(5) + "-+-" + "-".repeat(14) + "-+-" +
    "-".repeat(10) + "-+-" + "-".repeat(10) + "-+-" + "-".repeat(10) + "-+-" +
    "-".repeat(12) + "-+-" + "-".repeat(12));

  // Print every 10th step
  let aCum = 0;
  let fCum = 0;
  for (const s of result.steps) {
    aCum += s.adaptiveSpreadBps - s.trueRiskBps;
    fCum += s.fixedSpreadBps - s.trueRiskBps;

    if (s.step % 10 === 0 || s.step === result.steps.length - 1) {
      console.log(
        "  " +
        pad(String(s.step), 5) + " | " +
        pad(s.regimeLabel, 14, "left") + " | " +
        pad(`${s.trueRiskBps} bps`, 10) + " | " +
        pad(`${s.adaptiveSpreadBps} bps`, 10) + " | " +
        pad(`${s.fixedSpreadBps} bps`, 10) + " | " +
        pad(fmtBps(aCum), 12) + " | " +
        pad(fmtBps(fCum), 12)
      );
    }
  }

  // Summary
  console.log();
  console.log("  Summary:");
  console.log(
    "  " + pad("", 16, "left") +
    pad("Adaptive", 14) +
    pad("Fixed", 14) +
    pad("Delta", 14)
  );
  console.log(
    "  " + pad("Total P&L", 16, "left") +
    pad(fmtBps(result.adaptiveTotalPnl), 14) +
    pad(fmtBps(result.fixedTotalPnl), 14) +
    pad(fmtBps(result.adaptiveTotalPnl - result.fixedTotalPnl), 14)
  );
  console.log(
    "  " + pad("Max DD", 16, "left") +
    pad(`${result.adaptiveMaxDD} bps`, 14) +
    pad(`${result.fixedMaxDD} bps`, 14) +
    pad("", 14)
  );
  console.log(
    "  " + pad("Sharpe", 16, "left") +
    pad(fmtSharpe(result.adaptiveSharpe), 14) +
    pad(fmtSharpe(result.fixedSharpe), 14) +
    pad("", 14)
  );
  console.log(
    "  " + pad("Win Rate", 16, "left") +
    pad(fmtPct(result.adaptiveWinRate), 14) +
    pad(fmtPct(result.fixedWinRate), 14) +
    pad("", 14)
  );
}

function printScorecard(results: SimResult[]): void {
  console.log();
  printSeparator();
  console.log("                        FINAL SCORECARD");
  printSeparator();
  console.log();
  console.log(
    "  " +
    pad("Matcher", 20, "left") +
    pad("Adaptive P&L", 14) +
    pad("Fixed P&L", 14) +
    pad("Advantage", 14) +
    "  Bar"
  );
  console.log("  " + "-".repeat(70));

  const maxAdvantage = Math.max(
    ...results.map((r) => r.adaptiveTotalPnl - r.fixedTotalPnl)
  );

  for (const r of results) {
    const advantage = r.adaptiveTotalPnl - r.fixedTotalPnl;
    const barLen = maxAdvantage > 0
      ? Math.max(1, Math.round((advantage / maxAdvantage) * 20))
      : 1;
    const bar = "\u2588".repeat(barLen);

    console.log(
      "  " +
      pad(r.name, 20, "left") +
      pad(fmtBps(r.adaptiveTotalPnl), 14) +
      pad(fmtBps(r.fixedTotalPnl), 14) +
      pad(fmtBps(advantage), 14) +
      "  " + bar
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 7. main() orchestrator
// ---------------------------------------------------------------------------

function main(): void {
  printSeparator();
  console.log("  PERCOLATOR MATCHERS \u2014 LP Protection Backtest (200 trades)");
  printSeparator();

  const results: SimResult[] = [];

  // Vol-Matcher
  results.push(simulate(
    "Vol-Matcher",
    "Volatility Regime-Adaptive",
    "VeryLow \u2192 Low \u2192 Normal \u2192 High/Extreme \u2192 Recovery",
    generateVolScenario(),
  ));

  // Macro-Matcher
  results.push(simulate(
    "Macro-Matcher",
    "Economic Cycle Regime",
    "Expansion \u2192 Stagnation \u2192 Crisis (2008-style) \u2192 Recovery",
    generateMacroScenario(),
  ));

  // Event-Matcher
  results.push(simulate(
    "Event-Matcher",
    "Election Night Adaptive",
    "~52% Stable \u2192 ~35% Drift \u2192 ~20% Signal \u2192 ~8% Tail \u2192 ~2% Resolution",
    generateEventScenario(),
  ));

  // Privacy-Matcher
  results.push(simulate(
    "Privacy-Matcher",
    "MEV-Adaptive Solver Fee",
    "Low MEV \u2192 High MEV Spike \u2192 Low MEV",
    generatePrivacyScenario(),
  ));

  // JPY-Matcher
  results.push(simulate(
    "JPY-Matcher",
    "BOJ Intervention + KYC Tiered",
    "Normal Mixed \u2192 BOJ Intervention \u2192 Normal",
    generateJpyScenario(),
  ));

  // Print individual reports
  for (const r of results) {
    printMatcherReport(r);
  }

  // Print final scorecard
  printScorecard(results);

  // Verification: all adaptive > fixed
  const allAdaptiveWins = results.every((r) => r.adaptiveTotalPnl >= r.fixedTotalPnl);
  if (allAdaptiveWins) {
    console.log("  \u2713 All matchers show adaptive >= fixed P&L (backtest passed)");
  } else {
    console.log("  \u2717 WARNING: Not all matchers show adaptive advantage!");
    process.exit(1);
  }
  console.log();
}

main();
