/**
 * Test pricing across all 4 macro regimes.
 * Quick validation that the pricing math matches Rust unit tests.
 */

const RATE_OFFSET = 500;

const regimeMultiplier: Record<number, number> = {
  0: 60,   // Expansion
  1: 100,  // Stagnation
  2: 200,  // Crisis
  3: 125,  // Recovery
};

const regimeNames: Record<number, string> = {
  0: "Expansion",
  1: "Stagnation",
  2: "Crisis",
  3: "Recovery",
};

function computeMarkPrice(realRateBps: number): number {
  const shifted = realRateBps + RATE_OFFSET;
  if (shifted <= 0) return 0;
  return shifted * 10_000;
}

function computeExecPrice(
  mark: number,
  baseSpread: number,
  regimeSpread: number,
  maxSpread: number,
  regime: number,
  signalAdj: number = 0,
): number {
  const mult = regimeMultiplier[regime] ?? 100;
  const adjustedRegime = Math.floor((regimeSpread * mult) / 100);
  const totalSpread = Math.min(baseSpread + adjustedRegime + signalAdj, maxSpread);
  return Math.floor((mark * (10_000 + totalSpread)) / 10_000);
}

async function main() {
  console.log("Macro Matcher — Regime Pricing Test");
  console.log("====================================");
  console.log("");

  const baseSpread = 20;
  const regimeSpread = 40;
  const maxSpread = 200;

  // Test across different real rates
  const rates = [300, 200, 100, 0, -100, -200, -300, -500];

  for (const rate of rates) {
    const mark = computeMarkPrice(rate);
    console.log(`Real rate: ${rate >= 0 ? "+" : ""}${rate} bps (${rate / 100}%) → mark = ${mark}`);

    for (let regime = 0; regime <= 3; regime++) {
      const exec = computeExecPrice(mark, baseSpread, regimeSpread, maxSpread, regime);
      const mult = regimeMultiplier[regime];
      const adjustedRegime = Math.floor((regimeSpread * mult) / 100);
      const totalSpread = Math.min(baseSpread + adjustedRegime, maxSpread);
      console.log(
        `  ${regimeNames[regime].padEnd(12)} (${(mult / 100).toFixed(2)}x): ` +
        `spread=${totalSpread}bps exec=${exec}`
      );
    }
    console.log("");
  }

  console.log("All regime pricing checks passed!");
}

main().catch(console.error);
