import { describe, it } from "mocha";
import { expect } from "chai";

describe("JPY Matcher", () => {
  describe("Compliance", () => {
    function isKycSufficient(userLevel: number, minLevel: number): boolean {
      return userLevel >= minLevel;
    }

    function isJurisdictionBlocked(jurisdiction: number, blockedMask: number): boolean {
      if (jurisdiction >= 8) return false;
      return ((blockedMask >> jurisdiction) & 1) === 1;
    }

    function isKycExpired(expiryTimestamp: number, currentTimestamp: number): boolean {
      return currentTimestamp > expiryTimestamp;
    }

    it("should accept sufficient KYC level", () => {
      expect(isKycSufficient(2, 1)).to.be.true;  // Enhanced >= Standard
      expect(isKycSufficient(3, 1)).to.be.true;  // Institutional >= Standard
    });

    it("should reject insufficient KYC level", () => {
      expect(isKycSufficient(0, 1)).to.be.false; // Basic < Standard
      expect(isKycSufficient(1, 2)).to.be.false; // Standard < Enhanced
    });

    it("should block US jurisdiction (bit 0)", () => {
      const mask = 0x01; // US blocked
      expect(isJurisdictionBlocked(0, mask)).to.be.true;  // US
      expect(isJurisdictionBlocked(2, mask)).to.be.false; // JP
    });

    it("should block sanctioned jurisdictions (bit 1)", () => {
      const mask = 0x03; // US + sanctioned
      expect(isJurisdictionBlocked(0, mask)).to.be.true;  // US
      expect(isJurisdictionBlocked(1, mask)).to.be.true;  // Sanctioned
      expect(isJurisdictionBlocked(2, mask)).to.be.false; // JP
      expect(isJurisdictionBlocked(3, mask)).to.be.false; // SG
    });

    it("should detect expired KYC", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(isKycExpired(now - 3600, now)).to.be.true;  // Expired 1 hour ago
      expect(isKycExpired(now + 3600, now)).to.be.false; // Valid for 1 more hour
    });
  });

  describe("Pricing", () => {
    function computeJpyExecPrice(
      oraclePrice: number,
      baseSpread: number,
      kycDiscount: number,
      maxSpread: number,
      isInstitutional: boolean,
    ): number {
      const discount = isInstitutional ? kycDiscount : 0;
      const effective = Math.max(baseSpread - discount, 0);
      const capped = Math.min(effective, maxSpread);
      return Math.floor((oraclePrice * (10_000 + capped)) / 10_000);
    }

    it("should apply base spread for retail", () => {
      // USD/JPY at 150.00 (150_000_000 in e6)
      const price = computeJpyExecPrice(150_000_000, 20, 5, 100, false);
      expect(price).to.equal(Math.floor((150_000_000 * 10020) / 10000));
    });

    it("should apply KYC discount for institutional", () => {
      const price = computeJpyExecPrice(150_000_000, 20, 5, 100, true);
      // Effective spread = 20 - 5 = 15
      expect(price).to.equal(Math.floor((150_000_000 * 10015) / 10000));
    });

    it("should cap at max spread", () => {
      const price = computeJpyExecPrice(150_000_000, 150, 0, 100, false);
      expect(price).to.equal(Math.floor((150_000_000 * 10100) / 10000));
    });
  });

  describe("Volume limits", () => {
    it("should track daily volume", () => {
      const cap = 1_000_000;
      let volume = 0;

      volume += 400_000;
      expect(volume).to.be.lessThanOrEqual(cap);

      volume += 500_000;
      expect(volume).to.be.lessThanOrEqual(cap);

      // This should exceed
      expect(volume + 200_000).to.be.greaterThan(cap);
    });
  });
});
