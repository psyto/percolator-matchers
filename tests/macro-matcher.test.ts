import { describe, it } from "mocha";
import { expect } from "chai";

describe("Macro Matcher", () => {
  // Regime spread multipliers (must match state.rs MacroRegime::spread_multiplier)
  const regimeMultiplier: Record<number, number> = {
    0: 60,   // Expansion
    1: 100,  // Stagnation
    2: 200,  // Crisis
    3: 125,  // Recovery
  };

  /**
   * Replicate the pricing math from process_match:
   *   adjusted_regime = regime_spread * multiplier / 100
   *   total_spread = min(base_spread + adjusted_regime + signal_adj, max_spread)
   *   exec_price = mark * (10_000 + total_spread) / 10_000
   */
  function computeMacroExecPrice(
    markE6: number,
    baseSpread: number,
    regimeSpread: number,
    maxSpread: number,
    regime: number,
    signalAdj: number = 0,
  ): number {
    const multiplier = regimeMultiplier[regime] ?? 100;
    const adjustedRegime = Math.floor((regimeSpread * multiplier) / 100);
    const totalSpread = Math.min(baseSpread + adjustedRegime + signalAdj, maxSpread);
    const spreadMult = 10_000 + totalSpread;
    return Math.floor((markE6 * spreadMult) / 10_000);
  }

  /**
   * Compute mark price from real rate bps.
   * mark_price_e6 = max(0, (real_rate_bps + 500) * 10_000)
   */
  function computeMarkPrice(realRateBps: number): number {
    const shifted = realRateBps + 500; // RATE_OFFSET
    if (shifted <= 0) return 0;
    return shifted * 10_000;
  }

  // -----------------------------------------------------------------------
  // Regime pricing tests
  // -----------------------------------------------------------------------
  describe("Pricing across regimes", () => {
    const mark = 5_000_000; // 0% real rate
    const baseSpread = 20;
    const regimeSpread = 40;
    const maxSpread = 200;

    it("Stagnation regime (1.0x): Stevenson's baseline", () => {
      const price = computeMacroExecPrice(mark, baseSpread, regimeSpread, maxSpread, 1);
      // adjusted = 40 * 100 / 100 = 40, total = 20 + 40 = 60
      // exec = 5_000_000 * 10060 / 10000 = 5_030_000
      expect(price).to.equal(5_030_000);
    });

    it("Crisis regime (2.0x): widest spreads", () => {
      const price = computeMacroExecPrice(mark, baseSpread, regimeSpread, maxSpread, 2);
      // adjusted = 40 * 200 / 100 = 80, total = 20 + 80 = 100
      // exec = 5_000_000 * 10100 / 10000 = 5_050_000
      expect(price).to.equal(5_050_000);
    });

    it("Expansion regime (0.6x): tightest spreads", () => {
      const price = computeMacroExecPrice(mark, baseSpread, regimeSpread, maxSpread, 0);
      // adjusted = 40 * 60 / 100 = 24, total = 20 + 24 = 44
      // exec = 5_000_000 * 10044 / 10000 = 5_022_000
      expect(price).to.equal(5_022_000);
    });

    it("Recovery regime (1.25x): moderate", () => {
      const price = computeMacroExecPrice(mark, baseSpread, regimeSpread, maxSpread, 3);
      // adjusted = 40 * 125 / 100 = 50, total = 20 + 50 = 70
      // exec = 5_000_000 * 10070 / 10000 = 5_035_000
      expect(price).to.equal(5_035_000);
    });
  });

  // -----------------------------------------------------------------------
  // Spread capping
  // -----------------------------------------------------------------------
  describe("Spread capping", () => {
    it("should cap total spread at max_spread", () => {
      const price = computeMacroExecPrice(5_000_000, 100, 200, 150, 2);
      // adjusted = 200 * 200 / 100 = 400, total = min(100 + 400, 150) = 150
      // exec = 5_000_000 * 10150 / 10000 = 5_075_000
      expect(price).to.equal(5_075_000);
    });

    it("should cap with signal adjustment too", () => {
      const price = computeMacroExecPrice(5_000_000, 100, 200, 150, 2, 100);
      // total = min(100 + 400 + 100, 150) = 150
      expect(price).to.equal(5_075_000);
    });
  });

  // -----------------------------------------------------------------------
  // Signal adjustment
  // -----------------------------------------------------------------------
  describe("Signal adjustment", () => {
    it("signal_adj adds to total spread", () => {
      const price = computeMacroExecPrice(5_000_000, 20, 40, 200, 1, 30);
      // adjusted = 40, total = 20 + 40 + 30 = 90
      // exec = 5_000_000 * 10090 / 10000 = 5_045_000
      expect(price).to.equal(5_045_000);
    });

    it("signal_adj = 0 has no effect", () => {
      const withSignal = computeMacroExecPrice(5_000_000, 20, 40, 200, 1, 0);
      const without = computeMacroExecPrice(5_000_000, 20, 40, 200, 1);
      expect(withSignal).to.equal(without);
    });
  });

  // -----------------------------------------------------------------------
  // Mark price construction
  // -----------------------------------------------------------------------
  describe("Mark price construction", () => {
    it("+2.00% real rate → 7,000,000", () => {
      expect(computeMarkPrice(200)).to.equal(7_000_000);
    });

    it("0.00% real rate → 5,000,000", () => {
      expect(computeMarkPrice(0)).to.equal(5_000_000);
    });

    it("-1.00% real rate → 4,000,000", () => {
      expect(computeMarkPrice(-100)).to.equal(4_000_000);
    });

    it("-5.00% real rate → 0 (floor)", () => {
      expect(computeMarkPrice(-500)).to.equal(0);
    });

    it("below floor stays at 0", () => {
      expect(computeMarkPrice(-600)).to.equal(0);
    });
  });

  // -----------------------------------------------------------------------
  // Regime constants
  // -----------------------------------------------------------------------
  describe("Regime constants", () => {
    it("all 4 multiplier values are correct", () => {
      expect(regimeMultiplier[0]).to.equal(60);   // Expansion
      expect(regimeMultiplier[1]).to.equal(100);  // Stagnation
      expect(regimeMultiplier[2]).to.equal(200);  // Crisis
      expect(regimeMultiplier[3]).to.equal(125);  // Recovery
    });

    it("from_u8: all 4 + out-of-range defaults to Stagnation", () => {
      // Simulate Rust's MacroRegime::from_u8
      function regimeFromU8(v: number): number {
        if (v >= 0 && v <= 3) return v;
        return 1; // Stagnation
      }
      expect(regimeFromU8(0)).to.equal(0);
      expect(regimeFromU8(1)).to.equal(1);
      expect(regimeFromU8(2)).to.equal(2);
      expect(regimeFromU8(3)).to.equal(3);
      expect(regimeFromU8(4)).to.equal(1);
      expect(regimeFromU8(255)).to.equal(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe("Edge cases", () => {
    it("zero mark price should yield zero", () => {
      const price = computeMacroExecPrice(0, 20, 40, 200, 1);
      expect(price).to.equal(0);
    });

    it("very high mark price (strong positive rate)", () => {
      const mark = computeMarkPrice(500); // +5% → mark = 10_000_000
      const price = computeMacroExecPrice(mark, 20, 40, 200, 0);
      expect(price).to.be.greaterThan(mark);
    });

    it("very negative rate floors at zero mark", () => {
      const mark = computeMarkPrice(-1000); // -10% → floored to 0
      expect(mark).to.equal(0);
      const price = computeMacroExecPrice(mark, 20, 40, 200, 2);
      expect(price).to.equal(0);
    });
  });
});
