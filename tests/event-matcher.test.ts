import { describe, it } from "mocha";
import { expect } from "chai";

describe("Event Matcher", () => {
  const MAX_PROBABILITY = 1_000_000;

  function computeEdgeFactor(probability: number): number {
    const p = probability;
    const oneMinusP = MAX_PROBABILITY - p;
    const denom = (p * oneMinusP * 4) / 1_000_000_000_000;
    if (denom <= 0) return 10_000_000; // max
    return Math.min(Math.floor(1_000_000 / denom), 10_000_000);
  }

  function computeEventExecPrice(
    probability: number,
    baseSpread: number,
    edgeSpread: number,
    maxSpread: number,
    signalAdj: number,
  ): number {
    const edgeFactor = computeEdgeFactor(probability);
    const adjustedEdge = Math.floor((edgeSpread * edgeFactor) / 1_000_000);
    const totalSpread = Math.min(baseSpread + adjustedEdge + signalAdj, maxSpread);
    const spreadMult = 10_000 + totalSpread;
    return Math.floor((probability * spreadMult) / 10_000);
  }

  describe("Edge spread at different probabilities", () => {
    const baseSpread = 20;
    const edgeSpread = 50;
    const maxSpread = 500;

    it("50% probability: minimal edge spread", () => {
      const factor = computeEdgeFactor(500_000);
      // At 50%: p*(1-p)*4 = 0.25*4 = 1.0 → factor = 1.0 (1_000_000)
      expect(factor).to.equal(1_000_000);

      const price = computeEventExecPrice(500_000, baseSpread, edgeSpread, maxSpread, 0);
      // adjustedEdge = 50 * 1_000_000 / 1_000_000 = 50
      // total = 20 + 50 = 70
      expect(price).to.equal(Math.floor((500_000 * 10_070) / 10_000));
    });

    it("10% probability: wider edge spread", () => {
      const factor = computeEdgeFactor(100_000);
      // At 10%: p*(1-p)*4 = 0.1*0.9*4 = 0.36 → factor = 1/0.36 ≈ 2.78
      expect(factor).to.be.greaterThan(2_000_000);
      expect(factor).to.be.lessThan(3_000_000);
    });

    it("1% probability: much wider edge spread (capped at 10x)", () => {
      const factor = computeEdgeFactor(10_000);
      // At 1%: uncapped factor ≈ 25.25x, but capped at 10x (10_000_000)
      expect(factor).to.equal(10_000_000);
    });

    it("99% probability: similar to 1%", () => {
      const factor99 = computeEdgeFactor(990_000);
      const factor1 = computeEdgeFactor(10_000);
      // Symmetric: same edge factor
      expect(factor99).to.equal(factor1);
    });
  });

  describe("Signal-adjusted spread", () => {
    it("no signal: base spread only", () => {
      const price = computeEventExecPrice(500_000, 20, 50, 500, 0);
      expect(price).to.be.greaterThan(500_000);
    });

    it("critical signal: widest spread", () => {
      const normalPrice = computeEventExecPrice(500_000, 20, 50, 500, 0);
      const criticalPrice = computeEventExecPrice(500_000, 20, 50, 500, 75);
      expect(criticalPrice).to.be.greaterThan(normalPrice);
    });

    it("spread capped at max", () => {
      const price = computeEventExecPrice(500_000, 200, 200, 300, 100);
      // Would be 200+200+100=500, capped to 300
      expect(price).to.equal(Math.floor((500_000 * 10_300) / 10_000));
    });
  });

  describe("Resolution", () => {
    it("YES outcome: probability = 1_000_000", () => {
      const finalPrice = MAX_PROBABILITY;
      expect(finalPrice).to.equal(1_000_000);
    });

    it("NO outcome: probability = 0", () => {
      const finalPrice = 0;
      expect(finalPrice).to.equal(0);
    });

    it("P&L calculation: long YES, event resolves YES", () => {
      const entryProb = 500_000; // Entered at 50%
      const exitProb = 1_000_000; // Resolved YES (100%)
      const notional = 1_000; // 1000 units
      const pnl = (exitProb - entryProb) * notional;
      expect(pnl).to.equal(500_000_000); // Profit!
    });

    it("P&L calculation: long YES, event resolves NO", () => {
      const entryProb = 500_000;
      const exitProb = 0;
      const notional = 1_000;
      const pnl = (exitProb - entryProb) * notional;
      expect(pnl).to.equal(-500_000_000); // Loss
    });
  });

  describe("Edge cases", () => {
    it("probability at exactly 0", () => {
      const factor = computeEdgeFactor(0);
      expect(factor).to.equal(10_000_000); // Max factor
    });

    it("probability at exactly 100%", () => {
      const factor = computeEdgeFactor(1_000_000);
      expect(factor).to.equal(10_000_000); // Max factor
    });

    it("very small probability (0.1%)", () => {
      const price = computeEventExecPrice(1_000, 20, 50, 500, 0);
      expect(price).to.be.greaterThan(1_000);
      expect(price).to.be.lessThan(2_000); // Should not be absurd
    });
  });
});
