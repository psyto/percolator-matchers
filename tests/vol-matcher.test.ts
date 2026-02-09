import { describe, it } from "mocha";
import { expect } from "chai";

describe("Vol Matcher", () => {
  // Regime spread multipliers
  const regimeMultiplier: Record<number, number> = {
    0: 50,   // VeryLow
    1: 75,   // Low
    2: 100,  // Normal
    3: 150,  // High
    4: 250,  // Extreme
  };

  function computeVolExecPrice(
    volMarkE6: number,
    baseSpread: number,
    vovSpread: number,
    maxSpread: number,
    regime: number,
  ): number {
    const multiplier = regimeMultiplier[regime] || 100;
    const adjustedVov = Math.floor((vovSpread * multiplier) / 100);
    const totalSpread = Math.min(baseSpread + adjustedVov, maxSpread);
    const spreadMult = 10_000 + totalSpread;
    return Math.floor((volMarkE6 * spreadMult) / 10_000);
  }

  describe("Pricing across regimes", () => {
    const volMark = 4_500_000_000; // 45% vol = 4500 bps * 1e6
    const baseSpread = 20;
    const vovSpread = 30;
    const maxSpread = 200;

    it("VeryLow regime: tightest spread", () => {
      const price = computeVolExecPrice(volMark, baseSpread, vovSpread, maxSpread, 0);
      // adjustedVov = 30 * 50 / 100 = 15, total = 35
      expect(price).to.equal(Math.floor((volMark * 10035) / 10000));
    });

    it("Normal regime: standard spread", () => {
      const price = computeVolExecPrice(volMark, baseSpread, vovSpread, maxSpread, 2);
      // adjustedVov = 30, total = 50
      expect(price).to.equal(Math.floor((volMark * 10050) / 10000));
    });

    it("High regime: wider spread", () => {
      const price = computeVolExecPrice(volMark, baseSpread, vovSpread, maxSpread, 3);
      // adjustedVov = 45, total = 65
      expect(price).to.equal(Math.floor((volMark * 10065) / 10000));
    });

    it("Extreme regime: widest spread", () => {
      const price = computeVolExecPrice(volMark, baseSpread, vovSpread, maxSpread, 4);
      // adjustedVov = 75, total = 95
      expect(price).to.equal(Math.floor((volMark * 10095) / 10000));
    });

    it("should cap at max_spread", () => {
      const price = computeVolExecPrice(volMark, 150, 100, 200, 4);
      // adjustedVov = 250, total = 400, capped to 200
      expect(price).to.equal(Math.floor((volMark * 10200) / 10000));
    });
  });

  describe("Edge cases", () => {
    it("zero vol mark should be handled", () => {
      const price = computeVolExecPrice(0, 20, 30, 200, 2);
      expect(price).to.equal(0);
    });

    it("very high vol (100%)", () => {
      const volMark = 10_000_000_000; // 100% vol
      const price = computeVolExecPrice(volMark, 20, 30, 200, 2);
      expect(price).to.be.greaterThan(volMark);
    });

    it("very low vol (1%)", () => {
      const volMark = 100_000_000; // 1% vol = 100 bps * 1e6
      const price = computeVolExecPrice(volMark, 20, 30, 200, 0);
      expect(price).to.be.greaterThan(volMark);
    });
  });
});
